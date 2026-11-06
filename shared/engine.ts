// Motor de juego autoritativo: estado + acción -> estado nuevo. Puro y síncrono.
// Lo ejecuta el Durable Object; la validación criptográfica de respuestas ocurre fuera (async)
// y aquí solo llega `correct: boolean`.
import {
  BOSS_HEAL_ON_MISS,
  bossMaxHp,
  computeBossDamage,
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
}

export type GameEventKind = 'solve' | 'round' | 'skip' | 'extraTime' | 'overtime' | 'hint' | 'heal' | 'countdown';

export interface GameEvent {
  at: number;
  kind: GameEventKind;
  uid?: string;
  crypticId?: string;
  tier?: Difficulty;
  points?: number;
  seconds?: number;
}

export type EndReason = 'time' | 'target' | 'winByTwo' | 'exhausted' | 'bossDefeated' | 'bossSurvived' | null;

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
  for (const p of input.participants) {
    participants[p.uid] = { ...p, score: 0, solvedIds: [], hintsByClue: {}, hintsUsed: 0, attempts: 0, wrongAttempts: 0, lastSolvedAt: null, lastAttemptAt: null };
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
  return config.winByTwo || config.mode === 'count' ? 'solved' : 'score';
}

export function rankState(state: LiveState): RankedParticipant[] {
  return rankParticipants(Object.values(state.participants), rankMetric(state.config));
}

/** Fin del reloj de la partida (incluye prórroga). */
export function gameDeadline(state: LiveState): number {
  return state.overtimeEndsAt ?? state.endsAt;
}

/** Próximo instante en el que el servidor debe re-evaluar (reloj o cierre de ronda). */
export function nextDeadline(state: LiveState): number {
  const closesAt = state.round?.closesAt ?? null;
  return closesAt !== null ? Math.min(closesAt, gameDeadline(state)) : gameDeadline(state);
}

export function remainingRatio(state: LiveState, now: number): number {
  const total = state.endsAt - state.startedAt;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (state.endsAt - now) / total));
}

/** Criptico que el jugador puede intentar ahora (en 'free' cualquiera no resuelto de la lista). */
function isPlayable(state: LiveState, participant: Participant, crypticId: string): boolean {
  if (state.config.flow === 'rounds') return state.round?.crypticId === crypticId && !participant.solvedIds.includes(crypticId);
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
  if (!isPlayable(state, participant, crypticId)) throw new GameError('not_playable', 'Ese criptico ya no está en juego.');
  if (participant.lastAttemptAt !== null && now - participant.lastAttemptAt < LIMITS.minAttemptIntervalMs) {
    throw new GameError('too_fast', 'Espera un momento antes de volver a intentar.');
  }
  participant.lastAttemptAt = now;
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
  if (!isPlayable(state, participant, crypticId)) {
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
  if (!isPlayable(state, participant, input.crypticId)) throw new GameError('not_playable', 'Ese criptico ya no está en juego.');
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

  state.skipVotes = toggle(state.skipVotes, input.uid);
  if (!everyone(state, state.skipVotes)) return { skipped: false };

  pushEvent(state, { at: input.now, kind: 'skip', crypticId: state.round.crypticId, tier: state.round.tier });
  advanceRound(state, input.now, input.random ?? Math.random);
  evaluate(state, input.now);
  return { skipped: true };
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
  state.round = {
    index: (state.round?.index ?? 0) + 1,
    crypticId: drawn.id,
    tier: drawn.tier,
    startedAt: now,
    votes: {},
    solvedBy: [],
    closesAt: null,
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
  const everyoneSolved = Object.keys(state.participants).every((id) => round.solvedBy.includes(id));
  if (state.config.rivalCountdownSec <= 0 || everyoneSolved) {
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
  return { finished: evaluate(state, now).finished };
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
  if (state.config.flow === 'rounds') {
    const current = state.status === 'live' ? state.round?.crypticId : undefined;
    return state.usedIds.filter((id) => id !== current);
  }
  return state.status === 'finished' ? [...state.crypticIds] : [];
}
