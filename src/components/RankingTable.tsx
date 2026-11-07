// Tabla de posiciones de un pool de Elo (Race, Royale por tiempo o Duel): victorias, derrotas, empates, % de victorias y Elo.
import { memo } from 'react';
import { Link } from 'react-router';
import { cx } from '../lib/utils';
import { statsOf, winRate } from '../lib/pools';
import type { RatingPool } from '../../shared/ratingPools';
import type { UserProfile } from '../../shared/types';

const TH = 'whitespace-nowrap py-2 text-[11px] font-semibold uppercase tracking-wider text-muted';
const TD = 'whitespace-nowrap py-2.5 text-right font-mono tabular-nums';

export const RankingTable = memo(function RankingTable({
  rows,
  meId,
  pool,
}: {
  rows: UserProfile[];
  meId: string;
  pool: RatingPool;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className={cx(TH, 'w-9')}>#</th>
            <th className={TH}>Jugador</th>
            <th className={cx(TH, 'w-10 text-right')} title="Victorias">V</th>
            <th className={cx(TH, 'w-10 text-right')} title="Derrotas">D</th>
            <th className={cx(TH, 'w-10 text-right')} title="Empates">E</th>
            <th className={cx(TH, 'hidden w-14 text-right sm:table-cell')} title="Porcentaje de victorias">% V</th>
            <th className={cx(TH, 'w-14 text-right')}>Elo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((user, index) => {
            const stats = statsOf(user, pool);
            return (
              <tr key={user.uid} className={cx('border-b border-line', user.uid === meId && 'bg-accent/10')}>
                <td className={cx('py-2.5 font-mono', index < 3 && 'font-bold text-accent')}>{index + 1}</td>
                <td className="min-w-0 py-2.5 pr-2">
                  <Link to={`/u/${user.uid}`} className="block truncate font-semibold hover:underline" title={user.displayName}>
                    {user.displayName}
                  </Link>
                  <span className="block truncate font-mono text-xs text-muted">@{user.handle}</span>
                </td>
                <td className={TD}>{stats.wins}</td>
                <td className={TD}>{stats.losses}</td>
                <td className={TD}>{stats.draws}</td>
                <td className={cx(TD, 'hidden sm:table-cell')}>{winRate(stats)}</td>
                <td className={cx(TD, 'font-semibold')}>{stats.rating}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
