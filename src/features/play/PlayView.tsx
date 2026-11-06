// Vista de juego: flujo libre (navegación por lista) o por rondas (criptico compartido + votación).
import { useMemo, useState } from 'react';
import type { LiveState } from '../../../shared/engine';
import { nextPendingFree } from './playUtils';
import type { GameActions } from '../../hooks/useGameChannel';
import { cx } from '../../lib/utils';
import { ErrorBanner, Spinner } from '../../components/ui';
import { CluePanel } from './CluePanel';
import { DifficultyVote, SharedRequests } from './GameControls';
import { useCryptics } from './useCryptics';

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
              title={tier}
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
              cryptic={current}
              me={me}
              heading={`Criptico ${index + 1} de ${state.crypticIds.length}`}
              maxHintsPerClue={state.config.maxHintsPerClue}
              isBoss={state.boss !== null}
              actions={actions}
              onSolved={(id) => setSelectedId(nextPendingFree(state.crypticIds, [...me.solvedIds, id], id))}
            />
            <button
              className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
              onClick={() => setSelectedId(nextPendingFree(state.crypticIds, me.solvedIds, selectedId))}
            >
              Saltar →
            </button>
          </>
        )}
        <SharedRequests state={state} uid={uid} actions={actions} />
      </section>
    </div>
  );
}

function RoundsFlow({ state, uid, actions }: { state: LiveState; uid: string; actions: GameActions }) {
  const me = state.participants[uid]!;
  const round = state.round;
  const { cryptics, error } = useCryptics(round ? [round.crypticId] : []);

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
      <section className="min-w-0">
        {current ? (
          <CluePanel
            cryptic={current}
            me={me}
            heading={`Ronda ${round.index}`}
            maxHintsPerClue={state.config.maxHintsPerClue}
            isBoss={state.boss !== null}
            actions={actions}
          />
        ) : (
          <Spinner />
        )}
      </section>
      <aside className="space-y-6">
        {state.config.difficultyVote && <DifficultyVote state={state} uid={uid} actions={actions} />}
        <SharedRequests state={state} uid={uid} actions={actions} />
      </aside>
    </div>
  );
}

export function PlayView({ state, uid, actions }: { state: LiveState; uid: string; actions: GameActions }) {
  return state.config.flow === 'rounds' ? (
    <RoundsFlow state={state} uid={uid} actions={actions} />
  ) : (
    <FreeFlow state={state} uid={uid} actions={actions} />
  );
}
