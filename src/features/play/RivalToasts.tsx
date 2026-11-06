// Notificaciones a la derecha cuando un rival acierta, abre cuenta atrás o cura al jefe.
import { useEffect, useRef, useState, memo } from 'react';
import type { GameEvent, LiveState } from '../../../shared/engine';
import { DIFFICULTY_LABELS } from '../../../shared/scoring';
import { playCue } from '../../lib/sound';
import { cx } from '../../lib/utils';

interface Toast {
  id: string;
  title: string;
  detail: string;
  tone: 'rival' | 'warn' | 'heal';
}

const TOAST_MS = 3_800;

function toToast(event: GameEvent, state: LiveState): Toast | null {
  const name = event.uid ? (state.participants[event.uid]?.displayName ?? 'Un rival') : 'Un rival';
  const id = `${event.at}-${event.kind}-${event.uid ?? ''}`;
  const hidden = state.config.hideScoreboard;
  switch (event.kind) {
    case 'damage':
      return { id, title: `${name} acertó primero`, detail: `Te quitó ${event.points} de vida`, tone: 'rival' };
    case 'eliminated':
      return { id, title: `${name} se quedó sin tiempo`, detail: 'Eliminado', tone: 'warn' };
    case 'solve': {
      if (state.config.royale) return { id, title: `${name} acertó`, detail: `+${event.seconds ?? 0}s a su reloj`, tone: 'rival' };
      const tier = event.tier ? DIFFICULTY_LABELS[event.tier].toLowerCase() : '';
      const detail = state.boss ? `Golpeó al jefe (−${event.points})` : hidden ? `Resolvió uno ${tier}` : `Uno ${tier} · +${event.points}`;
      return { id, title: `${name} acertó`, detail, tone: 'rival' };
    }
    case 'countdown':
      return { id, title: `${name} acertó primero`, detail: `Tienes ${event.seconds}s para acertar`, tone: 'warn' };
    case 'heal':
      return { id, title: `${name} falló`, detail: `El jefe se cura +${event.points}`, tone: 'heal' };
    default:
      return null;
  }
}

export const RivalToasts = memo(function RivalToasts({ state, uid }: { state: LiveState; uid: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<number>(Date.now()); // Solo eventos posteriores al montaje.
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  useEffect(() => {
    const fresh = state.events.filter((e) => e.at > seen.current && e.uid !== undefined && e.uid !== uid);
    if (fresh.length === 0) return;
    seen.current = Math.max(...state.events.map((e) => e.at));
    const next = fresh.map((e) => toToast(e, state)).filter((t): t is Toast => t !== null);
    if (next.length === 0) return;
    const kinds = new Set(fresh.map((e) => e.kind));
    playCue(kinds.has('damage') ? 'hit' : kinds.has('eliminated') ? 'eliminated' : next.some((t) => t.tone === 'heal') ? 'heal' : 'rival');
    setToasts((prev) => [...prev, ...next].slice(-4));
    const ids = next.map((t) => t.id);
    // Sin cleanup por render: el estado cambia seguido y cancelaría el cierre del toast.
    timers.current.push(window.setTimeout(() => setToasts((prev) => prev.filter((t) => !ids.includes(t.id))), TOAST_MS));
  }, [state, uid]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-20 z-40 flex w-72 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(
            'toast-in border-l-4 bg-paper px-4 py-3 shadow-[4px_4px_0_var(--ink)] ring-1 ring-ink',
            toast.tone === 'rival' && 'border-accent',
            toast.tone === 'warn' && 'border-ink',
            toast.tone === 'heal' && 'border-ok',
          )}
        >
          <p className="text-sm font-semibold">{toast.title}</p>
          <p className="text-xs text-muted">{toast.detail}</p>
        </div>
      ))}
    </div>
  );
});
