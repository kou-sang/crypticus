import { describe, expect, it } from 'vitest';
import { byFreshness, kindWeightedOrder, mergeLastSeen, selectCryptics, spreadByKind } from './selection';

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

describe('spreadByKind', () => {
  const kinds: Record<string, string> = { a1: 'ana', a2: 'ana', a3: 'ana', c1: 'cont', c2: 'cont', h1: 'hom', d1: 'dd', d2: 'dd' };
  const kindOf = (id: string) => kinds[id];

  // Generador determinista para recorrer muchas semillas.
  const seeded = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };

  it('nunca pone dos del mismo tipo seguidos cuando es posible', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const order = spreadByKind(Object.keys(kinds), kindOf, seeded(seed));
      expect(order).toHaveLength(8);
      expect(new Set(order).size).toBe(8);
      for (let i = 1; i < order.length; i++) expect(kindOf(order[i]!)).not.toBe(kindOf(order[i - 1]!));
    }
  });

  it('sigue siendo aleatorio: el primer elemento varía según la semilla', () => {
    const firsts = new Set(Array.from({ length: 50 }, (_, seed) => spreadByKind(Object.keys(kinds), kindOf, seeded(seed + 1))[0]));
    expect(firsts.size).toBeGreaterThan(3);
  });

  it('acepta repeticiones solo si no queda otro tipo', () => {
    const order = spreadByKind(['a1', 'a2', 'a3', 'c1'], kindOf, seeded(7));
    expect(order).toHaveLength(4);
    expect(kindOf(order[0]!)).toBe('ana');
  });

  it('respeta el tipo anterior al encadenar bloques', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const order = spreadByKind(['a1', 'c1'], kindOf, seeded(seed), 'ana');
      expect(order[0]).toBe('c1');
    }
  });

  it('sin tipos conocidos se comporta como un barajado normal', () => {
    const order = spreadByKind(['x', 'y', 'z'], () => undefined, seeded(3));
    expect([...order].sort()).toEqual(['x', 'y', 'z']);
  });

  it('selectCryptics reparte tipos también en orden progresivo', () => {
    const tiers = { easy: ['a1', 'a2', 'c1', 'h1'], medium: ['a3', 'c2', 'd1', 'd2'], hard: [] };
    for (let seed = 1; seed <= 100; seed++) {
      const { crypticIds } = selectCryptics({
        byTier: tiers,
        lastSeen: new Map(),
        flow: 'free',
        tierMix: 'progressive',
        count: 8,
        kindOf,
        random: seeded(seed),
      });
      for (let i = 1; i < crypticIds.length; i++) expect(kindOf(crypticIds[i]!)).not.toBe(kindOf(crypticIds[i - 1]!));
    }
  });
});

describe('kindWeightedOrder (v1.9)', () => {
  it('reparte por peso de tipo y, dentro de cada tipo, primero los no vistos', () => {
    const ids = [...Array.from({ length: 50 }, (_, i) => `a${i}`), ...Array.from({ length: 50 }, (_, i) => `b${i}`)];
    const kindOf = (id: string) => (id.startsWith('a') ? 'anagrama' : 'charada');
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const order = kindWeightedOrder(ids, kindOf, { anagrama: 9, charada: 1 }, new Map([['a0', 5]]), random);
    expect(order).toHaveLength(100);
    const firstTen = order.slice(0, 10).filter((id) => id.startsWith('a')).length;
    expect(firstTen).toBeGreaterThanOrEqual(7);
    expect(order.filter((id) => id.startsWith('a')).pop()).toBe('a0'); // El visto, último de su tipo.
  });
});
