// Resultados de una partida COOP: resumen, estadísticas por jugador y por jefe, y Elo de cada uno.
import { useEffect, useMemo } from 'react';
import { BOSSES } from '../../../shared/coop/catalog/bosses';
import { CHARACTERS } from '../../../shared/coop/catalog/characters';
import type { CoopResultSummary } from '../../../shared/coop/protocol';
import { playCue } from '../../lib/sound';
import { cx } from '../../lib/utils';
import { BossSilhouette, CharacterSilhouette } from './silhouettes';

const CATEGORY_LABELS = { easy: 'Easy', medium: 'Medium', difficult: 'Difficult', expert: 'Expert', nightmare: 'Nightmare' } as const;

const minutes = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const COLUMNS: Array<{ key: keyof CoopResultSummary['players'][number]; label: string; title: string }> = [
  { key: 'damageDealt', label: 'Daño', title: 'Daño hecho a los jefes' },
  { key: 'damageTaken', label: 'Recibido', title: 'Daño recibido' },
  { key: 'healingDone', label: 'Curó', title: 'Curación hecha a otros o a sí mismo' },
  { key: 'goldEarned', label: 'Oro', title: 'Oro obtenido' },
  { key: 'goldSpent', label: 'Gastó', title: 'Oro gastado' },
  { key: 'crypticsSolved', label: 'Cripticos', title: 'Cripticos resueltos' },
  { key: 'roundsWon', label: 'Rondas', title: 'Rondas superadas' },
  { key: 'deaths', label: 'Caídas', title: 'Veces que cayó' },
  { key: 'hintsUsed', label: 'Pistas', title: 'Pistas usadas' },
  { key: 'activesUsed', label: 'Activas', title: 'Habilidades activas usadas' },
];

export function CoopResults({ result, meId }: { result: CoopResultSummary; meId: string }) {
  useEffect(() => {
    playCue(result.won ? 'victory' : 'defeat');
  }, [result.won]);

  // Totales del equipo (fila final y destacados).
  const totals = useMemo(() => {
    const sum = (key: (typeof COLUMNS)[number]['key']) => result.players.reduce((acc, p) => acc + Number(p[key] ?? 0), 0);
    return Object.fromEntries(COLUMNS.map((c) => [c.key, sum(c.key)])) as Record<string, number>;
  }, [result.players]);
  const best = (key: (typeof COLUMNS)[number]['key']) => Math.max(...result.players.map((p) => Number(p[key] ?? 0)));

  return (
    <div className="space-y-8">
      <div className="border-2 border-ink p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          COOP {result.level} · {result.bossesDefeated}/{result.bosses.length} jefes · {result.rounds} rondas · {minutes(result.endedGt)}
        </p>
        <p className="mt-2 font-display text-4xl">
          {result.won ? (
            <>
              ¡<em className="text-accent">Victoria</em>!
            </>
          ) : (
            'Derrota'
          )}
        </p>
      </div>

      <section aria-labelledby="coop-players">
        <h2 id="coop-players" className="mb-3 font-display text-2xl">
          Jugadores
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ink text-left text-[11px] uppercase tracking-widest text-muted">
                <th className="py-2">Jugador</th>
                {COLUMNS.map((column) => (
                  <th key={column.key} title={column.title} className="whitespace-nowrap px-1 py-2 text-right">
                    {column.label}
                  </th>
                ))}
                <th className="py-2 pl-2 text-right">Elo</th>
              </tr>
            </thead>
            <tbody>
              {result.players.map((player) => (
                <tr key={player.uid} className={cx('border-b border-line', player.uid === meId && 'bg-accent/10')}>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <span className="coop-halo shrink-0">
                        <CharacterSilhouette id={player.character} className="size-7" />
                      </span>
                      <span>
                        <span className="font-semibold">{player.displayName}</span>
                        <span className="block text-xs text-muted">
                          {CHARACTERS[player.character].name}
                          {player.status === 'left' ? ' · salió' : player.status === 'dead' ? ' · caído' : ''}
                        </span>
                      </span>
                    </span>
                  </td>
                  {COLUMNS.map((column) => {
                    const value = Number(player[column.key] ?? 0);
                    const top = value > 0 && value === best(column.key) && column.key !== 'deaths' && column.key !== 'damageTaken';
                    return (
                      <td key={column.key} className={cx('px-1 py-2 text-right font-mono tabular-nums', top && 'font-bold text-accent')}>
                        {value}
                      </td>
                    );
                  })}
                  <td
                    className={cx(
                      'py-2 pl-2 text-right font-mono font-semibold',
                      player.ratingDelta > 0 ? 'text-ok' : player.ratingDelta < 0 ? 'text-accent' : '',
                    )}
                  >
                    {player.ratingDelta > 0 ? `+${player.ratingDelta}` : player.ratingDelta}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink text-muted">
                <td className="py-2 text-[11px] font-semibold uppercase tracking-widest">Equipo</td>
                {COLUMNS.map((column) => (
                  <td key={column.key} className="px-1 py-2 text-right font-mono tabular-nums">
                    {totals[column.key]}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="coop-bosses">
        <h2 id="coop-bosses" className="mb-3 font-display text-2xl">
          Jefes
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {result.bosses.map((boss, index) => {
            const defeated = boss.defeatedGt !== null;
            const reached = defeated || index === result.bossesDefeated;
            return (
              <li key={boss.id} className={cx('flex gap-3 border border-ink p-3 text-sm', !reached && 'opacity-50')}>
                <span className="coop-halo shrink-0 self-start">
                  <BossSilhouette id={boss.id} className={cx('size-16', defeated && 'opacity-40')} />
                </span>
                <div className="space-y-0.5">
                  <p className="font-display text-lg">
                    {BOSSES[boss.id].name} <span className="text-xs uppercase tracking-widest text-muted">{CATEGORY_LABELS[boss.category]}</span>
                  </p>
                  <p className={defeated ? 'text-ok' : 'text-accent'}>
                    {defeated ? `Derrotado a los ${minutes(boss.defeatedGt!)}` : reached ? `Resistió con ${boss.hp}/${boss.maxHp}` : 'No llegaron'}
                  </p>
                  {reached && (
                    <p className="font-mono text-xs text-muted">
                      {boss.rounds} rondas · recibió {boss.damageTaken} · hizo {boss.damageDealt}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
