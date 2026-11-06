// Muerte súbita de desempate: los empatados en la cima responden cripticos de varias palabras; el primero que acierta gana.
import { memo } from 'react';
import { TIEBREAK_TIME_MS, type LiveState } from '../../../shared/engine';
import type { Solution } from '../../../shared/protocol';
import type { GameActions } from '../../hooks/useGameChannel';
import { useNow } from '../../hooks/useNow';
import { cx, formatClock } from '../../lib/utils';
import { ErrorBanner, Spinner } from '../../components/ui';
import { CluePanel, ClueText } from './CluePanel';
import { NextCountdown } from './ModeViews';
import { useCryptics } from './useCryptics';

/** Tiempo restante del criptico de desempate (se repinta solo). */
const TiebreakClock = memo(function TiebreakClock({ closesAt, offsetMs }: { closesAt: number; offsetMs: number }) {
  const now = useNow(250) + offsetMs;
  const left = Math.max(0, closesAt - now);
  return (
    <p className={cx('font-mono text-2xl font-semibold tabular-nums', left <= 15_000 && 'text-accent')} aria-label="Tiempo restante">
      {formatClock(left)}
    </p>
  );
});

function PreviousTiebreak({ solution }: { solution: Solution }) {
  const { cryptics } = useCryptics([solution.crypticId]);
  const cryptic = cryptics.get(solution.crypticId);
  return (
    <section className="border-l-4 border-ink bg-paper-2/60 px-4 py-3 text-sm fade-in" aria-label="Desempate anterior">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Nadie lo resolvió</p>
      {cryptic && <ClueText cryptic={cryptic} className="mt-1 block font-display text-lg" />}
      {solution.answer && <p className="mt-1 font-mono text-base font-semibold uppercase tracking-widest">{solution.answer}</p>}
      {solution.explanation && <p className="mt-1">{solution.explanation}</p>}
    </section>
  );
}

export function TiebreakView({
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
  const tb = state.tiebreak!;
  const me = state.participants[uid];
  const playing = tb.uids.includes(uid);
  // Antes de abrir, el servidor oculta el id del criptico ('').
  const waiting = tb.crypticId === '';
  const { cryptics, error } = useCryptics(waiting ? [] : [tb.crypticId]);
  const current = waiting ? undefined : cryptics.get(tb.crypticId);
  const names = tb.uids.map((id) => (id === uid ? 'tú' : (state.participants[id]?.displayName ?? '?')));
  const previous = tb.index > 0 ? solutions.find((s) => s.crypticId === tb.played[tb.index - 1]) : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="border-b-2 border-ink pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent">Desempate · muerte súbita</p>
        <h2 className="mt-1 font-display text-3xl">Empate entre {names.join(' y ')}</h2>
        <p className="mt-2 text-sm text-muted">
          Criptico {tb.index + 1} de {tb.total}. Gana quien acierte primero; hay {Math.round(TIEBREAK_TIME_MS / 1000)} s por criptico.
        </p>
      </header>

      {error && <ErrorBanner error={error} />}
      {waiting ? (
        <div className="space-y-4">
          <NextCountdown opensAt={tb.opensAt} offsetMs={offsetMs} label="Desempate en" />
          {previous && <PreviousTiebreak solution={previous} />}
        </div>
      ) : !current ? (
        <Spinner />
      ) : (
        <>
          <TiebreakClock closesAt={tb.closesAt} offsetMs={offsetMs} />
          {playing && me ? (
            <CluePanel
              key={current.id}
              cryptic={current}
              me={me}
              heading="Criptico de desempate"
              maxHintsPerClue={0}
              hintCost={0}
              wrongPenalty={0}
              isBoss={false}
              actions={actions}
              successLabel={() => '¡Ganaste el desempate!'}
            />
          ) : (
            <section className="border-2 border-ink p-6">
              <ClueText cryptic={current} className="block font-display text-2xl leading-snug" />
              <p className="mt-4 text-sm text-muted">Solo responden {names.join(' y ')}.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
