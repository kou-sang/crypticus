// Votar para terminar la sala: requiere confirmación y mayoría estricta. El voto se puede retirar.
import { memo, useState } from 'react';
import { endVotesNeeded, type LiveState } from '../../../shared/engine';
import type { GameActions } from '../../hooks/useGameChannel';
import { errorMessage } from '../../lib/utils';
import { Button, ErrorBanner } from '../../components/ui';

export const EndVote = memo(function EndVote({ state, uid, actions }: { state: LiveState; uid: string; actions: GameActions }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const votes = state.endVotes ?? [];
  const voted = votes.includes(uid);
  const needed = endVotesNeeded(state);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await actions.endVote();
      setConfirming(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-t border-line pt-4 text-sm">
      {votes.length > 0 && (
        <p className="mb-2 text-muted">
          Votos para terminar: <strong className="text-ink">{votes.length}/{needed}</strong>
        </p>
      )}
      {voted ? (
        <Button variant="ghost" loading={busy} onClick={toggle}>
          Retirar mi voto
        </Button>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>¿Votar para terminar la sala?</span>
          <Button variant="danger" loading={busy} onClick={toggle}>
            Confirmar
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          Votar terminar
        </Button>
      )}
      <ErrorBanner error={error} />
    </section>
  );
});
