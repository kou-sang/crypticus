// Worker de entrada: sirve la SPA (static assets) y enruta /api/* al árbitro de cada competencia.
import { bearerToken, verifyFirebaseToken } from './auth';
import { AppError, errorResponse, json } from './errors';
import { FirestoreRest } from './firestore';
import type { Env } from './env';
import type { Competition, CompetitionConfig, Difficulty, Participant } from '../shared/types';
import { byFreshness, mergeLastSeen, selectCryptics, selectTiebreakers } from '../shared/selection';
import { assignTeams, isTeamDuel, startBlocker } from '../shared/teams';
import { ROYALE_TIER_COUNTS } from '../shared/gameModes';
import { answerWords, catalogByTier, catalogTiebreak, crypticKind } from './secrets';
import { validateConfig } from '../shared/scoring';
import { normalizeConfig } from '../shared/config';
import { handleCreate, handleUpdate } from './rooms';
import { PARTY_MAX, PARTY_MIN, type CoopTier } from '../shared/coop/balance';
import { CHARACTERS, type CharacterId } from '../shared/coop/catalog/characters';
import type { CoopPlayerSetup } from '../shared/coop/protocol';

export { CompetitionRoom } from './competitionRoom';

const COMPETITION_ID = /^[A-Za-z0-9_-]{1,64}$/;
// 3 s visibles (3-2-1) + margen para que todos los clientes reciban el estado antes del primer número.
const COUNTDOWN_MS = 4_500;

/**
 * Cada sala vive en un Durable Object. La pista de región lo crea cerca de los jugadores
 * (solo influye la primera vez; después el objeto no se mueve).
 */
function roomStub(env: Env, competitionId: string) {
  const id = env.COMPETITION_ROOM.idFromName(competitionId);
  const hint = env.DO_LOCATION_HINT as DurableObjectLocationHint | undefined;
  return hint ? env.COMPETITION_ROOM.get(id, { locationHint: hint }) : env.COMPETITION_ROOM.get(id);
}

async function readCompetitionId(request: Request): Promise<string> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError(400, 'bad_json', 'JSON inválido.');
  }
  const id = (body as { competitionId?: unknown } | null)?.competitionId;
  if (typeof id !== 'string' || !COMPETITION_ID.test(id)) throw new AppError(400, 'bad_body', 'competitionId inválido.');
  return id;
}

/**
 * Elige los cripticos de la partida con el catálogo empaquetado y el historial `userSeen/{uid}` de cada jugador.
 * Conserva el tamaño que pidió el anfitrión (total en 'free', por dificultad en 'rounds').
 */
async function selectUnseen(
  firestore: FirestoreRest,
  competition: Competition,
  uids: string[],
): Promise<{ crypticIds: string[]; pool: Record<Difficulty, string[]>; tiebreakIds: string[] }> {
  const seenDocs = await firestore.batchGet<{ seen?: Record<string, number> }>(uids.map((uid) => `userSeen/${uid}`));
  const lastSeen = mergeLastSeen([...seenDocs.values()].map((d) => d.seen));
  const pool = competition.pool ?? { easy: [], medium: [], hard: [] };
  // `clueCount` (v0.7+) evita que el cliente tenga que elegir cripticos; antes se deducía de la lista guardada.
  const stored = typeof competition.clueCount === 'number' ? competition.clueCount : null;
  const count =
    stored ??
    (competition.flow === 'rounds'
      ? Math.max(pool.easy.length, pool.medium.length, pool.hard.length, 1)
      : Math.max(competition.crypticIds.length, 1));
  const selection = selectCryptics({
    byTier: catalogByTier(),
    lastSeen,
    flow: competition.flow,
    tierMix: competition.tierMix,
    count,
    kindOf: crypticKind,
    // Royale: 10 fáciles, 10 medios y después solo difíciles.
    ...(competition.game === 'royale' ? { tierCounts: ROYALE_TIER_COUNTS } : {}),
  });
  if (selection.crypticIds.length === 0) throw new AppError(409, 'no_cryptics', 'No hay cripticos disponibles.');
  // Muerte súbita: solo Race, Royale y Duel con rivales (el jefe es cooperativo).
  const competitive = uids.length >= 2;
  const tiebreakIds = competitive ? selectTiebreakers(catalogTiebreak(), lastSeen) : [];
  return { ...selection, tiebreakIds };
}

