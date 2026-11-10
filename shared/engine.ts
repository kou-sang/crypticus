// Motor de juego autoritativo: estado + acción -> estado nuevo. Puro y síncrono.
// Lo ejecuta el Durable Object; la validación criptográfica de respuestas ocurre fuera (async)
// y aquí solo llega `correct: boolean`.
import {
  computeDuelDamage,
  computeSolvePoints,
  LIMITS,
  rankParticipants,
  rankPrimary,
  type RankMetric,
} from './scoring';
import { isTeamDuel, startBlocker, TEAM_SIZE } from './teams';
import {
  DIFFICULTIES,
  type CompetitionConfig,
  type Difficulty,
  type Participant,
  type RankedParticipant,
} from './types';

export class GameError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface CatalogEntry {
  tier: Difficulty;
  hintCount: number;
  kind?: string; // Tipo (anagrama, contenedor…). Solo en el servidor: se quita del estado que ven los clientes.
}

export interface RoundState {
  index: number;
  crypticId: string;
  tier: Difficulty;
  startedAt: number;
  votes: Record<string, Difficulty>; // Votos de dificultad de ESTA ronda (solo mientras `voting`).
  /**
   * Votación de dificultad abierta (Race Hardcore): la ronda anterior ya cerró, todos votan durante
   * DIFFICULTY_VOTE_MS y recién entonces se sortea el criptico (hasta ahí `crypticId` es '').
   */
  voting?: boolean;
  solvedBy: string[]; // Orden de acierto en esta ronda.
  closesAt: number | null; // Cuenta atrás activa tras el primer acierto.
  opensAt?: number; // Intervalo entre cripticos: no se puede responder (ni se muestra) antes.
  surrenderedBy?: string[]; // Jugadores que se rindieron en esta ronda.
}

/**
 * Muerte súbita de desempate: si la partida termina con empate en la cima, los empatados
 * reciben cripticos de varias palabras (pool aparte). El primero que acierta gana.
 */
export interface TiebreakState {
  uids: string[]; // Empatados: solo ellos responden.
  index: number; // Criptico actual (0-based).
  total: number;
  crypticId: string;
  opensAt: number;
  closesAt: number;
  reason: EndReason; // Motivo con el que habría terminado la partida.
  played: string[]; // Cripticos de desempate que llegaron a abrirse.
  winnerId: string | null;
}

/** Aviso antes de abrir el primer criptico de desempate y pausa entre uno y otro. */
export const TIEBREAK_INTRO_MS = 3_000;
/** Duración de la votación de dificultad entre rondas. */
export const DIFFICULTY_VOTE_MS = 7_000;
/** Tiempo para cada criptico de desempate. */
export const TIEBREAK_TIME_MS = 90_000;

export type GameEventKind =
  | 'solve'
  | 'round'
  | 'overtime'
  | 'hint'
  | 'countdown'
  | 'eliminated'
  | 'damage'
  | 'tiebreak'
  | 'surrender';

export interface GameEvent {
  at: number;
  kind: GameEventKind;
  uid?: string;
  crypticId?: string;
  tier?: Difficulty;
  points?: number;
  seconds?: number;
  combo?: number; // Duel: aciertos consecutivos del atacante.
}

export type EndReason =
  | 'time'
  | 'target'
  | 'winByTwo'
  | 'exhausted'
  | 'voted'
  | 'lastStanding' // Royale
  | 'knockout' // Duel
  | 'tiebreak' // Ganada en la muerte súbita
  | null;

export interface LiveState {
  competitionId: string;
  title: string;
  config: CompetitionConfig;
  status: 'live' | 'finished';
  startedAt: number;
  endsAt: number;
  overtimeEndsAt: number | null; // Prórroga activa de "diferencia de dos".
  participants: Record<string, Participant>;
  crypticIds: string[]; // 'free': orden de juego
  pool: Record<Difficulty, string[]>; // 'rounds': cripticos disponibles por dificultad
  catalog: Record<string, CatalogEntry>;
  usedIds: string[]; // 'rounds': cripticos ya jugados
  round: RoundState | null;
  endVotes?: string[]; // Opcional: estados guardados antes de v0.5 no lo tienen.
  tiebreakIds?: string[]; // Cripticos de desempate reservados (secretos hasta abrir). Opcional: estados previos a v0.8.
  tiebreak?: TiebreakState | null;
  events: GameEvent[];
  winnerId: string | null;
  endReason: EndReason;
  finishedAt: number | null;
}

export interface CreateInput {
  competitionId: string;
  title?: string;
  config: CompetitionConfig;
  participants: Participant[];
  crypticIds: string[];
  pool: Record<Difficulty, string[]>;
  catalog: Record<string, CatalogEntry>;
  startedAt: number;
  tiebreakIds?: string[];
  random?: () => number;
}

const MAX_EVENTS = 20;

// ---------- Creación ----------

