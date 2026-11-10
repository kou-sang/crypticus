// Sala COOP dentro del Durable Object: explicación previa, motor (`shared/coop/engine.ts`), asignación de
// cripticos sin repetir y vista recortada por jugador. Sin E/S: el DO persiste, difunde y programa la alarma.
import { LEVELS, WRONG_ANSWER_COOLDOWN_MS, type CoopLevel, type CoopTier } from '../shared/coop/balance';
import { createCoopGame, nextDeadline, reduceCoop, type CoopAction } from '../shared/coop/engine';
import type { CoopEvent } from '../shared/coop/events';
import {
  COOP_BRIEFING_MS,
  type CoopClientAction,
  type CoopCrypticView,
  type CoopPlayerSetup,
  type CoopReply,
  type CoopView,
} from '../shared/coop/protocol';
import type { CoopState } from '../shared/coop/state';
import { GameError } from '../shared/engine';
import { getCrypticSecret } from './secrets';

export interface CoopStartInput {
  competitionId: string;
  title: string;
  level: CoopLevel;
  players: CoopPlayerSetup[];
  /** Ids por dificultad, ordenados (los que nadie vio, primero). */
  pools: Record<CoopTier, string[]>;
  seed: number;
  now: number;
}

export interface CoopRoomState {
  version: 1;
  competitionId: string;
  title: string;
  level: CoopLevel;
  players: CoopPlayerSetup[];
  seed: number;
  briefing: { endsAt: number; ready: string[] } | null;
  game: CoopState | null;
  pools: Record<CoopTier, string[]>;
  cursors: Record<CoopTier, number>;
  /** Cripticos de la ronda en curso, por jugador y casilla. */
  assigned: Record<string, string[]>;
  played: string[];
  cooldownUntil: Record<string, number>;
  createdAt: number;
}

/** Si una dificultad se agota (o no hay de ese tipo), se usa la más cercana. */
const TIER_FALLBACK: Record<CoopTier, CoopTier[]> = {
  easy: ['medium', 'hard'],
  medium: ['easy', 'hard'],
  hard: ['medium', 'veryHard2'],
  veryHard2: ['hard', 'veryHard3'],
  veryHard3: ['veryHard2', 'hard'],
};

export function createCoopRoom(input: CoopStartInput): CoopRoomState {
  if (!LEVELS[input.level].available) throw new GameError('bad_level', `El nivel ${input.level} todavía no está disponible.`);
  return {
    version: 1,
    competitionId: input.competitionId,
    title: input.title,
    level: input.level,
    players: input.players,
    seed: input.seed >>> 0,
    briefing: { endsAt: input.now + COOP_BRIEFING_MS, ready: [] },
    game: null,
    pools: input.pools,
    cursors: { easy: 0, medium: 0, hard: 0, veryHard2: 0, veryHard3: 0 },
    assigned: {},
    played: [],
    cooldownUntil: {},
    createdAt: input.now,
  };
}

export function coopFinished(room: CoopRoomState): boolean {
  return room.game?.result != null;
}

/** Próximo instante con algo programado (para la alarma del DO). */
export function coopDeadline(room: CoopRoomState): number | null {
  if (room.briefing) return room.briefing.endsAt;
  return room.game ? nextDeadline(room.game) : null;
}

/** Siguiente criptico sin repetir en la partida para una dificultad. */
function takeCryptic(room: CoopRoomState, tier: CoopTier): string {
  for (const candidate of [tier, ...TIER_FALLBACK[tier]]) {
    const pool = room.pools[candidate];
    if (pool.length === 0) continue;
    const id = pool[room.cursors[candidate] % pool.length]!;
    room.cursors[candidate] += 1;
    return id;
  }
  throw new GameError('no_cryptics', 'No hay cripticos disponibles.');
}

/** Aplica los eventos del motor a la sala: asigna cripticos al abrir cada ronda. */
function absorb(room: CoopRoomState, events: CoopEvent[]): void {
  for (const event of events) {
    if (event.type !== 'roundStart') continue;
    room.assigned = {};
    for (const [uid, tiers] of Object.entries(event.tiers)) {
      const ids = tiers.map((tier) => takeCryptic(room, tier));
      room.assigned[uid] = ids;
      room.played.push(...ids);
    }
  }
}

