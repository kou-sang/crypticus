// Sala COOP dentro del Durable Object: selección de personajes, carga/explicación previa, motor (`shared/coop/engine.ts`), asignación de
// cripticos sin repetir y vista recortada por jugador. Sin E/S: el DO persiste, difunde y programa la alarma.
import {
  DEFAULT_COOP_STAGE,
  LEVELS,
  STAGE_RATING_OFFSET,
  WRONG_ANSWER_COOLDOWN_MS,
  normalizeStage,
  type CoopLevel,
  type CoopStage,
  type CoopTier,
} from '../shared/coop/balance';
import { createCoopGame, nextDeadline, pickBosses, reduceCoop, type CoopAction } from '../shared/coop/engine';
import type { CoopEvent } from '../shared/coop/events';
import { AT_CHARACTER_IDS, CHARACTERS, type CharacterId } from '../shared/coop/catalog/characters';
import { pickIndex } from '../shared/coop/rng';
import {
  COOP_BRIEFING_MS,
  COOP_DRAFT_MS,
  type CoopClientAction,
  type CoopDraftView,
  type CoopSeat,
  type CoopCrypticView,
  type CoopPlayerSetup,
  type CoopReply,
  type CoopView,
} from '../shared/coop/protocol';
import type { CoopState } from '../shared/coop/state';
import { GameError } from '../shared/engine';
import { getCrypticSecret } from './secrets';
import type { Solution } from '../shared/protocol';

export interface CoopStartInput {
  competitionId: string;
  title: string;
  level: CoopLevel;
  /** AT1/AT2/AT3 (por defecto 2). */
  stage?: CoopStage;
  players: CoopSeat[];
  /** Por jugador: ids por dificultad, ordenados por SU historial (los que nunca vio, primero). */
  pools: Record<string, PlayerPools>;
  seed: number;
  now: number;
}

export type PlayerPools = Record<CoopTier, string[]>;

/** Máximo de ids por dificultad y jugador guardados en la sala (cabe de sobra en una partida de 22 min). */
export const COOP_POOL_LIMIT = 50;

const ZERO_CURSORS = (): Record<CoopTier, number> => ({ easy: 0, medium: 0, hard: 0, veryHard2: 0, veryHard3: 0 });

export interface CoopRoomState {
  version: 1;
  competitionId: string;
  title: string;
  level: CoopLevel;
  /** Opcional: salas anteriores a los subniveles son AT2. */
  stage?: CoopStage;
  /** Personajes vacíos ('') hasta que termina la selección. */
  players: CoopPlayerSetup[];
  seed: number;
  draft: CoopDraftView | null;
  /** Quienes salieron antes de empezar: quedan fuera desde el primer instante de la partida. */
  leftEarly: string[];
  briefing: { endsAt: number; ready: string[] } | null;
  game: CoopState | null;
  /** Por jugador (desde v1.4.1). Las salas anteriores usan `pools`/`cursors` compartidos. */
  playerPools?: Record<string, PlayerPools>;
  playerCursors?: Record<string, Record<CoopTier, number>>;
  /** Legado (salas anteriores a v1.4.1): lista compartida. */
  pools?: PlayerPools;
  cursors?: Record<CoopTier, number>;
  /** Cripticos de la ronda en curso, por jugador y casilla. */
  assigned: Record<string, string[]>;
  played: string[];
  /** Cripticos que cada jugador llegó a ver (el de cada casilla aparece al resolver el anterior). */
  shown?: Record<string, string[]>;
  cooldownUntil: Record<string, number>;
  /** Quién resolvió cada criptico (soluciones al terminar). Opcional: salas creadas antes de v1.3.1. */
  solvedBy?: Record<string, string[]>;
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
    stage: normalizeStage(input.stage),
    players: input.players.map((p) => ({ ...p, character: '' as CharacterId })),
    seed: input.seed >>> 0,
    draft: { endsAt: input.now + COOP_DRAFT_MS, picks: {}, locked: [] },
    leftEarly: [],
    briefing: null,
    game: null,
    playerPools: input.pools,
    playerCursors: Object.fromEntries(input.players.map((p) => [p.uid, ZERO_CURSORS()])),
    assigned: {},
    played: [],
    shown: {},
    cooldownUntil: {},
    solvedBy: {},
    createdAt: input.now,
  };
}

export function coopFinished(room: CoopRoomState): boolean {
  return room.game?.result != null;
}

/** Próximo instante con algo programado (para la alarma del DO). */
export function coopDeadline(room: CoopRoomState): number | null {
  if (room.draft) return room.draft.endsAt;
  if (room.briefing) return room.briefing.endsAt;
  return room.game ? nextDeadline(room.game) : null;
}

