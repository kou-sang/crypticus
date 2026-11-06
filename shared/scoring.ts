// Reglas de puntuación, daño al jefe, ranking, validación y rating.
// Funciones puras usadas por el motor (servidor) y por la UI (previsualización).

import type {
  BossLevel,
  ComebackLevel,
  CompetitionConfig,
  CompetitionMode,
  Difficulty,
  DuelDamage,
  GameFlow,
  GameMode,
  Participant,
  RankedParticipant,
  ScoringRule,
  TierMix,
} from './types';

export const DEFAULT_CONFIG: CompetitionConfig = {
  mode: 'timed',
  scoring: 'standard',
  flow: 'free',
  durationSec: 600,
  targetCount: 5,
  winByTwo: false,
  difficultyVote: false,
  rivalCountdownSec: 0,
  comeback: 'off',
  extraTime: { enabled: false, seconds: 60, maxUses: 2 },
  bossLevel: 'normal',
  maxHintsPerClue: 3,
  wrongPenalty: 0,
  tierMix: 'balanced',
  hideScoreboard: false,
};

export const LIMITS = {
  minDurationSec: 60,
  maxDurationSec: 3 * 60 * 60,
  minTargetCount: 1,
  maxTargetCount: 50,
  minPlayers: 1,
  maxPlayers: 50,
  maxCluesPerTier: 30,
  minExtraSeconds: 10,
  maxExtraSeconds: 300,
  maxExtraUses: 5,
  maxWrongPenalty: 100,
  maxRivalCountdownSec: 120,
  minAttemptIntervalMs: 800, // Anti fuerza bruta.
  overtimeRatio: 0.5, // Prórroga máxima de "diferencia de dos": 50 % de la duración.
  winByTwoMargin: 2,
  maxModePlayers: 8, // Race y Royale.
} as const;

// ---------- Etiquetas para la UI ----------

export const GAME_LABELS: Record<GameMode, { title: string; tagline: string; description: string }> = {
  race: {
    title: 'Race',
    tagline: 'Primero a la meta',
    description: 'Hasta ocho jugadores, la misma meta y diez minutos. No se saltea: cada criptico se resuelve o se entrega.',
  },
  royale: {
    title: 'Royale',
    tagline: 'Reloj de ajedrez',
    description: 'Cada acierto suma segundos a tu reloj; cada duda los consume. La dificultad sube sin pausa. Queda uno solo.',
  },
  duel: {
    title: 'Duel',
    tagline: 'Uno contra uno',
    description: 'El mismo criptico para los dos. Quien lo resuelve primero golpea, y los aciertos seguidos golpean más fuerte.',
  },
  boss: { title: 'Boss', tagline: 'Próximamente', description: 'Hasta cuatro jugadores contra un mismo adversario. En preparación.' },
};

export const DUEL_DAMAGE_LABELS: Record<DuelDamage, { title: string; description: string }> = {
  difficulty: { title: 'Dificultad', description: 'Fácil 20, medio 30, difícil 40 de daño.' },
  speed: { title: 'Velocidad', description: 'Hasta 40 de daño; baja cuanto más tardas (mín. 10).' },
};
export const DUEL_COMBO_INFO = 'Combo: acertar primero varias veces seguidas suma +25 % de daño por golpe (máx. ×2). Se corta cuando el rival acierta.';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Fácil', medium: 'Medio', hard: 'Difícil' };

export const MODE_LABELS: Record<CompetitionMode, { title: string; description: string }> = {
  timed: { title: 'Por tiempo', description: 'Más puntos al terminar el reloj.' },
  count: { title: 'Por cantidad', description: 'El primero en resolver N gana.' },
  boss: { title: 'Jefe', description: 'Cooperativo: bajen la vida del jefe antes de que acabe el tiempo.' },
};

export const SCORING_LABELS: Record<ScoringRule, { title: string; description: string }> = {
  standard: { title: 'Clásico', description: 'Puntos según la dificultad.' },
  fewestHints: { title: 'Menos pistas', description: 'Cada pista usada resta puntos.' },
  speed: { title: 'Velocidad', description: 'Bonus por resolver antes.' },
};

export const FLOW_LABELS: Record<GameFlow, { title: string; description: string }> = {
  free: { title: 'Libre', description: 'Cada uno a su ritmo por la misma lista.' },
  rounds: { title: 'Rondas', description: 'Todos el mismo criptico; el primero en acertar se lo lleva.' },
};

