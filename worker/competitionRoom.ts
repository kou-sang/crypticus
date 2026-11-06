// Durable Object: árbitro autoritativo de una competencia.
// Ejecuta shared/engine.ts en memoria, persiste en el SQLite local del DO, difunde el estado por
// WebSocket (con hibernación) y usa alarmas para fin por tiempo, prórroga y reintentos de sincronización.
import { DurableObject } from 'cloudflare:workers';
import { verifyAnswer } from '../shared/answerHash';
import {
  applyAnswer,
  applyDifficultyVote,
  applyHint,
  createLiveState,
  GameError,
  nextDeadline,
  rankState,
  reserveAttempt,
  tick,
  toggleExtraTime,
  toggleSkip,
  type LiveState,
} from '../shared/engine';
import { computeRatingDeltas } from '../shared/scoring';
import type { CompetitionConfig, Difficulty, Participant } from '../shared/types';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  type AckReply,
  type ActionMessage,
  type AnswerReply,
  type ClientMessage,
  type HintReply,
  type ServerMessage,
  type Solution,
} from '../shared/protocol';
import { verifyFirebaseToken } from './auth';
import { AppError } from './errors';
import { FirestoreRest, type Write } from './firestore';
import { buildCatalog, getCrypticSecret, solutionsFor } from './secrets';
import type { Env } from './env';

export interface StartInput {
  competitionId: string;
  title: string;
  config: CompetitionConfig;
  participants: Participant[];
  crypticIds: string[];
  pool: Record<Difficulty, string[]>;
  startedAt: number;
}

interface SyncMeta {
  synced: boolean;
  attempts: number;
}

interface SocketAttachment {
  uid: string | null;
}

const STATE_KEY = 'state';
const SYNC_KEY = 'sync';
const SYNC_RETRY_MS = 15_000;
const MAX_SYNC_ATTEMPTS = 20;

