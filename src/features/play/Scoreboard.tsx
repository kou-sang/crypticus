// Marcador en vivo. Ordenado con la misma función que usa el servidor.
import { rankParticipants, type RankMetric } from '../../../shared/scoring';
import type { Participant } from '../../../shared/types';
import { cx } from '../../lib/utils';

export function Scoreboard({
  participants,
  meId,
  total,
  metric = 'score',
  hideScores = false,
  isBoss = false,
}: {
  participants: Participant[];
  meId: string;
  total: number; // Para la barra de progreso
  metric?: RankMetric;
  hideScores?: boolean;
  isBoss?: boolean;
}) {
  const ranked = hideScores
    ? [...participants].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => ({ ...p, rank: 0 }))
    : rankParticipants(participants, metric);

  return (
    <ol className="divide-y divide-line border border-line">
      {ranked.map((p) => (
        <li key={p.uid} className={cx('flex items-center gap-3 px-3 py-2', p.uid === meId && 'bg-accent/10')}>
          <span className={cx('w-5 font-mono text-sm', p.rank === 1 && 'font-bold text-accent')}>{hideScores ? '·' : p.rank}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{p.displayName}</p>
            <div className="mt-1 h-1 bg-line">
              <div
                className="h-1 bg-ink transition-[width] duration-300"
                style={{ width: `${Math.min(100, (p.solvedIds.length / Math.max(1, total)) * 100)}%` }}
              />
            </div>
          </div>
          <span className="text-right font-mono text-sm font-semibold tabular-nums">
            {hideScores ? `${p.solvedIds.length}✓` : metric === 'solved' ? `${p.solvedIds.length}✓` : p.score}
            {isBoss && !hideScores && <span className="block text-[10px] font-normal text-muted">daño</span>}
            {metric === 'solved' && !hideScores && <span className="block text-[10px] font-normal text-muted">{p.score} pts</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
