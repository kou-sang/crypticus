import { describe, expect, it } from 'vitest';
import {
  comebackFactor,
  duelComboMultiplier,
  computeBossDamage,
  computeRatingDeltas,
  computeSolvePoints,
  DEFAULT_CONFIG,
  gapRatio,
  parseDifficulty,
  rankParticipants,
  validateConfig,
} from './scoring';
import { makeParticipant } from './testUtils';

const solve = (overrides: Partial<Parameters<typeof computeSolvePoints>[0]> = {}) =>
  computeSolvePoints({
    tier: 'easy',
    comeback: 'off',
    score: 0,
    leaderScore: 0,
    ...overrides,
  });

describe('computeSolvePoints', () => {
  it('escala con la dificultad', () => {
    expect(solve({ tier: 'easy' })).toBe(100);
    expect(solve({ tier: 'medium' })).toBe(150);
    expect(solve({ tier: 'hard' })).toBe(200);
  });

  it('remontada: suave 1 + brecha, fuerte 1 + 2·brecha, igual en cualquier dificultad', () => {
    // Fuerte sin puntos frente a un líder => ×3
    expect(solve({ tier: 'hard', comeback: 'high', score: 0, leaderScore: 400 })).toBe(600);
    // Mitad del líder: fuerte ×2, suave ×1.5
    expect(solve({ tier: 'hard', comeback: 'high', score: 200, leaderScore: 400 })).toBe(400);
    expect(solve({ tier: 'hard', comeback: 'low', score: 200, leaderScore: 400 })).toBe(300);
    // El líder no recibe bonus
    expect(solve({ tier: 'hard', comeback: 'high', score: 400, leaderScore: 400 })).toBe(200);
    // También los fáciles
    expect(solve({ tier: 'easy', comeback: 'low', score: 0, leaderScore: 400 })).toBe(200);
  });

  it('gapRatio y comebackFactor', () => {
    expect(gapRatio(100, 400)).toBe(0.75);
    expect(gapRatio(500, 400)).toBe(0);
    expect(comebackFactor('low', 0, 100)).toBe(2);
    expect(comebackFactor('high', 75, 100)).toBe(1.5);
    expect(comebackFactor('off', 0, 100)).toBe(1);
  });
});

describe('computeBossDamage', () => {
  it('proporcional al tiempo restante con mínimo del 10 %', () => {
    expect(computeBossDamage('hard', 1)).toBe(200);
    expect(computeBossDamage('hard', 0.5)).toBe(100);
    expect(computeBossDamage('easy', 0)).toBe(10);
  });
});

describe('rankParticipants', () => {
  it('desempata por pistas y luego por tiempo', () => {
    const ranked = rankParticipants([
      makeParticipant({ uid: 'slow', score: 100, lastSolvedAt: 50 }),
      makeParticipant({ uid: 'hinty', score: 100, hintsUsed: 2, lastSolvedAt: 10 }),
      makeParticipant({ uid: 'fast', score: 100, lastSolvedAt: 20 }),
      makeParticipant({ uid: 'top', score: 200 }),
    ]);
    expect(ranked.map((p) => p.uid)).toEqual(['top', 'fast', 'slow', 'hinty']);
  });

  it('métrica por resueltos', () => {
    const ranked = rankParticipants(
      [makeParticipant({ uid: 'points', score: 900, solvedIds: ['a'] }), makeParticipant({ uid: 'many', score: 200, solvedIds: ['a', 'b'] })],
      'solved',
    );
    expect(ranked[0]?.uid).toBe('many');
  });

  it('empates exactos comparten posición', () => {
    const ranked = rankParticipants([
      makeParticipant({ uid: 'a', score: 50, joinedAt: 1 }),
      makeParticipant({ uid: 'b', score: 50, joinedAt: 2 }),
      makeParticipant({ uid: 'c', score: 10 }),
    ]);
    expect(ranked.map((p) => p.rank)).toEqual([1, 1, 3]);
  });
});

describe('computeRatingDeltas', () => {
  it('suma cero con ratings iguales', () => {
    const ranked = rankParticipants([makeParticipant({ uid: 'a', score: 2 }), makeParticipant({ uid: 'b', score: 1 })]);
    expect(computeRatingDeltas(ranked, { a: 1200, b: 1200 })).toEqual({ a: 16, b: -16 });
  });
});

describe('validateConfig', () => {
  it('acepta la configuración por defecto', () => {
    expect(validateConfig(DEFAULT_CONFIG, 8)).toEqual([]);
  });
  it('rechaza combinaciones inválidas', () => {
    expect(validateConfig({ ...DEFAULT_CONFIG, mode: 'boss', winByTwo: true }, 4).length).toBeGreaterThan(0);
    expect(validateConfig({ ...DEFAULT_CONFIG, difficultyVote: true, flow: 'free' }, 4).length).toBeGreaterThan(0);
    expect(validateConfig({ ...DEFAULT_CONFIG, maxHintsPerClue: 11 }, 4).length).toBeGreaterThan(0);
  });
});

describe('parseDifficulty', () => {
  it('acepta etiquetas en español, inglés y números', () => {
    expect(parseDifficulty('Fácil')).toBe('easy');
    expect(parseDifficulty('medio')).toBe('medium');
    expect(parseDifficulty('DIFICIL')).toBe('hard');
    expect(parseDifficulty(5)).toBe('hard');
    expect(parseDifficulty(undefined)).toBe('medium');
    expect(parseDifficulty('rarísimo')).toBeNull();
  });
});

describe('duelComboMultiplier', () => {
  it('tabla de combo: ×1 0 %, ×2 15 %, ×3 30 %, ×4 50 %, ×5 80 %, ×6+ 110 %', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(duelComboMultiplier)).toEqual([1, 1.15, 1.3, 1.5, 1.8, 2.1, 2.1]);
    expect(duelComboMultiplier(0)).toBe(1);
  });
});
