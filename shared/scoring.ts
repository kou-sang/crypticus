// Motor de reglas de competencia: puntuación, ranking, fin de partida y rating.
// Funciones puras: se ejecutan en el servidor (fuente de verdad) y en el cliente (previsualización).

import type {
  Competition,
  CompetitionConfig,
  Difficulty,
  Participant,
  RankedParticipant,
  ScoringRule,
} from './types';

export const DEFAULT_CONFIG: CompetitionConfig = {
  mode: 'timed',
  scoring: 'standard',
  durationSec: 600,
  targetCount: 5,
  winByTwoMinScore: 3,
  maxHintsPerClue: 3,
};

export const LIMITS = {
  minDurationSec: 60,
  maxDurationSec: 3 * 60 * 60,
  minTargetCount: 1,
  maxTargetCount: 50,
  minPlayers: 2,
  maxPlayers: 50,
  minAttemptIntervalMs: 800, // Anti fuerza bruta.
} as const;

export const SCORING_LABELS: Record<ScoringRule, { title: string; description: string }> = {
  standard: { title: 'Clásico', description: 'Puntos según la dificultad del criptico.' },
  fewestHints: { title: 'Menos pistas', description: 'Cada pista usada resta puntos.' },
  speed: { title: 'Velocidad', description: 'Bonus por resolver antes.' },
  winByTwo: { title: 'Diferencia de dos', description: 'Duelo: gana quien saque 2 de ventaja.' },
};

const BASE_POINTS = 100;
const HINT_PENALTY = 30;
const MIN_POINTS = 10;
const MAX_SPEED_BONUS = 100;

export function difficultyMultiplier(difficulty: Difficulty): number {
  return 1 + (difficulty - 1) * 0.25; // 1.00 .. 2.00
}

export interface SolveInput {
  rule: ScoringRule;
  difficulty: Difficulty;
  hintsUsed: number;
  elapsedMs: number; // Desde el inicio de la competencia.
  durationMs: number;
}

/** Puntos otorgados por resolver un criptico. */
export function computeSolvePoints(input: SolveInput): number {
  const { rule, difficulty, hintsUsed, elapsedMs, durationMs } = input;
  if (rule === 'winByTwo') return 1;

  const base = Math.round(BASE_POINTS * difficultyMultiplier(difficulty));

  if (rule === 'standard') return base;

  if (rule === 'fewestHints') {
    return Math.max(MIN_POINTS, base - HINT_PENALTY * Math.max(0, hintsUsed));
  }

  // speed: bonus lineal decreciente según el tiempo transcurrido.
  const safeDuration = Math.max(1, durationMs);
  const remainingRatio = Math.min(1, Math.max(0, 1 - elapsedMs / safeDuration));
  return base + Math.round(MAX_SPEED_BONUS * remainingRatio);
}

/** Valida una configuración; devuelve la lista de errores (vacía si es válida). */
export function validateConfig(config: CompetitionConfig, maxPlayers: number): string[] {
  const errors: string[] = [];
  if (config.durationSec < LIMITS.minDurationSec || config.durationSec > LIMITS.maxDurationSec) {
    errors.push(`La duración debe estar entre ${LIMITS.minDurationSec}s y ${LIMITS.maxDurationSec}s.`);
  }
  if (config.mode === 'count' && (config.targetCount < LIMITS.minTargetCount || config.targetCount > LIMITS.maxTargetCount)) {
    errors.push(`La meta debe estar entre ${LIMITS.minTargetCount} y ${LIMITS.maxTargetCount} cripticos.`);
  }
  if (maxPlayers < LIMITS.minPlayers || maxPlayers > LIMITS.maxPlayers) {
    errors.push(`Los jugadores deben estar entre ${LIMITS.minPlayers} y ${LIMITS.maxPlayers}.`);
  }
  if (config.scoring === 'winByTwo' && maxPlayers !== 2) {
    errors.push('"Diferencia de dos" es un duelo: exactamente 2 jugadores.');
  }
  if (config.maxHintsPerClue < 0 || config.maxHintsPerClue > 10) {
    errors.push('Las pistas por criptico deben estar entre 0 y 10.');
  }
  return errors;
}