/**
 * COOP: todo el catálogo por dificultad, con los que nadie de la sala vio primero. El DO los reparte por ronda
 * sin repetir. Los de desempate son los «muy difíciles», separados por cantidad de palabras.
 */
async function coopPools(firestore: FirestoreRest, uids: string[]): Promise<Record<CoopTier, string[]>> {
  const seenDocs = await firestore.batchGet<{ seen?: Record<string, number> }>(uids.map((uid) => `userSeen/${uid}`));
  const lastSeen = mergeLastSeen([...seenDocs.values()].map((d) => d.seen));
  const regular = catalogByTier();
  const tiebreak = Object.values(catalogTiebreak()).flat();
  const pools: Record<CoopTier, string[]> = {
    easy: byFreshness(regular.easy, lastSeen),
    medium: byFreshness(regular.medium, lastSeen),
    hard: byFreshness(regular.hard, lastSeen),
    veryHard2: byFreshness(tiebreak.filter((id) => answerWords(id) <= 2), lastSeen),
    veryHard3: byFreshness(tiebreak.filter((id) => answerWords(id) >= 3), lastSeen),
  };
  if (pools.easy.length + pools.medium.length + pools.hard.length === 0) throw new AppError(409, 'no_cryptics', 'No hay cripticos disponibles.');
  return pools;
}

/** COOP: jugadores con su personaje (elegido en la sala, sin repetir). */
function coopPlayers(competition: Competition, participants: Array<Participant & { id: string }>, names: Map<string, { displayName?: string }>): CoopPlayerSetup[] {
  if (participants.length < PARTY_MIN || participants.length > PARTY_MAX) {
    throw new AppError(409, 'bad_players', `COOP se juega de ${PARTY_MIN} a ${PARTY_MAX} jugadores.`);
  }
  const chosen = competition.coopCharacters ?? {};
  const players = [...participants]
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0))
    .map((p) => ({ uid: p.id, name: names.get(p.id)?.displayName ?? p.displayName, character: chosen[p.id] as CharacterId }));
  const missing = players.filter((p) => !p.character || !(p.character in CHARACTERS));
  if (missing.length > 0) throw new AppError(409, 'no_character', `Falta elegir personaje: ${missing.map((p) => p.name).join(', ')}.`);
  const repeated = players.filter((p, i) => players.findIndex((o) => o.character === p.character) !== i);
  if (repeated.length > 0) throw new AppError(409, 'repeated_character', `${CHARACTERS[repeated[0]!.character].name} está elegido dos veces.`);
  return players;
}