export const COMEBACK_LABELS: Record<ComebackLevel, string> = { off: 'Sin remontada', low: 'Remontada suave', high: 'Remontada fuerte' };
export const TIER_MIX_LABELS: Record<TierMix, string> = {
  balanced: 'Equilibrada',
  easy: 'Mayoría fáciles',
  hard: 'Mayoría difíciles',
  progressive: 'Progresiva (fácil → difícil)',
};
export const BOSS_LABELS: Record<BossLevel, string> = { normal: 'Normal', hard: 'Duro', epic: 'Épico' };

// ---------- Puntaje ----------

const BASE_POINTS = 100;
export const HINT_PENALTY = 30;
const MIN_POINTS = 10;
const MAX_SPEED_BONUS = 100;
const BOSS_BASE_DAMAGE = 100;
const BOSS_MIN_RATIO = 0.1;

export const BOSS_HP_PER_PLAYER: Record<BossLevel, number> = { normal: 350, hard: 500, epic: 700 };
/** Vida que recupera el jefe por cada respuesta incorrecta. */
export const BOSS_HEAL_ON_MISS: Record<BossLevel, number> = { normal: 15, hard: 25, epic: 40 };

const TIER_MULTIPLIER: Record<Difficulty, number> = { easy: 1, medium: 1.5, hard: 2 };
/** Peso de la dificultad en la remontada: los fáciles no dan bonus de remontada. */
const TIER_COMEBACK_WEIGHT: Record<Difficulty, number> = { easy: 0, medium: 0.5, hard: 1 };
const COMEBACK_STRENGTH: Record<ComebackLevel, number> = { off: 0, low: 0.5, high: 1 };

export function tierMultiplier(tier: Difficulty): number {
  return TIER_MULTIPLIER[tier];
}

/** Proporción [0,1] que le falta a `score` para alcanzar al líder. 0 si es líder. */
export function gapRatio(score: number, leaderScore: number): number {
  if (leaderScore <= 0 || score >= leaderScore) return 0;
  return (leaderScore - Math.max(0, score)) / leaderScore;
}

/**
 * Multiplicador de remontada, proporcional al puntaje propio respecto del líder.
 * Ej.: remontada fuerte, difícil, con la mitad de puntos del líder => ×1.5.
 */
export function comebackFactor(level: ComebackLevel, tier: Difficulty, score: number, leaderScore: number): number {
  return 1 + COMEBACK_STRENGTH[level] * TIER_COMEBACK_WEIGHT[tier] * gapRatio(score, leaderScore);
}

export interface SolveInput {
  rule: ScoringRule;
  tier: Difficulty;
  hintsUsed: number;
  remainingRatio: number; // Tiempo restante / duración, en [0,1].
  comeback: ComebackLevel;
  score: number; // Puntaje actual del jugador.
  leaderScore: number; // Puntaje del líder (excluye a nadie).
}

/** Puntos otorgados por resolver un criptico. */
export function computeSolvePoints(input: SolveInput): number {
  const base = BASE_POINTS * TIER_MULTIPLIER[input.tier];
  let raw: number;
  if (input.rule === 'fewestHints') {
    raw = Math.max(MIN_POINTS, base - HINT_PENALTY * Math.max(0, input.hintsUsed));
  } else if (input.rule === 'speed') {
    raw = base + MAX_SPEED_BONUS * clamp01(input.remainingRatio);
  } else {
    raw = base;
  }
  return Math.round(raw * comebackFactor(input.comeback, input.tier, input.score, input.leaderScore));
}

/** Daño al jefe: proporcional al tiempo restante (con un mínimo del 10 %). */
export function computeBossDamage(tier: Difficulty, remainingRatio: number): number {
  return Math.round(BOSS_BASE_DAMAGE * TIER_MULTIPLIER[tier] * Math.max(BOSS_MIN_RATIO, clamp01(remainingRatio)));
}

export function bossMaxHp(level: BossLevel, players: number): number {
  return BOSS_HP_PER_PLAYER[level] * Math.max(1, players);
}

// ---------- Duelo ----------

