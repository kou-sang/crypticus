import { describe, expect, it } from 'vitest';
import { drawTier, hardTierShares, roundDurationMs, roundKind, tierShares } from './schedule';
import { armorReduction, bossBaseDamage, partyFactor } from './balance';
import { chance, roll, shuffled } from './rng';

describe('roundKind', () => {
  it('sigue 2N, D, 2N, D, 3N, D, 4N, D… y luego D cada 5', () => {
    const kinds = Array.from({ length: 26 }, (_, i) => (roundKind(i + 1) === 'hard' ? 'D' : 'N')).join('');
    expect(kinds).toBe('NNDNNDNNNDNNNNDNNNDNNNNDNN');
    // La secuencia (2,2,3,4,3,4,5,4,5,5) suma 37 normales + 10 difíciles = 47 rondas; luego, una difícil cada 5.
    expect(roundKind(47)).toBe('hard');
    expect(roundKind(52)).toBe('normal');
    expect(roundKind(53)).toBe('hard');
  });
});

describe('duraciones y dificultad', () => {
  it('80 s / 30 s para Easy y −7 s / −3 s por categoría', () => {
    expect(roundDurationMs('normal', 'easy')).toBe(80_000);
    expect(roundDurationMs('normal', 'expert')).toBe(59_000);
    expect(roundDurationMs('hard', 'easy')).toBe(30_000);
    expect(roundDurationMs('hard', 'expert')).toBe(21_000);
  });

  it('reparto por número de ronda (v1.9)', () => {
    expect(tierShares(5)).toEqual({ easy: 0.6, medium: 0.4 });
    expect(tierShares(6)).toEqual({ easy: 0.4, medium: 0.4, hard: 0.2 });
    expect(tierShares(15)).toEqual({ easy: 0.2, medium: 0.4, hard: 0.4 });
    expect(tierShares(25)).toEqual({ medium: 0.4, hard: 0.6 });
    expect(tierShares(26)).toEqual({ medium: 0.2, hard: 0.5, veryHard: 0.3 });
    expect(tierShares(31)).toEqual({ medium: 0.15, hard: 0.43, veryHard: 0.42 });
  });

  it('la dificultad sorteada es determinista y respeta el reparto', () => {
    expect(drawTier(7, 3, 'a', 0, 'normal')).toBe(drawTier(7, 3, 'a', 0, 'normal'));
    const tiers = new Set(Array.from({ length: 200 }, (_, i) => drawTier(7, 3, `p${i}`, 0, 'normal')));
    expect([...tiers].sort()).toEqual(['easy', 'medium']);
  });

  it('la ronda difícil (grupal) usa la misma tabla que las individuales', () => {
    for (const round of [1, 6, 11, 16, 26, 31, 40]) expect(hardTierShares(round)).toEqual(tierShares(round));
    const late = new Set(Array.from({ length: 300 }, (_, i) => drawTier(7, 31, `p${i}`, 0, 'hard')));
    expect([...late].sort()).toEqual(['hard', 'medium', 'veryHard']);
  });
});

describe('fórmulas base', () => {
  it('factor party, daño base y armadura', () => {
    expect(partyFactor(4)).toBe(1.5);
    expect(partyFactor(8)).toBe(1);
    expect(bossBaseDamage('easy')).toBe(50);
    expect(bossBaseDamage('expert')).toBe(110);
    expect(armorReduction(100)).toBe(0.5);
    expect(armorReduction(0)).toBe(0);
  });

  it('el azar depende solo de la semilla y el contexto', () => {
    expect(roll(1, ['a', 2])).toBe(roll(1, ['a', 2]));
    expect(roll(1, ['a', 2])).not.toBe(roll(2, ['a', 2]));
    expect(chance(1, ['x'], 0)).toBe(false);
    expect(shuffled(3, ['s'], [1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});
