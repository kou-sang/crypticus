// Votación de la dificultad del próximo criptico (Race Hardcore): se abre cuando todos terminaron, dura 7 s.
import { useState } from 'react';
import { DIFFICULTY_VOTE_MS, type LiveState } from '../../../shared/engine';
import { DIFFICULTY_LABELS } from '../../../shared/scoring';
import { type Difficulty } from '../../../shared/types';
import { startsFor, votableTiers } from '../../../shared/progression';
import type { GameActions } from '../../hooks/useGameChannel';
import { cx, errorMessage } from '../../lib/utils';
import { ErrorBanner } from '../../components/ui';

export function DifficultyVote({ state, uid, actions }: { state: LiveState; uid: string; actions: GameActions }) {
  const [error, setError] = useState<string | null>(null);
  const votes = state.round?.votes ?? {};
  const mine = votes[uid];
  // Progresión (v1.9): solo se vota hasta la dificultad que ya se habilitó en esta ronda.
  const tiers = votableTiers(startsFor(state.config), state.round?.index ?? 1);

  const vote = async (tier: Difficulty) => {
    setError(null);
    try {
      await actions.vote(tier);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section aria-label="Votar dificultad del próximo criptico">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Vota la dificultad del próximo criptico</p>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        {tiers.map((tier) => {
          const count = Object.values(votes).filter((v) => v === tier).length;
          return (
            <button
              key={tier}
              onClick={() => vote(tier)}
              aria-pressed={mine === tier}
              className={cx(
                'border px-2 py-2 text-sm font-semibold transition-colors',
                mine === tier ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink',
              )}
            >
              {DIFFICULTY_LABELS[tier]}
              <span className="ml-1 font-mono text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {DIFFICULTY_VOTE_MS / 1000} s para votar. Gana la mayoría; en empate se sortea entre las más votadas. Sin votos: la dificultad de la ronda.
      </p>
      <ErrorBanner error={error} />
    </section>
  );
}