export function createLiveState(input: CreateInput): LiveState {
  const random = input.random ?? Math.random;
  const participants: Record<string, Participant> = {};
  const { royale, duel } = input.config;
  // Guardia del servidor: Duel exige la cantidad exacta de jugadores (sin rival, el daño sería 0).
  const blocker = startBlocker(input.config, input.participants.map((p) => p.uid));
  if (blocker) throw new GameError('bad_players', blocker);
  if (isTeamDuel(input.config)) {
    const sizes = [0, 1].map((t) => input.participants.filter((p) => p.team === t).length);
    if (sizes[0] !== TEAM_SIZE || sizes[1] !== TEAM_SIZE) throw new GameError('bad_teams', 'Los equipos deben ser de 2 contra 2.');
  }
  for (const p of input.participants) {
    // Solo se copian campos de identidad: el doc de participante lo escribe el cliente, y cualquier
    // otro campo (racha, saltos usados, desempate ganado…) sería una trampa al iniciar.
    participants[p.uid] = {
      uid: p.uid,
      displayName: String(p.displayName ?? '').slice(0, 32) || 'Jugador',
      joinedAt: Number(p.joinedAt) || 0,
      ...(p.device === 'mobile' || p.device === 'desktop' ? { device: p.device } : {}),
      ...(isTeamDuel(input.config) && (p.team === 0 || p.team === 1) ? { team: p.team } : {}),
      score: duel ? duel.hp : 0, // Duel: el puntaje es la vida restante.
      solvedIds: [],
      hintsByClue: {},
      hintsUsed: 0,
      attempts: 0,
      wrongAttempts: 0,
      lastSolvedAt: null,
      lastAttemptAt: null,
      ...(royale ? { bankMs: royale.baseSec * 1000, eliminatedAt: null } : {}),
      ...(isSequential(input.config) ? { cursor: 0, nextOpensAt: input.startedAt } : {}),
      surrenders: 0,
      skipsUsed: 0,
      streak: 0,
    };
  }
  // Solo se conservan cripticos con secreto disponible en el catálogo.
  const known = (id: string) => id in input.catalog;
  const pool = {
    easy: input.pool.easy.filter(known),
    medium: input.pool.medium.filter(known),
    hard: input.pool.hard.filter(known),
  };
  const crypticIds = input.crypticIds.filter(known);
  if (input.config.flow === 'free' && crypticIds.length === 0) throw new GameError('no_cryptics', 'No hay cripticos disponibles.');
  if (input.config.flow === 'rounds' && DIFFICULTIES.every((t) => pool[t].length === 0)) {
    throw new GameError('no_cryptics', 'No hay cripticos disponibles.');
  }

  const state: LiveState = {
    competitionId: input.competitionId,
    title: input.title ?? '',
    config: input.config,
    status: 'live',
    startedAt: input.startedAt,
    endsAt: input.startedAt + input.config.durationSec * 1000,
    overtimeEndsAt: null,
    participants,
    crypticIds,
    pool,
    catalog: input.catalog,
    usedIds: [],
    round: null,
    endVotes: [],
    tiebreakIds: (input.tiebreakIds ?? []).filter(known),
    tiebreak: null,
    events: [],
    winnerId: null,
    endReason: null,
    finishedAt: null,
  };
  if (input.config.flow === 'rounds') openRound(state, 'medium', input.startedAt, random);
  return state;
}

// ---------- Consultas ----------

export function rankMetric(config: CompetitionConfig): RankMetric {
  if (config.game === 'royale') return 'survival';
  if (config.game === 'duel') return 'score';
  return config.winByTwo || config.mode === 'count' ? 'solved' : 'score';
}

// ---------- Secuencial (Race Pacífico y Royale) ----------

/** Cada jugador avanza por la misma lista en orden, sin saltear ni ver los siguientes. */
export function isSequential(config: CompetitionConfig): boolean {
  return Boolean(config.royale) || (config.game === 'race' && config.flow === 'free');
}

/** Criptico actual de un jugador en modos secuenciales (null si terminó la lista). */
export function currentFor(state: LiveState, participant: Participant): string | null {
  return state.crypticIds[participant.cursor ?? 0] ?? null;
}

/** Segundos que los demás tienen para acertar cuando alguien se rinde. */
export const SURRENDER_GRACE_MS = 5_000;

// ---------- Duel ----------

/**
 * Daño máximo que podría recibir `uid` en el próximo golpe del rival:
 * criptico difícil, respuesta instantánea y el combo que el rival tendría.
 */
export function duelMaxIncoming(state: LiveState, uid: string): number {
  const duel = state.config.duel;
  const me = state.participants[uid];
  const rivals = rivalsOf(state, uid);
  const rival = rivals[0];
  if (!duel || !me || !rival) return 0;
  return computeDuelDamage({
    rule: duel.damage,
    tier: 'hard',
    elapsedMs: 0,
    comeback: state.config.comeback,
    hp: rival.score,
    rivalHp: me.score,
    streak: duel.combo === false ? 1 : Math.max(...rivals.map((p) => p.streak ?? 0)) + 1,
  });
}

/** `uid` está a un golpe de perder: el próximo acierto del rival puede dejarlo sin vida. */
export function duelOneHitFromDeath(state: LiveState, uid: string): boolean {
  const me = state.participants[uid];
  return Boolean(state.config.duel && me && me.score > 0 && me.score <= duelMaxIncoming(state, uid));
}

// ---------- Royale ----------

/** Momento en que el reloj de un jugador llega a 0 (Royale). */
export function royaleDeadline(state: LiveState, participant: Participant): number {
  return state.startedAt + (participant.bankMs ?? 0);
}

/** Tiempo restante del reloj de un jugador (Royale). */
/** Royale: saltar cuesta lo mismo que suma un acierto (con incremento 0, no cuesta nada). */
export function royaleSkipPenaltyMs(royale: { incrementSec: number }): number {
  return Math.max(0, royale.incrementSec) * 1000;
}

export function royaleRemaining(state: LiveState, participant: Participant, now: number): number {
  if (participant.eliminatedAt != null) return 0;
  return Math.max(0, royaleDeadline(state, participant) - Math.max(now, state.startedAt));
}

function alivePlayers(state: LiveState): Participant[] {
  return Object.values(state.participants).filter((p) => p.eliminatedAt == null);
}

/** Criptico actual de un jugador en Royale (secuencial). */
export function royaleCurrent(state: LiveState, participant: Participant): string | null {
  return currentFor(state, participant);
}

/** Hay una muerte súbita en curso. */
export function inTiebreak(state: LiveState): boolean {
  return state.status === 'live' && state.tiebreak != null;
}

