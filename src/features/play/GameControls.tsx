// Controles colectivos: votación de dificultad, tiempo extra y pasar ronda.
import { useState } from 'react';
import type { LiveState } from '../../../shared/engine';
import { DIFFICULTY_LABELS } from '../../../shared/scoring';
import { DIFFICULTIES, type Difficulty } from '../../../shared/types';
import type { GameActions } from '../../hooks/useGameChannel';
import { cx, errorMessage } from '../../lib/utils';
import { Button, ErrorBanner } from '../../components/ui';

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

export function SharedRequests({ state, uid, actions }: { state: LiveState; uid: string; actions: GameActions }) {
  const [busy, setBusy] = useState<'extra' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = Object.keys(state.participants).length;
  const { config } = state;

  const run = async (key: 'extra' | 'skip', action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const showExtra = config.extraTime.enabled;
  const showSkip = config.flow === 'rounds' && state.round !== null;
  if (!showExtra && !showSkip) return null;

  const extraAsked = state.extraTime.votes.includes(uid);
  const skipAsked = state.skipVotes.includes(uid);

  return (
    <section className="flex flex-wrap gap-2">
      {showExtra && (
        <Button
          variant={extraAsked ? 'primary' : 'secondary'}
          loading={busy === 'extra'}
          disabled={state.extraTime.usesLeft <= 0}
          onClick={() => run('extra', actions.extraTime)}
          title="Se aplica cuando todos lo piden"
        >
          +{config.extraTime.seconds}s · {state.extraTime.votes.length}/{total}
          <span className="font-mono text-xs opacity-70">({state.extraTime.usesLeft} usos)</span>
        </Button>
      )}
      {showSkip && (
        <Button variant={skipAsked ? 'primary' : 'ghost'} loading={busy === 'skip'} onClick={() => run('skip', actions.skip)}>
          Pasar · {state.skipVotes.length}/{total}
        </Button>
      )}
      <ErrorBanner error={error} />
    </section>
  );
}
