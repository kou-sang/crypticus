// Serie diaria del Elo de un pool: una entrada por día local con el Elo al cierre, el cambio neto y los resultados.
import type { HistoryEntry } from '../../shared/types';
import type { RatingPool } from '../../shared/ratingPools';
import { dayIndex } from './chartScale';
import { entryPool } from './pools';

/** Resumen de un día: Elo al cierre, cambio neto y resultados. */
export interface DayPoint {
  day: number;
  elo: number;
  delta: number;
  games: number;
  wins: number;
  losses: number;
}

export function dailyPoints(history: HistoryEntry[], pool: RatingPool): DayPoint[] {
  const sorted = history.filter((h) => entryPool(h) === pool).sort((a, b) => a.finishedAt - b.finishedAt);
  const days: DayPoint[] = [];
  let previous: number | null = null;
  for (const entry of sorted) {
    const elo = entry.modeRatingAfter;
    if (typeof elo !== 'number') continue;
    const delta = entry.modeRatingDelta ?? (previous === null ? 0 : elo - previous);
    previous = elo;
    const day = dayIndex(entry.finishedAt);
    const outcome = entry.outcome ?? (entry.won ? 'win' : 'loss');
    let point = days.at(-1);
    if (point?.day !== day) {
      point = { day, elo, delta: 0, games: 0, wins: 0, losses: 0 };
      days.push(point);
    }
    point.elo = elo;
    point.delta += delta;
    point.games += 1;
    if (outcome === 'win') point.wins += 1;
    if (outcome === 'loss') point.losses += 1;
  }
  return days;
}