async function startCoop(
  env: Env,
  firestore: FirestoreRest,
  competitionId: string,
  competition: Competition,
  participants: Array<Participant & { id: string }>,
): Promise<Response> {
  const config = normalizeConfig(competition as unknown as Record<string, unknown>);
  const configErrors = validateConfig(config, competition.maxPlayers);
  if (configErrors.length > 0) throw new AppError(400, 'bad_config', configErrors.join(' '));
  const uids = participants.map((p) => p.id);
  const [pools, profiles] = await Promise.all([
    coopPools(firestore, uids),
    firestore.batchGet<{ displayName?: string }>(uids.map((uid) => `users/${uid}`)),
  ]);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  let times: { startedAt: number; endsAt: number };
  try {
    times = await roomStub(env, competitionId).startCoop({
      competitionId,
      title: competition.title ?? '',
      level: config.coop?.level ?? 'AT',
      players: coopPlayers(competition, participants, profiles),
      pools,
      seed,
      now: Date.now(),
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(409, 'start_failed', error instanceof Error ? error.message : 'No se pudo iniciar.');
  }
  await firestore.commit([{ kind: 'update', path: `competitions/${competitionId}`, data: { status: 'live', ...times } }]);
  return json({ ok: true, data: times });
}

/** POST /api/competitions/start — el anfitrión inicia; el DO toma el control de la partida. */
async function handleStart(request: Request, env: Env): Promise<Response> {
  const user = await verifyFirebaseToken(bearerToken(request), env.FIREBASE_PROJECT_ID);
  const competitionId = await readCompetitionId(request);
  const firestore = new FirestoreRest(env.FIREBASE_SERVICE_ACCOUNT);

  const competition = await firestore.getDoc<Competition>(`competitions/${competitionId}`);
  if (!competition) throw new AppError(404, 'not_found', 'La competencia no existe.');
  if (competition.hostId !== user.uid) throw new AppError(403, 'not_host', 'Solo el anfitrión puede iniciar.');
  if (competition.status === 'finished') throw new AppError(409, 'already_finished', 'La competencia ya terminó.');

  const participants = await firestore.listDocs<Participant>(`competitions/${competitionId}/participants`);
  if (competition.game === 'coop') return startCoop(env, firestore, competitionId, competition, participants);
  const minPlayers = competition.winByTwo ? 2 : 1;
  if (participants.length < minPlayers) {
    throw new AppError(409, 'not_enough_players', `Se necesitan al menos ${minPlayers} jugadores.`);
  }
  // Duel: cantidad exacta (1 vs 1 o 2 vs 2). Sin esto se podía jugar solo y el daño era 0.
  const blocker = startBlocker(competition, participants.map((p) => p.id));
  if (blocker) throw new AppError(409, 'bad_players', blocker);
  // 2 vs 2: respeta lo elegido en la sala y completa por orden de llegada.
  const teams = isTeamDuel(competition)
    ? assignTeams(
        [...participants].sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0)).map((p) => p.id),
        competition.teams ?? {},
      )
    : null;

  // Las reglas guardadas se vuelven a normalizar y validar: el documento podría ser de una versión anterior.
  const config: CompetitionConfig = normalizeConfig(competition as unknown as Record<string, unknown>);
  const configErrors = validateConfig(config, competition.maxPlayers);
  if (configErrors.length > 0) throw new AppError(400, 'bad_config', configErrors.join(' '));

  // Selección sin repetir: se descartan (o se dejan para el final) los cripticos que ya vio algún jugador.
  const [{ crypticIds, pool, tiebreakIds }, profiles] = await Promise.all([
    selectUnseen(firestore, competition, participants.map((p) => p.id)),
    firestore.batchGet<{ displayName?: string }>(participants.map((p) => `users/${p.id}`)),
  ]);

  // El DO es idempotente: si ya inició (reintento), devuelve los tiempos originales.
  let times: { startedAt: number; endsAt: number };
  try {
    times = await roomStub(env, competitionId).start({
      competitionId,
      title: competition.title ?? '',
      config,
      // Nombre real: el del perfil al iniciar (el doc de participante lo escribe el cliente).
      participants: participants.map((p) => ({
        ...p,
        uid: p.id,
        displayName: profiles.get(p.id)?.displayName ?? p.displayName,
        ...(teams ? { team: teams[p.id] } : {}),
      })),
      crypticIds,
      pool,
      tiebreakIds,
      startedAt: Date.now() + COUNTDOWN_MS, // Tras la selección: el margen no se consume en lecturas.
    });
  } catch (error) {
    // Los errores del motor llegan del DO como Error genérico con el mensaje original.
    throw new AppError(409, 'start_failed', error instanceof Error ? error.message : 'No se pudo iniciar.');
  }

  // Los clientes escuchan este cambio en Firestore y abren el WebSocket.
  // La lista de cripticos no se publica: vive solo en el DO (el siguiente siempre es secreto).
  await firestore.commit([
    { kind: 'update', path: `competitions/${competitionId}`, data: { status: 'live', crypticIds: [], pool: { easy: [], medium: [], hard: [] }, ...times } },
  ]);
  return json({ ok: true, data: times });
}

