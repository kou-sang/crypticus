import { describe, expect, it } from 'vitest';
import { RATING_POOLS, categoryOfPool, isRoyalePool, ratingPoolOf, royaleCategory } from './ratingPools';

describe('royaleCategory', () => {
  it('clasifica por minutos iniciales, con límites inclusivos', () => {
    expect(royaleCategory(30)).toBe('hyperbullet');
    expect(royaleCategory(60)).toBe('hyperbullet');
    expect(royaleCategory(61)).toBe('bullet');
    expect(royaleCategory(120)).toBe('bullet');
    expect(royaleCategory(180)).toBe('rapid');
    expect(royaleCategory(30 * 60)).toBe('rapid');
  });
});

describe('ratingPoolOf', () => {
  it('Race y Duel tienen un pool; Royale depende del tiempo; COOP tiene el suyo', () => {
    expect(ratingPoolOf('race')).toBe('race');
    expect(ratingPoolOf('duel')).toBe('duel');
    expect(ratingPoolOf('royale', { baseSec: 120 })).toBe('royale_bullet');
    expect(ratingPoolOf('royale', { baseSec: 60 })).toBe('royale_hyperbullet');
    expect(ratingPoolOf('royale')).toBeNull();
    expect(ratingPoolOf('coop')).toBe('coop');
    expect(ratingPoolOf(undefined)).toBeNull();
  });

  it('todos los pools de Royale se reconocen', () => {
    const royale = RATING_POOLS.filter(isRoyalePool);
    expect(royale.map(categoryOfPool)).toEqual(['hyperbullet', 'bullet', 'rapid']);
  });
});
