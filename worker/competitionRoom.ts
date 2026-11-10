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
  toggleEndVote,
  passCryptic,
  surrender,
  isSequential,
  type LiveState,
  isOnWinningSide,
} from '../shared/engine';
import { computeRatingDeltas } from '../shared/scoring';
import { isRoyalePool, ratingPoolOf } from '../shared/ratingPools';
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
import {
  CoopActionError,
  advanceCoop,
  applyCoopAction,
  coopDeadline,
  coopFinished,
  coopRatingDelta,
  coopSolutions,
  coopView,
  createCoopRoom,
  type CoopRoomState,
  type CoopStartInput,
} from './coopRoom';
import type { CoopEvent } from '../shared/coop/events';
import { COOP_BRIEFING_MS, COOP_DRAFT_MS, type CoopClientAction, type CoopResultSummary } from '../shared/coop/protocol';
import { LEVELS } from '../shared/coop/balance';

export interface StartInput {
  competitionId: string;
  title: string;
  config: CompetitionConfig;
  participants: Participant[];
  crypticIds: string[];
  pool: Record<Difficulty, string[]>;
  tiebreakIds?: string[];
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
  // De los cripticos de desempate solo se muestran los que llegaron a jugarse.
  if (state.status === 'finished') {
    return { ...state, pool: { easy: [], medium: [], hard: [] }, tiebreakIds: state.tiebreak?.played ?? [] };
  }

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
  // Muerte súbita: el criptico actual se envía al abrir; los siguientes siguen siendo secretos.
  const tb = state.tiebreak;
  const tbOpen = tb != null && now >= tb.opensAt;
  const tbVisible = tb ? tb.played.slice(0, tbOpen ? tb.index + 1 : tb.index) : [];
  const allowed = new Set([...visible, ...tbVisible]);
  return {
    ...state,
    tiebreakIds: [],
    tiebreak: tb && !tbOpen ? { ...tb, crypticId: '', played: tb.played.slice(0, tb.index) } : tb,
    crypticIds: visible,
    usedIds: state.usedIds.filter((id) => allowed.has(id)),
    pool: { easy: [], medium: [], hard: [] },
    // Sin `kind`: el tipo de criptico sería una pista gratis.
    catalog: Object.fromEntries(
      Object.entries(state.catalog)
        .filter(([id]) => allowed.has(id))
        .map(([id, entry]) => [id, { tier: entry.tier, hintCount: entry.hintCount }]),
    ),
    round: round && pendingRound ? { ...round, crypticId: '' } : round,
  };
}

const RTT_SAMPLES = 5;
// Compensación máxima: limita lo que un cliente podría ganar inflando su latencia.
const MAX_COMPENSATION_MS = 80;
const RACE_JITTER_MS = 15;

const STATE_KEY = 'state';
const COOP_KEY = 'coop';
const SYNC_KEY = 'sync';
const SYNC_RETRY_MS = 15_000;
const MAX_SYNC_ATTEMPTS = 20;

