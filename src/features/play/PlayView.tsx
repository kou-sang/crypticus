// Vista de juego según el modo: desempate, Royale, Race (Pacífico o Hardcore) y rondas (Duel).
import { memo } from 'react';
import type { LiveState } from '../../../shared/engine';
import type { Solution } from '../../../shared/protocol';
import type { GameActions } from '../../hooks/useGameChannel';
import { ErrorBanner, Spinner } from '../../components/ui';
import { CluePanel, ClueText } from './CluePanel';
import { DifficultyVote } from './GameControls';
import { useCryptics } from './useCryptics';
import { DuelAlerts, DuelBars, NextCountdown, RoyaleFlow } from './ModeViews';
import { RaceTrack, SequentialRace, SurrenderButton } from './RaceView';
import { TiebreakView } from './TiebreakView';
import { cooldownMs, isSequential, gameHintsLeft } from '../../../shared/engine';


/** Solución de la ronda que acaba de cerrar: solo durante la pausa entre rondas (después queda en los resultados). */
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
        {state.config.duel && (
          <>
            <DuelBars state={state} uid={uid} />
            <DuelAlerts state={state} uid={uid} />
          </>
        )}
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
            heading={`Criptico ${round.index}`}
            maxHintsPerClue={state.config.maxHintsPerClue}
            gameHintsLeft={gameHintsLeft(state, me)}
            isBoss={state.boss !== null}
            actions={actions}
            successLabel={
              state.config.duel
                ? (points) => `−${points} de vida al rival`
                : state.config.game === 'race'
                  ? () => '¡Correcto!'
                  : undefined
            }
            cooldownMs={cooldownMs(state.config)}
            footer={state.config.surrender?.enabled ? <SurrenderButton state={state} uid={uid} actions={actions} /> : undefined}
          />
        ) : (
          <Spinner />
        )}
      </section>
      <aside className="space-y-6">
        {state.config.difficultyVote && <DifficultyVote state={state} uid={uid} actions={actions} />}
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
  if (state.tiebreak) return <TiebreakView state={state} uid={uid} actions={actions} solutions={solutions} offsetMs={offsetMs} />;
  if (state.config.royale) return <RoyaleFlow state={state} uid={uid} actions={actions} offsetMs={offsetMs} />;
  if (state.config.game === 'race') {
    return (
      <div className="space-y-8">
        <RaceTrack state={state} uid={uid} />
        {isSequential(state.config) ? (
          <SequentialRace state={state} uid={uid} actions={actions} offsetMs={offsetMs} />
        ) : (
          <RoundsFlow state={state} uid={uid} actions={actions} solutions={solutions} offsetMs={offsetMs} />
        )}
      </div>
    );
  }
  // Duel (y Boss, cuando exista) juegan por rondas.
  return <RoundsFlow state={state} uid={uid} actions={actions} solutions={solutions} offsetMs={offsetMs} />;
});
