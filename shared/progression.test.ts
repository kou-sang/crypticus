import { describe, expect, it } from 'vitest';
import { buildConfig, DEFAULT_MODE_SETTINGS, ROYALE_TIER_COUNTS } from './gameModes';
import { duelStarts, raceStarts, ROYALE_STARTS, startsFor, tierAt, tierCountsFor, votableTiers } from './progression';

const tiers = (starts: Parameters<typeof tierAt>[0], to: number) => Array.from({ length: to }, (_, i) => tierAt(starts, i + 1));

describe('progresión de dificultad (v1.9)', () => {
  it('Royale: fácil 1–12, medio 13–25, difícil 26–35, muy difícil 36+', () => {
    expect(ROYALE_TIER_COUNTS).toEqual({ easy: 12, medium: 13, hard: 10, veryHard: 25 });
    expect([12, 13, 25, 26, 35, 36].map((n) => tierAt(ROYALE_STARTS, n))).toEqual(['easy', 'medium', 'medium', 'hard', 'hard', 'veryHard']);
  });

  it('Race según la meta', () => {
    expect(tiers(raceStarts(3), 9)).toEqual(['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard', 'veryHard']);
    expect([3, 4, 7, 8, 11, 12].map((n) => tierAt(raceStarts(5), n))).toEqual(['easy', 'medium', 'medium', 'hard', 'hard', 'veryHard']);
    expect([4, 5, 8, 9, 12, 13].map((n) => tierAt(raceStarts(7), n))).toEqual(['easy', 'medium', 'medium', 'hard', 'hard', 'veryHard']);
    expect([5, 6, 10, 11, 16, 17].map((n) => tierAt(raceStarts(10), n))).toEqual(['easy', 'medium', 'medium', 'hard', 'hard', 'veryHard']);
  });

  it('metas personalizadas: tabla cercana o la de 10 escalada', () => {
    expect(raceStarts(1)).toEqual(raceStarts(3));
    expect(raceStarts(6)).toEqual(raceStarts(5));
    expect(raceStarts(20)).toEqual([12, 22, 34]);
  });

  it('Duel según la vida', () => {
    expect(duelStarts(150)).toEqual([4, 6, 9]);
    expect(duelStarts(500)).toEqual([10, 18, 27]);
    expect(duelStarts(250)).toEqual(duelStarts(200)); // Fuera de las opciones: la más cercana por debajo.
  });

  it('lista de Race Pacífico con la progresión de su meta', () => {
    const { config, clueCount } = buildConfig({ ...DEFAULT_MODE_SETTINGS, race: { ...DEFAULT_MODE_SETTINGS.race, intensity: 'peaceful', target: 5 } });
    expect(config.tierMix).toBe('progressive');
    expect(tierCountsFor(startsFor(config)!, clueCount)).toEqual({ easy: 3, medium: 4, hard: 4, veryHard: 19 });
  });

  it('la votación solo ofrece lo ya habilitado', () => {
    const starts = raceStarts(5);
    expect(votableTiers(starts, 1)).toEqual(['easy']);
    expect(votableTiers(starts, 8)).toEqual(['easy', 'medium', 'hard']);
    expect(votableTiers(null, 1)).toEqual(['easy', 'medium', 'hard', 'veryHard']);
  });

  it('COOP no tiene progresión por lista', () => {
    expect(startsFor({ game: 'coop', targetCount: 0 })).toBeNull();
  });
});
