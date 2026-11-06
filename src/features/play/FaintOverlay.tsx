// Efecto "desmayo": tras el acierto de un rival, la pantalla se oscurece desde los bordes hasta el cierre.
import { useEffect, useRef } from 'react';
import { playCue } from '../../lib/sound';

export function FaintOverlay({ closesAt, totalMs, now }: { closesAt: number; totalMs: number; now: number }) {
  const remaining = Math.max(0, closesAt - now);
  const progress = totalMs > 0 ? Math.min(1, 1 - remaining / totalMs) : 1;
  const seconds = Math.ceil(remaining / 1000);
  const lastTick = useRef<number | null>(null);

  // Tic en los últimos 5 segundos.
  useEffect(() => {
    if (seconds > 0 && seconds <= 5 && lastTick.current !== seconds) {
      lastTick.current = seconds;
      playCue('tick');
    }
  }, [seconds]);

  // El centro libre se encoge de 80 % a 12 % y el borde se vuelve casi negro.
  const clear = 80 - progress * 68;
  const darkness = 0.25 + progress * 0.7;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-30">
      <div
        className="absolute inset-0 transition-[background] duration-200"
        style={{ background: `radial-gradient(ellipse at center, transparent ${clear}%, rgba(0,0,0,${darkness}) 100%)` }}
      />
      <div className="absolute left-1/2 top-20 -translate-x-1/2 bg-ink px-4 py-1 font-mono text-2xl font-semibold text-paper tabular-nums">
        {seconds}s
      </div>
    </div>
  );
}
