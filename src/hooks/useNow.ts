import { useEffect, useState } from 'react';

/** Reloj reactivo; `active=false` lo pausa para no re-renderizar en vano. */
export function useNow(intervalMs = 250, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

/**
 * `true` cuando el reloj (con desfase del servidor) alcanza `at`.
 * Usa un único setTimeout en lugar de un intervalo: cero renders hasta el momento exacto.
 */
export function useReached(at: number | null, offsetMs = 0): boolean {
  const target = at === null ? null : at - offsetMs; // momento en reloj local
  const [reached, setReached] = useState(() => target !== null && Date.now() >= target);
  useEffect(() => {
    if (target === null) {
      setReached(false);
      return;
    }
    const wait = target - Date.now();
    if (wait <= 0) {
      setReached(true);
      return;
    }
    setReached(false);
    const id = window.setTimeout(() => setReached(true), Math.min(wait, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [target]);
  return reached;
}
