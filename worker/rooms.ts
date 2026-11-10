// Crear y editar salas desde el servidor: las reglas se validan aquí (Firestore no deja crear salas desde el cliente)
// y los nombres salen del perfil de cada usuario, no de lo que mande el navegador.
import { AppError, json } from './errors';
import { bearerToken, verifyFirebaseToken } from './auth';
import { FirestoreRest, type Write } from './firestore';
import type { Env } from './env';
import { CONFIG_KEYS, normalizeConfig, normalizeRoom, validateRoom } from '../shared/config';
import { generateRoomCode, rematchRoomId, roomTitle } from '../shared/roomCode';
import type { Competition, CompetitionConfig } from '../shared/types';

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const MAX_INVITES = 7;

/** Id al estilo Firestore: 20 caracteres aleatorios. */
function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // cae al error de abajo
  }
  throw new AppError(400, 'bad_json', 'JSON inválido.');
}

/** Nombre real del usuario (perfil). */
export async function profileName(firestore: FirestoreRest, uid: string): Promise<string> {
  const user = await firestore.getDoc<{ displayName?: string }>(`users/${uid}`);
  if (!user?.displayName) throw new AppError(403, 'no_profile', 'Completa tu perfil antes de jugar.');
  return user.displayName;
}

/** El título no lo elige el cliente: es «CÓDIGO · anfitrión». */
function configAndRoom(body: Record<string, unknown>, title: string) {
  const config = normalizeConfig(body);
  const room = { ...normalizeRoom(body), title };
  const errors = validateRoom(config, room);
  if (errors.length > 0) throw new AppError(400, 'invalid_config', errors.join(' '));
  return { config, room };
}

const CODE_ATTEMPTS = 8;
const OPEN_STATUSES = ['lobby', 'live'];

/**
 * Código de 4 letras sin repetir entre las salas abiertas (en espera o en vivo).
 * 26⁴ ≈ 457 000 combinaciones: con pocas salas abiertas casi siempre basta un intento.
 */
async function uniqueRoomCode(firestore: FirestoreRest, preferred?: string): Promise<string> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    // Revancha: primero se intenta conservar el código de la sala anterior (ya terminó, así que suele estar libre).
    const code = attempt === 0 && preferred ? preferred : generateRoomCode();
    const taken = await firestore.queryEquals<{ code: string }>(
      'competitions',
      [
        { field: 'code', op: 'EQUAL', value: code },
        { field: 'status', op: 'IN', value: OPEN_STATUSES },
      ],
      1,
    );
    if (taken.length === 0) return code;
  }
  throw new AppError(503, 'no_room_code', 'No se pudo generar un código de sala. Intenta de nuevo.');
}

/** Invitados: ids válidos, sin repetir y sin el anfitrión. */
function invitesFrom(body: Record<string, unknown>, hostUid: string): { invitedIds: string[]; invitedNames: Record<string, string> } {
  const ids = Array.isArray(body.invitedIds) ? body.invitedIds : [];
  const invitedIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9]{1,128}$/.test(id)))]
    .filter((id) => id !== hostUid)
    .slice(0, MAX_INVITES);
  const rawNames = (body.invitedNames && typeof body.invitedNames === 'object' ? body.invitedNames : {}) as Record<string, unknown>;
  const invitedNames = Object.fromEntries(invitedIds.map((id) => [id, String(rawNames[id] ?? 'Jugador').slice(0, 32)]));
  return { invitedIds, invitedNames };
}

