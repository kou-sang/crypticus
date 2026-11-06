import { describe, expect, it } from 'vitest';
import { byFreshness, mergeLastSeen, selectCryptics } from './selection';

const byTier = { easy: ['e1', 'e2', 'e3'], medium: ['m1', 'm2', 'm3'], hard: ['h1', 'h2', 'h3'] };
const fixed = () => 0;

describe('byFreshness', () => {
  it('pone primero los no vistos y luego los más antiguos', () => {
    const seen = new Map([
      ['e1', 300],
      ['e2', 100],
    ]);
    const order = byFreshness(['e1', 'e2', 'e3'], seen, fixed);
    expect(order[0]).toBe('e3');
    expect(order.slice(1)).toEqual(['e2', 'e1']);
  });
});

describe('mergeLastSeen', () => {
  it('se queda con la vista más reciente entre jugadores', () => {
    const merged = mergeLastSeen([{ a: 5, b: 1 }, { a: 2, c: 9 }, undefined]);
    expect(merged.get('a')).toBe(5);
    expect(merged.get('c')).toBe(9);
  });
});

describe('selectCryptics', () => {
  it('flujo libre progresivo: no repite vistos mientras haya nuevos', () => {
    const lastSeen = new Map([
      ['e1', 1],
      ['m1', 1],
      ['h1', 1],
    ]);
    const { crypticIds } = selectCryptics({ byTier, lastSeen, flow: 'free', tierMix: 'progressive', count: 6, random: fixed });
    expect(crypticIds).toHaveLength(6);
    expect(crypticIds.includes('e1') || crypticIds.includes('m1') || crypticIds.includes('h1')).toBe(false);
    expect(crypticIds[0]!.startsWith('e')).toBe(true);
    expect(crypticIds[5]!.startsWith('h')).toBe(true);
  });

  it('si se agotan los nuevos, repite los más antiguos', () => {
    const lastSeen = new Map(['e1', 'e2', 'e3'].map((id, i) => [id, i + 1] as const));
    const { pool } = selectCryptics({ byTier, lastSeen, flow: 'rounds', tierMix: 'balanced', count: 2, random: fixed });
    expect(pool.easy).toEqual(['e1', 'e2']);
  });

  it('completa con otras dificultades si falta una', () => {
    const { crypticIds } = selectCryptics({
      byTier: { easy: ['e1'], medium: ['m1', 'm2', 'm3'], hard: [] },
      lastSeen: new Map(),
      flow: 'free',
      tierMix: 'balanced',
      count: 4,
      random: fixed,
    });
    expect(crypticIds).toHaveLength(4);
  });
});