export function rankState(state: LiveState): RankedParticipant[] {
  const ranked = rankParticipants(Object.values(state.participants), rankMetric(state.config));
  if (!isTeamDuel(state.config)) return ranked;
  // 2 vs 2: el puesto es del equipo. Ganador (o mejor vida/desempate) primero; si siguen iguales, empate.
  const sideKey = (team: 0 | 1) => {
    const members = ranked.filter((p) => p.team === team);
    const won = state.winnerId !== null && members.some((p) => p.uid === state.winnerId) ? 1 : 0;
    const tiebreak = members.some((p) => p.tiebreakWon) ? 1 : 0;
    return [won, members[0]?.score ?? 0, tiebreak] as const;
  };
  const [a, b] = [sideKey(0), sideKey(1)];
  const cmp = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const rankOf = (team: 0 | 1) => (cmp === 0 ? 1 : (team === 0) === cmp > 0 ? 1 : TEAM_SIZE + 1);
  return ranked
    .map((p) => ({ ...p, rank: rankOf(p.team === 1 ? 1 : 0) }))
    .sort((x, y) => x.rank - y.rank);
}

// ---------- Equipos ----------

/** Mismo bando: el mismo jugador o compañeros de equipo en Duel 2 vs 2. */
export function sameSide(state: LiveState, a: string, b: string): boolean {
  if (a === b) return true;
  if (!isTeamDuel(state.config)) return false;
  const ta = state.participants[a]?.team;
  return ta !== undefined && ta === state.participants[b]?.team;
}

/** Jugadores del bando de `uid` (él incluido). */
export function sideOf(state: LiveState, uid: string): Participant[] {
  return Object.values(state.participants).filter((p) => sameSide(state, uid, p.uid));
}

/** Rivales de `uid`: el otro jugador (1 vs 1) o el otro equipo (2 vs 2). */
export function rivalsOf(state: LiveState, uid: string): Participant[] {
  return Object.values(state.participants).filter((p) => !sameSide(state, uid, p.uid));
}

/** Ganó la partida (en 2 vs 2, también el compañero de quien figura como ganador). */
export function isOnWinningSide(state: LiveState, uid: string): boolean {
  return state.winnerId !== null && sameSide(state, uid, state.winnerId);
}

/** Fin del reloj de la partida (incluye prórroga). */
export function gameDeadline(state: LiveState): number {
  return state.overtimeEndsAt ?? state.endsAt;
}

/**
 * Próximo instante en el que el servidor debe re-evaluar: fin del reloj, cierre de ronda,
 * apertura del siguiente criptico (para revelarlo) o eliminación de un jugador en Royale.
 */
export function nextDeadline(state: LiveState, now = 0): number {
  const tb = state.tiebreak;
  if (tb && state.status === 'live') return tb.opensAt > now ? tb.opensAt : tb.closesAt;
  const candidates = [gameDeadline(state)];
  const round = state.round;
  if (round?.closesAt != null) candidates.push(round.closesAt);
  if (round?.opensAt != null && round.opensAt > now) candidates.push(round.opensAt);
  if (state.config.royale) for (const p of alivePlayers(state)) candidates.push(royaleDeadline(state, p));
  if (isSequential(state.config)) {
    for (const p of Object.values(state.participants)) if ((p.nextOpensAt ?? 0) > now) candidates.push(p.nextOpensAt!);
  }
  return Math.min(...candidates);
}

export function remainingRatio(state: LiveState, now: number): number {
  const total = state.endsAt - state.startedAt;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (state.endsAt - now) / total));
}

/** Criptico que el jugador puede intentar ahora (en 'free' cualquiera no resuelto de la lista). */
function isPlayable(state: LiveState, participant: Participant, crypticId: string, now: number): boolean {
  const tb = state.tiebreak;
  if (tb && state.status === 'live') {
    return tb.uids.includes(participant.uid) && tb.crypticId === crypticId && now >= tb.opensAt && now < tb.closesAt;
  }
  if (isSequential(state.config)) {
    if (state.config.royale && (participant.eliminatedAt != null || royaleRemaining(state, participant, now) <= 0)) return false;
    return now >= (participant.nextOpensAt ?? 0) && currentFor(state, participant) === crypticId;
  }
  if (state.config.flow === 'rounds') {
    const round = state.round;
    return (
      round != null &&
      !round.voting &&
      round.crypticId === crypticId &&
      now >= (round.opensAt ?? 0) &&
      !participant.solvedIds.includes(crypticId) &&
      !(round.surrenderedBy ?? []).includes(participant.uid)
    );
  }
  return state.crypticIds.includes(crypticId) && !participant.solvedIds.includes(crypticId);
}

function requireLive(state: LiveState, now: number): void {
  if (state.status !== 'live') throw new GameError('not_live', 'La competencia no está en curso.');
  if (now < state.startedAt) throw new GameError('not_started', 'Aún no empieza.');
}

/** Durante la muerte súbita solo se responde: sin pistas, votos ni rendiciones. */
function requireNoTiebreak(state: LiveState): void {
  if (inTiebreak(state)) throw new GameError('tiebreak', 'Desempate en curso.');
}

function requireParticipant(state: LiveState, uid: string): Participant {
  const participant = state.participants[uid];
  if (!participant) throw new GameError('not_participant', 'No participas en esta competencia.');
  return participant;
}

function pushEvent(state: LiveState, event: GameEvent): void {
  state.events = [...state.events, event].slice(-MAX_EVENTS);
}

// ---------- Respuestas ----------

/**
 * Valida un intento y reserva la ventana anti fuerza bruta.
 * Se llama ANTES del chequeo asíncrono de la respuesta.
 */
