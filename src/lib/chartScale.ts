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

export interface TimeTick {
  at: number;
  label: string;
}

const DAY_FORMAT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const HOUR_FORMAT = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });

/** Formato según el rango: horas si todo ocurrió en menos de dos días, fechas si no. */
export function timeLabel(at: number, spanMs: number): string {
  return spanMs < 2 * DAY_MS ? HOUR_FORMAT.format(at) : DAY_FORMAT.format(at);
}

/** Hasta `count` marcas repartidas entre el primer y el último instante, sin etiquetas repetidas. */
export function timeTicks(start: number, end: number, count = 4): TimeTick[] {
  const span = Math.max(0, end - start);
  if (span === 0) return [{ at: start, label: timeLabel(start, 0) }];
  const ticks: TimeTick[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = start + (span * i) / (count - 1);
    const label = timeLabel(at, span);
    if (ticks.at(-1)?.label !== label) ticks.push({ at, label });
  }
  return ticks;
}
