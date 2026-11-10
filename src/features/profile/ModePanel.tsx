// Panel de un pool de Elo en el perfil: estadísticas, evolución diaria del Elo e historial desplegable.
import { memo, useMemo } from 'react';
import type { HistoryEntry, UserProfile } from '../../../shared/types';
import { isRoyalePool, type RatingPool } from '../../../shared/ratingPools';
import { HistoryTable } from '../../components/HistoryTable';
import { RatingChart } from '../../components/RatingChart';
import { MODE_GLYPH, entryPool, modeOfPool, poolTitle, statsOf, winRate } from '../../lib/pools';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-l-2 border-ink pl-3">
      <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="font-mono text-lg font-semibold">{value}</dd>
    </div>
  );
}

export const ModePanel = memo(function ModePanel({
  pool,
  user,
  history,
}: {
  pool: RatingPool;
  user: UserProfile;
  history: HistoryEntry[];
}) {
  const stats = statsOf(user, pool);
  const entries = useMemo(() => history.filter((h) => entryPool(h) === pool), [history, pool]);
  // Royale anterior a v1.2 sin control de tiempo: no se puede ubicar en ninguna categoría.
  const unclassified = useMemo(
    () => (isRoyalePool(pool) ? history.filter((h) => h.game === 'royale' && entryPool(h) === null).length : 0),
    [history, pool],
  );
  const solved = entries.reduce((sum, h) => sum + h.solved, 0);

  return (
    <section aria-labelledby={`pool-${pool}`} className="border-2 border-ink">
      <header className="flex items-baseline justify-between gap-3 border-b-2 border-ink px-4 py-3">
        <h2 id={`pool-${pool}`} className="font-display text-2xl">
          <span aria-hidden className="mr-2">
            {MODE_GLYPH[modeOfPool(pool)]}
          </span>
          {poolTitle(pool)}
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Evolución del Elo · por día</h3>
          <RatingChart history={history} pool={pool} />
          {unclassified > 0 && (
            <p className="mt-2 text-xs text-muted">
              {unclassified} {unclassified === 1 ? 'partida' : 'partidas'} de Royale anteriores a la v1.2 sin categoría de tiempo.
            </p>
          )}
        </div>
        <details className="group">
          <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-2 border border-line px-4 py-1.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>Historial ({entries.length})</span>
            <span aria-hidden className="text-xs transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="mt-3">
            {entries.length === 0 ? (
              <p className="text-center text-sm text-muted">Sin partidas en este modo.</p>
            ) : (
              <>
                <p className="mb-2 text-right font-mono text-xs text-muted">{solved} resueltos</p>
                <HistoryTable entries={entries} modeDeltas coop={pool === 'coop'} />
              </>
            )}
          </div>
        </details>
      </div>
    </section>
  );
});