function startGame(room: CoopRoomState, now: number): CoopEvent[] {
  room.briefing = null;
  const created = createCoopGame({
    seed: room.seed,
    level: room.level,
    players: room.players.map((p) => ({ id: p.uid, name: p.name, character: p.character })),
    now,
  });
  room.game = created.state;
  absorb(room, created.events);
  return created.events;
}

/** Avanza el reloj (fin de la explicación, rondas, tienda…). */
export function advanceCoop(room: CoopRoomState, now: number): CoopEvent[] {
  const events: CoopEvent[] = [];
  if (room.briefing) {
    if (now < room.briefing.endsAt) return events;
    events.push(...startGame(room, room.briefing.endsAt));
  }
  if (!room.game) return events;
  const result = reduceCoop(room.game, { type: 'tick' }, now);
  room.game = result.state;
  absorb(room, result.events);
  return [...events, ...result.events];
}

/** Acción rechazada por el motor. Lleva los eventos del reloj que igual ocurrieron (para difundirlos). */
export class CoopActionError extends GameError {
  constructor(
    message: string,
    readonly events: CoopEvent[],
    code = 'rejected',
  ) {
    super(code, message);
  }
}

function applyEngine(room: CoopRoomState, action: CoopAction, now: number, before: CoopEvent[]): CoopEvent[] {
  if (!room.game) throw new GameError('not_live', 'La partida todavía no empezó.');
  const result = reduceCoop(room.game, action, now);
  room.game = result.state;
  absorb(room, result.events);
  if (result.rejected) throw new CoopActionError(result.rejected, [...before, ...result.events]);
  return result.events;
}

export interface CoopOutcome {
  reply: CoopReply;
  events: CoopEvent[];
}

/**
 * Acción de un jugador. `verify` comprueba una respuesta contra el hash (async, fuera del motor).
 * Antes de aplicar se avanza el reloj: la ronda pudo terminar mientras llegaba el mensaje.
 */
export async function applyCoopAction(
  room: CoopRoomState,
  uid: string,
  action: CoopClientAction,
  now: number,
  verify: (crypticId: string, guess: string) => Promise<boolean>,
): Promise<CoopOutcome> {
  if (!room.players.some((p) => p.uid === uid)) throw new GameError('not_participant', 'No juegas en esta sala.');
  const events = advanceCoop(room, now);
  try {
    return await runAction(room, uid, action, now, verify, events);
  } catch (error) {
    // Cualquier rechazo conserva los eventos del reloj que ya ocurrieron.
    if (error instanceof GameError && !(error instanceof CoopActionError)) throw new CoopActionError(error.message, events, error.code);
    throw error;
  }
}

