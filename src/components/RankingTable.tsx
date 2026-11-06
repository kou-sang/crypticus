// Tabla de posiciones. `compact` muestra solo #, jugador y rating (paneles laterales angostos).
import { memo } from 'react';
import { Link } from 'react-router';
import { cx } from '../lib/utils';
import type { UserProfile } from '../../shared/types';

const TH = 'whitespace-nowrap py-2 text-[11px] font-semibold uppercase tracking-wider text-muted';
const TD = 'whitespace-nowrap py-2.5 font-mono tabular-nums';

function winRate(user: UserProfile): string {
  return user.stats.played > 0 ? `${Math.round((user.stats.wins / user.stats.played) * 100)}%` : '—';
}

export const RankingTable = memo(function RankingTable({
  rows,
  meId,
  compact = false,
}: {
  rows: UserProfile[];
  meId: string;
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className={cx(TH, 'w-10')}>#</th>
            <th className={TH}>Jugador</th>
            {!compact && <th className={cx(TH, 'w-20 text-right')}>Partidas</th>}
            {!compact && <th className={cx(TH, 'hidden w-20 text-right sm:table-cell')}>% Vict.</th>}
            {!compact && <th className={cx(TH, 'hidden w-24 text-right sm:table-cell')}>Resueltos</th>}
            <th className={cx(TH, 'w-16 text-right')}>Rating</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((user, index) => (
            <tr key={user.uid} className={cx('border-b border-line', user.uid === meId && 'bg-accent/10')}>
              <td className={cx(TD, index < 3 && 'font-bold text-accent')}>{index + 1}</td>
              <td className="min-w-0 py-2.5 pr-2">
                <Link to={`/u/${user.uid}`} className="block truncate font-semibold hover:underline" title={user.displayName}>
                  {user.displayName}
                </Link>
                {!compact && <span className="block truncate font-mono text-xs text-muted">@{user.handle}</span>}
              </td>
              {!compact && <td className={cx(TD, 'text-right')}>{user.stats.played}</td>}
              {!compact && <td className={cx(TD, 'hidden text-right sm:table-cell')}>{winRate(user)}</td>}
              {!compact && <td className={cx(TD, 'hidden text-right sm:table-cell')}>{user.stats.solved}</td>}
              <td className={cx(TD, 'text-right font-semibold')}>{user.rating}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
