// Relojes autónomos: son los únicos componentes de la sala que se re-renderizan con el paso del tiempo.
import { memo } from 'react';
import { useNow } from '../../hooks/useNow';
import { cx, formatClock } from '../../lib/utils';

export const GameClock = memo(function GameClock({ deadline, offsetMs }: { deadline: number; offsetMs: number }) {
  const remaining = deadline - (useNow(250) + offsetMs);
  return (
    <div className={cx('font-mono text-3xl font-semibold tabular-nums md:text-4xl', remaining < 30_000 && 'text-accent')}>
      {formatClock(remaining)}
    </div>
  );
});

/** Siempre 3-2-1: el servidor da margen extra, que se muestra como "Preparados". */
export const StartCountdown = memo(function StartCountdown({ startedAt, offsetMs }: { startedAt: number; offsetMs: number }) {
  const remaining = startedAt - (useNow(100) + offsetMs);
  const seconds = Math.max(1, Math.ceil(remaining / 1000));
  return (
    <div className="flex min-h-[40dvh] flex-col items-center justify-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">{seconds > 3 ? 'Preparados' : 'Comienza en'}</p>
      <p key={seconds > 3 ? 'ready' : seconds} className="font-display text-9xl fade-in">
        {seconds > 3 ? '…' : seconds}
      </p>
    </div>
  );
});
