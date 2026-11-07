// Vistas específicas de cada modo: relojes de Royale, barras de vida de Duel y pausa entre cripticos.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { cooldownMs, duelOneHitFromDeath, royaleCurrent, royaleRemaining, royaleSkipPenaltyMs, type LiveState, rivalsOf, sideOf } from '../../../shared/engine';
import type { GameActions } from '../../hooks/useGameChannel';
import { useNow } from '../../hooks/useNow';
import { playCue } from '../../lib/sound';
import { cx, errorMessage, formatClock } from '../../lib/utils';
import { Button, ErrorBanner, Spinner } from '../../components/ui';
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
            successLabel={(seconds) => `+${seconds}s a tu reloj`}
            cooldownMs={cooldownMs(state.config)}
            maxHintsPerClue={0}
            hintCost={0}
            wrongPenalty={0}
            isBoss={false}
            actions={actions}
          />
          <RoyaleSkip state={state} uid={uid} actions={actions} />
        </>
      )}
    </div>
  );
}

/** Saltar en Royale: usos limitados y cuesta tiempo del reloj. */
function RoyaleSkip({ state, uid, actions }: { state: LiveState; uid: string; actions: GameActions }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const royale = state.config.royale;
  const allowed = royale?.skips ?? 0;
  if (!royale || allowed <= 0) return null;
  const left = allowed - (state.participants[uid]?.skipsUsed ?? 0);
  const cost = royaleSkipPenaltyMs(royale) / 1000;
  if (left <= 0) return <p className="text-xs text-muted">Sin saltos.</p>;
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await actions.pass();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Button variant="ghost" loading={busy} onClick={() => void run()}>
        Saltear{cost > 0 ? ` (−${cost} s)` : ''} · quedan {left}
      </Button>
      <ErrorBanner error={error} />
    </div>
  );
}

// ---------- Duel ----------

/** Vida baja: por debajo del 30 % la barra late. */
const LOW_HEALTH_RATIO = 0.3;

export const DuelBars = memo(function DuelBars({ state, uid }: { state: LiveState; uid: string }) {
  const maxHp = state.config.duel?.hp ?? 100;
  // Un bando por barra: el jugador (1 vs 1) o el equipo con vida compartida (2 vs 2). El propio va primero.
  const mine = sideOf(state, uid);
  const theirs = rivalsOf(state, uid);
  const sides = [mine, theirs].filter((side) => side.length > 0);
  const label = (side: typeof mine) =>
    side.map((p) => (p.uid === uid ? 'Tú' : p.displayName)).join(' y ');
  return (
    <div className="grid grid-cols-2 gap-3" aria-label="Vida">
      {sides.map((side, index) => {
        const p = side[0]!;
        const hp = Math.max(0, p.score);
        const ratio = hp / maxHp;
        const low = hp > 0 && ratio <= LOW_HEALTH_RATIO;
        const lethal = duelOneHitFromDeath(state, p.uid);
        // Sin combo la racha no cambia el daño: no se muestra.
        const streak = state.config.duel?.combo === false ? 0 : (p.streak ?? 0);
        return (
          <div key={p.uid} className={cx(index === 1 && 'text-right')}>
            <p className={cx('flex items-center gap-1.5 text-xs font-semibold', index === 1 && 'justify-end')}>
              <span className="truncate">{label(side)}</span>
              <span className={cx('font-mono', low && 'text-accent')}>{hp}</span>
              {streak >= 2 && (
                <span key={streak} className="cell-pop bg-ink px-1.5 font-mono text-[10px] text-paper" title="Aciertos seguidos">
                  COMBO ×{streak}
                </span>
              )}
            </p>
            <div
              className={cx(
                'mt-1 flex h-3 border',
                index === 1 && 'justify-end',
                lethal ? 'animate-pulse border-accent ring-2 ring-accent' : low ? 'animate-pulse border-accent' : 'border-ink',
              )}
            >
              <div
                className={cx('h-full transition-[width] duration-500', ratio > 0.5 ? 'bg-ok' : ratio > LOW_HEALTH_RATIO ? 'bg-ink' : 'bg-accent')}
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
            {lethal && (
              <p className="mt-1 animate-pulse text-[11px] font-bold uppercase tracking-widest text-accent">☠ A un golpe</p>
            )}
          </div>
        );
      })}
    </div>
  );
});

/**
 * Avisos propios del duelo: sonido y destello al bajar de la mitad y del 30 % de vida,
 * viñeta roja con latido mientras estás a un golpe de perder, y sonido al encadenar combo.
 */
export const DuelAlerts = memo(function DuelAlerts({ state, uid }: { state: LiveState; uid: string }) {
  const me = state.participants[uid];
  const maxHp = state.config.duel?.hp ?? 100;
  const hp = Math.max(0, me?.score ?? 0);
  const ratio = hp / maxHp;
  const lethal = duelOneHitFromDeath(state, uid);
  const streak = state.config.duel?.combo === false ? 0 : (me?.streak ?? 0);
  const previous = useRef({ ratio, lethal, streak });
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    const before = previous.current;
    previous.current = { ratio, lethal, streak };
    if (lethal && !before.lethal) {
      playCue('danger');
      setFlash((n) => n + 1);
    } else if ((before.ratio > 0.5 && ratio <= 0.5) || (before.ratio > LOW_HEALTH_RATIO && ratio <= LOW_HEALTH_RATIO)) {
      playCue('lowHealth');
      setFlash((n) => n + 1);
    }
    if (streak >= 2 && streak > before.streak) playCue('combo');
  }, [ratio, lethal, streak]);

  // Latido periódico mientras dure el peligro.
  useEffect(() => {
    if (!lethal) return;
    const id = window.setInterval(() => playCue('danger'), 2500);
    return () => window.clearInterval(id);
  }, [lethal]);

  return (
    <>
      {flash > 0 && (
        <div key={flash} aria-hidden className="damage-flash pointer-events-none fixed inset-0 z-30 bg-accent/25" />
      )}
      {lethal && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-30 animate-pulse"
          style={{ boxShadow: 'inset 0 0 90px 25px color-mix(in srgb, var(--accent) 55%, transparent)' }}
        />
      )}
      <p className="sr-only" aria-live="assertive">
        {lethal ? 'Estás a un golpe de perder.' : ratio <= LOW_HEALTH_RATIO ? 'Vida baja.' : ''}
      </p>
    </>
  );
});

// ---------- Pausa entre cripticos ----------

/** Cuenta los segundos hasta que abre el siguiente criptico (con tic por segundo). */
export const NextCountdown = memo(function NextCountdown({
  opensAt,
  offsetMs,
  label = 'Siguiente criptico en',
}: {
  opensAt: number;
  offsetMs: number;
  label?: string;
}) {
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
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">{label}</p>
      <p key={seconds} className="font-display text-5xl fade-in">
        {seconds}
      </p>
    </div>
  );
});
