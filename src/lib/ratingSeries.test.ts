import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../../shared/types';
import { dailyPoints } from './ratingSeries';

function entry(at: Date, partial: Partial<HistoryEntry>): HistoryEntry {
  return {
    competitionId: `c${at.getTime()}`,
    title: 'Sala',
    mode: 'timed',
    flow: 'free',
    finishedAt: at.getTime(),
    rank: 1,
    players: 2,
    score: 0,
    solved: 0,
    hintsUsed: 0,
    won: true,
    endReason: null,
    ratingDelta: 0,
    ...partial,
  };
}

describe('dailyPoints', () => {
  const history = [
    entry(new Date(2026, 10, 5, 22), { game: 'race', modeRatingAfter: 1210, modeRatingDelta: 10, outcome: 'win' }),
    entry(new Date(2026, 10, 6, 9), { game: 'race', modeRatingAfter: 1200, modeRatingDelta: -10, outcome: 'loss', won: false }),
    entry(new Date(2026, 10, 6, 23), { game: 'race', modeRatingAfter: 1225, modeRatingDelta: 25, outcome: 'win' }),
    entry(new Date(2026, 10, 6, 12), { game: 'duel', modeRatingAfter: 1300, modeRatingDelta: 5 }),
    entry(new Date(2026, 10, 6, 13), { game: 'royale', royale: { baseSec: 120, incrementSec: 5 }, modeRatingAfter: 1190, modeRatingDelta: -10 }),
  ];

  it('un punto por día con el Elo al cierre y el cambio neto', () => {
    const points = dailyPoints(history, 'race');
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ elo: 1210, delta: 10, games: 1, wins: 1, losses: 0 });
    expect(points[1]).toMatchObject({ elo: 1225, delta: 15, games: 2, wins: 1, losses: 1 });
    expect(points[1]!.day - points[0]!.day).toBe(1);
  });

  it('separa Royale por categoría de tiempo', () => {
    expect(dailyPoints(history, 'royale_bullet')).toHaveLength(1);
    expect(dailyPoints(history, 'royale_rapid')).toHaveLength(0);
  });
});
