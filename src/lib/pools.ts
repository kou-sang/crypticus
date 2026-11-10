// Etiquetas y estadísticas de los pools de Elo para la UI (perfil, ranking, amigos).
import { GAME_LABELS } from '../../shared/scoring';
import {
  ROYALE_CATEGORIES,
  ROYALE_CATEGORY_LABELS,
  categoryOfPool,
  isRoyalePool,
  ratingPoolOf,
  type RatingPool,
  type RoyaleCategory,
} from '../../shared/ratingPools';
import type { GameMode, HistoryEntry, ModeStats, RankedMode, UserProfile } from '../../shared/types';

export const EMPTY_STATS: ModeStats = { rating: 1200, played: 0, wins: 0, losses: 0, draws: 0 };

export const MODE_GLYPH: Record<GameMode, string> = { race: '➶', royale: '◷', duel: '⚔', coop: '♛' };

export function modeOfPool(pool: RatingPool): GameMode {
  return isRoyalePool(pool) ? 'royale' : pool;
}

export function royalePool(category: RoyaleCategory): RatingPool {
  return `royale_${category}`;
}

/** Título corto: «Race», «Bullet» (en Royale se muestra solo la categoría). */
export function poolShortTitle(pool: RatingPool): string {
  return isRoyalePool(pool) ? ROYALE_CATEGORY_LABELS[categoryOfPool(pool)].title : GAME_LABELS[pool].title;
}

/** Título completo: «Race», «Royale Bullet». */
export function poolTitle(pool: RatingPool): string {
  return isRoyalePool(pool) ? `Royale ${poolShortTitle(pool)}` : GAME_LABELS[pool].title;
}

/**
 * Estadísticas de un pool. Un pool de Royale sin partidas muestra como Elo de partida el Royale
 * anterior a v1.2, que es desde donde arranca en el servidor.
 */
export function statsOf(user: UserProfile, pool: RatingPool | RankedMode): ModeStats {
  const own = user.modeStats?.[pool];
  if (own) return { ...EMPTY_STATS, ...own };
  const legacyRating = pool !== 'royale' && isRoyalePool(pool) ? user.modeStats?.royale?.rating : undefined;
  return { ...EMPTY_STATS, rating: legacyRating ?? EMPTY_STATS.rating };
}

/** Royale en una línea (lista de amigos): la categoría más jugada. */
export function mainRoyalePool(user: UserProfile): RatingPool {
  // Sin partidas, Bullet (el control por defecto); con empate gana el primero en ROYALE_CATEGORIES.
  let best: RatingPool = royalePool('bullet');
  let played = user.modeStats?.[best]?.played ?? 0;
  for (const category of ROYALE_CATEGORIES) {
    const pool = royalePool(category);
    const count = user.modeStats?.[pool]?.played ?? 0;
    if (count > played) {
      best = pool;
      played = count;
    }
  }
  return best;
}

export function winRate(stats: ModeStats): string {
  return stats.played > 0 ? `${Math.round((stats.wins / stats.played) * 100)}%` : '—';
}

/**
 * Pool de una partida del historial. Las anteriores a v1.2 no lo guardan: Race y Duel se deducen del modo;
 * Royale, del control de tiempo si está (si no, queda sin pool hasta correr `scripts/backfill-royale-pools.ts`).
 */
export function entryPool(entry: HistoryEntry): RatingPool | null {
  return entry.ratingPool ?? ratingPoolOf(entry.game, entry.royale);
}