/** POST /api/competitions — crea la sala (y, si es revancha, la enlaza desde la partida terminada). */
export async function handleCreate(request: Request, env: Env): Promise<Response> {
  const user = await verifyFirebaseToken(bearerToken(request), env.FIREBASE_PROJECT_ID);
  const body = await readBody(request);
  const firestore = new FirestoreRest(env.FIREBASE_SERVICE_ACCOUNT);

  // Revancha: solo un jugador de la partida terminada puede proponerla.
  const rematchOf = typeof body.rematchOf === 'string' ? body.rematchOf : null;
  let origin: (Competition & { id: string }) | null = null;
  if (rematchOf) {
    origin = await firestore.getDoc<Competition>(`competitions/${rematchOf}`);
    if (!origin || origin.status !== 'finished' || !origin.participantIds?.includes(user.uid)) {
      throw new AppError(403, 'bad_rematch', 'Solo los jugadores de una partida terminada pueden pedir revancha.');
    }
    // Ya hay una revancha en espera: todos van a esa misma sala (el cliente se une).
    const existing = await openRematch(firestore, origin);
    if (existing) return json({ ok: true, data: { id: existing, existing: true } });
  }

  const [hostName, code] = await Promise.all([profileName(firestore, user.uid), uniqueRoomCode(firestore, origin?.code)]);
  const { config, room } = configAndRoom(body, roomTitle(code, hostName));
  const { invitedIds, invitedNames } = invitesFrom(body, user.uid);

  const id = origin ? rematchRoomId(origin) : newId();
  const now = Date.now();
  const writes: Write[] = [
    {
      // Revancha: 'create' falla si otro jugador la creó un instante antes (entonces se une a esa).
      kind: rematchOf ? 'create' : 'set',
      path: `competitions/${id}`,
      data: {
        ...config,
        ...room,
        code,
        hostId: user.uid,
        hostName,
        status: 'lobby',
        crypticIds: [],
        pool: { easy: [], medium: [], hard: [] },
        participantIds: [user.uid],
        createdAt: now,
        startedAt: null,
        endsAt: null,
        finishedAt: null,
        winnerId: null,
        ...(invitedIds.length > 0 ? { invitedIds, invitedNames } : {}),
        // El chat sigue siendo el de la primera sala de la serie de revanchas.
        ...(rematchOf && origin
          ? { rematchOf, declinedIds: [], chatId: origin.chatId ?? origin.id, rematchDepth: (origin.rematchDepth ?? 0) + 1 }
          : {}),
      },
    },
    {
      kind: 'set',
      path: `competitions/${id}/participants/${user.uid}`,
      data: {
        uid: user.uid,
        displayName: hostName,
        score: 0,
        solvedIds: [],
        hintsByClue: {},
        hintsUsed: 0,
        attempts: 0,
        wrongAttempts: 0,
        lastSolvedAt: null,
        lastAttemptAt: null,
        joinedAt: now,
        ...(body.device === 'mobile' || body.device === 'desktop' ? { device: body.device } : {}),
      },
    },
    ...(rematchOf ? [{ kind: 'update' as const, path: `competitions/${rematchOf}`, data: { rematchId: id } }] : []),
  ];
  try {
    await firestore.commit(writes);
  } catch (error) {
    if (!(origin && error instanceof AppError && error.code === 'already_exists')) throw error;
    const existing = await openRematch(firestore, origin);
    if (!existing) throw new AppError(409, 'rematch_started', 'La revancha ya empezó.');
    return json({ ok: true, data: { id: existing, existing: true } });
  }
  return json({ ok: true, data: { id } });
}

/** Sala de revancha en espera de una partida, o null. Si ya empezó, no se puede entrar. */
async function openRematch(firestore: FirestoreRest, origin: Competition & { id: string }): Promise<string | null> {
  // Salas creadas antes del id fijo: la enlazada en `rematchId`, si sigue en espera.
  if (origin.rematchId && origin.rematchId !== rematchRoomId(origin)) {
    const legacy = await firestore.getDoc<Competition>(`competitions/${origin.rematchId}`);
    if (legacy?.status === 'lobby') return origin.rematchId;
  }
  const id = rematchRoomId(origin);
  const room = await firestore.getDoc<Competition>(`competitions/${id}`);
  if (!room) return null;
  if (room.status !== 'lobby') throw new AppError(409, 'rematch_started', 'La revancha ya empezó: no se puede entrar.');
  return id;
}

/** PATCH /api/competitions/:id — el anfitrión cambia las reglas en la sala de espera. */
export async function handleUpdate(request: Request, env: Env, competitionId: string): Promise<Response> {
  const user = await verifyFirebaseToken(bearerToken(request), env.FIREBASE_PROJECT_ID);
  const body = await readBody(request);
  const firestore = new FirestoreRest(env.FIREBASE_SERVICE_ACCOUNT);
  const competition = await firestore.getDoc<Competition>(`competitions/${competitionId}`);
  if (!competition) throw new AppError(404, 'not_found', 'La sala no existe.');
  if (competition.hostId !== user.uid) throw new AppError(403, 'not_host', 'Solo el anfitrión puede editar la sala.');
  if (competition.status !== 'lobby') throw new AppError(409, 'not_lobby', 'La partida ya empezó.');

  // Se conserva el título (código + anfitrión); salas anteriores a v1.0 mantienen el suyo.
  const { config, room } = configAndRoom(body, competition.title || 'Sala');
  const joined = competition.participantIds?.length ?? 0;
  if (joined > room.maxPlayers) {
    throw new AppError(409, 'too_many_players', `Ya hay ${joined} jugadores en la sala: el nuevo cupo es ${room.maxPlayers}.`);
  }
  await firestore.commit([
    {
      kind: 'update',
      path: `competitions/${competitionId}`,
      data: {
        ...(config satisfies CompetitionConfig),
        ...room,
        // Revancha: las reglas cambiaron, quien la rechazó puede reconsiderarla.
        ...(competition.rematchOf ? { declinedIds: [] } : {}),
        updatedAt: Date.now(),
      },
      clear: CONFIG_KEYS,
    },
  ]);
  return json({ ok: true, data: { id: competitionId } });
}
