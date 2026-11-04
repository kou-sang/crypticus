// Resultados finales (standings congelados por el servidor al cerrar).
import { Link } from 'react-router';
import type { Competition } from '../../../shared/types';
import { cx } from '../../lib/utils';

interface Standing {
  uid: string;
  displayName: string;
  rank: number;
  score: number;
  solved: number;
  hintsUsed: number;
  ratingDelta: number;
}

const REASONS: Record<string, string> = {
  time: 'Se acabó el tiempo.',
  target: 'Alguien alcanzó la meta.',
  winByTwo: 'Ventaja de dos alcanzada.',
  exhausted: 'Se resolvieron todos los cripticos.',
};

export function ResultsView({ competition, meId }: { competition: Competition & { finalStandings?: Standing[]; endReason?: string }; meId: string }) {
  const standings = competition.finalStandings ?? [];
  const winner = standings.find((s) => s.uid === competition.winnerId);

  return (
    <div className="space-y-8">
      <div className="border-2 border-ink p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          {REASONS[competition.endReason ?? ''] ?? 'Competencia terminada.'}
        </p>
        <p className="mt-2 font-display text-4xl">
          {winner ? (
            <>
              Gana <em className="text-accent">{winner.displayName}</em>
            </>
          ) : (
            'Empate'
          )}
        </p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left text-[11px] uppercase tracking-widest text-muted">
            <th className="py-2">#</th>
            <th className="py-2">Jugador</th>
            <th className="py-2 text-right">Resueltos</th>
            <th className="py-2 text-right">Pistas</th>
            <th className="py-2 text-right">Puntos</th>
            <th className="py-2 text-right">Rating</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.uid} className={cx('border-b border-line', s.uid === meId && 'bg-accent/10')}>
              <td className="py-2.5 font-mono">{s.rank}</td>
              <td className="py-2.5 font-semibold">{s.displayName}</td>
              <td className="py-2.5 text-right font-mono">{s.solved}</td>
              <td className="py-2.5 text-right font-mono">{s.hintsUsed}</td>
              <td className="py-2.5 text-right font-mono font-semibold">{s.score}</td>
              <td className={cx('py-2.5 text-right font-mono', s.ratingDelta > 0 ? 'text-ok' : s.ratingDelta < 0 ? 'text-accent' : '')}>
                {s.ratingDelta > 0 ? `+${s.ratingDelta}` : s.ratingDelta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-3">
        <Link to="/competencias/nueva" className="inline-flex h-10 items-center bg-ink px-4 text-sm font-semibold text-paper hover:bg-accent">
          Revancha
        </Link>
        <Link to="/competencias" className="inline-flex h-10 items-center border border-ink px-4 text-sm font-semibold">
          Más salas
        </Link>
      </div>
    </div>
  );
}