/**
 * Siguiente criptico del jugador para una dificultad: de SU lista, sin repetir en su partida. Si hay otro
 * disponible, evita el que ya tiene un aliado en esta ronda (el saltado queda para la próxima vez).
 */
function takeCryptic(room: CoopRoomState, uid: string, tier: CoopTier, takenThisRound: Set<string>): string {
  const own = room.playerPools?.[uid];
  const pools = own ?? room.pools;
  if (!pools) throw new GameError('no_cryptics', 'No hay cripticos disponibles.');
  let cursors: Record<CoopTier, number>;
  if (own) {
    room.playerCursors ??= {};
    cursors = room.playerCursors[uid] ??= ZERO_CURSORS();
  } else {
    cursors = room.cursors ??= ZERO_CURSORS();
  }
  for (const candidate of [tier, ...TIER_FALLBACK[tier]]) {
    const pool = pools[candidate];
    if (!pool || pool.length === 0) continue;
    const start = cursors[candidate] % pool.length;
    let index = start;
    for (let step = 0; step < pool.length; step += 1) {
      const at = (start + step) % pool.length;
      if (!takenThisRound.has(pool[at]!)) {
        index = at;
        break;
      }
    }
    // Se trae el elegido a la posición del cursor: los saltados siguen pendientes.
    [pool[start], pool[index]] = [pool[index]!, pool[start]!];
    cursors[candidate] += 1;
    return pool[start]!;
  }
  throw new GameError('no_cryptics', 'No hay cripticos disponibles.');
}

/** Registra el criptico que el jugador tiene en pantalla (el primero sin resolver de la ronda). */
function markShown(room: CoopRoomState, uid: string): void {
  const player = room.game?.players.find((p) => p.id === uid);
  if (!player) return;
  const slot = player.assignments.findIndex((a) => !a.solved);
  const crypticId = slot >= 0 ? room.assigned[uid]?.[slot] : undefined;
  if (!crypticId) return;
  room.shown ??= {};
  const list = (room.shown[uid] ??= []);
  if (!list.includes(crypticId)) list.push(crypticId);
}

/** Aplica los eventos del motor a la sala: asigna cripticos al abrir cada ronda. */
function absorb(room: CoopRoomState, events: CoopEvent[]): void {
  for (const event of events) {
    if (event.type !== 'roundStart') continue;
    room.assigned = {};
    const taken = new Set<string>();
    for (const [uid, tiers] of Object.entries(event.tiers)) {
      const ids = tiers.map((tier) => takeCryptic(room, uid, tier, taken));
      for (const id of ids) taken.add(id);
      room.assigned[uid] = ids;
      room.played.push(...ids);
    }
  }
  // Siempre se llama con `room.game` ya actualizado: el primer criptico pendiente de cada uno cuenta como visto.
  for (const uid of Object.keys(room.assigned)) markShown(room, uid);
}

/** Cierra la selección: quien no eligió recibe un personaje libre al azar (por semilla). Abre la carga. */
function endDraft(room: CoopRoomState, now: number): void {
  const draft = room.draft;
  if (!draft) return;
  const taken = new Set(Object.values(draft.picks));
  room.players = room.players.map((player, index) => {
    let character = draft.picks[player.uid];
    if (!character) {
      const free = AT_CHARACTER_IDS.filter((id) => !taken.has(id));
      character = free[pickIndex(room.seed, ['draft', index], free.length)]!;
      taken.add(character);
    }
    return { ...player, character };
  });
  room.draft = null;
  room.briefing = { endsAt: now + COOP_BRIEFING_MS, ready: room.leftEarly.filter((uid) => room.players.some((p) => p.uid === uid)) };
}

function startGame(room: CoopRoomState, now: number): CoopEvent[] {
  room.briefing = null;
  const created = createCoopGame({
    seed: room.seed,
    level: room.level,
    stage: room.stage ?? DEFAULT_COOP_STAGE,
    players: room.players.map((p) => ({ id: p.uid, name: p.name, character: p.character })),
    now,
  });
  room.game = created.state;
  absorb(room, created.events);
  const events = [...created.events];
  for (const uid of room.leftEarly ?? []) {
    const result = reduceCoop(room.game, { type: 'leave', playerId: uid }, now);
    room.game = result.state;
    absorb(room, result.events);
    events.push(...result.events);
  }
  return events;
}

