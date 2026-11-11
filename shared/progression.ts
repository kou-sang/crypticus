// Progresión de dificultad por modo (v1.9): en qué criptico o ronda entra cada dificultad. Puro.
import { DIFFICULTIES, type CompetitionConfig, type Difficulty } from './types';

/** Inicio (1-based) de medio, difícil y muy difícil; fácil siempre arranca en 1. */
export type TierStarts = readonly [medium: number, hard: number, veryHard: number];

/** Royale (60 cripticos en orden): fácil 1–12, medio 13–25, difícil 26–35, muy difícil 36+. */
export const ROYALE_STARTS: TierStarts = [13, 26, 36];
export const ROYALE_CLUES = 60;

/** Race según la meta (en Hardcore, por ronda; en Pacífico, por criptico de la lista de cada jugador). */
export const RACE_STARTS: Readonly<Record<number, TierStarts>> = {
  3: [3, 6, 9],
  5: [4, 8, 12],
  7: [5, 9, 13],
  10: [6, 11, 17],
};

/**
 * Duel según la vida: el difícil entra cuando ya se podría haber bajado al rival con cripticos medios
 * (30 de daño), y el muy difícil un 50 % más tarde.
 */
export const DUEL_STARTS: Readonly<Record<number, TierStarts>> = {
  100: [3, 5, 8],
  150: [4, 6, 9],
  200: [5, 8, 12],
  300: [6, 11, 17],
  500: [10, 18, 27],
};

/** Tabla más cercana por debajo (o la menor) para valores fuera de las opciones. */
function nearest(table: Readonly<Record<number, TierStarts>>, value: number): TierStarts {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const key = [...keys].reverse().find((k) => k <= value) ?? keys[0]!;
  return table[key]!;
}

/** Metas personalizadas: por debajo de 10, la tabla más cercana; por encima, la de 10 escalada. */
export function raceStarts(target: number): TierStarts {
  if (target > 10) {
    const [m, h, v] = RACE_STARTS[10]!;
    const scale = target / 10;
    return [Math.round(m * scale), Math.round(h * scale), Math.round(v * scale)];
  }
  return nearest(RACE_STARTS, target);
}

export function duelStarts(hp: number): TierStarts {
  return nearest(DUEL_STARTS, hp);
}

/** Dificultad del criptico o ronda número `n` (1-based). */
export function tierAt(starts: TierStarts, n: number): Difficulty {
  if (n >= starts[2]) return 'veryHard';
  if (n >= starts[1]) return 'hard';
  if (n >= starts[0]) return 'medium';
  return 'easy';
}

/** Cantidad por dificultad de una lista de `total` cripticos que sigue la progresión. */
export function tierCountsFor(starts: TierStarts, total: number): Record<Difficulty, number> {
  const counts = { easy: 0, medium: 0, hard: 0, veryHard: 0 };
  for (let n = 1; n <= total; n++) counts[tierAt(starts, n)] += 1;
  return counts;
}

/** Progresión de la partida (null si el modo no la tiene: partidas sin juego, COOP). */
export function startsFor(config: Pick<CompetitionConfig, 'game' | 'targetCount' | 'duel' | 'royale'>): TierStarts | null {
  if (config.game === 'royale' || config.royale) return ROYALE_STARTS;
  if (config.game === 'duel' && config.duel) return duelStarts(config.duel.hp);
  if (config.game === 'race') return raceStarts(config.targetCount);
  return null;
}

/** Dificultades que se pueden votar en la ronda `n`: hasta la que marca la progresión. */
export function votableTiers(starts: TierStarts | null, n: number): Difficulty[] {
  if (!starts) return [...DIFFICULTIES];
  const max = DIFFICULTIES.indexOf(tierAt(starts, n));
  return DIFFICULTIES.slice(0, max + 1);
}
