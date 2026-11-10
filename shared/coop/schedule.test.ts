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

  it('reparto por número de ronda', () => {
    expect(tierShares(5)).toEqual({ easy: 0.6, medium: 0.4 });
    expect(tierShares(6)).toEqual({ easy: 0.2, medium: 0.5, hard: 0.3 });
    expect(tierShares(20)).toEqual({ medium: 0.6, hard: 0.4 });
    expect(tierShares(31)).toEqual({ hard: 0.2, veryHard2: 0.5, veryHard3: 0.3 });
  });

  it('la dificultad sorteada es determinista y respeta el reparto', () => {
    expect(drawTier(7, 3, 'a', 0, 'normal')).toBe(drawTier(7, 3, 'a', 0, 'normal'));
    const tiers = new Set(Array.from({ length: 200 }, (_, i) => drawTier(7, 3, `p${i}`, 0, 'normal')));
    expect([...tiers].sort()).toEqual(['easy', 'medium']);
  });

  it('ronda difícil: medio o difícil hasta la 10; difícil o muy difícil desde la 11', () => {
    expect(hardTierShares(3)).toEqual({ medium: 0.5, hard: 0.5 });
    expect(hardTierShares(10)).toEqual({ medium: 0.5, hard: 0.5 });
    expect(hardTierShares(11)).toEqual({ hard: 0.6, veryHard2: 0.4 });
    const early = new Set(Array.from({ length: 200 }, (_, i) => drawTier(7, 3, `p${i}`, 0, 'hard')));
    expect([...early].sort()).toEqual(['hard', 'medium']);
    const late = new Set(Array.from({ length: 200 }, (_, i) => drawTier(7, 14, `p${i}`, 0, 'hard')));
    expect([...late].sort()).toEqual(['hard', 'veryHard2']);
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
