// Resultados finales (standings congelados por el servidor al cerrar).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { playCue } from '../../lib/sound';
import { api } from '../../lib/api';
import type { Competition } from '../../../shared/types';
import type { Solution } from '../../../shared/protocol';
import { cx, errorMessage } from '../../lib/utils';
import { ErrorBanner, Spinner } from '../../components/ui';
import { ClueText } from './CluePanel';
import { useCryptics } from './useCryptics';

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
  exhausted: 'No quedan cripticos.',
  bossDefeated: 'El jefe cayó.',
  bossSurvived: 'El jefe resistió.',
  voted: 'Terminada por votación.',
  lastStanding: 'Último en pie.',
  knockout: 'Nocaut: un jugador se quedó sin vida.',
};

type FinishedCompetition = Competition & {
  finalStandings?: Standing[];
  endReason?: string;
  bossDefeated?: boolean | null;
  boss?: { hp: number; maxHp: number } | null;
};

/** Repaso: cada criptico con su respuesta y su explicación. Es lo que permite comprobar que la pista es justa. */
function SolutionsList({ competitionId, meId, names }: { competitionId: string; meId: string; names: Map<string, string> }) {
  const [solutions, setSolutions] = useState<Solution[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .solutions(competitionId)
      .then((list) => !cancelled && setSolutions(list))
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [competitionId]);
  const ids = useMemo(() => solutions?.map((s) => s.crypticId) ?? [], [solutions]);
  const { cryptics } = useCryptics(ids);

  if (error) return <ErrorBanner error={error} />;
  if (!solutions) return <Spinner />;
  if (solutions.length === 0) return <p className="text-sm text-muted">No se jugó ningún criptico.</p>;
  return (
    <ol className="divide-y divide-line border-y border-line">
      {solutions.map((solution, index) => {
        const cryptic = cryptics.get(solution.crypticId);
        const mine = solution.solvedBy.includes(meId);
        const others = solution.solvedBy.filter((id) => id !== meId).map((id) => names.get(id) ?? '?');
        return (
          <li key={solution.crypticId} className="grid gap-1 py-4 sm:grid-cols-[2rem_1fr]">
            <span className="font-mono text-sm text-muted">{index + 1}.</span>
            <div className="min-w-0">
              {cryptic && <ClueText cryptic={cryptic} className="font-display text-lg" />}
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <span className={cx('font-mono font-semibold uppercase tracking-widest', mine ? 'text-ok' : 'text-ink')}>
                  {solution.answer ?? '—'}
                </span>
                <span className="text-xs text-muted">
                  {mine ? '✓ Lo resolviste' : 'No lo resolviste'}
                  {others.length > 0 && ` · también ${others.join(', ')}`}
                </span>
              </p>
              {solution.explanation && <p className="mt-1 text-sm">{solution.explanation}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ResultsView({ competition, meId }: { competition: FinishedCompetition; meId: string }) {
  const standings = competition.finalStandings ?? [];
  const winner = standings.find((s) => s.uid === competition.winnerId);
  const isBoss = competition.mode === 'boss';
  const won = isBoss ? competition.bossDefeated === true : competition.winnerId === meId;

  // Fanfarria al entrar en resultados.
  useEffect(() => {
    playCue(won ? 'victory' : 'defeat');
  }, [won]);

  return (
    <div className="space-y-8">
      <div className="border-2 border-ink p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          {REASONS[competition.endReason ?? ''] ?? 'Competencia terminada.'}
        </p>
        <p className="mt-2 font-display text-4xl">
          {isBoss ? (
            competition.bossDefeated ? (
              <>
                ¡Jefe <em className="text-accent">derrotado</em>!
              </>
            ) : (
              `El jefe sobrevivió con ${competition.boss?.hp ?? '?'} de vida`
            )
          ) : winner ? (
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
            <th className="py-2 text-right">{isBoss ? 'Daño' : 'Puntos'}</th>
            {!isBoss && <th className="py-2 text-right">Rating</th>}
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
              {!isBoss && (
                <td className={cx('py-2.5 text-right font-mono', s.ratingDelta > 0 ? 'text-ok' : s.ratingDelta < 0 ? 'text-accent' : '')}>
                  {s.ratingDelta > 0 ? `+${s.ratingDelta}` : s.ratingDelta}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {competition.participantIds.includes(meId) && (
        <section>
          <h2 className="mb-3 font-display text-2xl">Soluciones</h2>
          <SolutionsList
            competitionId={competition.id}
            meId={meId}
            names={new Map(standings.map((s) => [s.uid, s.displayName]))}
          />
        </section>
      )}

      <Link to="/jugar/nueva" className="inline-flex h-10 items-center bg-ink px-4 text-sm font-semibold text-paper hover:bg-accent">
        Revancha
      </Link>
    </div>
  );
}