export function reserveAttempt(state: LiveState, uid: string, crypticId: string, now: number): void {
  requireLive(state, now);
  if (!inTiebreak(state)) {
    if (now >= gameDeadline(state)) throw new GameError('time_up', 'Se acabó el tiempo.');
    if (state.round?.closesAt != null && now >= state.round.closesAt) throw new GameError('not_playable', 'La ronda ya cerró.');
  }
  const participant = requireParticipant(state, uid);
  if (!(crypticId in state.catalog)) throw new GameError('unknown_cryptic', 'Criptico fuera de la competencia.');
  if (!isPlayable(state, participant, crypticId, now)) throw new GameError('not_playable', 'Ese criptico ya no está en juego.');
  if (participant.lastAttemptAt !== null && now - participant.lastAttemptAt < cooldownMs(state.config)) {
    throw new GameError('too_fast', 'Espera un momento antes de volver a intentar.');
  }
  participant.lastAttemptAt = now;
}

/** Espera mínima entre respuestas: la del modo (cooldown) o el mínimo anti fuerza bruta. */
export function cooldownMs(config: CompetitionConfig): number {
  return Math.max(LIMITS.minAttemptIntervalMs, (config.cooldownSec ?? 0) * 1000);
}

export interface AnswerOutcome {
  correct: boolean;
  points: number; // Puntos (competitivo) o daño (jefe)
  finished: boolean;
  stale: boolean; // La respuesta era correcta pero otro ganó la ronda antes.
}

export function applyAnswer(
  state: LiveState,
  input: { uid: string; crypticId: string; correct: boolean; now: number; random?: () => number },
): AnswerOutcome {
  const { uid, crypticId, now } = input;
  // Acierto que llegó después del ganador de la muerte súbita (arbitraje): se informa como tardío.
  if (state.status === 'finished' && state.tiebreak?.crypticId === crypticId) {
    return { correct: false, points: 0, finished: true, stale: input.correct };
  }
  requireLive(state, now);
  const participant = requireParticipant(state, uid);
  participant.attempts += 1;

  // Revalidación tras el await: la ronda pudo cambiar.
  if (!isPlayable(state, participant, crypticId, now)) {
    return { correct: false, points: 0, finished: false, stale: input.correct };
  }

  if (inTiebreak(state)) return applyTiebreakAnswer(state, participant, input.correct, now);

  if (!input.correct) {
    participant.wrongAttempts += 1;
    return { correct: false, points: 0, finished: evaluate(state, now).finished, stale: false };
  }

  const tier = state.catalog[crypticId]!.tier;

  // Royale: cada acierto suma segundos al reloj y avanza al siguiente criptico.
  if (state.config.royale) {
    participant.bankMs = (participant.bankMs ?? 0) + state.config.royale.incrementSec * 1000;
    advanceCursor(state, participant, now);
    participant.score += 1;
    participant.solvedIds = [...participant.solvedIds, crypticId];
    participant.lastSolvedAt = now;
    pushEvent(state, { at: now, kind: 'solve', uid, crypticId, tier, seconds: state.config.royale.incrementSec });
    return { correct: true, points: state.config.royale.incrementSec, finished: evaluate(state, now).finished, stale: false };
  }

  // Duel: acertar primero le quita vida al rival; los aciertos seguidos forman combo.
  // En 2 vs 2 la vida y la racha son del equipo: cualquiera de los dos puede responder.
  if (state.config.duel) {
    const side = sideOf(state, uid);
    const rivals = rivalsOf(state, uid);
    const rival = rivals[0];
    // Sin combo, cada acierto vale como aislado (la racha se sigue contando solo como dato).
    const streak = Math.max(...side.map((p) => p.streak ?? 0)) + 1;
    for (const p of side) p.streak = streak;
    const comboStreak = state.config.duel.combo === false ? 1 : streak;
    for (const p of rivals) p.streak = 0;
    const damage = rival
      ? Math.min(
          rival.score,
          computeDuelDamage({
            rule: state.config.duel.damage,
            tier,
            elapsedMs: now - (state.round?.opensAt ?? state.round?.startedAt ?? now),
            comeback: state.config.comeback,
            hp: participant.score,
            rivalHp: rival.score,
            streak: comboStreak,
          }),
        )
      : 0;
    for (const p of rivals) p.score = Math.max(0, p.score - damage);
    participant.solvedIds = [...participant.solvedIds, crypticId];
    participant.lastSolvedAt = now;
    pushEvent(state, { at: now, kind: 'damage', uid, crypticId, tier, points: damage, combo: comboStreak });
    onRoundSolved(state, uid, now, input.random ?? Math.random);
    return { correct: true, points: damage, finished: evaluate(state, now).finished, stale: false };
  }

  const leaderScore = Math.max(0, ...Object.values(state.participants).map((p) => p.score));
  const points = computeSolvePoints({
    tier,
    comeback: state.config.comeback,
    score: participant.score,
    leaderScore,
  });
  participant.score += points;
  participant.solvedIds = [...participant.solvedIds, crypticId];
  participant.lastSolvedAt = now;
  pushEvent(state, { at: now, kind: 'solve', uid, crypticId, tier, points });
  if (isSequential(state.config)) advanceCursor(state, participant, now);

  if (state.config.flow === 'rounds') onRoundSolved(state, uid, now, input.random ?? Math.random);

  return { correct: true, points, finished: evaluate(state, now).finished, stale: false };
}

// ---------- Pistas ----------

export interface HintOutcome {
  used: number;
  maxAllowed: number;
}

/** Pistas que le quedan al jugador en toda la partida (sin tope: infinitas). */
export function gameHintsLeft(state: LiveState, participant: Participant): number {
  const cap = state.config.hintsPerGame;
  return cap === undefined ? Number.POSITIVE_INFINITY : Math.max(0, cap - participant.hintsUsed);
}

