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
  revealableIds,
  tick,
  toggleExtraTime,
  toggleEndVote,
  passCryptic,
  surrender,
  isSequential,
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
  rtts?: number[]; // Últimas muestras de RTT medidas por el servidor (probe/probeAck).
}

/** Respuesta correcta en espera de arbitraje (rondas). */
interface RaceEntry {
  uid: string;
  receivedAt: number;
  effectiveAt: number; // receivedAt - latencia de ida estimada (compensación)
  resolve: (outcome: ReturnType<typeof applyAnswer>) => void;
  reject: (error: unknown) => void;
}

/**
 * Copia para difundir: durante el intervalo entre cripticos se oculta el siguiente
 * (id y dificultad), para que nadie pueda leerlo antes de que abra.
 */
function publicState(state: LiveState, now: number, uid: string | null): LiveState {
  // Partida terminada: ya no hay nada que ocultar del juego en sí (las soluciones van aparte).
  if (state.status === 'finished') return { ...state, pool: { easy: [], medium: [], hard: [] } };

  const round = state.round;
  const pendingRound = round && round.opensAt != null && now < round.opensAt ? round.crypticId : null;
  let visible: string[];
  if (isSequential(state.config)) {
    // Cada jugador solo recibe los cripticos que ya le abrieron (el siguiente es secreto).
    const me = uid ? state.participants[uid] : undefined;
    const cursor = me?.cursor ?? 0;
    const opened = me && now >= (me.nextOpensAt ?? 0) ? cursor + 1 : cursor;
    visible = state.crypticIds.slice(0, opened);
  } else if (state.config.flow === 'rounds') {
    visible = state.usedIds.filter((id) => id !== pendingRound);
  } else {
    visible = state.crypticIds; // Flujo libre clásico: la lista completa es parte del juego.
  }
  const allowed = new Set(visible);
  return {
    ...state,
    crypticIds: visible,
    usedIds: state.usedIds.filter((id) => allowed.has(id)),
    pool: { easy: [], medium: [], hard: [] },
    catalog: Object.fromEntries(Object.entries(state.catalog).filter(([id]) => allowed.has(id))),
    round: round && pendingRound ? { ...round, crypticId: '' } : round,
  };
}

