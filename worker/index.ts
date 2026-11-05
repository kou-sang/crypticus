// Worker de entrada: sirve la SPA (static assets) y enruta /api/* al árbitro de cada competencia.
import { bearerToken, verifyFirebaseToken } from './auth';
import { AppError, errorResponse, json } from './errors';
import { FirestoreRest } from './firestore';
import type { Env } from './env';
import type { Competition, Participant } from '../shared/types';

export { CompetitionRoom } from './competitionRoom';

const COMPETITION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const COUNTDOWN_MS = 3_000;

function roomStub(env: Env, competitionId: string) {
  return env.COMPETITION_ROOM.get(env.COMPETITION_ROOM.idFromName(competitionId));
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

/** POST /api/competitions/start — mismo contrato que la variante Vercel. */
async function handleStart(request: Request, env: Env): Promise<Response> {
  const user = await verifyFirebaseToken(bearerToken(request), env.FIREBASE_PROJECT_ID);
  const competitionId = await readCompetitionId(request);
  const firestore = new FirestoreRest(env.FIREBASE_SERVICE_ACCOUNT);

  const competition = await firestore.getDoc<Competition>(`competitions/${competitionId}`);
  if (!competition) throw new AppError(404, 'not_found', 'La competencia no existe.');
  if (competition.hostId !== user.uid) throw new AppError(403, 'not_host', 'Solo el anfitrión puede iniciar.');
  if (competition.status === 'finished') throw new AppError(409, 'already_finished', 'La competencia ya terminó.');

  const participants = await firestore.listDocs<Participant>(`competitions/${competitionId}/participants`);
  const minPlayers = competition.scoring === 'winByTwo' ? 2 : 1;
  if (participants.length < minPlayers) {
    throw new AppError(409, 'not_enough_players', `Se necesitan al menos ${minPlayers} jugadores.`);
  }

  const startedAt = Date.now() + COUNTDOWN_MS;
  // El DO es idempotente: si ya inició (reintento), devuelve los tiempos originales.
  const times = await roomStub(env, competitionId).start({
    competitionId,
    config: {
      mode: competition.mode,
      scoring: competition.scoring,
      durationSec: competition.durationSec,
      targetCount: competition.targetCount,
      winByTwoMinScore: competition.winByTwoMinScore,
      maxHintsPerClue: competition.maxHintsPerClue,
      crypticIds: competition.crypticIds,
      hostId: competition.hostId,
    },
    participants: participants.map((p) => ({ ...p, uid: p.id })),
    startedAt,
    endsAt: startedAt + competition.durationSec * 1000,
  });

  // Los clientes escuchan este cambio en Firestore y abren el WebSocket.
  await firestore.commit([
    { kind: 'update', path: `competitions/${competitionId}`, data: { status: 'live', ...times } },
  ]);
  return json({ ok: true, data: times });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/competitions/start') {
        if (request.method !== 'POST') throw new AppError(405, 'method_not_allowed', 'Solo POST.');
        return await handleStart(request, env);
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
