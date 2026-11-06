// Motor de juego autoritativo: estado + acción -> estado nuevo. Puro y síncrono.
// Lo ejecuta el Durable Object; la validación criptográfica de respuestas ocurre fuera (async)
// y aquí solo llega `correct: boolean`.
import {
  BOSS_HEAL_ON_MISS,
  bossMaxHp,
  computeBossDamage,
  computeDuelDamage,
  computeSolvePoints,
  LIMITS,
  rankParticipants,
  type RankMetric,
} from './scoring';
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
}

export interface RoundState {
  index: number;
  crypticId: string;
  tier: Difficulty;
  startedAt: number;
  votes: Record<string, Difficulty>; // Voto de dificultad para la SIGUIENTE ronda.
  solvedBy: string[]; // Orden de acierto en esta ronda.
  closesAt: number | null; // Cuenta atrás activa tras el primer acierto.
  opensAt?: number; // Intervalo entre cripticos: no se puede responder (ni se muestra) antes.
  surrenderedBy?: string[]; // Jugadores que se rindieron en esta ronda.
}

export type GameEventKind =
  | 'solve'
  | 'round'
  | 'skip'
  | 'extraTime'
  | 'overtime'
  | 'hint'
  | 'heal'
  | 'countdown'
  | 'eliminated'
  | 'damage'
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
  | 'bossDefeated'
  | 'bossSurvived'
  | 'voted'
  | 'lastStanding' // Royale
  | 'knockout' // Duel
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
  boss: { maxHp: number; hp: number } | null;
  extraTime: { usesLeft: number; votes: string[] };
  skipVotes: string[];
  endVotes?: string[]; // Opcional: estados guardados antes de v0.5 no lo tienen.
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
  random?: () => number;
}

const MAX_EVENTS = 20;

// ---------- Creación ----------

