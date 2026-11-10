// Tabla de partidas terminadas (perfil propio y ajeno).
import { memo } from 'react';
import { Link } from 'react-router';
import { formatRelative } from '../lib/utils';
import { GAME_LABELS } from '../../shared/scoring';
import { LEVELS, coopLevelLabel } from '../../shared/coop/balance';
import type { HistoryEntry } from '../../shared/types';
import { Badge } from './ui';

const signed = (delta: number) => (delta > 0 ? `+${delta}` : String(delta));
const deltaTone = (delta: number) => (delta > 0 ? 'text-ok' : delta < 0 ? 'text-accent' : '');

/** COOP: en vez de puesto y resueltos (no significan nada en equipo), nivel, resultado, ronda y jefes. */
function CoopHistoryTable({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left text-[11px] uppercase tracking-widest text-muted">
            <th className="py-2">Partida</th>
            <th className="py-2">Nivel</th>
            <th className="py-2">Resultado</th>
            <th className="py-2 text-right">Ronda</th>
            <th className="py-2 text-right">Jefes</th>
            <th className="py-2 text-right">Rating</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const coop = entry.coop;
            const delta = entry.modeRatingDelta ?? entry.ratingDelta;
            const totalBosses = coop?.bosses ?? (coop ? LEVELS[coop.level].categories.length : null);
            return (
              <tr key={entry.competitionId} className="border-b border-line">
                <td className="max-w-0 py-2.5 pr-2">
                  <Link to={`/c/${entry.competitionId}`} className="block truncate font-semibold hover:underline">
                    {entry.title || 'Partida'}
                  </Link>
                  <span className="block text-xs text-muted">{formatRelative(entry.finishedAt)}</span>
                </td>
                <td className="py-2.5 font-mono font-semibold">{coop ? coopLevelLabel(coop.level, coop.stage) : '—'}</td>
                <td className="py-2.5">
                  <Badge tone={entry.won ? 'ok' : 'neutral'}>{entry.won ? 'Victoria' : 'Derrota'}</Badge>
                </td>
                <td className="py-2.5 text-right font-mono">{coop?.rounds ?? '—'}</td>
                <td className="py-2.5 text-right font-mono">
                  {coop ? `${coop.bossesDefeated}${totalBosses ? `/${totalBosses}` : ''}` : '—'}
                </td>
                <td className={`py-2.5 text-right font-mono ${deltaTone(delta)}`}>{signed(delta)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * `modeDeltas`: muestra el cambio del Elo del modo (si la partida lo tiene) en lugar del general.
 * `coop`: columnas propias de COOP.
 */
export const HistoryTable = memo(function HistoryTable({
  entries,
  modeDeltas = false,
  coop = false,
}: {
  entries: HistoryEntry[];
  modeDeltas?: boolean;
  coop?: boolean;
}) {
  if (coop) return <CoopHistoryTable entries={entries} />;
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
