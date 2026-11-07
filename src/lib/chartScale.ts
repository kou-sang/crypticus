// Escalas para gráficos SVG simples: marcas "redondas" en el eje Y y marcas de fecha en el eje X.

const NICE_STEPS = [1, 2, 2.5, 5, 10];
const DAY_MS = 86_400_000;

/** Marcas equiespaciadas y redondas que cubren [min, max]. Devuelve al menos dos valores. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (hi - lo < 1e-9) {
    // Serie plana: se abre un margen para que la línea no quede pegada a un borde.
    lo -= 10;
    hi += 10;
  }
  const rough = (hi - lo) / Math.max(1, target - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = (NICE_STEPS.find((s) => s * magnitude >= rough) ?? 10) * magnitude;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks.length >= 2 ? ticks : [start, start + step];
}

export interface DayTick {
  day: number; // Índice de día (ver `dayIndex`).
  label: string;
}

const DAY_FORMAT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const DAY_YEAR_FORMAT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: '2-digit' });

/**
 * Índice del día local de un instante: días enteros desde la época, en la zona horaria del navegador.
 * Se calcula con la fecha local (no dividiendo ms) para que los cambios de horario no partan un día.
 */
export function dayIndex(at: number): number {
  const date = new Date(at);
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

/** Mediodía local del día `day`: sirve para formatear la fecha sin depender de la hora. */
export function dayToDate(day: number): Date {
  const utc = new Date(day * DAY_MS);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 12);
}

/** «7 nov»; si el rango cruza de año, «7 nov 26». */
export function dayLabel(day: number, withYear = false): string {
  return (withYear ? DAY_YEAR_FORMAT : DAY_FORMAT).format(dayToDate(day));
}

/** Hasta `count` marcas en días enteros entre `first` y `last` (inclusive), sin repetir. */
export function dayTicks(first: number, last: number, count = 5): DayTick[] {
  const lo = Math.min(first, last);
  const hi = Math.max(first, last);
  const withYear = dayToDate(lo).getFullYear() !== dayToDate(hi).getFullYear();
  const span = hi - lo;
  const steps = Math.max(1, Math.min(count - 1, span));
  const ticks: DayTick[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const day = lo + Math.round((span * i) / steps);
    if (ticks.at(-1)?.day !== day) ticks.push({ day, label: dayLabel(day, withYear) });
  }
  return ticks;
}
