// Votación de la dificultad del próximo criptico (Race Hardcore).
import { useState } from 'react';
import type { LiveState } from '../../../shared/engine';
import { DIFFICULTY_LABELS } from '../../../shared/scoring';
import { DIFFICULTIES, type Difficulty } from '../../../shared/types';
import type { GameActions } from '../../hooks/useGameChannel';
import { cx, errorMessage } from '../../lib/utils';
import { ErrorBanner } from '../../components/ui';

export function DifficultyVote({ state, uid, actions }: { state: LiveState; uid: string; actions: GameActions }) {
  const [error, setError] = useState<string | null>(null);
  const votes = state.round?.votes ?? {};
  const mine = votes[uid];

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
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Próximo criptico</p>
      <div className="grid grid-cols-3 gap-1">
        {DIFFICULTIES.map((tier) => {
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
      <p className="mt-1 text-[11px] text-muted">En empate decide quien va perdiendo.</p>
      <ErrorBanner error={error} />
    </section>
  );
}