async function runAction(
  room: CoopRoomState,
  uid: string,
  action: CoopClientAction,
  now: number,
  verify: (crypticId: string, guess: string) => Promise<boolean>,
  events: CoopEvent[],
): Promise<CoopOutcome> {

  if (action.kind === 'ready') {
    if (room.briefing && !room.briefing.ready.includes(uid)) room.briefing.ready.push(uid);
    if (room.briefing && room.players.every((p) => room.briefing!.ready.includes(p.uid))) events.push(...startGame(room, now));
    return { reply: { ok: true }, events };
  }

  switch (action.kind) {
    case 'answer': {
      const game = room.game;
      if (!game || game.phase !== 'round') throw new GameError('not_round', 'No hay una ronda en curso.');
      const slot = Math.floor(Number(action.slot));
      const crypticId = room.assigned[uid]?.[slot];
      const assignment = game.players.find((p) => p.id === uid)?.assignments[slot];
      if (!crypticId || !assignment) throw new GameError('not_yours', 'Ese criptico no es tuyo.');
      if (assignment.solved) throw new GameError('already_solved', 'Ya lo resolviste.');
      const waitUntil = room.cooldownUntil[uid] ?? 0;
      if (now < waitUntil) throw new GameError('cooldown', 'Espera antes de volver a intentar.');
      const roundAtStart = game.roundNumber;
      const correct = await verify(crypticId, String(action.guess ?? '').slice(0, 100));
      if (!correct) {
        room.cooldownUntil[uid] = now + WRONG_ANSWER_COOLDOWN_MS;
        return { reply: { ok: true, correct: false, cooldownUntil: room.cooldownUntil[uid] }, events };
      }
      // Durante la verificación la ronda pudo cerrarse: la respuesta llegó tarde.
      if (room.game?.roundNumber !== roundAtStart || room.game.phase !== 'round') {
        throw new GameError('round_over', 'La ronda ya terminó.');
      }
      events.push(...applyEngine(room, { type: 'solve', playerId: uid, slot }, now, events));
      return { reply: { ok: true, correct: true, explanation: getCrypticSecret(crypticId)?.explanation ?? null }, events };
    }
    case 'hint':
      events.push(...applyEngine(room, { type: 'useHint', playerId: uid }, now, events));
      break;
    case 'active':
      events.push(
        ...applyEngine(room, { type: 'useActive', playerId: uid, targetId: action.targetId, amount: Number(action.amount) || undefined }, now, events),
      );
      break;
    case 'item':
      events.push(...applyEngine(room, { type: 'useItem', playerId: uid, itemUid: String(action.itemUid), targetId: action.targetId }, now, events));
      break;
    case 'buy':
      events.push(...applyEngine(room, { type: 'buy', playerId: uid, offerId: String(action.offerId) }, now, events));
      break;
    case 'swap':
      events.push(...applyEngine(room, { type: 'shopSwap', playerId: uid, targetId: String(action.targetId) }, now, events));
      break;
    case 'shopDone':
      events.push(...applyEngine(room, { type: 'shopDone', playerId: uid }, now, events));
      break;
    case 'vote':
      events.push(
        ...applyEngine(room, { type: 'vote', playerId: uid, decisionId: String(action.decisionId), accept: action.accept === true }, now, events),
      );
      break;
    case 'leave':
      if (room.briefing) {
        // Salir durante la explicación: cuenta como abandono desde el primer instante.
        events.push(...startGame(room, now));
      }
      events.push(...applyEngine(room, { type: 'leave', playerId: uid }, now, events));
      break;
    default:
      throw new GameError('unknown_action', 'Acción desconocida.');
  }
  return { reply: { ok: true }, events };
}

/** Vista de un jugador: sin semilla y solo sus cripticos (con las pistas ya reveladas). */
export function coopView(room: CoopRoomState, uid: string, events: CoopEvent[], now: number): CoopView {
  const game = room.game;
  const me = game?.players.find((p) => p.id === uid);
  const cryptics: CoopCrypticView[] =
    me && game && game.phase === 'round'
      ? me.assignments.map((assignment, slot) => {
          const crypticId = room.assigned[uid]?.[slot] ?? '';
          const secret = getCrypticSecret(crypticId);
          return {
            slot,
            crypticId,
            tier: assignment.tier,
            clue: secret?.clue ?? null,
            enumeration: game.modifiers.hideCells ? null : (secret?.enumeration ?? null),
            hints: (secret?.hints ?? []).slice(0, assignment.hintsRevealed),
            solved: assignment.solved,
          };
        })
      : [];
  return {
    competitionId: room.competitionId,
    title: room.title,
    level: room.level,
    players: room.players,
    briefing: room.briefing,
    game: game ? { ...game, seed: 0 } : null,
    mine: { cryptics, cooldownUntil: room.cooldownUntil[uid] ?? 0 },
    events,
    serverTime: now,
  };
}

// --- Elo COOP: cada jugador contra el rating fijo del nivel --------------------------------------------

const COOP_K = 24;

export function coopRatingDelta(rating: number, levelRating: number, won: boolean): number {
  const expected = 1 / (1 + 10 ** ((levelRating - rating) / 400));
  return Math.round(COOP_K * ((won ? 1 : 0) - expected));
}
