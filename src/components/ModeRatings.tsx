// Ratings por modo al estilo Lichess: lista vertical (perfil) o línea compacta (lista de amigos).
import { GAME_LABELS } from '../../shared/scoring';
import { RANKED_MODES, type UserProfile } from '../../shared/types';
import { cx } from '../lib/utils';
import { statsOf, winRate } from './RankingTable';

const GLYPH = { race: '➶', royale: '◷', duel: '⚔' } as const;

export function ModeRatings({ user, compact = false }: { user: UserProfile; compact?: boolean }) {
  if (compact) {
    return (
      <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-muted">
        {RANKED_MODES.map((mode) => {
          const stats = statsOf(user, mode);
          return (
            <span key={mode} title={`${GAME_LABELS[mode].title}: ${stats.played} partidas`}>
              <span aria-hidden>{GLYPH[mode]}</span> {stats.played > 0 ? stats.rating : '—'}
            </span>
          );
        })}
      </span>
    );
  }
  return (
    <ul className="divide-y divide-line border border-line">
      {RANKED_MODES.map((mode) => {
        const stats = statsOf(user, mode);
        const played = stats.played > 0;
        return (
          <li key={mode} className="flex items-center gap-3 px-3 py-2.5">
            <span aria-hidden className="w-6 text-center text-xl">
              {GLYPH[mode]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">{GAME_LABELS[mode].title}</p>
              <p className={cx('font-mono text-xl font-semibold', !played && 'text-muted')}>{played ? stats.rating : '—'}</p>
            </div>
            <div className="text-right font-mono text-xs text-muted">
              <p>{stats.played} partidas</p>
              {played && (
                <p>
                  {stats.wins}V {stats.losses}D {stats.draws}E · {winRate(stats)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