const RTT_SAMPLES = 5;
// Compensación máxima: limita lo que un cliente podría ganar inflando su latencia.
const MAX_COMPENSATION_MS = 80;
const RACE_JITTER_MS = 15;

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

    if (message.type === 'ping') {
      const sentAt = typeof message.sentAt === 'number' ? message.sentAt : undefined;
      this.send(ws, { type: 'pong', serverTime: Date.now(), sentAt });
      return this.probe(ws);
    }
    if (message.type === 'probeAck') return this.recordRtt(ws, Number(message.id));
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
    } finally {
      // La respuesta sale antes de persistir: el jugador no espera a la escritura en disco.
      await this.flush();
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
      const state = this.state ? publicState(this.state, Date.now(), user.uid) : null;
      this.send(ws, { type: 'ready', uid: user.uid, state, solutions, serverTime: Date.now() });
      this.probe(ws);
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
    if (state.status === 'live' && now >= nextDeadline(state, now)) {
      const result = tick(state, now);
      this.markDirty(result.finished);
      if (result.finished) throw new GameError('time_up', 'Se acabó el tiempo.');
    }

    switch (message.type) {
      case 'answer':
        return this.handleAnswer(uid, String(message.crypticId ?? ''), String(message.guess ?? '').slice(0, 100));
      case 'hint':
        return this.handleHint(uid, String(message.crypticId ?? ''), message.reveal === true);
      case 'vote':
        applyDifficultyVote(state, { uid, tier: message.tier, now });
        this.markDirty();
        return { ok: true };
      case 'extraTime': {
        const { applied } = toggleExtraTime(state, { uid, now });
        this.markDirty();
        return { ok: true, applied };
      }
      case 'endVote': {
        const { ended } = toggleEndVote(state, { uid, now });
        this.markDirty(ended);
        return { ok: true, applied: ended };
      }
      case 'surrender': {
        surrender(state, { uid, now });
        this.markDirty(state.status === 'finished');
        return { ok: true, applied: true };
      }
      case 'pass': {
        passCryptic(state, { uid, now });
        this.markDirty(state.status === 'finished');
        return { ok: true, applied: true };
      }
      case 'skip': {
        const { skipped } = toggleSkip(state, { uid, now });
        this.markDirty(state.status === 'finished');
        return { ok: true, applied: skipped };
      }
      default:
        throw new AppError(400, 'unknown_action', 'Acción desconocida.');
    }
  }

  private async handleAnswer(uid: string, crypticId: string, guess: string): Promise<AnswerReply> {
    const state = this.requireState();
    const receivedAt = Date.now();
    reserveAttempt(state, uid, crypticId, receivedAt); // Valida y reserva la ventana anti fuerza bruta.
    const secret = getCrypticSecret(crypticId);
    if (!secret) throw new GameError('missing_cryptic', 'Criptico no encontrado.');

    const correct = await verifyAnswer(this.env.ANSWER_HMAC_KEY, crypticId, guess, secret.hash);
    // En rondas, varios aciertos casi simultáneos se arbitran con compensación de latencia.
    const contested = correct && state.config.flow === 'rounds' && state.status === 'live' && state.round?.crypticId === crypticId;
    // applyAnswer revalida: durante el await pudo cerrarse la ronda. Se usa la hora de llegada, no la de fin de verificación.
    const outcome = contested
      ? await this.joinRace(uid, crypticId, receivedAt)
      : applyAnswer(state, { uid, crypticId, correct, now: receivedAt });
    this.markDirty(outcome.finished);
    return { ...outcome, explanation: outcome.correct ? (secret.explanation ?? null) : null };
  }

  // ---------- Arbitraje de aciertos simultáneos ----------

  private race: { crypticId: string; entries: RaceEntry[] } | null = null;

  /** Latencia de ida estimada de un jugador (mitad del menor RTT reciente), acotada. */
  private oneWayMs(uid: string): number {
    let best = Infinity;
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.uid === uid && attachment.rtts?.length) best = Math.min(best, ...attachment.rtts);
    }
    return Number.isFinite(best) ? Math.min(best / 2, MAX_COMPENSATION_MS) : 0;
  }

  /**
   * Abre (o se une a) la ventana de arbitraje. La ventana dura lo justo para que llegue un rival
   * más lento que haya respondido antes: (su latencia de ida - la mía) + margen. Gana el menor `effectiveAt`.
   */
  private joinRace(uid: string, crypticId: string, receivedAt: number): Promise<ReturnType<typeof applyAnswer>> {
    const mine = this.oneWayMs(uid);
    const entry: Omit<RaceEntry, 'resolve' | 'reject'> = { uid, receivedAt, effectiveAt: receivedAt - mine };
    return new Promise((resolve, reject) => {
      if (this.race?.crypticId === crypticId) {
        this.race.entries.push({ ...entry, resolve, reject });
        return;
      }
      const others = Object.keys(this.state?.participants ?? {}).filter((id) => id !== uid);
      const slowest = Math.max(0, ...others.map((id) => this.oneWayMs(id)));
      const windowMs = Math.min(MAX_COMPENSATION_MS, Math.max(0, slowest - mine)) + RACE_JITTER_MS;
      this.race = { crypticId, entries: [{ ...entry, resolve, reject }] };
      setTimeout(() => this.settleRace(), windowMs);
    });
  }

  private settleRace(): void {
    const race = this.race;
    this.race = null;
    const state = this.state;
    if (!race) return;
    race.entries.sort((a, b) => a.effectiveAt - b.effectiveAt || a.receivedAt - b.receivedAt);
    for (const entry of race.entries) {
      try {
        if (!state) throw new GameError('not_live', 'La competencia no ha iniciado.');
        // El primero gana la ronda; para los demás applyAnswer devuelve `stale` (o puntúa si hay cuenta atrás).
        entry.resolve(applyAnswer(state, { uid: entry.uid, crypticId: race.crypticId, correct: true, now: entry.receivedAt }));
      } catch (error) {
        entry.reject(error);
      }
    }
  }

  // ---------- Latencia ----------

  private probe(ws: WebSocket): void {
    this.send(ws, { type: 'probe', id: Date.now() });
  }

  private recordRtt(ws: WebSocket, sentAt: number): void {
    const rtt = Date.now() - sentAt;
    if (!Number.isFinite(rtt) || rtt < 0 || rtt > 10_000) return;
    const attachment = (ws.deserializeAttachment() as SocketAttachment | null) ?? { uid: null };
    const rtts = [...(attachment.rtts ?? []), rtt].slice(-RTT_SAMPLES);
    ws.serializeAttachment({ ...attachment, rtts } satisfies SocketAttachment);
  }

  private async handleHint(uid: string, crypticId: string, reveal: boolean): Promise<HintReply> {
    const state = this.requireState();
    const { used, maxAllowed } = applyHint(state, { uid, crypticId, reveal, now: Date.now() });
    if (reveal) this.markDirty();
    const hints = getCrypticSecret(crypticId)?.hints ?? [];
    return { hints: hints.slice(0, used), remaining: Math.max(0, maxAllowed - used) };
  }

  // ---------- Persistencia, difusión y alarmas ----------

  private dirty = false;
  private needsSync = false;

  /** Marca cambios para persistir y difundir después de responder (ver `flush`). */
  private markDirty(finished = false): void {
    this.dirty = true;
    if (finished || this.state?.status === 'finished') this.needsSync = true;
  }

  private async flush(): Promise<void> {
    if (this.dirty) {
      this.dirty = false;
      await this.commit();
    }
    if (this.needsSync) {
      this.needsSync = false;
      await this.syncResults();
    }
  }

  /**
   * Difunde y luego persiste. Difundir primero evita que el "output gate" del DO retenga
   * los mensajes hasta confirmar la escritura en disco.
   */
  private async commit(): Promise<void> {
    const state = this.state;
    if (!state) return;
    this.broadcastState(state);
    await this.ctx.storage.put(STATE_KEY, state);
    if (state.status === 'live') await this.ctx.storage.setAlarm(nextDeadline(state, Date.now()));
  }

  /** Escribe resultados, rating y estadísticas en Firestore. Reintenta por alarma si falla. */
  private async syncResults(): Promise<void> {
    const state = this.state;
    if (!state || state.status !== 'finished' || this.sync.synced) return;
    try {
      const firestore = new FirestoreRest(this.env.FIREBASE_SERVICE_ACCOUNT);
      const ranked = rankState(state);
      const users = await firestore.batchGet<{ rating?: number; modeStats?: Record<string, { rating?: number }> }>(
        ranked.map((p) => `users/${p.uid}`),
      );
      const ratings: Record<string, number> = {};
      users.forEach((user, uid) => {
        ratings[uid] = user.rating ?? 1200;
      });
      // Elo propio de cada modo (Race, Royale, Duel).
      const game = state.config.game;
      const rankedMode = game === 'race' || game === 'royale' || game === 'duel' ? game : null;
      const modeRatings: Record<string, number> = {};
      users.forEach((user, uid) => {
        modeRatings[uid] = (rankedMode ? user.modeStats?.[rankedMode]?.rating : undefined) ?? 1200;
      });
      const modeDeltas = rankedMode && ranked.length >= 2 ? computeRatingDeltas(ranked, modeRatings) : {};
      const outcomeOf = (p: { uid: string; rank: number }): 'win' | 'loss' | 'draw' =>
        state.winnerId ? (p.uid === state.winnerId ? 'win' : 'loss') : p.rank === 1 ? 'draw' : 'loss';
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
              ...(game ? { game } : {}),
              outcome: outcomeOf(p),
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
        // Estadísticas y Elo por modo (solo partidas de 2 o más).
        ...(rankedMode && ranked.length >= 2
          ? ranked
              .filter((p) => p.uid in ratings)
              .flatMap<Write>((p) => {
                const outcome = outcomeOf(p);
                const prefix = `modeStats.${rankedMode}`;
                return [
                  {
                    kind: 'setFields',
                    path: `users/${p.uid}`,
                    fields: { [`${prefix}.rating`]: (modeRatings[p.uid] ?? 1200) + (modeDeltas[p.uid] ?? 0) },
                  },
                  {
                    kind: 'increment',
                    path: `users/${p.uid}`,
                    increments: {
                      [`${prefix}.played`]: 1,
                      [`${prefix}.wins`]: outcome === 'win' ? 1 : 0,
                      [`${prefix}.losses`]: outcome === 'loss' ? 1 : 0,
                      [`${prefix}.draws`]: outcome === 'draw' ? 1 : 0,
                    },
                  },
                ];
              })
          : []),
        // Cripticos vistos: no se repetirán en futuras salas con este jugador.
        ...this.seenWrites(state, ranked.map((p) => p.uid)),
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

  private seenWrites(state: LiveState, uids: string[]): Write[] {
    const at = state.finishedAt ?? Date.now();
    const played = revealableIds(state);
    if (played.length === 0) return [];
    const entries = Object.fromEntries(played.map((id) => [id, at]));
    return uids.map((uid) => ({ kind: 'mergeMap', path: `userSeen/${uid}`, field: 'seen', entries }));
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Socket cerrado.
    }
  }

  /** Difunde el estado recortado para cada jugador (cada uno ve solo sus cripticos abiertos). */
  private broadcastState(state: LiveState): void {
    const now = Date.now();
    const solutions = solutionsFor(state);
    const cache = new Map<string, string>();
    for (const ws of this.ctx.getWebSockets()) {
      const uid = (ws.deserializeAttachment() as SocketAttachment | null)?.uid;
      if (!uid) continue;
      // Sin modo secuencial el estado es igual para todos: se serializa una sola vez.
      const key = isSequential(state.config) ? uid : '*';
      let payload = cache.get(key);
      if (!payload) {
        payload = JSON.stringify({ type: 'state', state: publicState(state, now, uid), solutions } satisfies ServerMessage);
        cache.set(key, payload);
      }
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
