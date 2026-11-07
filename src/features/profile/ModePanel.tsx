// Panel de un modo en el perfil: estadísticas, evolución del Elo e historial desplegable.
import { memo, useMemo } from 'react';
import { GAME_LABELS } from '../../../shared/scoring';
import type { HistoryEntry, RankedMode, UserProfile } from '../../../shared/types';
import { HistoryTable } from '../../components/HistoryTable';
import { RatingChart } from '../../components/RatingChart';
import { statsOf, winRate } from '../../components/RankingTable';

const GLYPH: Record<RankedMode, string> = { race: '➶', royale: '◷', duel: '⚔' };

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-l-2 border-ink pl-3">
      <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="font-mono text-lg font-semibold">{value}</dd>
    </div>
  );
}

export const ModePanel = memo(function ModePanel({
  mode,
  user,
  history,
}: {
  mode: RankedMode;
  user: UserProfile;
  history: HistoryEntry[];
}) {
  const stats = statsOf(user, mode);
  const entries = useMemo(() => history.filter((h) => h.game === mode), [history, mode]);
  const solved = entries.reduce((sum, h) => sum + h.solved, 0);

  return (
    <section aria-labelledby={`modo-${mode}`} className="border-2 border-ink">
      <header className="flex items-baseline justify-between gap-3 border-b-2 border-ink px-4 py-3">
        <h2 id={`modo-${mode}`} className="font-display text-2xl">
          <span aria-hidden className="mr-2">
            {GLYPH[mode]}
          </span>
          {GAME_LABELS[mode].title}
        </h2>
        <p className="font-mono text-2xl font-semibold">{stats.played > 0 ? stats.rating : '—'}</p>
      </header>
      <div className="space-y-5 p-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Partidas" value={stats.played} />
          <Stat label="Victorias" value={stats.wins} />
          <Stat label="Derrotas" value={stats.losses} />
          <Stat label="Empates" value={stats.draws} />
          <Stat label="% victorias" value={winRate(stats)} />
        </dl>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Evolución del Elo</h3>
          <RatingChart history={entries} series={mode} />
        </div>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between border-t border-line pt-3 text-sm font-semibold">
            <span>
              Historial · {entries.length} {entries.length === 1 ? 'partida' : 'partidas'}
              {entries.length > 0 && <span className="font-normal text-muted"> · {solved} resueltos</span>}
            </span>
            <span aria-hidden className="transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="mt-3">
            {entries.length === 0 ? <p className="text-sm text-muted">Sin partidas en este modo.</p> : <HistoryTable entries={entries} modeDeltas />}
          </div>
        </details>
      </div>
    </section>
  );
});
