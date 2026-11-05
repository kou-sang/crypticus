// Durable Object: un árbitro autoritativo por competencia.
// Estado en memoria + SQLite local del DO; WebSocket con hibernación; cierre por alarma.
// Firestore solo se toca al iniciar (vía Worker) y al terminar (resultados, rating, estadísticas).
import { DurableObject } from 'cloudflare:workers';
import { verifyAnswer } from '../shared/answerHash';
import { computeRatingDeltas, computeSolvePoints, evaluateEnd, LIMITS, rankParticipants, type EndEvaluation } from '../shared/scoring';
import type { Competition, CompetitionStatus, Participant } from '../shared/types';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  type AnswerReply,
  type ClientMessage,
  type HintReply,
  type RoomSnapshot,
  type ServerMessage,
} from '../shared/protocol';
import { verifyFirebaseToken } from './auth';
import { AppError } from './errors';
import { FirestoreRest, type Write } from './firestore';
import { getCrypticSecret } from './secrets';
import type { Env } from './env';

type RoomConfig = Pick<
  Competition,
  'mode' | 'scoring' | 'durationSec' | 'targetCount' | 'winByTwoMinScore' | 'maxHintsPerClue' | 'crypticIds' | 'hostId'
>;

interface RoomState {
  competitionId: string;
  config: RoomConfig;
  status: CompetitionStatus;
  startedAt: number;
  endsAt: number;
  participants: Record<string, Participant>;
  winnerId: string | null;
  endReason: EndEvaluation['reason'];
  synced: boolean; // Resultado persistido en Firestore
  syncAttempts: number;
}

export interface StartInput {
  competitionId: string;
  config: RoomConfig;
  participants: Participant[];
  startedAt: number;
  endsAt: number;
}

interface SocketAttachment {
  uid: string | null;
}

const STATE_KEY = 'state';
const SYNC_RETRY_MS = 15_000;
const MAX_SYNC_ATTEMPTS = 20;