export function applyHint(state: LiveState, input: { uid: string; crypticId: string; reveal: boolean; now: number }): HintOutcome {
  const participant = requireParticipant(state, input.uid);
  const entry = state.catalog[input.crypticId];
  if (!entry) throw new GameError('unknown_cryptic', 'Criptico fuera de la competencia.');
  const used = participant.hintsByClue[input.crypticId] ?? 0;
  const maxAllowed = Math.min(state.config.maxHintsPerClue, entry.hintCount, used + gameHintsLeft(state, participant));
  if (!input.reveal) return { used, maxAllowed };

  requireLive(state, input.now);
  requireNoTiebreak(state);
  if (!isPlayable(state, participant, input.crypticId, input.now)) throw new GameError('not_playable', 'Ese criptico ya no está en juego.');
  if (used >= maxAllowed) throw new GameError('no_more_hints', 'No quedan pistas.');
  participant.hintsByClue = { ...participant.hintsByClue, [input.crypticId]: used + 1 };
  participant.hintsUsed += 1;
  pushEvent(state, { at: input.now, kind: 'hint', uid: input.uid, crypticId: input.crypticId });
  return { used: used + 1, maxAllowed };
}

// ---------- Votos y acuerdos ----------

export function applyDifficultyVote(state: LiveState, input: { uid: string; tier: Difficulty; now: number }): void {
  requireLive(state, input.now);
  requireNoTiebreak(state);
  requireParticipant(state, input.uid);
  if (state.config.flow !== 'rounds' || !state.config.difficultyVote || !state.round) {
    throw new GameError('vote_disabled', 'La votación de dificultad no está activa.');
  }
  // Solo entre rondas: se vota cuando todos terminaron el criptico anterior.
  if (!state.round.voting || input.now >= (state.round.opensAt ?? 0)) {
    throw new GameError('vote_closed', 'La votación se abre cuando todos terminan el criptico.');
  }
  if (!DIFFICULTIES.includes(input.tier)) throw new GameError('bad_tier', 'Dificultad inválida.');
  state.round.votes = { ...state.round.votes, [input.uid]: input.tier };
}

function toggle(list: string[], uid: string): string[] {
  return list.includes(uid) ? list.filter((id) => id !== uid) : [...list, uid];
}


/** Avanza al siguiente criptico de la lista; se abre tras el intervalo del modo. */
function advanceCursor(state: LiveState, participant: Participant, now: number): void {
  participant.cursor = (participant.cursor ?? 0) + 1;
  participant.nextOpensAt = now + (state.config.intervalSec ?? 0) * 1000;
}

/**
 * Rendirse ante el criptico actual (usos limitados).
 * - Rondas: los demás tienen 5 s para acertar; si nadie queda pendiente, se pasa al siguiente.
 * - Secuencial: el jugador pasa a su siguiente criptico.
 */
export function surrender(state: LiveState, input: { uid: string; now: number; random?: () => number }): { applied: boolean } {
  const { uid, now } = input;
  requireLive(state, now);
  requireNoTiebreak(state);
  const participant = requireParticipant(state, uid);
  const rule = state.config.surrender;
  if (!rule?.enabled) throw new GameError('surrender_disabled', 'Rendirse no está habilitado.');
  if ((participant.surrenders ?? 0) >= rule.maxUses) throw new GameError('surrender_exhausted', 'No te quedan rendiciones.');

  if (isSequential(state.config)) {
    const id = currentFor(state, participant);
    if (!id || !isPlayable(state, participant, id, now)) throw new GameError('not_playable', 'No hay criptico para rendirse.');
    participant.surrenders = (participant.surrenders ?? 0) + 1;
    pushEvent(state, { at: now, kind: 'surrender', uid, crypticId: id });
    advanceCursor(state, participant, now);
    evaluate(state, now);
    return { applied: true };
  }

  const round = state.round;
  if (!round || !isPlayable(state, participant, round.crypticId, now)) throw new GameError('not_playable', 'No hay criptico para rendirse.');
  round.surrenderedBy = [...(round.surrenderedBy ?? []), uid];
  participant.surrenders = (participant.surrenders ?? 0) + 1;
  pushEvent(state, { at: now, kind: 'surrender', uid, crypticId: round.crypticId, seconds: SURRENDER_GRACE_MS / 1000 });
  if (roundSettled(state)) {
    advanceRound(state, now, input.random ?? Math.random);
  } else {
    const closes = now + SURRENDER_GRACE_MS;
    round.closesAt = round.closesAt == null ? closes : Math.min(round.closesAt, closes);
  }
  evaluate(state, now);
  return { applied: true };
}

/** Todos acertaron o se rindieron: no queda nadie por esperar en la ronda. */
function roundSettled(state: LiveState): boolean {
  const round = state.round;
  if (!round) return true;
  const done = new Set([...round.solvedBy, ...(round.surrenderedBy ?? [])]);
  return Object.keys(state.participants).every((id) => done.has(id));
}

/** Royale: pasar al siguiente criptico (sin volver atrás y sin ganar tiempo). */
export function passCryptic(state: LiveState, input: { uid: string; now: number }): { passed: boolean } {
  requireLive(state, input.now);
  requireNoTiebreak(state);
  const participant = requireParticipant(state, input.uid);
  const royale = state.config.royale;
  if (!royale) throw new GameError('pass_disabled', 'Solo disponible en Royale.');
  if (participant.eliminatedAt != null) throw new GameError('eliminated', 'Ya fuiste eliminado.');
  const used = participant.skipsUsed ?? 0;
  if (used >= (royale.skips ?? 0)) throw new GameError('skip_exhausted', royale.skips ? 'No te quedan saltos.' : 'En esta partida no se saltea.');
  const id = royaleCurrent(state, participant);
  if (!id || !isPlayable(state, participant, id, input.now)) throw new GameError('not_playable', 'No hay criptico para saltear.');
  // Saltar cuesta tiempo: lo mismo que suma un acierto.
  participant.skipsUsed = used + 1;
  participant.bankMs = (participant.bankMs ?? 0) - royaleSkipPenaltyMs(royale);
  pushEvent(state, { at: input.now, kind: 'surrender', uid: input.uid, crypticId: id, seconds: -royaleSkipPenaltyMs(royale) / 1000 });
  advanceCursor(state, participant, input.now);
  evaluate(state, input.now);
  return { passed: true };
}