export class CompetitionRoom extends DurableObject<Env> {
  private state: LiveState | null = null;
  private sync: SyncMeta = { synced: false, attempts: 0 };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Restaura el estado tras hibernación/desalojo antes de procesar cualquier evento.
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<LiveState>(STATE_KEY)) ?? null;
      this.sync = (await ctx.storage.get<SyncMeta>(SYNC_KEY)) ?? { synced: false, attempts: 0 };
    });
  }

  // ---------- RPC desde el Worker ----------

  /** Idempotente: si ya inició, devuelve los tiempos existentes. */
  async start(input: StartInput): Promise<{ startedAt: number; endsAt: number }> {
    if (this.state) {
      if (this.state.competitionId !== input.competitionId) throw new Error('Sala inconsistente.');
      return { startedAt: this.state.startedAt, endsAt: this.state.endsAt };
    }
    const allIds = [...new Set([...input.crypticIds, ...input.pool.easy, ...input.pool.medium, ...input.pool.hard])];
    this.state = createLiveState({
      competitionId: input.competitionId,
      title: input.title,
      config: input.config,
      participants: input.participants,
      crypticIds: input.crypticIds,
      pool: input.pool,
      catalog: buildCatalog(allIds),
      startedAt: input.startedAt,
    });
    await this.commit();
    return { startedAt: this.state.startedAt, endsAt: this.state.endsAt };
  }

  /** Soluciones de una partida terminada, solo para sus participantes. */
  async solutions(uid: string): Promise<Solution[]> {
    const state = this.state;
    if (!state) throw new Error('not_found');
    if (!state.participants[uid]) throw new Error('not_participant');
    if (state.status !== 'finished') throw new Error('not_finished');
    return solutionsFor(state);
  }

  // ---------- WebSocket ----------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Se esperaba WebSocket', { status: 426 });
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

    if (message.type === 'ping') return this.send(ws, { type: 'pong', serverTime: Date.now() });
    if (message.type === 'auth') return this.handleAuth(ws, message.token);

    const uid = (ws.deserializeAttachment() as SocketAttachment | null)?.uid ?? null;
    const reqId = typeof message.reqId === 'string' ? message.reqId.slice(0, 40) : '';
    try {
      if (!uid) throw new AppError(401, 'unauthenticated', 'Autentícate primero.');
      const data = await this.handleAction(uid, message);
      this.send(ws, { type: 'reply', reqId, ok: true, data });
    } catch (error) {
      const { code, message: text } = describeError(error);
      this.send(ws, { type: 'reply', reqId, ok: false, error: { code, message: text } });
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      // Ya estaba cerrado.
    }
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    console.warn('[room] websocket error', error);
  }

  // ---------- Alarma ----------

  async alarm(): Promise<void> {
    const state = this.state;
    if (!state) return;
    if (state.status === 'live') {
      const result = tick(state, Date.now());
      await this.commit();
      if (result.finished) await this.syncResults();
      return;
    }
    if (!this.sync.synced) await this.syncResults();
  }

  // ---------- Acciones ----------

  private async handleAuth(ws: WebSocket, token: unknown): Promise<void> {
    try {
      const user = await verifyFirebaseToken(typeof token === 'string' ? token : '', this.env.FIREBASE_PROJECT_ID);
      ws.serializeAttachment({ uid: user.uid } satisfies SocketAttachment);
      const solutions = this.state ? solutionsFor(this.state) : [];
      this.send(ws, { type: 'ready', uid: user.uid, state: this.state, solutions, serverTime: Date.now() });
    } catch (error) {
      this.send(ws, { type: 'error', code: 'unauthenticated', message: describeError(error).message });
      ws.close(4401, 'unauthenticated');
    }
  }

  private requireState(): LiveState {
    if (!this.state) throw new GameError('not_live', 'La competencia no ha iniciado.');
    return this.state;
  }

  private async handleAction(uid: string, message: ActionMessage): Promise<AnswerReply | HintReply | AckReply> {
    const state = this.requireState();
    const now = Date.now();

    // Si venció el plazo, se evalúa primero (cierre o prórroga).
    if (state.status === 'live' && now >= nextDeadline(state)) {
      const result = tick(state, now);
      await this.commit();
      if (result.finished) {
        await this.syncResults();
        throw new GameError('time_up', 'Se acabó el tiempo.');
      }
    }

    switch (message.type) {
      case 'answer':
        return this.handleAnswer(uid, String(message.crypticId ?? ''), String(message.guess ?? '').slice(0, 100));
      case 'hint':
        return this.handleHint(uid, String(message.crypticId ?? ''), message.reveal === true);
      case 'vote':
        applyDifficultyVote(state, { uid, tier: message.tier, now });
        await this.commit();
        return { ok: true };
      case 'extraTime': {
        const { applied } = toggleExtraTime(state, { uid, now });
        await this.commit();
        return { ok: true, applied };
      }
      case 'skip': {
        const { skipped } = toggleSkip(state, { uid, now });
        await this.commit();
        if (state.status === 'finished') await this.syncResults();
        return { ok: true, applied: skipped };
      }
      default:
        throw new AppError(400, 'unknown_action', 'Acción desconocida.');
    }
  }

  private async handleAnswer(uid: string, crypticId: string, guess: string): Promise<AnswerReply> {
    const state = this.requireState();
    const now = Date.now();
    reserveAttempt(state, uid, crypticId, now); // Valida y reserva la ventana anti fuerza bruta.
    const secret = getCrypticSecret(crypticId);
    if (!secret) throw new GameError('missing_cryptic', 'Criptico no encontrado.');

    const correct = await verifyAnswer(this.env.ANSWER_HMAC_KEY, crypticId, guess, secret.hash);
    // applyAnswer revalida: durante el await pudo cerrarse la ronda.
    const outcome = applyAnswer(state, { uid, crypticId, correct, now: Date.now() });
    await this.commit();
    if (outcome.finished) await this.syncResults();
    return { ...outcome, explanation: outcome.correct ? (secret.explanation ?? null) : null };
  }

  private async handleHint(uid: string, crypticId: string, reveal: boolean): Promise<HintReply> {
    const state = this.requireState();
    const { used, maxAllowed } = applyHint(state, { uid, crypticId, reveal, now: Date.now() });
    if (reveal) await this.commit();
    const hints = getCrypticSecret(crypticId)?.hints ?? [];
    return { hints: hints.slice(0, used), remaining: Math.max(0, maxAllowed - used) };
  }

  // ---------- Persistencia, difusión y alarmas ----------

  /** Persiste, reprograma la alarma y difunde el estado. */
  private async commit(): Promise<void> {
    const state = this.state;
    if (!state) return;
    await this.ctx.storage.put(STATE_KEY, state);
    if (state.status === 'live') await this.ctx.storage.setAlarm(nextDeadline(state));
    this.broadcast({ type: 'state', state, solutions: solutionsFor(state) });
  }

  /** Escribe resultados, rating y estadísticas en Firestore. Reintenta por alarma si falla. */
  private async syncResults(): Promise<void> {
    const state = this.state;
    if (!state || state.status !== 'finished' || this.sync.synced) return;
    try {
      const firestore = new FirestoreRest(this.env.FIREBASE_SERVICE_ACCOUNT);
      const ranked = rankState(state);
      const users = await firestore.batchGet<{ rating?: number }>(ranked.map((p) => `users/${p.uid}`));
      const ratings: Record<string, number> = {};
      users.forEach((user, uid) => {
        ratings[uid] = user.rating ?? 1200;
      });
      // El modo jefe es cooperativo: no altera el rating.
      const competitive = state.config.mode !== 'boss' && ranked.length >= 2;
      const deltas = competitive ? computeRatingDeltas(ranked, ratings) : {};
      const bossDefeated = state.endReason === 'bossDefeated';
      const isWinner = (playerId: string) => (state.boss ? bossDefeated : playerId === state.winnerId);

      const writes: Write[] = [
        {
          kind: 'update',
          path: `competitions/${state.competitionId}`,
          data: {
            status: 'finished',
            finishedAt: state.finishedAt ?? Date.now(),
            winnerId: state.winnerId,
            endReason: state.endReason,
            bossDefeated: state.boss ? bossDefeated : null,
            boss: state.boss,
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
        // Historial por jugador (partidas + evolución del rating).
        ...ranked
          .filter((p) => p.uid in ratings)
          .map<Write>((p) => ({
            kind: 'set',
            path: `users/${p.uid}/history/${state.competitionId}`,
            data: {
              competitionId: state.competitionId,
              title: state.title,
              mode: state.config.mode,
              flow: state.config.flow,
              finishedAt: state.finishedAt ?? Date.now(),
              rank: p.rank,
              players: ranked.length,
              score: p.score,
              solved: p.solvedIds.length,
              hintsUsed: p.hintsUsed,
              won: isWinner(p.uid),
              endReason: state.endReason,
              ratingDelta: deltas[p.uid] ?? 0,
              ratingAfter: (ratings[p.uid] ?? 1200) + (deltas[p.uid] ?? 0),
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
              'stats.wins': isWinner(p.uid) ? 1 : 0,
              'stats.solved': p.solvedIds.length,
              'stats.hintsUsed': p.hintsUsed,
            },
          })),
      ];
      await firestore.commit(writes);
      this.sync = { synced: true, attempts: this.sync.attempts };
      await this.ctx.storage.put(SYNC_KEY, this.sync);
    } catch (error) {
      this.sync = { synced: false, attempts: this.sync.attempts + 1 };
      await this.ctx.storage.put(SYNC_KEY, this.sync);
      console.error(`[room] sync fallida (${this.sync.attempts})`, error);
      if (this.sync.attempts < MAX_SYNC_ATTEMPTS) await this.ctx.storage.setAlarm(Date.now() + SYNC_RETRY_MS);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Socket cerrado.
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
        // Socket cerrado.
      }
    }
  }
}

function describeError(error: unknown): { code: string; message: string } {
  if (error instanceof GameError || error instanceof AppError) return { code: error.code, message: error.message };
  console.error('[room] error inesperado', error);
  return { code: 'internal', message: 'Error interno.' };
}