export class CompetitionRoom extends DurableObject<Env> {
  private state: RoomState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Restaura el estado tras hibernación/desalojo antes de procesar cualquier evento.
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<RoomState>(STATE_KEY)) ?? null;
    });
  }

  // ---------- RPC desde el Worker ----------

  /** Idempotente: si ya inició, devuelve los tiempos existentes. */
  async start(input: StartInput): Promise<{ startedAt: number; endsAt: number }> {
    if (this.state) {
      if (this.state.competitionId !== input.competitionId) throw new AppError(409, 'room_mismatch', 'Sala inconsistente.');
      return { startedAt: this.state.startedAt, endsAt: this.state.endsAt };
    }
    const participants: Record<string, Participant> = {};
    for (const p of input.participants) participants[p.uid] = p;

    this.state = {
      competitionId: input.competitionId,
      config: input.config,
      status: 'live',
      startedAt: input.startedAt,
      endsAt: input.endsAt,
      participants,
      winnerId: null,
      endReason: null,
      synced: false,
      syncAttempts: 0,
    };
    await this.persist();
    await this.ctx.storage.setAlarm(input.endsAt);
    return { startedAt: input.startedAt, endsAt: input.endsAt };
  }

  // ---------- WebSocket ----------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Se esperaba WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ uid: null } satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    if (text.length > MAX_CLIENT_MESSAGE_BYTES) {
      this.send(ws, { type: 'error', code: 'too_large', message: 'Mensaje demasiado grande.' });
      return;
    }

    let message: ClientMessage;
    try {
      message = JSON.parse(text) as ClientMessage;
    } catch {
      this.send(ws, { type: 'error', code: 'bad_json', message: 'JSON inválido.' });
      return;
    }

    if (message.type === 'ping') {
      this.send(ws, { type: 'pong', serverTime: Date.now() });
      return;
    }

    if (message.type === 'auth') {
      await this.handleAuth(ws, message.token);
      return;
    }

    const uid = (ws.deserializeAttachment() as SocketAttachment | null)?.uid ?? null;
    const reqId = typeof message.reqId === 'string' ? message.reqId.slice(0, 40) : '';
    try {
      if (!uid) throw new AppError(401, 'unauthenticated', 'Autentícate primero.');
      if (typeof message.crypticId !== 'string') throw new AppError(400, 'bad_body', 'crypticId inválido.');
      const data =
        message.type === 'answer'
          ? await this.handleAnswer(uid, message.crypticId, String(message.guess ?? '').slice(0, 100))
          : await this.handleHint(uid, message.crypticId, message.reveal === true);
      this.send(ws, { type: 'reply', reqId, ok: true, data });
    } catch (error) {
      const appError =
        error instanceof AppError ? error : new AppError(500, 'internal', 'Error interno.');
      if (!(error instanceof AppError)) console.error('[room] error', error);
      this.send(ws, { type: 'reply', reqId, ok: false, error: { code: appError.code, message: appError.message } });
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      // El socket ya estaba cerrado.
    }
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    console.warn('[room] websocket error', error);
  }

  // ---------- Alarma: fin por tiempo y reintentos de sincronización ----------

  async alarm(): Promise<void> {
    if (!this.state) return;
    if (this.state.status === 'live') {
      const evaluation = this.evaluate(Date.now());
      await this.finish(evaluation.finished ? evaluation : { finished: true, reason: 'time', winnerId: null });
      return;
    }
    if (!this.state.synced) await this.syncResults();
  }

  // ---------- Handlers ----------

  private async handleAuth(ws: WebSocket, token: unknown): Promise<void> {
    try {
      const user = await verifyFirebaseToken(typeof token === 'string' ? token : '', this.env.FIREBASE_PROJECT_ID);
      ws.serializeAttachment({ uid: user.uid } satisfies SocketAttachment);
      this.send(ws, { type: 'ready', uid: user.uid, snapshot: this.snapshot() });
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'No autorizado.';
      this.send(ws, { type: 'error', code: 'unauthenticated', message });
      ws.close(4401, 'unauthenticated');
    }
  }

  private requireLive(now: number): RoomState {
    const state = this.state;
    if (!state || state.status !== 'live') throw new AppError(409, 'not_live', 'La competencia no está en curso.');
    if (now < state.startedAt) throw new AppError(409, 'not_started', 'Aún no empieza.');
    return state;
  }

  private requireParticipant(state: RoomState, uid: string): Participant {
    const participant = state.participants[uid];
    if (!participant) throw new AppError(403, 'not_participant', 'No participas en esta competencia.');
    return participant;
  }

  private async handleAnswer(uid: string, crypticId: string, guess: string): Promise<AnswerReply> {
    const now = Date.now();
    const state = this.requireLive(now);

    if (now >= state.endsAt) {
      await this.finish(this.evaluateOrTime(now));
      return { correct: false, points: 0, finished: true };
    }

    const before = this.requireParticipant(state, uid);
    if (!state.config.crypticIds.includes(crypticId)) throw new AppError(400, 'unknown_cryptic', 'Criptico fuera de la competencia.');
    if (before.solvedIds.includes(crypticId)) throw new AppError(409, 'already_solved', 'Ya resolviste este criptico.');
    if (before.lastAttemptAt !== null && now - before.lastAttemptAt < LIMITS.minAttemptIntervalMs) {
      throw new AppError(429, 'too_fast', 'Espera un momento antes de volver a intentar.');
    }
    const secret = getCrypticSecret(crypticId);
    if (!secret) throw new AppError(404, 'missing_cryptic', 'Criptico no encontrado.');

    // Reserva el intento ANTES del await para que dos mensajes simultáneos no se intercalen.
    before.lastAttemptAt = now;
    const correct = await verifyAnswer(this.env.ANSWER_HMAC_KEY, crypticId, guess, secret.hash);

    // Revalidación síncrona tras el await (el DO puede haber procesado otros mensajes).
    const participant = this.requireParticipant(this.requireLive(now), uid);
    participant.attempts += 1;

    if (!correct || participant.solvedIds.includes(crypticId)) {
      await this.persist();
      return { correct: false, points: 0, finished: false };
    }

    const points = computeSolvePoints({
      rule: state.config.scoring,
      difficulty: secret.difficulty,
      hintsUsed: participant.hintsByClue[crypticId] ?? 0,
      elapsedMs: now - state.startedAt,
      durationMs: state.config.durationSec * 1000,
    });
    participant.score += points;
    participant.solvedIds = [...participant.solvedIds, crypticId];
    participant.lastSolvedAt = now;

    const evaluation = this.evaluate(now);
    await this.persist();
    this.broadcast({ type: 'participant', participant });
    if (evaluation.finished) await this.finish(evaluation);

    return { correct: true, points, finished: evaluation.finished, explanation: secret.explanation ?? null };
  }

  private async handleHint(uid: string, crypticId: string, reveal: boolean): Promise<HintReply> {
    const state = this.state;
    if (!state) throw new AppError(409, 'not_live', 'La competencia no está en curso.');
    const participant = this.requireParticipant(state, uid);
    if (!state.config.crypticIds.includes(crypticId)) throw new AppError(400, 'unknown_cryptic', 'Criptico fuera de la competencia.');

    const hints = getCrypticSecret(crypticId)?.hints ?? [];
    const used = participant.hintsByClue[crypticId] ?? 0;
    const maxAllowed = Math.min(state.config.maxHintsPerClue, hints.length);

    if (!reveal) return { hints: hints.slice(0, used), remaining: maxAllowed - used };

    this.requireLive(Date.now());
    if (participant.solvedIds.includes(crypticId)) throw new AppError(409, 'already_solved', 'Ya resolviste este criptico.');
    if (used >= maxAllowed) throw new AppError(409, 'no_more_hints', 'No quedan pistas.');

    participant.hintsByClue = { ...participant.hintsByClue, [crypticId]: used + 1 };
    participant.hintsUsed += 1;
    await this.persist();
    this.broadcast({ type: 'participant', participant });
    return { hints: hints.slice(0, used + 1), remaining: maxAllowed - used - 1 };
  }

  // ---------- Fin de partida ----------

  private evaluate(now: number): EndEvaluation {
    const state = this.state!;
    return evaluateEnd(
      { ...state.config, endsAt: state.endsAt },
      Object.values(state.participants),
      now,
    );
  }

  private evaluateOrTime(now: number): EndEvaluation {
    const evaluation = this.evaluate(now);
    return evaluation.finished ? evaluation : { finished: true, reason: 'time', winnerId: null };
  }

  private async finish(evaluation: EndEvaluation): Promise<void> {
    const state = this.state;
    if (!state || state.status === 'finished') return;
    state.status = 'finished';
    state.winnerId = evaluation.winnerId;
    state.endReason = evaluation.reason;
    await this.persist();
    await this.ctx.storage.deleteAlarm();
    this.broadcast({ type: 'finished', winnerId: evaluation.winnerId });
    await this.syncResults();
  }

  /** Escribe resultados, rating y estadísticas en Firestore. Reintenta por alarma si falla. */
  private async syncResults(): Promise<void> {
    const state = this.state;
    if (!state || state.synced) return;
    try {
      const firestore = new FirestoreRest(this.env.FIREBASE_SERVICE_ACCOUNT);
      const ranked = rankParticipants(Object.values(state.participants));
      const users = await firestore.batchGet<{ rating?: number }>(ranked.map((p) => `users/${p.uid}`));
      const ratings: Record<string, number> = {};
      users.forEach((user, uid) => {
        ratings[uid] = user.rating ?? 1200;
      });
      const deltas = computeRatingDeltas(ranked, ratings);
      const base = `competitions/${state.competitionId}`;

      const writes: Write[] = [
        {
          kind: 'update',
          path: base,
          data: {
            status: 'finished',
            finishedAt: Date.now(),
            winnerId: state.winnerId,
            endReason: state.endReason,
            finalStandings: ranked.map((p) => ({
              uid: p.uid,
              displayName: p.displayName,
              rank: p.rank,
              score: p.score,
              solved: p.solvedIds.length,
              hintsUsed: p.hintsUsed,
              ratingDelta: deltas[p.uid] ?? 0,
            })),
          },
        },
        ...ranked.map<Write>((p) => ({
          kind: 'update',
          path: `${base}/participants/${p.uid}`,
          data: {
            score: p.score,
            solvedIds: p.solvedIds,
            hintsByClue: p.hintsByClue,
            hintsUsed: p.hintsUsed,
            attempts: p.attempts,
            lastSolvedAt: p.lastSolvedAt,
            lastAttemptAt: p.lastAttemptAt,
          },
        })),
        ...ranked
          .filter((p) => p.uid in ratings) // Usuarios borrados se omiten.
          .map<Write>((p) => ({
            kind: 'increment',
            path: `users/${p.uid}`,
            increments: {
              rating: deltas[p.uid] ?? 0,
              'stats.played': 1,
              'stats.wins': p.uid === state.winnerId ? 1 : 0,
              'stats.solved': p.solvedIds.length,
              'stats.hintsUsed': p.hintsUsed,
            },
          })),
      ];

      await firestore.commit(writes);
      state.synced = true;
      await this.persist();
    } catch (error) {
      state.syncAttempts += 1;
      await this.persist();
      console.error(`[room] sync fallida (${state.syncAttempts})`, error);
      if (state.syncAttempts < MAX_SYNC_ATTEMPTS) await this.ctx.storage.setAlarm(Date.now() + SYNC_RETRY_MS);
    }
  }

  // ---------- Utilidades ----------

  private snapshot(): RoomSnapshot {
    const state = this.state;
    return {
      status: state?.status ?? 'lobby',
      startedAt: state?.startedAt ?? null,
      endsAt: state?.endsAt ?? null,
      participants: state ? Object.values(state.participants) : [],
      serverTime: Date.now(),
    };
  }

  private async persist(): Promise<void> {
    if (this.state) await this.ctx.storage.put(STATE_KEY, this.state);
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Socket cerrado: se ignora.
    }
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (!attachment?.uid) continue;
      try {
        ws.send(payload);
      } catch {
        // Socket cerrado: se ignora.
      }
    }
  }
}
