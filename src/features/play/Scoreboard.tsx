// Marcador en vivo. Ordenado con la misma función que usa el servidor.
import { rankParticipants } from '../../../shared/scoring';
import type { Competition, Participant } from '../../../shared/types';
import { cx } from '../../lib/utils';

export function Scoreboard({
  competition,
  participants,
  meId,
}: {
  competition: Competition;
  participants: Participant[];
  meId: string;
}) {
  const ranked = rankParticipants(participants);
  const total = competition.mode === 'count' ? Math.min(competition.targetCount, competition.crypticIds.length) : competition.crypticIds.length;

  return (
    <ol className="divide-y divide-line border border-line">
      {ranked.map((p) => (
        <li key={p.uid} className={cx('flex items-center gap-3 px-3 py-2', p.uid === meId && 'bg-accent/10')}>
          <span className={cx('w-5 font-mono text-sm', p.rank === 1 && 'font-bold text-accent')}>{p.rank}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{p.displayName}</p>
            <div className="mt-1 h-1 bg-line">
              <div
                className="h-1 bg-ink transition-[width] duration-300"
                style={{ width: `${Math.min(100, (p.solvedIds.length / Math.max(1, total)) * 100)}%` }}
              />
            </div>
          </div>
          <span className="font-mono text-sm font-semibold tabular-nums">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}
