// Race: pista con el avance de cada jugador hacia la meta, flujo secuencial (Pacífico) y rendirse.
import { memo, useMemo, useState } from 'react';
import { cooldownMs, currentFor, type LiveState, gameHintsLeft } from '../../../shared/engine';
import type { GameActions } from '../../hooks/useGameChannel';
import { cx, errorMessage } from '../../lib/utils';
import { Button, ErrorBanner, Spinner } from '../../components/ui';
import { CluePanel } from './CluePanel';
import { NextCountdown } from './ModeViews';
import { useCryptics } from './useCryptics';
import { useReached } from '../../hooks/useNow';

/** Avance de todos hacia la meta. Reemplaza los avisos por acierto: se ve de un vistazo quién va adelante. */
export const RaceTrack = memo(function RaceTrack({ state, uid }: { state: LiveState; uid: string }) {
  const target = Math.max(1, state.config.targetCount);
  const round = state.round;
  const players = Object.values(state.participants).sort(
    (a, b) => b.solvedIds.length - a.solvedIds.length || (a.lastSolvedAt ?? Infinity) - (b.lastSolvedAt ?? Infinity),
  );
  const best = players[0]?.solvedIds.length ?? 0;
  return (
    <ol className="space-y-1.5" aria-label="Carrera">
      {players.map((p) => {
        const solved = p.solvedIds.length;
        const leader = solved > 0 && solved === best;
        const thisRound = round && round.crypticId ? round.solvedBy.includes(p.uid) : false;
        const gaveUp = round?.surrenderedBy?.includes(p.uid) ?? false;
        return (
          <li key={p.uid} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 text-sm">
            <span className={cx('truncate', p.uid === uid ? 'font-bold' : 'font-medium')}>
              {leader && <span aria-label="Va primero">♛ </span>}
              {p.uid === uid ? 'Tú' : p.displayName}
            </span>
            <div className="relative h-4 border border-ink bg-paper">
              <div
                className={cx('h-full transition-[width] duration-500', p.uid === uid ? 'bg-accent' : 'bg-ink')}
                style={{ width: `${Math.min(100, (solved / target) * 100)}%` }}
              />
              {/* Marcas de la meta: un tramo por criptico. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 flex">
                {Array.from({ length: target }, (_, i) => (
                  <span key={i} className="flex-1 border-r border-paper/60 last:border-0" />
                ))}
              </div>
            </div>
            <span className="w-16 text-right font-mono text-xs tabular-nums">
              {solved}/{target}
              {thisRound && <span className="ml-1 text-ok">✓</span>}
              {gaveUp && <span className="ml-1 text-muted">⚑</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
});

/** Rendirse ante el criptico actual (usos limitados). En Hardcore da 5 s al resto. */
export function SurrenderButton({ state, uid, actions }: { state: LiveState; uid: string; actions: GameActions }) {
  const rule = state.config.surrender;
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!rule?.enabled) return null;
  const left = rule.maxUses - (state.participants[uid]?.surrenders ?? 0);
  if (left <= 0) return <span className="text-xs text-muted">Sin rendiciones</span>;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await actions.surrender();
      setConfirming(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <Button variant="danger" loading={busy} onClick={run}>
            Confirmar
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </>
      ) : (
        <Button variant="ghost" onClick={() => setConfirming(true)} title={state.config.flow === 'rounds' ? 'El resto tiene 5 s para acertar' : undefined}>
          ⚑ Rendirme · {left}
        </Button>
      )}
      <ErrorBanner error={error} />
    </span>
  );
}

/** Pacífico: cada uno avanza en orden por la misma lista; el siguiente se abre tras 3 s y nunca se ve antes. */
export function SequentialRace({ state, uid, actions, offsetMs }: { state: LiveState; uid: string; actions: GameActions; offsetMs: number }) {
  const me = state.participants[uid]!;
  const cursor = me.cursor ?? 0;
  // El servidor solo envía los cripticos ya abiertos: si el actual no está, estamos en la pausa.
  const currentId = currentFor(state, me);
  const shownId = currentId ?? (cursor > 0 ? state.crypticIds[cursor - 1] : undefined) ?? null;
  const ids = useMemo(() => (shownId ? [shownId] : []), [shownId]);
  const { cryptics, error } = useCryptics(ids);
  const shown = shownId ? cryptics.get(shownId) : undefined;
  // Margen de 1,5 s tras la apertura: el servidor difunde el nuevo criptico apenas abre.
  const opened = useReached((me.nextOpensAt ?? 0) + 1500, offsetMs);
  const waiting = !currentId && !opened;
  const gaveUp = waiting && shownId !== null && !me.solvedIds.includes(shownId);
  const finishedList = !currentId && !waiting;

  if (error) return <ErrorBanner error={error} />;
  if (finishedList) {
    return (
      <div className="border-2 border-ink p-8 text-center">
        <p className="font-display text-3xl">No quedan cripticos</p>
        <p className="mt-2 text-sm text-muted">Espera a que termine la carrera.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {waiting && me.nextOpensAt != null && <NextCountdown opensAt={me.nextOpensAt} offsetMs={offsetMs} />}
      {gaveUp ? (
        <p className="border-l-4 border-line pl-3 text-sm text-muted">Te rendiste en el anterior. La solución se verá al final.</p>
      ) : !shown ? (
        <Spinner />
      ) : (
        <CluePanel
          key={shown.id}
          cryptic={shown}
          me={me}
          heading={`Criptico ${currentId ? cursor + 1 : cursor}`}
          maxHintsPerClue={state.config.maxHintsPerClue}
          gameHintsLeft={gameHintsLeft(state, me)}
          hintCost={0}
          wrongPenalty={0}
          isBoss={false}
          actions={actions}
          successLabel={() => `¡Correcto! Llevas ${me.solvedIds.length + (currentId ? 1 : 0)}/${state.config.targetCount}`}
          cooldownMs={cooldownMs(state.config)}
          footer={<SurrenderButton state={state} uid={uid} actions={actions} />}
        />
      )}
    </div>
  );
}
