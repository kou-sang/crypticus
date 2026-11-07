// Grupos de Elo ("pools"): Race y Duel tienen un Elo cada uno; Royale tiene uno por categoría de tiempo,
// como Bullet/Blitz/Rapid en Lichess. Módulo puro: lo usan el Worker, el cliente y los scripts.
import type { GameMode, RoyaleConfig } from './types';

export type RoyaleCategory = 'hyperbullet' | 'bullet' | 'rapid';
export const ROYALE_CATEGORIES: readonly RoyaleCategory[] = ['hyperbullet', 'bullet', 'rapid'];

export type RoyalePool = `royale_${RoyaleCategory}`;
export type RatingPool = 'race' | RoyalePool | 'duel';
export const RATING_POOLS: readonly RatingPool[] = ['race', 'royale_hyperbullet', 'royale_bullet', 'royale_rapid', 'duel'];

/** Límite superior (inclusive) del tiempo inicial de cada categoría; lo que supera a Bullet es Rapid. */
const CATEGORY_MAX_BASE_SEC: Record<Exclude<RoyaleCategory, 'rapid'>, number> = { hyperbullet: 60, bullet: 120 };

export const ROYALE_CATEGORY_LABELS: Record<RoyaleCategory, { title: string; range: string }> = {
  hyperbullet: { title: 'Hyperbullet', range: '≤ 1 min' },
  bullet: { title: 'Bullet', range: '≤ 2 min' },
  rapid: { title: 'Rapid', range: '> 2 min' },
};

/** Categoría de un control de tiempo según los minutos iniciales (el incremento no cambia la categoría). */
export function royaleCategory(baseSec: number): RoyaleCategory {
  if (!Number.isFinite(baseSec) || baseSec <= CATEGORY_MAX_BASE_SEC.hyperbullet) return 'hyperbullet';
  return baseSec <= CATEGORY_MAX_BASE_SEC.bullet ? 'bullet' : 'rapid';
}

/** Pool de Elo de una partida. `null`: la partida no es puntuable (Boss o sin modo). */
export function ratingPoolOf(game: GameMode | undefined, royale?: Pick<RoyaleConfig, 'baseSec'> | null): RatingPool | null {
  if (game === 'race' || game === 'duel') return game;
  if (game === 'royale') return royale ? `royale_${royaleCategory(royale.baseSec)}` : null;
  return null;
}

export function isRoyalePool(pool: RatingPool): pool is RoyalePool {
  return pool.startsWith('royale_');
}

export function categoryOfPool(pool: RoyalePool): RoyaleCategory {
  return pool.slice('royale_'.length) as RoyaleCategory;
}