/** Votos necesarios para terminar la sala: mayoría estricta. */
export function endVotesNeeded(state: LiveState): number {
  return Math.floor(Object.keys(state.participants).length / 2) + 1;
}

/**
 * Alterna el voto para terminar la partida. Con mayoría estricta termina:
 * gana quien va primero (sin ganador si hay empate en la cima o es modo jefe).
 */
export function toggleEndVote(state: LiveState, input: { uid: string; now: number }): { ended: boolean } {
  requireLive(state, input.now);
  requireParticipant(state, input.uid);
  state.endVotes = toggle(state.endVotes ?? [], input.uid);
  if (state.endVotes.length < endVotesNeeded(state)) return { ended: false };

  const ranked = rankState(state);
  const leader = ranked[0];
  const tiedAtTop = ranked.filter((p) => p.rank === 1).length > 1;
  const winnerId = !leader || tiedAtTop ? null : leader.uid;
  finish(state, 'voted', winnerId, input.now);
  return { ended: true };
}

// ---------- Rondas ----------

/**
 * Dificultad elegida por votación: gana la mayoría. Empate entre las más votadas: sorteo entre ellas.
 * Sin votos: `null` (el llamador usa medio).
 */
export function resolveVote(votes: Record<string, Difficulty>, random: () => number = Math.random): Difficulty | null {
  const entries = Object.values(votes);
  if (entries.length === 0) return null;
  const counts = new Map<Difficulty, number>();
  for (const tier of entries) counts.set(tier, (counts.get(tier) ?? 0) + 1);
  const max = Math.max(...counts.values());
  // Orden fijo (fácil → difícil) para que el sorteo no dependa del orden de llegada de los votos.
  const tied = DIFFICULTIES.filter((tier) => counts.get(tier) === max);
  if (tied.length === 1) return tied[0]!;
  return tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))]!;
}

function drawFromPool(state: LiveState, preferred: Difficulty, random: () => number): { id: string; tier: Difficulty } | null {
  const order: Difficulty[] =
    preferred === 'easy' ? ['easy', 'medium', 'hard'] : preferred === 'hard' ? ['hard', 'medium', 'easy'] : ['medium', 'easy', 'hard'];
  // Evita repetir el tipo del criptico anterior (si quedan otros de esa dificultad).
  const lastId = state.usedIds[state.usedIds.length - 1];
  const lastKind = lastId ? state.catalog[lastId]?.kind : undefined;
  for (const tier of order) {
    const available = state.pool[tier].filter((id) => !state.usedIds.includes(id));
    if (available.length > 0) {
      const varied = lastKind ? available.filter((id) => state.catalog[id]?.kind !== lastKind) : available;
      const options = varied.length > 0 ? varied : available;
      const id = options[Math.floor(random() * options.length)] ?? options[0]!;
      return { id, tier };
    }
  }
  return null;
}

function openRound(state: LiveState, preferred: Difficulty, now: number, random: () => number): void {
  const drawn = drawFromPool(state, preferred, random);
  if (!drawn) {
    state.round = null;
    return;
  }
  state.usedIds = [...state.usedIds, drawn.id];
  // La primera ronda abre al iniciar; las siguientes, tras el intervalo (se revela la solución anterior).
  const first = state.round === null;
  const opensAt = first ? now : now + (state.config.intervalSec ?? 0) * 1000;
  state.round = {
    index: (state.round?.index ?? 0) + 1,
    crypticId: drawn.id,
    tier: drawn.tier,
    startedAt: opensAt,
    votes: {},
    solvedBy: [],
    closesAt: null,
    opensAt,
  };
  pushEvent(state, { at: now, kind: 'round', crypticId: drawn.id, tier: drawn.tier });
}

/**
 * Tras un acierto en rondas: sin cuenta atrás, la ronda cierra al instante.
 * Con cuenta atrás, el resto tiene `rivalCountdownSec` para acertar también.
 */
function onRoundSolved(state: LiveState, uid: string, now: number, random: () => number): void {
  const round = state.round;
  if (!round) return;
  round.solvedBy = [...round.solvedBy, uid];
  if (state.config.rivalCountdownSec <= 0 || roundSettled(state)) {
    advanceRound(state, now, random);
    return;
  }
  if (round.closesAt === null) {
    round.closesAt = now + state.config.rivalCountdownSec * 1000;
    pushEvent(state, { at: now, kind: 'countdown', uid, seconds: state.config.rivalCountdownSec });
  }
}

function advanceRound(state: LiveState, now: number, random: () => number): void {
  if (!state.round) return;
  if (state.config.difficultyVote) {
    openVote(state, now);
    return;
  }
  const preferred = DIFFICULTIES[Math.floor(random() * DIFFICULTIES.length)] ?? 'medium';
  openRound(state, preferred, now, random);
}

/** Cierra la ronda y abre la votación de dificultad de la siguiente (también muestra la solución anterior). */
function openVote(state: LiveState, now: number): void {
  const previous = state.round!;
  // Sin cripticos por sortear no hay nada que votar: la partida termina como antes.
  if (!DIFFICULTIES.some((tier) => state.pool[tier].some((id) => !state.usedIds.includes(id)))) {
    state.round = null;
    return;
  }
  const opensAt = now + Math.max(DIFFICULTY_VOTE_MS, (state.config.intervalSec ?? 0) * 1000);
  state.round = {
    index: previous.index + 1,
    crypticId: '',
    tier: 'medium',
    startedAt: opensAt,
    votes: {},
    solvedBy: [],
    closesAt: null,
    opensAt,
    voting: true,
  };
}

