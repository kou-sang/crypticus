// Tabla de partidas terminadas (perfil propio y ajeno).
import { memo } from 'react';
import { Link } from 'react-router';
import { formatRelative } from '../lib/utils';
import { GAME_LABELS } from '../../shared/scoring';
import type { HistoryEntry } from '../../shared/types';
import { Badge } from './ui';

/** `modeDeltas`: muestra el cambio del Elo del modo (si la partida lo tiene) en lugar del general. */
export const HistoryTable = memo(function HistoryTable({ entries, modeDeltas = false }: { entries: HistoryEntry[]; modeDeltas?: boolean }) {
  return (
    <div className="overflow-x-auto">
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
          {entries.map((entry) => {
            const delta = modeDeltas ? (entry.modeRatingDelta ?? entry.ratingDelta) : entry.ratingDelta;
            return (
            <tr key={entry.competitionId} className="border-b border-line">
              <td className="max-w-0 py-2.5 pr-2">
                <Link to={`/c/${entry.competitionId}`} className="block truncate font-semibold hover:underline">
                  {entry.title || 'Partida'}
                </Link>
                <span className="block text-xs text-muted">{formatRelative(entry.finishedAt)}</span>
              </td>
              <td className="py-2.5">
                <Badge tone={entry.won ? 'ok' : 'neutral'}>
                  {entry.outcome === 'draw' ? 'Empate' : entry.won ? 'Victoria' : (entry.game ? GAME_LABELS[entry.game].title : 'Partida')}
                </Badge>
              </td>
              <td className="py-2.5 text-right font-mono">
                {entry.rank}/{entry.players}
              </td>
              <td className="hidden py-2.5 text-right font-mono sm:table-cell">{entry.solved}</td>
              <td className={`py-2.5 text-right font-mono ${delta > 0 ? 'text-ok' : delta < 0 ? 'text-accent' : ''}`}>
                {delta > 0 ? `+${delta}` : delta}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