const SOLUTION_ERRORS: Record<string, [number, string]> = {
  not_found: [404, 'La partida no existe.'],
  not_participant: [403, 'Solo los participantes ven las soluciones.'],
  not_finished: [409, 'La partida no terminó.'],
};

/** GET /api/competitions/:id/solutions — respuestas y explicaciones al terminar. */
async function handleSolutions(request: Request, env: Env, competitionId: string): Promise<Response> {
  const user = await verifyFirebaseToken(bearerToken(request), env.FIREBASE_PROJECT_ID);
  try {
    return json({ ok: true, data: await roomStub(env, competitionId).solutions(user.uid) });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const [status, message] = SOLUTION_ERRORS[code] ?? [500, 'No se pudieron cargar las soluciones.'];
    throw new AppError(status, code || 'internal', message);
  }
}

/**
 * Proxy del handler de Firebase Auth en el mismo dominio (`/__/auth/*`).
 * Con `VITE_AUTH_SAME_ORIGIN=true` el login de Google no depende de cookies de terceros,
 * que Safari, Brave y el Chrome móvil bloquean y que rompen el popup/redirect.
 */
async function proxyFirebaseAuth(request: Request, url: URL, env: Env): Promise<Response> {
  const target = new URL(`${url.pathname}${url.search}`, `https://${env.FIREBASE_PROJECT_ID}.firebaseapp.com`);
  return fetch(new Request(target, request));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/__/auth/') || url.pathname.startsWith('/__/firebase/')) {
        return await proxyFirebaseAuth(request, url, env);
      }

      if (url.pathname === '/api/competitions') {
        if (request.method !== 'POST') throw new AppError(405, 'method_not_allowed', 'Solo POST.');
        return await handleCreate(request, env);
      }
      const roomMatch = url.pathname.match(/^\/api\/competitions\/([^/]+)$/);
      if (roomMatch && roomMatch[1] !== 'start' && request.method === 'PATCH') {
        const id = decodeURIComponent(roomMatch[1]!);
        if (!COMPETITION_ID.test(id)) throw new AppError(400, 'bad_id', 'Id inválido.');
        return await handleUpdate(request, env, id);
      }
      if (url.pathname === '/api/competitions/start') {
        if (request.method !== 'POST') throw new AppError(405, 'method_not_allowed', 'Solo POST.');
        return await handleStart(request, env);
      }

      const solutionsMatch = url.pathname.match(/^\/api\/competitions\/([^/]+)\/solutions$/);
      if (solutionsMatch) {
        const competitionId = decodeURIComponent(solutionsMatch[1] ?? '');
        if (!COMPETITION_ID.test(competitionId)) throw new AppError(400, 'bad_id', 'Id inválido.');
        if (request.method !== 'GET') throw new AppError(405, 'method_not_allowed', 'Solo GET.');
        return await handleSolutions(request, env, competitionId);
      }

      const wsMatch = url.pathname.match(/^\/api\/competitions\/([^/]+)\/ws$/);
      if (wsMatch) {
        const competitionId = decodeURIComponent(wsMatch[1] ?? '');
        if (!COMPETITION_ID.test(competitionId)) throw new AppError(400, 'bad_id', 'Id inválido.');
        if (request.headers.get('Upgrade') !== 'websocket') throw new AppError(426, 'upgrade_required', 'Se esperaba WebSocket.');
        return await roomStub(env, competitionId).fetch(request);
      }

      if (url.pathname.startsWith('/api/')) throw new AppError(404, 'not_found', 'Ruta no encontrada.');
      return await env.ASSETS.fetch(request);
    } catch (error) {
      return errorResponse(error);
    }
  },
} satisfies ExportedHandler<Env>;