/** Ordena: más puntos > menos pistas > resolvió antes > se unió antes. */
export function rankParticipants(participants: Participant[]): RankedParticipant[] {
  const sorted = [...participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.hintsUsed !== b.hintsUsed) return a.hintsUsed - b.hintsUsed;
    const aTime = a.lastSolvedAt ?? Number.POSITIVE_INFINITY;
    const bTime = b.lastSolvedAt ?? Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return a.joinedAt - b.joinedAt;
  });

  // Empates exactos comparten posición (ranking estilo "1, 1, 3").
  const ranked: RankedParticipant[] = [];
  sorted.forEach((participant, index) => {
    const previous = ranked[index - 1];
    const tied =
      previous !== undefined &&
      previous.score === participant.score &&
      previous.hintsUsed === participant.hintsUsed &&
      previous.lastSolvedAt === participant.lastSolvedAt;
    ranked.push({ ...participant, rank: tied ? previous.rank : index + 1 });
  });
  return ranked;
}

export type EndReason = 'time' | 'target' | 'winByTwo' | 'exhausted' | null;

export interface EndEvaluation {
  finished: boolean;
  reason: EndReason;
  winnerId: string | null;
}

type EndCompetitionFields = Pick<
  Competition,
  'mode' | 'scoring' | 'targetCount' | 'winByTwoMinScore' | 'endsAt' | 'crypticIds'
>;

/** Decide si la competencia terminó y quién ganó. */
export function evaluateEnd(
  competition: EndCompetitionFields,
  participants: Participant[],
  now: number,
): EndEvaluation {
  const ranked = rankParticipants(participants);
  const leader = ranked[0];
  const runnerUp = ranked[1];
  const leaderId = leader && (!runnerUp || runnerUp.rank !== leader.rank) ? leader.uid : null;
  const totalClues = competition.crypticIds.length;

  if (competition.scoring === 'winByTwo' && leader) {
    const lead = leader.score - (runnerUp?.score ?? 0);
    if (leader.score >= competition.winByTwoMinScore && lead >= 2) {
      return { finished: true, reason: 'winByTwo', winnerId: leader.uid };
    }
  }

  if (competition.mode === 'count' && competition.scoring !== 'winByTwo') {
    const target = Math.min(competition.targetCount, totalClues);
    // El primero en llegar a la meta gana (desempate por lastSolvedAt ya aplicado en ranking).
    const finishers = ranked
      .filter((p) => p.solvedIds.length >= target)
      .sort((a, b) => (a.lastSolvedAt ?? Infinity) - (b.lastSolvedAt ?? Infinity));
    if (finishers[0]) {
      return { finished: true, reason: 'target', winnerId: finishers[0].uid };
    }
  }

  const everyoneExhausted =
    participants.length > 0 && participants.every((p) => p.solvedIds.length >= totalClues);
  if (everyoneExhausted) {
    return { finished: true, reason: 'exhausted', winnerId: leaderId };
  }

  if (competition.endsAt !== null && now >= competition.endsAt) {
    return { finished: true, reason: 'time', winnerId: leaderId };
  }

  return { finished: false, reason: null, winnerId: null };
}

/**
 * Elo multijugador: cada par de jugadores cuenta como un enfrentamiento.
 * K se divide entre (n-1) para que el delta total no escale con el tamaño de la sala.
 */
export function computeRatingDeltas(
  ranked: RankedParticipant[],
  ratings: Record<string, number>,
  kFactor = 32,
): Record<string, number> {
  const deltas: Record<string, number> = {};
  const n = ranked.length;
  if (n < 2) {
    for (const p of ranked) deltas[p.uid] = 0;
    return deltas;
  }
  const k = kFactor / (n - 1);

  for (const player of ranked) {
    const playerRating = ratings[player.uid] ?? 1200;
    let delta = 0;
    for (const opponent of ranked) {
      if (opponent.uid === player.uid) continue;
      const opponentRating = ratings[opponent.uid] ?? 1200;
      const expected = 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
      const actual = player.rank < opponent.rank ? 1 : player.rank === opponent.rank ? 0.5 : 0;
      delta += k * (actual - expected);
    }
    deltas[player.uid] = Math.round(delta);
  }
  return deltas;
}

/** Siguiente criptico pendiente para un participante (orden fijo de la competencia). */
export function nextPendingClue(crypticIds: string[], solvedIds: string[]): string | null {
  const solved = new Set(solvedIds);
  return crypticIds.find((id) => !solved.has(id)) ?? null;
}
