// Historial de partidas del jugador y evolución del rating.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../../hooks/useAuth';
import { getHistory } from '../../lib/repo';
import { errorMessage, formatRelative } from '../../lib/utils';
import { MODE_LABELS } from '../../../shared/scoring';
import type { HistoryEntry } from '../../../shared/types';
import { Badge, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { RatingChart } from '../../components/RatingChart';

export function HistoryTable({ entries }: { entries: HistoryEntry[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b-2 border-ink text-left text-[11px] uppercase tracking-widest text-muted">
          <th className="py-2">Partida</th>
          <th className="py-2">Modo</th>
          <th className="py-2 text-right">Puesto</th>
          <th className="hidden py-2 text-right sm:table-cell">Resueltos</th>
          <th className="py-2 text-right">Rating</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.competitionId} className="border-b border-line">
            <td className="py-2.5">
              <Link to={`/c/${entry.competitionId}`} className="font-semibold hover:underline">
                {entry.title || 'Partida'}
              </Link>
              <span className="block text-xs text-muted">{formatRelative(entry.finishedAt)}</span>
            </td>
            <td className="py-2.5">
              <Badge tone={entry.won ? 'ok' : 'neutral'}>{entry.won ? 'Victoria' : MODE_LABELS[entry.mode]?.title}</Badge>
            </td>
            <td className="py-2.5 text-right font-mono">
              {entry.rank}/{entry.players}
            </td>
            <td className="hidden py-2.5 text-right font-mono sm:table-cell">{entry.solved}</td>
            <td className={`py-2.5 text-right font-mono ${entry.ratingDelta > 0 ? 'text-ok' : entry.ratingDelta < 0 ? 'text-accent' : ''}`}>
              {entry.ratingDelta > 0 ? `+${entry.ratingDelta}` : entry.ratingDelta}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function HistoryPage() {
  const { profile } = useSession();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHistory(profile.uid)
      .then((list) => !cancelled && setEntries(list))
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [profile.uid]);

  const wins = entries?.filter((e) => e.won).length ?? 0;

  return (
    <>
      <PageHeader kicker="Historial" title="Tus partidas" />
      <ErrorBanner error={error} />
      {entries === null ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <EmptyState title="Aún no terminaste ninguna partida">
          <Link to="/competencias" className="underline">
            Busca una sala
          </Link>{' '}
          y vuelve aquí.
        </EmptyState>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <HistoryTable entries={entries} />
          <aside className="space-y-4">
            <Card>
              <h2 className="mb-3 font-display text-lg">Rating</h2>
              <RatingChart history={entries} />
            </Card>
            <Card>
              <p className="text-sm">
                <strong>{entries.length}</strong> partidas · <strong>{wins}</strong> victorias ·{' '}
                <strong>{Math.round((wins / entries.length) * 100)}%</strong>
              </p>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
