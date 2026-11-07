// Relojes autónomos: son los únicos componentes de la sala que se re-renderizan con el paso del tiempo.
import { memo, useEffect, useRef } from 'react';
import { useNow } from '../../hooks/useNow';
import { cx, formatClock } from '../../lib/utils';
import { playCue } from '../../lib/sound';

/** Avisos del reloj de partida: alerta al quedar 1 minuto y 30 segundos; tic en los últimos 10. */
const ALERT_AT_SECONDS = [60, 30];
const TICK_FROM_SECONDS = 10;

export const GameClock = memo(function GameClock({ deadline, offsetMs }: { deadline: number; offsetMs: number }) {
  const remaining = deadline - (useNow(250) + offsetMs);
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const last = useRef<number | null>(null);

  // Un sonido por segundo como máximo; al montar a mitad de partida no se reproducen avisos ya pasados.
  useEffect(() => {
    const previous = last.current;
    last.current = seconds;
    if (previous === null || previous === seconds || seconds <= 0) return;
    if (ALERT_AT_SECONDS.some((mark) => previous > mark && seconds <= mark)) playCue('lowTime');
    else if (seconds <= TICK_FROM_SECONDS) playCue('tick');
  }, [seconds]);

  const urgent = seconds <= TICK_FROM_SECONDS;
  const low = remaining < 30_000;
  return (
    <div
      role="timer"
      aria-live={urgent ? 'assertive' : 'off'}
      className={cx('game-clock font-mono text-3xl font-semibold tabular-nums md:text-4xl', low && 'text-accent', urgent && 'is-urgent')}
    >
      {/* key = segundo: cada cambio reinicia la animación (pulso en los últimos 30 s). */}
      <span key={low ? seconds : 'steady'} className={cx('inline-block', low && 'clock-beat')}>
        {formatClock(remaining)}
      </span>
    </div>
  );
});

/** Siempre 3-2-1: el servidor da margen extra, que se muestra como "Preparados". */
export const StartCountdown = memo(function StartCountdown({ startedAt, offsetMs }: { startedAt: number; offsetMs: number }) {
  const remaining = startedAt - (useNow(100) + offsetMs);
  const seconds = Math.max(1, Math.ceil(remaining / 1000));
  const lastTick = useRef<number | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (seconds <= 3 && lastTick.current !== seconds) {
      lastTick.current = seconds;
      playCue('tick');
    }
  }, [seconds]);
  // "¡Ya!" justo antes de que la cuenta desaparezca (el componente se desmonta al empezar).
  useEffect(() => {
    if (!started.current && remaining <= 250) {
      started.current = true;
      playCue('go');
    }
  }, [remaining]);

  return (
    <div className="start-countdown flex min-h-[40dvh] flex-col items-center justify-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">{seconds > 3 ? 'Preparados' : 'Comienza en'}</p>
      <div className="relative flex items-center justify-center">
        {seconds <= 3 && <span key={`ring${seconds}`} aria-hidden className="count-ring absolute size-40 rounded-full border-4 border-accent" />}
        <p key={seconds > 3 ? 'ready' : seconds} className={cx('font-display text-9xl', seconds > 3 ? 'count-wait' : 'count-pop')}>
          {seconds > 3 ? '…' : seconds}
        </p>
      </div>
    </div>
  );
});