/** Fin de la votación: gana la mayoría y se sortea el criptico de esa dificultad. Abre en el acto. */
function closeVote(state: LiveState, now: number, random: () => number): void {
  const round = state.round!;
  const preferred = resolveVote(round.votes, random) ?? 'medium';
  const drawn = drawFromPool(state, preferred, random);
  if (!drawn) {
    state.round = null;
    return;
  }
  state.usedIds = [...state.usedIds, drawn.id];
  const opensAt = Math.max(round.opensAt ?? now, now);
  state.round = { ...round, crypticId: drawn.id, tier: drawn.tier, startedAt: opensAt, opensAt, voting: false };
  pushEvent(state, { at: now, kind: 'round', crypticId: drawn.id, tier: drawn.tier });
}

// ---------- Fin de partida ----------

/** Re-evaluación periódica (alarma). */
export function tick(state: LiveState, now: number, random: () => number = Math.random): { finished: boolean } {
  if (state.status !== 'live') return { finished: state.status === 'finished' };
  if (state.tiebreak) return tickTiebreak(state, now);
  if (state.round?.voting && now >= (state.round.opensAt ?? 0)) closeVote(state, now, random);
  if (state.round?.closesAt != null && now >= state.round.closesAt) advanceRound(state, now, random);
  if (state.config.royale) eliminateExpired(state, now);
  return { finished: evaluate(state, now).finished };
}

/** Royale: elimina a quien se quedó sin reloj. `eliminatedAt` es el instante exacto en que llegó a 0. */
function eliminateExpired(state: LiveState, now: number): void {
  const expired = alivePlayers(state)
    .filter((p) => royaleDeadline(state, p) <= now)
    .sort((a, b) => royaleDeadline(state, a) - royaleDeadline(state, b));
  for (const p of expired) {
    p.eliminatedAt = royaleDeadline(state, p);
    pushEvent(state, { at: p.eliminatedAt, kind: 'eliminated', uid: p.uid });
  }
}

function finish(state: LiveState, reason: EndReason, winnerId: string | null, now: number): { finished: true } {
  state.status = 'finished';
  state.endReason = reason;
  state.winnerId = winnerId;
  state.finishedAt = now;
  return { finished: true };
}

function evaluate(state: LiveState, now: number): { finished: boolean } {
  if (state.status !== 'live') return { finished: state.status === 'finished' };
  if (state.tiebreak) return { finished: false }; // La muerte súbita la cierra un acierto o `tick`.
  const { config } = state;
  const players = Object.values(state.participants);

  const ranked = rankState(state);
  const leader = ranked[0];
  const second = ranked[1];
  const uniqueLeader = leader && (!second || second.rank !== leader.rank) ? leader.uid : null;

  // Royale: gana el último en pie (en solitario, la partida acaba al caer).
  if (config.royale) {
    eliminateExpired(state, now);
    const alive = alivePlayers(state);
    const reranked = rankState(state);
    const top = reranked[0];
    const uniqueTop = top && reranked.filter((p) => p.rank === 1).length === 1 ? top.uid : null;
    if (players.length > 1 && alive.length === 1) return finish(state, 'lastStanding', alive[0]!.uid, now);
    if (players.length > 1 && alive.length === 0) return finishOrTiebreak(state, 'lastStanding', uniqueTop, now);
    if (players.length === 1 && alive.length === 0) return finish(state, 'time', null, now);
    if (alive.every((p) => royaleCurrent(state, p) === null)) return finishOrTiebreak(state, 'exhausted', uniqueTop, now);
    if (now >= gameDeadline(state)) return finishOrTiebreak(state, 'time', uniqueTop, now);
    return { finished: false };
  }

  // Duel: gana quien deja al rival sin vida.
  if (config.duel) {
    const knockedOut = players.find((p) => p.score <= 0);
    if (knockedOut) return finish(state, 'knockout', players.find((p) => !sameSide(state, knockedOut.uid, p.uid))?.uid ?? null, now);
  }
  const solvedLead = leader ? leader.solvedIds.length - (second?.solvedIds.length ?? 0) : 0;
  const hasMargin = !config.winByTwo || solvedLead >= LIMITS.winByTwoMargin;

  // Diferencia de dos alcanzada en prórroga
  if (state.overtimeEndsAt !== null && hasMargin && leader) return finish(state, 'winByTwo', leader.uid, now);

  // Meta en modo cantidad
  if (config.mode === 'count' && leader) {
    const available = config.flow === 'rounds' ? Number.POSITIVE_INFINITY : state.crypticIds.length;
    const target = Math.min(config.targetCount, available);
    if (leader.solvedIds.length >= target && hasMargin) {
      return finish(state, config.winByTwo ? 'winByTwo' : 'target', leader.uid, now);
    }
  }

  if (isExhausted(state, players)) return finishOrTiebreak(state, 'exhausted', uniqueLeader, now);

  // Tiempo
  if (now >= state.endsAt && state.overtimeEndsAt === null) {
    if (config.winByTwo && !hasMargin) {
      state.overtimeEndsAt = state.endsAt + Math.round(config.durationSec * 1000 * LIMITS.overtimeRatio);
      pushEvent(state, { at: now, kind: 'overtime' });
      return { finished: false };
    }
    return finishOrTiebreak(state, 'time', uniqueLeader, now);
  }
  if (state.overtimeEndsAt !== null && now >= state.overtimeEndsAt) return finishOrTiebreak(state, 'time', uniqueLeader, now);

  return { finished: false };
}

// ---------- Desempate (muerte súbita) ----------

