// Ratings por modo en una línea (lista de amigos). En Royale se muestra la categoría de tiempo más jugada.
import { RANKED_MODES, type UserProfile } from '../../shared/types';
import { MODE_GLYPH, mainRoyalePool, poolTitle, statsOf } from '../lib/pools';
import type { RatingPool } from '../../shared/ratingPools';

export function ModeRatings({ user }: { user: UserProfile }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-muted">
      {[...RANKED_MODES, 'coop' as const].map((mode) => {
        const pool: RatingPool = mode === 'royale' ? mainRoyalePool(user) : mode;
        const stats = statsOf(user, pool);
        return (
          <span key={mode} title={`${poolTitle(pool)}: ${stats.played} partidas`}>
            <span aria-hidden>{MODE_GLYPH[mode]}</span> {stats.played > 0 ? stats.rating : '—'}
          </span>
        );
      })}
    </span>
  );
}