export const DUEL_TIER_DAMAGE: Record<Difficulty, number> = { easy: 20, medium: 30, hard: 40 };
const DUEL_SPEED_MAX = 40;
const DUEL_SPEED_WINDOW_MS = 90_000; // A los 90 s el daño por velocidad llega a su mínimo.
const DUEL_SPEED_MIN_RATIO = 0.25;
/** Combo: cada acierto consecutivo (sin que el rival acierte en medio) suma +25 % de daño, hasta ×2. */
export const DUEL_COMBO_STEP = 0.25;
export const DUEL_COMBO_MAX = 5;

export function duelComboMultiplier(streak: number): number {
  return 1 + DUEL_COMBO_STEP * (Math.min(Math.max(streak, 1), DUEL_COMBO_MAX) - 1);
}

/**
 * Daño que recibe el rival en un duelo. La remontada usa la vida como puntaje:
 * quien tiene menos vida golpea más fuerte (en medio y difícil).
 */
export function computeDuelDamage(input: {
  rule: DuelDamage;
  tier: Difficulty;
  elapsedMs: number;
  comeback: ComebackLevel;
  hp: number;
  rivalHp: number;
  streak?: number; // Aciertos consecutivos incluido este (1 = aislado).
}): number {
  const base =
    input.rule === 'speed'
      ? DUEL_SPEED_MAX * Math.max(DUEL_SPEED_MIN_RATIO, 1 - Math.max(0, input.elapsedMs) / DUEL_SPEED_WINDOW_MS)
      : DUEL_TIER_DAMAGE[input.tier];
  return Math.round(
    base * comebackFactor(input.comeback, input.tier, input.hp, input.rivalHp) * duelComboMultiplier(input.streak ?? 1),
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

// ---------- Validación ----------

/** Valida una configuración; devuelve la lista de errores (vacía si es válida). */
export function validateConfig(config: CompetitionConfig, maxPlayers: number): string[] {
  const errors: string[] = [];
  if (config.durationSec < LIMITS.minDurationSec || config.durationSec > LIMITS.maxDurationSec) {
    errors.push(`La duración debe estar entre ${LIMITS.minDurationSec / 60} y ${LIMITS.maxDurationSec / 60} minutos.`);
  }
  if (config.mode === 'count' && (config.targetCount < LIMITS.minTargetCount || config.targetCount > LIMITS.maxTargetCount)) {
    errors.push(`La meta debe estar entre ${LIMITS.minTargetCount} y ${LIMITS.maxTargetCount}.`);
  }
  if (maxPlayers < LIMITS.minPlayers || maxPlayers > LIMITS.maxPlayers) {
    errors.push(`Los jugadores deben estar entre ${LIMITS.minPlayers} y ${LIMITS.maxPlayers}.`);
  }
  if (config.winByTwo && config.mode === 'boss') errors.push('"Diferencia de dos" no aplica al modo jefe.');
  if (config.winByTwo && maxPlayers < 2) errors.push('"Diferencia de dos" requiere al menos 2 jugadores.');
  if (config.difficultyVote && config.flow !== 'rounds') errors.push('Votar dificultad requiere el flujo por rondas.');
  if (config.rivalCountdownSec < 0 || config.rivalCountdownSec > LIMITS.maxRivalCountdownSec) {
    errors.push(`La cuenta atrás debe estar entre 0 y ${LIMITS.maxRivalCountdownSec} segundos.`);
  }
  if (config.rivalCountdownSec > 0 && config.flow !== 'rounds') errors.push('La cuenta atrás tras acierto requiere el flujo por rondas.');
  if (config.extraTime.enabled) {
    if (config.extraTime.seconds < LIMITS.minExtraSeconds || config.extraTime.seconds > LIMITS.maxExtraSeconds) {
      errors.push(`El tiempo extra debe estar entre ${LIMITS.minExtraSeconds} y ${LIMITS.maxExtraSeconds} segundos.`);
    }
    if (config.extraTime.maxUses < 1 || config.extraTime.maxUses > LIMITS.maxExtraUses) {
      errors.push(`Los usos de tiempo extra deben estar entre 1 y ${LIMITS.maxExtraUses}.`);
    }
  }
  if (config.maxHintsPerClue < 0 || config.maxHintsPerClue > 10) errors.push('Las pistas por criptico deben estar entre 0 y 10.');
  if (config.wrongPenalty < 0 || config.wrongPenalty > LIMITS.maxWrongPenalty) {
    errors.push(`La penalización debe estar entre 0 y ${LIMITS.maxWrongPenalty}.`);
  }
  if (config.game === 'boss') errors.push('El modo Boss estará disponible próximamente.');
  if (config.game === 'duel') {
    if (maxPlayers !== 2) errors.push('Duel es solo para 2 jugadores.');
    if (!config.duel || config.duel.hp < 50 || config.duel.hp > 500) errors.push('La vida del duelo debe estar entre 50 y 500.');
  }
  if ((config.game === 'race' || config.game === 'royale') && maxPlayers > LIMITS.maxModePlayers) {
    errors.push(`Este modo admite hasta ${LIMITS.maxModePlayers} jugadores.`);
  }
  if (config.game === 'royale') {
    const royale = config.royale;
    if (!royale || royale.baseSec < 30 || royale.baseSec > 30 * 60) errors.push('El tiempo de Royale debe estar entre 30 s y 30 min.');
    if (royale && (royale.incrementSec < 0 || royale.incrementSec > 60)) errors.push('El incremento debe estar entre 0 y 60 s.');
  }
  if ((config.intervalSec ?? 0) < 0 || (config.intervalSec ?? 0) > 30) errors.push('El intervalo debe estar entre 0 y 30 s.');
  if ((config.cooldownSec ?? 0) < 0 || (config.cooldownSec ?? 0) > 10) errors.push('El cooldown debe estar entre 0 y 10 s.');
  if (config.surrender?.enabled && (config.surrender.maxUses < 1 || config.surrender.maxUses > 10)) {
    errors.push('Las rendiciones deben estar entre 1 y 10.');
  }
  return errors;
}

// ---------- Ranking ----------

export type RankMetric = 'score' | 'solved' | 'survival';

/**
 * Orden: métrica principal (puntos; resueltos en carreras; supervivencia en Royale) > puntos > menos pistas
 * > resolvió antes > se unió antes. Empates exactos comparten posición.
 * Supervivencia: los que siguen en pie primero; entre eliminados, quien cayó más tarde.
 */
/** Valor principal del ranking según la métrica del modo (mayor es mejor). */
export function rankPrimary(p: Participant, metric: RankMetric): number {
  if (metric === 'solved') return p.solvedIds.length;
  if (metric === 'survival') return (p.eliminatedAt == null ? 1e15 : p.eliminatedAt * 100) + Math.min(99, p.solvedIds.length);
  return p.score;
}

export function rankParticipants(participants: Participant[], metric: RankMetric = 'score'): RankedParticipant[] {
  const primary = (p: Participant) => rankPrimary(p, metric);
  const won = (p: Participant) => (p.tiebreakWon === true ? 1 : 0);
  const sorted = [...participants].sort((a, b) => {
    if (primary(b) !== primary(a)) return primary(b) - primary(a);
    if (b.score !== a.score) return b.score - a.score;
    // Quien ganó la muerte súbita queda por delante de los empatados.
    if (won(b) !== won(a)) return won(b) - won(a);
    if (a.hintsUsed !== b.hintsUsed) return a.hintsUsed - b.hintsUsed;
    const aTime = a.lastSolvedAt ?? Number.POSITIVE_INFINITY;
    const bTime = b.lastSolvedAt ?? Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return a.joinedAt - b.joinedAt;
  });

  const ranked: RankedParticipant[] = [];
  sorted.forEach((participant, index) => {
    const previous = ranked[index - 1];
    const tied =
      previous !== undefined &&
      primary(previous) === primary(participant) &&
      previous.score === participant.score &&
      won(previous) === won(participant) &&
      previous.hintsUsed === participant.hintsUsed &&
      previous.lastSolvedAt === participant.lastSolvedAt;
    ranked.push({ ...participant, rank: tied ? previous.rank : index + 1 });
  });
  return ranked;
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

/** Convierte etiquetas libres de importación a dificultad. */
export function parseDifficulty(raw: unknown): Difficulty | null {
  if (raw === undefined || raw === null || raw === '') return 'medium';
  if (typeof raw === 'number') {
    if (raw <= 2) return 'easy';
    if (raw === 3) return 'medium';
    if (raw <= 5) return 'hard';
    return null;
  }
  const value = String(raw)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  if (['easy', 'facil', 'f'].includes(value)) return 'easy';
  if (['medium', 'medio', 'media', 'normal', 'm'].includes(value)) return 'medium';
  if (['hard', 'dificil', 'd'].includes(value)) return 'hard';
  if (/^\d$/.test(value)) return parseDifficulty(Number(value));
  return null;
}