export function createLiveState(input: CreateInput): LiveState {
  const random = input.random ?? Math.random;
  const participants: Record<string, Participant> = {};
  const { royale, duel } = input.config;
  for (const p of input.participants) {
    participants[p.uid] = {
      ...p,
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
    boss: input.config.mode === 'boss' ? { maxHp: 0, hp: 0 } : null,
    extraTime: { usesLeft: input.config.extraTime.enabled ? input.config.extraTime.maxUses : 0, votes: [] },
    skipVotes: [],
    endVotes: [],
    events: [],
    winnerId: null,
    endReason: null,
    finishedAt: null,
  };
  if (state.boss) {
    const hp = bossMaxHp(input.config.bossLevel, input.participants.length);
    state.boss = { maxHp: hp, hp };
  }
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
  const rival = Object.values(state.participants).find((p) => p.uid !== uid);
  if (!duel || !me || !rival) return 0;
  return computeDuelDamage({
    rule: duel.damage,
    tier: 'hard',
    elapsedMs: 0,
    comeback: state.config.comeback,
    hp: rival.score,
    rivalHp: me.score,
    streak: (rival.streak ?? 0) + 1,
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

export function rankState(state: LiveState): RankedParticipant[] {
  return rankParticipants(Object.values(state.participants), rankMetric(state.config));
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
  if (isSequential(state.config)) {
    if (state.config.royale && (participant.eliminatedAt != null || royaleRemaining(state, participant, now) <= 0)) return false;
    return now >= (participant.nextOpensAt ?? 0) && currentFor(state, participant) === crypticId;
  }
  if (state.config.flow === 'rounds') {
    const round = state.round;
    return (
      round?.crypticId === crypticId &&
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
  if (now >= gameDeadline(state)) throw new GameError('time_up', 'Se acabó el tiempo.');
  if (state.round?.closesAt != null && now >= state.round.closesAt) throw new GameError('not_playable', 'La ronda ya cerró.');
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
  requireLive(state, now);
  const participant = requireParticipant(state, uid);
  participant.attempts += 1;

  // Revalidación tras el await: la ronda pudo cambiar.
  if (!isPlayable(state, participant, crypticId, now)) {
    return { correct: false, points: 0, finished: false, stale: input.correct };
  }

  if (!input.correct) {
    participant.wrongAttempts += 1;
    if (state.boss) {
      // Fallar cura al jefe.
      const heal = Math.min(state.boss.maxHp - state.boss.hp, BOSS_HEAL_ON_MISS[state.config.bossLevel]);
      if (heal > 0) {
        state.boss.hp += heal;
        pushEvent(state, { at: now, kind: 'heal', uid, points: heal });
      }
    } else if (state.config.wrongPenalty > 0) {
      participant.score = Math.max(0, participant.score - state.config.wrongPenalty);
    }
    return { correct: false, points: 0, finished: evaluate(state, now).finished, stale: false };
  }

  const tier = state.catalog[crypticId]!.tier;
  const ratio = remainingRatio(state, now);

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
  if (state.config.duel) {
    const rival = Object.values(state.participants).find((p) => p.uid !== uid);
    const streak = (participant.streak ?? 0) + 1;
    participant.streak = streak;
    if (rival) rival.streak = 0;
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
            streak,
          }),
        )
      : 0;
    if (rival) rival.score = Math.max(0, rival.score - damage);
    participant.solvedIds = [...participant.solvedIds, crypticId];
    participant.lastSolvedAt = now;
    pushEvent(state, { at: now, kind: 'damage', uid, crypticId, tier, points: damage, combo: streak });
    onRoundSolved(state, uid, now, input.random ?? Math.random);
    return { correct: true, points: damage, finished: evaluate(state, now).finished, stale: false };
  }

  let points: number;
  if (state.boss) {
    points = Math.min(state.boss.hp, computeBossDamage(tier, ratio));
    state.boss.hp = Math.max(0, state.boss.hp - points);
  } else {
    const leaderScore = Math.max(0, ...Object.values(state.participants).map((p) => p.score));
    points = computeSolvePoints({
      rule: state.config.scoring,
      tier,
      hintsUsed: participant.hintsByClue[crypticId] ?? 0,
      remainingRatio: ratio,
      comeback: state.config.comeback,
      score: participant.score,
      leaderScore,
    });
  }
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

export function applyHint(state: LiveState, input: { uid: string; crypticId: string; reveal: boolean; now: number }): HintOutcome {
  const participant = requireParticipant(state, input.uid);
  const entry = state.catalog[input.crypticId];
  if (!entry) throw new GameError('unknown_cryptic', 'Criptico fuera de la competencia.');
  const used = participant.hintsByClue[input.crypticId] ?? 0;
  const maxAllowed = Math.min(state.config.maxHintsPerClue, entry.hintCount);
  if (!input.reveal) return { used, maxAllowed };

  requireLive(state, input.now);
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
  requireParticipant(state, input.uid);
  if (state.config.flow !== 'rounds' || !state.config.difficultyVote || !state.round) {
    throw new GameError('vote_disabled', 'La votación de dificultad no está activa.');
  }
  if (!DIFFICULTIES.includes(input.tier)) throw new GameError('bad_tier', 'Dificultad inválida.');
  state.round.votes = { ...state.round.votes, [input.uid]: input.tier };
}

function toggle(list: string[], uid: string): string[] {
  return list.includes(uid) ? list.filter((id) => id !== uid) : [...list, uid];
}

function everyone(state: LiveState, votes: string[]): boolean {
  return Object.keys(state.participants).every((uid) => votes.includes(uid));
}

/** Alterna la solicitud de tiempo extra; se aplica cuando TODOS la piden. */
export function toggleExtraTime(state: LiveState, input: { uid: string; now: number }): { applied: boolean } {
  requireLive(state, input.now);
  requireParticipant(state, input.uid);
  if (!state.config.extraTime.enabled) throw new GameError('extra_disabled', 'El tiempo extra no está habilitado.');
  if (state.extraTime.usesLeft <= 0) throw new GameError('extra_exhausted', 'No quedan usos de tiempo extra.');

  state.extraTime.votes = toggle(state.extraTime.votes, input.uid);
  if (!everyone(state, state.extraTime.votes)) return { applied: false };

  const ms = state.config.extraTime.seconds * 1000;
  if (state.overtimeEndsAt !== null) state.overtimeEndsAt += ms;
  else state.endsAt += ms;
  state.extraTime = { usesLeft: state.extraTime.usesLeft - 1, votes: [] };
  pushEvent(state, { at: input.now, kind: 'extraTime', seconds: state.config.extraTime.seconds });
  return { applied: true };
}

/** Rondas: alterna el voto para pasar el criptico actual; se pasa cuando TODOS votan. */
export function toggleSkip(state: LiveState, input: { uid: string; now: number; random?: () => number }): { skipped: boolean } {
  requireLive(state, input.now);
  requireParticipant(state, input.uid);
  if (state.config.flow !== 'rounds' || !state.round) throw new GameError('skip_disabled', 'Solo disponible en rondas.');
  if (state.config.game === 'race') throw new GameError('skip_disabled', 'En Race no se saltea: usa rendirse.');

  state.skipVotes = toggle(state.skipVotes, input.uid);
  if (!everyone(state, state.skipVotes)) return { skipped: false };

  pushEvent(state, { at: input.now, kind: 'skip', crypticId: state.round.crypticId, tier: state.round.tier });
  advanceRound(state, input.now, input.random ?? Math.random);
  evaluate(state, input.now);
  return { skipped: true };
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
  const participant = requireParticipant(state, input.uid);
  if (!state.config.royale) throw new GameError('pass_disabled', 'Solo disponible en Royale.');
  if (participant.eliminatedAt != null) throw new GameError('eliminated', 'Ya fuiste eliminado.');
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
  const winnerId = state.boss || !leader || tiedAtTop ? null : leader.uid;
  finish(state, 'voted', winnerId, input.now);
  return { ended: true };
}

// ---------- Rondas ----------

/**
 * Dificultad elegida por votación. Empate: gana el voto del jugador peor posicionado
 * (mecánica de remontada). Sin votos: medio.
 */
export function resolveVote(votes: Record<string, Difficulty>, ranked: RankedParticipant[]): Difficulty | null {
  const entries = Object.entries(votes);
  if (entries.length === 0) return null;
  const counts = new Map<Difficulty, number>();
  for (const [, tier] of entries) counts.set(tier, (counts.get(tier) ?? 0) + 1);
  const max = Math.max(...counts.values());
  const tied = [...counts.entries()].filter(([, count]) => count === max).map(([tier]) => tier);
  if (tied.length === 1) return tied[0]!;

  const rankOf = new Map(ranked.map((p) => [p.uid, p.rank]));
  let best: { tier: Difficulty; rank: number } | null = null;
  for (const [uid, tier] of entries) {
    if (!tied.includes(tier)) continue;
    const rank = rankOf.get(uid) ?? 0;
    if (!best || rank > best.rank) best = { tier, rank };
  }
  return best?.tier ?? tied[0]!;
}

function drawFromPool(state: LiveState, preferred: Difficulty, random: () => number): { id: string; tier: Difficulty } | null {
  const order: Difficulty[] =
    preferred === 'easy' ? ['easy', 'medium', 'hard'] : preferred === 'hard' ? ['hard', 'medium', 'easy'] : ['medium', 'easy', 'hard'];
  for (const tier of order) {
    const available = state.pool[tier].filter((id) => !state.usedIds.includes(id));
    if (available.length > 0) {
      const id = available[Math.floor(random() * available.length)] ?? available[0]!;
      return { id, tier };
    }
  }
  return null;
}

function openRound(state: LiveState, preferred: Difficulty, now: number, random: () => number): void {
  const drawn = drawFromPool(state, preferred, random);
  state.skipVotes = [];
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
  let preferred: Difficulty;
  if (state.config.difficultyVote) {
    preferred = resolveVote(state.round.votes, rankState(state)) ?? 'medium';
  } else {
    preferred = DIFFICULTIES[Math.floor(random() * DIFFICULTIES.length)] ?? 'medium';
  }
  openRound(state, preferred, now, random);
}

// ---------- Fin de partida ----------

/** Re-evaluación periódica (alarma). */
export function tick(state: LiveState, now: number, random: () => number = Math.random): { finished: boolean } {
  if (state.status !== 'live') return { finished: state.status === 'finished' };
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
  const { config } = state;
  const players = Object.values(state.participants);

  // Jefe (cooperativo)
  if (state.boss) {
    if (state.boss.hp <= 0) return finish(state, 'bossDefeated', null, now);
    if (isExhausted(state, players)) return finish(state, 'bossSurvived', null, now);
    if (now >= gameDeadline(state)) return finish(state, 'bossSurvived', null, now);
    return { finished: false };
  }

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
    if (players.length > 1 && alive.length <= 1) return finish(state, 'lastStanding', alive[0]?.uid ?? uniqueTop, now);
    if (players.length === 1 && alive.length === 0) return finish(state, 'time', null, now);
    if (alive.every((p) => royaleCurrent(state, p) === null)) return finish(state, 'exhausted', uniqueTop, now);
    if (now >= gameDeadline(state)) return finish(state, 'time', uniqueTop, now);
    return { finished: false };
  }

  // Duel: gana quien deja al rival sin vida.
  if (config.duel) {
    const knockedOut = players.find((p) => p.score <= 0);
    if (knockedOut) return finish(state, 'knockout', players.find((p) => p.uid !== knockedOut.uid)?.uid ?? null, now);
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

  if (isExhausted(state, players)) return finish(state, 'exhausted', uniqueLeader, now);

  // Tiempo
  if (now >= state.endsAt && state.overtimeEndsAt === null) {
    if (config.winByTwo && !hasMargin) {
      state.overtimeEndsAt = state.endsAt + Math.round(config.durationSec * 1000 * LIMITS.overtimeRatio);
      pushEvent(state, { at: now, kind: 'overtime' });
      return { finished: false };
    }
    return finish(state, 'time', uniqueLeader, now);
  }
  if (state.overtimeEndsAt !== null && now >= state.overtimeEndsAt) return finish(state, 'time', uniqueLeader, now);

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