/** Avanza el reloj (fin de la explicación, rondas, tienda…). */
export function advanceCoop(room: CoopRoomState, now: number): CoopEvent[] {
  const events: CoopEvent[] = [];
  if (room.draft) {
    if (now < room.draft.endsAt) return events;
    endDraft(room, room.draft.endsAt);
  }
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

  if (action.kind === 'pick' || action.kind === 'lock') {
    const draft = room.draft;
    if (!draft) throw new GameError('no_draft', 'La selección de personajes terminó.');
    if (draft.locked.includes(uid)) throw new GameError('locked', 'Ya confirmaste tu personaje.');
    if (action.kind === 'pick') {
      const character = action.character;
      if (!(character in CHARACTERS)) throw new GameError('bad_character', 'Personaje desconocido.');
      const owner = Object.entries(draft.picks).find(([other, pick]) => pick === character && other !== uid);
      if (owner) throw new GameError('taken', `${CHARACTERS[character].name} ya fue elegido.`);
      draft.picks[uid] = character;
    } else {
      if (!draft.picks[uid]) throw new GameError('no_pick', 'Elige un personaje antes de confirmar.');
      draft.locked.push(uid);
    }
    // Todos confirmaron (quienes salieron no cuentan): termina la selección.
    const active = room.players.filter((p) => !room.leftEarly.includes(p.uid));
    if (active.every((p) => draft.locked.includes(p.uid))) endDraft(room, now);
    return { reply: { ok: true }, events };
  }

  if (action.kind === 'ready') {
    if (room.draft) throw new GameError('in_draft', 'Primero elige personaje.');
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
      room.solvedBy = { ...room.solvedBy, [crypticId]: [...(room.solvedBy?.[crypticId] ?? []), uid] };
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
    case 'surrender':
      events.push(...applyEngine(room, { type: 'surrender', playerId: uid, accept: action.accept === true }, now, events));
      break;
    case 'leave':
      if (!room.game) {
        // Antes de empezar: queda fuera desde el primer instante (no adelanta la partida).
        if (!room.leftEarly.includes(uid)) room.leftEarly.push(uid);
        if (room.briefing && !room.briefing.ready.includes(uid)) room.briefing.ready.push(uid);
        if (room.draft && room.players.every((p) => room.leftEarly.includes(p.uid) || room.draft!.locked.includes(p.uid))) endDraft(room, now);
        if (room.briefing && room.players.every((p) => room.briefing!.ready.includes(p.uid))) events.push(...startGame(room, now));
        break;
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
          // Solo se revela lo que el jugador ya vio o tiene en pantalla; el resto viaja sin id ni enunciado.
          const current = me.assignments.findIndex((a) => !a.solved);
          const visible = assignment.solved || slot === current;
          const crypticId = visible ? (room.assigned[uid]?.[slot] ?? '') : '';
          const secret = visible ? getCrypticSecret(crypticId) : undefined;
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
    stage: room.stage ?? DEFAULT_COOP_STAGE,
    players: room.players.map((p) => (p.character ? p : { uid: p.uid, name: p.name })),
    draft: room.draft,
    bosses: pickBosses(room.seed, room.level),
    briefing: room.briefing,
    game: game ? { ...game, seed: 0 } : null,
    mine: { cryptics, cooldownUntil: room.cooldownUntil[uid] ?? 0 },
    events,
    serverTime: now,
  };
}

/** Cripticos que vio un jugador (salas anteriores a v1.4.1: los que resolvió). */
export function coopShownBy(room: CoopRoomState, uid: string): string[] {
  if (room.shown) return [...new Set(room.shown[uid] ?? [])];
  return Object.entries(room.solvedBy ?? {})
    .filter(([, solvers]) => solvers.includes(uid))
    .map(([crypticId]) => crypticId);
}

/** Soluciones para un jugador: solo los cripticos que vio él (no los de sus aliados), con su propio resultado. */
export function coopSolutions(room: CoopRoomState, uid: string): Solution[] {
  return coopShownBy(room, uid).map((crypticId) => {
    const secret = getCrypticSecret(crypticId);
    const solved = room.solvedBy?.[crypticId]?.includes(uid) ?? false;
    return { crypticId, answer: secret?.answer ?? null, explanation: secret?.explanation ?? null, solvedBy: solved ? [uid] : [] };
  });
}

// --- Elo COOP: cada jugador contra el rating fijo del nivel --------------------------------------------

const COOP_K = 24;

/** Rating del «rival» en el Elo COOP: el del nivel, ajustado por el subnivel. */
export function coopLevelRating(level: CoopLevel, stage: CoopStage | undefined): number {
  return LEVELS[level].rating + STAGE_RATING_OFFSET[stage ?? DEFAULT_COOP_STAGE];
}

export function coopRatingDelta(rating: number, levelRating: number, won: boolean): number {
  const expected = 1 / (1 + 10 ** ((levelRating - rating) / 400));
  return Math.round(COOP_K * ((won ? 1 : 0) - expected));
}