export class CompetitionRoom extends DurableObject<Env> {
  private state: LiveState | null = null;
  /** Sala COOP (motor propio). Una sala es COOP o es de los demás modos, nunca ambas. */
  private coop: CoopRoomState | null = null;
  private sync: SyncMeta = { synced: false, attempts: 0 };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Restaura el estado tras hibernación/desalojo antes de procesar cualquier evento.
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<LiveState>(STATE_KEY)) ?? null;
      this.coop = (await ctx.storage.get<CoopRoomState>(COOP_KEY)) ?? null;
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
    const tiebreakIds = input.tiebreakIds ?? [];
    const allIds = [...new Set([...input.crypticIds, ...input.pool.easy, ...input.pool.medium, ...input.pool.hard, ...tiebreakIds])];
    this.state = createLiveState({
      competitionId: input.competitionId,
      title: input.title,
      config: input.config,
      participants: input.participants,
      crypticIds: input.crypticIds,
      pool: input.pool,
      catalog: buildCatalog(allIds),
      tiebreakIds,
      startedAt: input.startedAt,
    });
    await this.commit();
    return { startedAt: this.state.startedAt, endsAt: this.state.endsAt };
  }

  /** COOP: crea la sala (explicación previa → partida). Idempotente. */
  async startCoop(input: CoopStartInput): Promise<{ startedAt: number; endsAt: number }> {
    if (this.state) throw new Error('Sala inconsistente.');
    if (!this.coop) {
      this.coop = createCoopRoom(input);
      await this.commitCoop([]);
    } else if (this.coop.competitionId !== input.competitionId) {
      throw new Error('Sala inconsistente.');
    }
    // Fin estimado (para las listas): selección + carga + tiempo total + presentaciones de jefes.
    const endsAt = this.coop.createdAt + COOP_DRAFT_MS + COOP_BRIEFING_MS + LEVELS[this.coop.level].totalMs + 60_000;
    return { startedAt: this.coop.createdAt, endsAt };
  }

  /** Soluciones de una partida terminada, solo para sus participantes. */
  async solutions(uid: string): Promise<Solution[]> {
    if (this.coop) {
      if (!this.coop.players.some((p) => p.uid === uid)) throw new Error('not_participant');
      if (!coopFinished(this.coop)) throw new Error('not_finished');
      return coopSolutions(this.coop);
    }
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
    if (this.coop) return this.handleCoopMessage(ws, message);

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
    if (this.coop) {
      const events = advanceCoop(this.coop, Date.now());
      await this.commitCoop(events);
      if (coopFinished(this.coop)) await this.syncCoopResults();
      return;
    }
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
      if (this.coop) {
        this.send(ws, { type: 'coopState', view: coopView(this.coop, user.uid, [], Date.now()) });
        this.probe(ws);
        return;
      }
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
    const contested =
      correct &&
      state.status === 'live' &&
      (state.tiebreak ? state.tiebreak.crypticId === crypticId : state.config.flow === 'rounds' && state.round?.crypticId === crypticId);
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

  // ---------- COOP ----------

  private async handleCoopMessage(ws: WebSocket, message: ClientMessage): Promise<void> {
    const coop = this.coop!;
    const uid = (ws.deserializeAttachment() as SocketAttachment | null)?.uid ?? null;
    const reqId = 'reqId' in message && typeof message.reqId === 'string' ? message.reqId.slice(0, 40) : '';
    let events: CoopEvent[] = [];
    try {
      if (!uid) throw new AppError(401, 'unauthenticated', 'Autentícate primero.');
      if (message.type !== 'coop' || !message.action || typeof message.action !== 'object') {
        throw new AppError(400, 'unknown_action', 'Acción desconocida en COOP.');
      }
      const outcome = await applyCoopAction(coop, uid, message.action as CoopClientAction, Date.now(), (crypticId, guess) => {
        const secret = getCrypticSecret(crypticId);
        if (!secret) throw new GameError('missing_cryptic', 'Criptico no encontrado.');
        return verifyAnswer(this.env.ANSWER_HMAC_KEY, crypticId, guess, secret.hash);
      });
      events = outcome.events;
      this.send(ws, { type: 'reply', reqId, ok: true, data: outcome.reply });
    } catch (error) {
      if (error instanceof CoopActionError) events = error.events;
      const { code, message: text } = describeError(error);
      this.send(ws, { type: 'reply', reqId, ok: false, error: { code, message: text } });
    }
    // Siempre se difunde: aun una acción rechazada pudo avanzar el reloj (fin de ronda, tienda…).
    await this.commitCoop(events);
    if (coopFinished(coop)) await this.syncCoopResults();
  }

  /** Difunde la vista de cada jugador, persiste y programa la próxima alarma. */
  private async commitCoop(events: CoopEvent[]): Promise<void> {
    const coop = this.coop;
    if (!coop) return;
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const uid = (ws.deserializeAttachment() as SocketAttachment | null)?.uid;
      if (uid) this.send(ws, { type: 'coopState', view: coopView(coop, uid, events, now) });
    }
    await this.ctx.storage.put(COOP_KEY, coop);
    const deadline = coopDeadline(coop);
    if (deadline !== null) await this.ctx.storage.setAlarm(Math.max(now, deadline));
  }

  /** Resultado COOP en Firestore: sala, historial, Elo contra el nivel y cripticos vistos. Reintenta por alarma. */
  private async syncCoopResults(): Promise<void> {
    const coop = this.coop;
    const game = coop?.game;
    if (!coop || !game?.result || this.sync.synced) return;
    try {
      const firestore = new FirestoreRest(this.env.FIREBASE_SERVICE_ACCOUNT);
      const uids = coop.players.map((p) => p.uid);
      const users = await firestore.batchGet<{ modeStats?: Record<string, { rating?: number }> }>(uids.map((uid) => `users/${uid}`));
      const won = game.result.won;
      const finishedAt = Date.now();
      const levelRating = LEVELS[coop.level].rating;
      const ratings = Object.fromEntries(uids.map((uid) => [uid, users.get(uid)?.modeStats?.coop?.rating ?? 1200]));
      // Quien abandonó pierde aunque el resto gane.
      const winnerOf = (uid: string) => won && game.players.find((p) => p.id === uid)?.status !== 'left';
      const deltas = Object.fromEntries(uids.map((uid) => [uid, coopRatingDelta(ratings[uid]!, levelRating, winnerOf(uid))]));
      const bossesDefeated = game.bosses.filter((b) => b.defeatedGt !== null).length;
      const summary: CoopResultSummary = {
        level: coop.level,
        won,
        endedGt: game.result.endedGt,
        rounds: game.roundNumber,
        bossesDefeated,
        bosses: game.bosses.map((b) => ({
          id: b.id,
          category: b.category,
          maxHp: b.maxHp,
          hp: b.hp,
          defeatedGt: b.defeatedGt,
          rounds: b.roundsFought,
          damageTaken: b.damageTaken,
          damageDealt: b.damageDealt,
        })),
        players: game.players.map((p) => ({
          uid: p.id,
          displayName: p.name,
          character: p.character,
          status: p.status,
          ratingDelta: deltas[p.id] ?? 0,
          ...p.stats,
        })),
      };
      const existing = uids.filter((uid) => users.has(uid));
      const writes: Write[] = [
        {
          kind: 'update',
          path: `competitions/${coop.competitionId}`,
          data: {
            status: 'finished',
            finishedAt,
            winnerId: null,
            endReason: won ? 'coopVictory' : 'coopDefeat',
            coopResult: summary,
            finalStandings: game.players.map((p, index) => ({
              uid: p.id,
              displayName: p.name,
              rank: index + 1,
              score: p.stats.damageDealt,
              solved: p.stats.crypticsSolved,
              hintsUsed: p.stats.hintsUsed,
              ratingDelta: deltas[p.id] ?? 0,
            })),
          },
        },
        ...existing.flatMap<Write>((uid) => {
          const player = game.players.find((p) => p.id === uid)!;
          const winner = winnerOf(uid);
          return [
            {
              kind: 'set',
              path: `users/${uid}/history/${coop.competitionId}`,
              data: {
                competitionId: coop.competitionId,
                title: coop.title,
                mode: 'timed',
                game: 'coop',
                outcome: winner ? 'win' : 'loss',
                flow: 'free',
                finishedAt,
                rank: winner ? 1 : 2,
                players: uids.length,
                score: player.stats.damageDealt,
                solved: player.stats.crypticsSolved,
                hintsUsed: player.stats.hintsUsed,
                won: winner,
                endReason: won ? 'coopVictory' : 'coopDefeat',
                ratingDelta: deltas[uid] ?? 0,
                modeRatingAfter: ratings[uid]! + (deltas[uid] ?? 0),
                modeRatingDelta: deltas[uid] ?? 0,
                ratingPool: 'coop',
                coop: { level: coop.level, character: player.character, bossesDefeated },
              },
            },
            {
              kind: 'increment',
              path: `users/${uid}`,
              increments: {
                'stats.played': 1,
                'stats.wins': winner ? 1 : 0,
                'stats.solved': player.stats.crypticsSolved,
                'stats.hintsUsed': player.stats.hintsUsed,
                'modeStats.coop.played': 1,
                'modeStats.coop.wins': winner ? 1 : 0,
                'modeStats.coop.losses': winner ? 0 : 1,
                'modeStats.coop.draws': 0,
              },
            },
            { kind: 'setFields', path: `users/${uid}`, fields: { 'modeStats.coop.rating': ratings[uid]! + (deltas[uid] ?? 0) } },
          ];
        }),
        // Cripticos vistos: no se repetirán en las próximas salas de estos jugadores.
        ...(coop.played.length > 0
          ? existing.map<Write>((uid) => ({
              kind: 'mergeMap',
              path: `userSeen/${uid}`,
              field: 'seen',
              entries: Object.fromEntries(coop.played.map((id) => [id, finishedAt])),
            }))
          : []),
      ];
      await firestore.commit(writes);
      this.sync = { synced: true, attempts: this.sync.attempts };
      await this.ctx.storage.put(SYNC_KEY, this.sync);
    } catch (error) {
      this.sync = { synced: false, attempts: this.sync.attempts + 1 };
      await this.ctx.storage.put(SYNC_KEY, this.sync);
      console.error(`[coop] sync fallida (${this.sync.attempts})`, error);
      if (this.sync.attempts < MAX_SYNC_ATTEMPTS) await this.ctx.storage.setAlarm(Date.now() + SYNC_RETRY_MS);
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
      const users = await firestore.batchGet<{ modeStats?: Record<string, { rating?: number }> }>(ranked.map((p) => `users/${p.uid}`));
      // Solo se escribe a usuarios que existen (los borrados se omiten).
      const existing = new Set(users.keys());
      // Elo propio de cada modo (Race, Royale, Duel).
      const game = state.config.game;
      // Pool de Elo: Race, Duel o Royale según su categoría de tiempo (v1.2).
      const rankedMode = ratingPoolOf(game, state.config.royale);
      const modeRatings: Record<string, number> = {};
      users.forEach((user, uid) => {
        // Un pool de Royale sin partidas arranca desde el Elo único de Royale anterior a v1.2.
        const legacy = rankedMode && isRoyalePool(rankedMode) ? user.modeStats?.royale?.rating : undefined;
        modeRatings[uid] = (rankedMode ? user.modeStats?.[rankedMode]?.rating : undefined) ?? legacy ?? 1200;
      });
      const modeDeltas = rankedMode && ranked.length >= 2 ? computeRatingDeltas(ranked, modeRatings) : {};
      // En 2 vs 2 gana el equipo: el compañero de quien figura como ganador también gana.
      const outcomeOf = (p: { uid: string; rank: number }): 'win' | 'loss' | 'draw' =>
        state.winnerId ? (isOnWinningSide(state, p.uid) ? 'win' : 'loss') : p.rank === 1 ? 'draw' : 'loss';
      // El Elo es por modo: las partidas en solitario no lo cambian.
      const deltas = modeDeltas;
      const isWinner = (playerId: string) => isOnWinningSide(state, playerId);

      const writes: Write[] = [
        {
          kind: 'update',
          path: `competitions/${state.competitionId}`,
          data: {
            status: 'finished',
            finishedAt: state.finishedAt ?? Date.now(),
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
              ...(p.team !== undefined ? { team: p.team } : {}),
            })),
          },
        },
        // Historial por jugador (partidas + evolución del rating).
        ...ranked
          .filter((p) => existing.has(p.uid))
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
              ...(rankedMode && ranked.length >= 2
                ? {
                    modeRatingAfter: (modeRatings[p.uid] ?? 1200) + (modeDeltas[p.uid] ?? 0),
                    modeRatingDelta: modeDeltas[p.uid] ?? 0,
                    ratingPool: rankedMode,
                  }
                : {}),
              ...(game === 'royale' && state.config.royale
                ? { royale: { baseSec: state.config.royale.baseSec, incrementSec: state.config.royale.incrementSec } }
                : {}),
            },
          })),
        ...ranked
          .filter((p) => existing.has(p.uid)) // Usuarios borrados se omiten.
          .map<Write>((p) => ({
            kind: 'increment',
            path: `users/${p.uid}`,
            increments: {
              'stats.played': 1,
              'stats.wins': isWinner(p.uid) ? 1 : 0,
              'stats.solved': p.solvedIds.length,
              'stats.hintsUsed': p.hintsUsed,
            },
          })),
        // Estadísticas y Elo por modo (solo partidas de 2 o más).
        ...(rankedMode && ranked.length >= 2
          ? ranked
              .filter((p) => existing.has(p.uid))
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
