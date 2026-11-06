// Vistas específicas de cada modo: relojes de Royale, barras de vida de Duel y pausa entre cripticos.
import { memo, useEffect, useMemo, useRef } from 'react';
import { royaleCurrent, royaleRemaining, type LiveState } from '../../../shared/engine';
import type { GameActions } from '../../hooks/useGameChannel';
import { useNow } from '../../hooks/useNow';
import { playCue } from '../../lib/sound';
import { cx, formatClock } from '../../lib/utils';
import { Button, Spinner } from '../../components/ui';
import { CluePanel } from './CluePanel';
import { useCryptics } from './useCryptics';

/** Umbral de "poco tiempo": 15 % del reloj inicial, entre 10 y 30 segundos. */
export function lowTimeThresholdMs(baseSec: number): number {
  return Math.min(30_000, Math.max(10_000, baseSec * 150));
}

// ---------- Royale ----------

/** Relojes de todos los jugadores, como en el ajedrez. Se repintan solos (no re-renderizan la sala). */
export const ChessClocks = memo(function ChessClocks({ state, uid, offsetMs }: { state: LiveState; uid: string; offsetMs: number }) {
  const now = useNow(200) + offsetMs;
  const threshold = lowTimeThresholdMs(state.config.royale?.baseSec ?? 60);
  const players = Object.values(state.participants).sort((a, b) => {
    const alive = Number(b.eliminatedAt == null) - Number(a.eliminatedAt == null);
    return alive !== 0 ? alive : royaleRemaining(state, b, now) - royaleRemaining(state, a, now);
  });
  return (
    <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" aria-label="Relojes">
      {players.map((p) => {
        const remaining = royaleRemaining(state, p, now);
        const out = p.eliminatedAt != null || remaining <= 0;
        const low = !out && remaining < threshold;
        return (
          <li
            key={p.uid}
            className={cx(
              'border px-2 py-1.5',
              p.uid === uid ? 'border-ink' : 'border-line',
              low && 'animate-pulse border-accent bg-accent/10',
              out && 'opacity-40',
            )}
          >
            <p className={cx('truncate text-xs font-semibold', out && 'line-through')}>{p.uid === uid ? 'Tú' : p.displayName}</p>
            <p className={cx('font-mono text-xl font-semibold tabular-nums', low && 'text-accent')}>
              {out ? 'Fuera' : formatClock(remaining)}
            </p>
            <p className="text-[11px] text-muted">{p.solvedIds.length} resueltos</p>
          </li>
        );
      })}
    </ul>
  );
});

/** Alerta de poco tiempo: borde rojo que late y un pitido por segundo (configurable en Ajustes). */
const LowTimeAlarm = memo(function LowTimeAlarm({ deadline, threshold, offsetMs }: { deadline: number; threshold: number; offsetMs: number }) {
  const now = useNow(250) + offsetMs;
  const remaining = deadline - now;
  const low = remaining > 0 && remaining < threshold;
  const lastBeep = useRef<number | null>(null);
  useEffect(() => {
    if (!low) return;
    const second = Math.ceil(remaining / 1000);
    if (lastBeep.current !== second) {
      lastBeep.current = second;
      playCue('lowTime');
    }
  }, [low, remaining]);
  if (!low) return null;
  return <div aria-hidden className="pointer-events-none fixed inset-0 z-30 animate-pulse border-[6px] border-accent" />;
});

export function RoyaleFlow({ state, uid, actions, offsetMs }: { state: LiveState; uid: string; actions: GameActions; offsetMs: number }) {
  const me = state.participants[uid]!;
  const cursor = me.cursor ?? 0;
  const currentId = royaleCurrent(state, me);
  // Precarga los próximos para que no haya espera entre cripticos.
  const upcoming = useMemo(() => state.crypticIds.slice(cursor, cursor + 4), [state.crypticIds, cursor]);
  const { cryptics } = useCryptics(upcoming);
  const current = currentId ? cryptics.get(currentId) : undefined;
  const baseSec = state.config.royale?.baseSec ?? 60;

  return (
    <div className="space-y-6">
      <ChessClocks state={state} uid={uid} offsetMs={offsetMs} />
      {me.eliminatedAt != null ? (
        <div className="border-2 border-ink p-8 text-center">
          <p className="font-display text-3xl">Te quedaste sin tiempo</p>
          <p className="mt-2 text-sm text-muted">Resolviste {me.solvedIds.length}. Puedes seguir mirando hasta el final.</p>
        </div>
      ) : !currentId ? (
        <div className="border-2 border-ink p-8 text-center">
          <p className="font-display text-3xl">¡No quedan cripticos!</p>
          <p className="mt-2 text-sm text-muted">Aguanta: gana quien siga en pie.</p>
        </div>
      ) : !current ? (
        <Spinner />
      ) : (
        <>
          <LowTimeAlarm deadline={state.startedAt + (me.bankMs ?? 0)} threshold={lowTimeThresholdMs(baseSec)} offsetMs={offsetMs} />
          <CluePanel
            key={current.id}
            cryptic={current}
            me={me}
            heading={`Criptico ${cursor + 1} · +${state.config.royale?.incrementSec ?? 0}s por acierto`}
            maxHintsPerClue={0}
            hintCost={0}
            wrongPenalty={0}
            isBoss={false}
            actions={actions}
          />
          <Button variant="ghost" onClick={() => void actions.pass().catch(() => undefined)}>
            Pasar al siguiente →
          </Button>
        </>
      )}
    </div>
  );
}

// ---------- Duel ----------

export const DuelBars = memo(function DuelBars({ state, uid }: { state: LiveState; uid: string }) {
  const maxHp = state.config.duel?.hp ?? 100;
  const players = Object.values(state.participants).sort((a, b) => Number(b.uid === uid) - Number(a.uid === uid));
  return (
    <div className="grid grid-cols-2 gap-3" aria-label="Vida">
      {players.map((p, index) => {
        const ratio = Math.max(0, p.score) / maxHp;
        return (
          <div key={p.uid} className={cx(index === 1 && 'text-right')}>
            <p className="truncate text-xs font-semibold">
              {p.uid === uid ? 'Tú' : p.displayName} · <span className="font-mono">{Math.max(0, p.score)}</span>
            </p>
            <div className={cx('mt-1 flex h-3 border border-ink', index === 1 && 'justify-end')}>
              <div
                className={cx('h-full transition-[width] duration-500', ratio > 0.5 ? 'bg-ok' : ratio > 0.25 ? 'bg-ink' : 'bg-accent')}
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});

// ---------- Pausa entre cripticos ----------

/** Cuenta los segundos hasta que abre el siguiente criptico (con tic por segundo). */
export const NextCountdown = memo(function NextCountdown({ opensAt, offsetMs }: { opensAt: number; offsetMs: number }) {
  const now = useNow(100) + offsetMs;
  const seconds = Math.max(0, Math.ceil((opensAt - now) / 1000));
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (seconds > 0 && last.current !== seconds) {
      last.current = seconds;
      playCue('tick');
    }
  }, [seconds]);
  return (
    <div className="flex items-baseline gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Siguiente criptico en</p>
      <p key={seconds} className="font-display text-5xl fade-in">
        {seconds}
      </p>
    </div>
  );
});
