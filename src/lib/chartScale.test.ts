import { describe, expect, it } from 'vitest';
import { dayIndex, dayTicks, dayToDate, niceTicks } from './chartScale';

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

describe('dayIndex', () => {
  it('agrupa por día local, sin importar la hora', () => {
    const morning = new Date(2026, 10, 6, 0, 5).getTime();
    const night = new Date(2026, 10, 6, 23, 55).getTime();
    expect(dayIndex(morning)).toBe(dayIndex(night));
    expect(dayIndex(new Date(2026, 10, 7, 0, 1).getTime())).toBe(dayIndex(night) + 1);
  });

  it('ida y vuelta con dayToDate', () => {
    const day = dayIndex(new Date(2026, 2, 29, 15).getTime());
    const date = dayToDate(day);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 2, 29]);
  });
});

describe('dayTicks', () => {
  it('marca días enteros sin repetir y respeta los extremos', () => {
    const first = dayIndex(new Date(2026, 9, 1).getTime());
    const ticks = dayTicks(first, first + 30, 5);
    expect(ticks[0]!.day).toBe(first);
    expect(ticks.at(-1)!.day).toBe(first + 30);
    expect(ticks.length).toBe(5);
    expect(ticks[0]!.label).not.toMatch(/:/);
  });

  it('no inventa marcas cuando hay pocos días', () => {
    const first = dayIndex(new Date(2026, 10, 6).getTime());
    expect(dayTicks(first, first + 2, 5).map((t) => t.day)).toEqual([first, first + 1, first + 2]);
    expect(dayTicks(first, first, 5)).toHaveLength(1);
  });

  it('agrega el año si el rango lo cruza', () => {
    const first = dayIndex(new Date(2025, 11, 20).getTime());
    expect(dayTicks(first, first + 20, 3)[0]!.label).toMatch(/25/);
  });
});
