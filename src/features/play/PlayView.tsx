// Vista de juego: flujo libre (navegación por lista) o por rondas (criptico compartido + votación).
import { useMemo, useState, memo } from 'react';
import type { LiveState } from '../../../shared/engine';
import type { Solution } from '../../../shared/protocol';
import { DIFFICULTY_LABELS, HINT_PENALTY } from '../../../shared/scoring';
import { nextPendingFree } from './playUtils';
import type { GameActions } from '../../hooks/useGameChannel';
import { cx } from '../../lib/utils';
import { ErrorBanner, Spinner } from '../../components/ui';
import { CluePanel, ClueText } from './CluePanel';
import { DifficultyVote, SharedRequests } from './GameControls';
import { useCryptics } from './useCryptics';
import { DuelBars, NextCountdown, RoyaleFlow } from './ModeViews';

/** Coste visible de una pista según la regla de puntaje. */
const hintCostOf = (state: LiveState) => (state.config.scoring === 'fewestHints' && state.boss === null ? HINT_PENALTY : 0);

function FreeFlow({ state, uid, actions }: { state: LiveState; uid: string; actions: GameActions }) {
  const me = state.participants[uid]!;
  const solved = useMemo(() => new Set(me.solvedIds), [me.solvedIds]);
  const [selectedId, setSelectedId] = useState<string | null>(() => nextPendingFree(state.crypticIds, me.solvedIds, null));
  const { cryptics, error } = useCryptics(state.crypticIds);

  if (error) return <ErrorBanner error={error} />;
  const current = selectedId ? cryptics.get(selectedId) : undefined;
  const index = selectedId ? state.crypticIds.indexOf(selectedId) : -1;

  return (
    <div className="grid gap-6 md:grid-cols-[auto_1fr]">
      <nav aria-label="Cripticos" className="flex flex-wrap gap-1 md:w-40 md:content-start">
        {state.crypticIds.map((id, i) => {
          const tier = state.catalog[id]?.tier;
          return (
            <button
              key={id}
              onClick={() => setSelectedId(id)}
              aria-current={id === selectedId}
              title={tier ? DIFFICULTY_LABELS[tier] : undefined}
              className={cx(
                'relative size-9 border font-mono text-xs font-semibold transition-colors',
                solved.has(id) ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink',
                id === selectedId && 'outline-2 outline-offset-1 outline-accent',
              )}
            >
              {i + 1}
              <span
                aria-hidden
                className={cx(
                  'absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full',
                  tier === 'easy' ? 'bg-ok' : tier === 'hard' ? 'bg-accent' : 'bg-muted',
                )}
              />
            </button>
          );
        })}
      </nav>

      <section className="min-w-0 space-y-6">
        {!selectedId ? (
          <div className="border-2 border-ink p-8 text-center">
            <p className="font-display text-3xl">¡Todo resuelto!</p>
            <p className="mt-2 text-sm text-muted">Espera a que termine la competencia.</p>
          </div>
        ) : !current ? (
          <Spinner />
        ) : (
          <>
            <CluePanel
              key={current.id}
              cryptic={current}
              me={me}
              heading={`Criptico ${index + 1} de ${state.crypticIds.length}`}
              maxHintsPerClue={state.config.maxHintsPerClue}
              hintCost={hintCostOf(state)}
              wrongPenalty={state.config.wrongPenalty}
              isBoss={state.boss !== null}
              actions={actions}
              onNext={() => setSelectedId(nextPendingFree(state.crypticIds, [...me.solvedIds, current.id], current.id))}
            />
            {!solved.has(current.id) && (
              <button
                className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
                onClick={() => setSelectedId(nextPendingFree(state.crypticIds, me.solvedIds, selectedId))}
              >
                Dejar para después →
              </button>
            )}
          </>
        )}
        <SharedRequests state={state} uid={uid} actions={actions} />
      </section>
    </div>
  );
}

/** Solución de la última ronda cerrada: en rondas el criptico cambia al instante y no daría tiempo a leerla. */
function PreviousRound({ solution, state, uid }: { solution: Solution; state: LiveState; uid: string }) {
  const { cryptics } = useCryptics([solution.crypticId]);
  const cryptic = cryptics.get(solution.crypticId);
  const names = solution.solvedBy.map((id) => (id === uid ? 'tú' : (state.participants[id]?.displayName ?? '?')));
  return (
    <section className="border-l-4 border-ink bg-paper-2/60 px-4 py-3 text-sm fade-in" aria-label="Ronda anterior">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Ronda anterior</p>
      {cryptic && <ClueText cryptic={cryptic} className="mt-1 block font-display text-lg" />}
      {solution.answer && <p className="mt-1 font-mono text-base font-semibold uppercase tracking-widest">{solution.answer}</p>}
      {solution.explanation && <p className="mt-1">{solution.explanation}</p>}
      <p className="mt-1 text-xs text-muted">{names.length > 0 ? `Resuelto por ${names.join(', ')}` : 'Nadie lo resolvió'}</p>
    </section>
  );
}

function RoundsFlow({
  state,
  uid,
  actions,
  solutions,
  offsetMs,
}: {
  state: LiveState;
  uid: string;
  actions: GameActions;
  solutions: Solution[];
  offsetMs: number;
}) {
  const me = state.participants[uid]!;
  const round = state.round;
  const previous = solutions[solutions.length - 1];
  // Durante la pausa el servidor oculta el id del siguiente criptico ('').
  const waiting = round !== null && round.crypticId === '';
  const { cryptics, error } = useCryptics(round && !waiting ? [round.crypticId] : []);

  if (error) return <ErrorBanner error={error} />;
  if (!round) {
    return (
      <div className="border-2 border-ink p-8 text-center">
        <p className="font-display text-3xl">No quedan cripticos</p>
      </div>
    );
  }
  const current = cryptics.get(round.crypticId);

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_220px]">
      <section className="min-w-0 space-y-6">
        {state.config.duel && <DuelBars state={state} uid={uid} />}
        {waiting ? (
          <div className="space-y-4">
            {round.opensAt != null && <NextCountdown opensAt={round.opensAt} offsetMs={offsetMs} />}
            {previous && <PreviousRound key={previous.crypticId} solution={previous} state={state} uid={uid} />}
          </div>
        ) : current ? (
          <CluePanel
            key={current.id}
            cryptic={current}
            me={me}
            heading={`Ronda ${round.index}`}
            maxHintsPerClue={state.config.maxHintsPerClue}
            hintCost={hintCostOf(state)}
            wrongPenalty={state.config.wrongPenalty}
            isBoss={state.boss !== null}
            actions={actions}
          />
        ) : (
          <Spinner />
        )}
      </section>
      <aside className="space-y-6">
        {previous && !waiting && <PreviousRound key={previous.crypticId} solution={previous} state={state} uid={uid} />}
        {state.config.difficultyVote && <DifficultyVote state={state} uid={uid} actions={actions} />}
        <SharedRequests state={state} uid={uid} actions={actions} />
      </aside>
    </div>
  );
}

export const PlayView = memo(function PlayView({
  state,
  uid,
  actions,
  solutions,
  offsetMs,
}: {
  state: LiveState;
  uid: string;
  actions: GameActions;
  solutions: Solution[];
  offsetMs: number;
}) {
  if (state.config.royale) return <RoyaleFlow state={state} uid={uid} actions={actions} offsetMs={offsetMs} />;
  return state.config.flow === 'rounds' ? (
    <RoundsFlow state={state} uid={uid} actions={actions} solutions={solutions} offsetMs={offsetMs} />
  ) : (
    <FreeFlow state={state} uid={uid} actions={actions} />
  );
});