/** Jugadores empatados en la cima por el resultado visible (métrica del modo y puntaje). */
export function tiedLeaders(state: LiveState): string[] {
  const metric = rankMetric(state.config);
  const ranked = rankState(state);
  const top = ranked[0];
  if (!top) return [];
  return ranked.filter((p) => rankPrimary(p, metric) === rankPrimary(top, metric) && p.score === top.score).map((p) => p.uid);
}

/** Termina la partida o, si hay empate en la cima y cripticos de desempate, abre la muerte súbita. */
function finishOrTiebreak(state: LiveState, reason: EndReason, winnerId: string | null, now: number): { finished: boolean } {
  const ids = state.tiebreakIds ?? [];
  if (!state.tiebreak && ids.length > 0) {
    const tied = tiedLeaders(state);
    if (tied.length >= 2) {
      const opensAt = now + TIEBREAK_INTRO_MS;
      state.round = state.round ? { ...state.round, closesAt: null } : null;
      state.tiebreak = {
        uids: tied,
        index: 0,
        total: ids.length,
        crypticId: ids[0]!,
        opensAt,
        closesAt: opensAt + TIEBREAK_TIME_MS,
        reason,
        played: [ids[0]!],
        winnerId: null,
      };
      pushEvent(state, { at: now, kind: 'tiebreak', crypticId: ids[0]! });
      return { finished: false };
    }
  }
  return finish(state, reason, winnerId, now);
}

/** Ganador según el ranking completo (pistas y hora del último acierto) o nadie si siguen empatados. */
function rankedWinner(state: LiveState): string | null {
  const ranked = rankState(state);
  const leader = ranked[0];
  const second = ranked[1];
  return leader && (!second || second.rank !== leader.rank) ? leader.uid : null;
}

function applyTiebreakAnswer(state: LiveState, participant: Participant, correct: boolean, now: number): AnswerOutcome {
  const tb = state.tiebreak!;
  if (!correct) {
    participant.wrongAttempts += 1; // Sin penalización: solo cuenta para las estadísticas.
    return { correct: false, points: 0, finished: false, stale: false };
  }
  for (const p of sideOf(state, participant.uid)) p.tiebreakWon = true; // 2 vs 2: gana el equipo.
  participant.lastSolvedAt = now;
  tb.winnerId = participant.uid;
  pushEvent(state, { at: now, kind: 'tiebreak', uid: participant.uid, crypticId: tb.crypticId });
  finish(state, 'tiebreak', participant.uid, now);
  return { correct: true, points: 0, finished: true, stale: false };
}

/** Nadie acertó a tiempo: siguiente criptico de desempate o, sin más, final con el ranking completo. */
function tickTiebreak(state: LiveState, now: number): { finished: boolean } {
  const tb = state.tiebreak!;
  if (now < tb.closesAt) return { finished: false };
  const ids = state.tiebreakIds ?? [];
  const next = ids[tb.index + 1];
  if (!next) return finish(state, tb.reason, rankedWinner(state), now);
  const opensAt = now + TIEBREAK_INTRO_MS;
  state.tiebreak = {
    ...tb,
    index: tb.index + 1,
    crypticId: next,
    opensAt,
    closesAt: opensAt + TIEBREAK_TIME_MS,
    played: [...tb.played, next],
  };
  pushEvent(state, { at: now, kind: 'tiebreak', crypticId: next });
  return { finished: false };
}

function isExhausted(state: LiveState, players: Participant[]): boolean {
  if (isSequential(state.config)) return players.length > 0 && players.every((p) => currentFor(state, p) === null);
  if (state.config.flow === 'rounds') return state.round === null;
  return players.length > 0 && players.every((p) => state.crypticIds.every((id) => p.solvedIds.includes(id)));
}

// ---------- Revelado de soluciones ----------

/**
 * Cripticos cuya solución ya se puede mostrar a todos:
 * - partida terminada: todos los jugados;
 * - 'rounds' en vivo: las rondas ya cerradas (nadie puede seguir respondiéndolas);
 * - 'free' en vivo: ninguno (los rivales podrían seguir con el mismo criptico).
 */
export function revealableIds(state: LiveState): string[] {
  const base = baseRevealableIds(state);
  const tb = state.tiebreak;
  if (!tb) return base;
  // Desempate: los ya cerrados en vivo; al terminar, los que llegaron a abrirse.
  const finishedAt = state.finishedAt ?? Number.POSITIVE_INFINITY;
  const closed = state.status === 'finished' ? tb.played.filter((id) => id !== tb.crypticId || tb.opensAt <= finishedAt) : tb.played.slice(0, tb.index);
  return [...base, ...closed.filter((id) => !base.includes(id))];
}

function baseRevealableIds(state: LiveState): string[] {
  const finishedAt = state.finishedAt ?? Number.POSITIVE_INFINITY;
  if (state.config.flow === 'rounds') {
    const round = state.round;
    // En vivo, la ronda actual sigue en juego; al terminar, una ronda que aún no había abierto nunca se jugó.
    const hidden = round && (state.status === 'live' || (round.opensAt ?? 0) > finishedAt) ? round.crypticId : undefined;
    return state.usedIds.filter((id) => id !== hidden);
  }
  if (state.status !== 'finished') return [];
  if (!isSequential(state.config)) return [...state.crypticIds];
  // Secuencial: solo lo que algún jugador llegó a ver (su actual cuenta si ya había abierto).
  let reached = 0;
  for (const p of Object.values(state.participants)) {
    const cursor = p.cursor ?? 0;
    const opened = (p.nextOpensAt ?? 0) <= finishedAt ? cursor + 1 : cursor;
    reached = Math.max(reached, Math.min(opened, state.crypticIds.length));
  }
  return state.crypticIds.slice(0, reached);
}
