import { describe, expect, it } from 'vitest';
import { niceTicks, timeTicks } from './chartScale';

describe('niceTicks', () => {
  it('cubre el rango con pasos redondos', () => {
    const ticks = niceTicks(1187, 1263);
    expect(ticks[0]).toBeLessThanOrEqual(1187);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(1263);
    const step = ticks[1]! - ticks[0]!;
    expect([10, 20, 25, 50]).toContain(step);
    ticks.forEach((t) => expect(t % step).toBe(0));
  });

  it('abre margen en una serie plana', () => {
    const ticks = niceTicks(1200, 1200);
    expect(ticks[0]).toBeLessThan(1200);
    expect(ticks.at(-1)).toBeGreaterThan(1200);
  });
});

describe('timeTicks', () => {
  it('usa horas dentro del mismo día y fechas en rangos largos', () => {
    const start = new Date(2026, 10, 6, 10, 0).getTime();
    const sameDay = timeTicks(start, start + 3 * 3_600_000);
    expect(sameDay[0]!.label).toMatch(/\d{1,2}:\d{2}/);
    const weeks = timeTicks(start, start + 20 * 86_400_000);
    expect(weeks[0]!.label).not.toMatch(/:/);
    expect(weeks.length).toBeGreaterThanOrEqual(2);
  });

  it('no repite etiquetas', () => {
    const start = new Date(2026, 10, 1).getTime();
    const labels = timeTicks(start, start + 2.5 * 86_400_000, 6).map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
