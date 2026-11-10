// Calendario de rondas COOP: tipo de cada ronda, duración y dificultad de sus cripticos. Funciones puras.
import {
  DEAD_TIERS,
  HARD_ROUND_MS_EASY,
  HARD_ROUND_MS_STEP,
  HARD_ROUND_TIERS,
  NORMAL_ROUND_MS_EASY,
  NORMAL_ROUND_MS_STEP,
  NORMAL_RUN_AFTER,
  NORMAL_RUNS,
  TIER_TABLE,
  categoryIndex,
  type BossCategory,
  type CoopTier,
} from './balance';
import { pickWeighted } from './rng';
import type { RoundKind } from './state';

/** Tipo de la ronda `roundNumber` (desde 1): 2N, D, 2N, D, 3N, D… La secuencia sigue entre jefes. */
export function roundKind(roundNumber: number): RoundKind {
  if (!Number.isInteger(roundNumber) || roundNumber < 1) throw new Error(`Ronda inválida: ${roundNumber}`);
  let remaining = roundNumber;
  for (let block = 0; ; block += 1) {
    const normals = NORMAL_RUNS[block] ?? NORMAL_RUN_AFTER;
    if (remaining <= normals) return 'normal';
    if (remaining === normals + 1) return 'hard';
    remaining -= normals + 1;
  }
}

export function roundDurationMs(kind: RoundKind, category: BossCategory): number {
  const step = categoryIndex(category);
  return kind === 'normal' ? NORMAL_ROUND_MS_EASY - NORMAL_ROUND_MS_STEP * step : HARD_ROUND_MS_EASY - HARD_ROUND_MS_STEP * step;
}

/** Reparto de dificultad de una ronda normal según su número. */
export function tierShares(roundNumber: number): Partial<Record<CoopTier, number>> {
  let shares = TIER_TABLE[0]!.shares;
  for (const row of TIER_TABLE) if (roundNumber >= row.from) shares = row.shares;
  return shares;
}

export type AssignmentRole = 'normal' | 'hard' | 'dead';

/** Dificultad de un criptico asignado (determinista por semilla, ronda, jugador y casilla). */
export function drawTier(seed: number, roundNumber: number, playerId: string, slot: number, role: AssignmentRole): CoopTier {
  const shares = role === 'dead' ? DEAD_TIERS : role === 'hard' ? HARD_ROUND_TIERS : tierShares(roundNumber);
  const options = Object.entries(shares).map(([tier, weight]) => ({ value: tier as CoopTier, weight: weight ?? 0 }));
  return pickWeighted(seed, ['tier', roundNumber, playerId, slot], options) ?? 'medium';
}
