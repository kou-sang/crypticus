// Selección de cripticos al iniciar una partida, sin repetir los que ya vieron los jugadores.
// Pura y determinista con `random` inyectable: la usa el Worker y se prueba sin red.
import { DIFFICULTIES, type Difficulty, type GameFlow, type TierMix } from './types';

export const TIER_SHARES: Record<TierMix, Record<Difficulty, number>> = {
  balanced: { easy: 1 / 3, medium: 1 / 3, hard: 1 / 3 },
  progressive: { easy: 1 / 3, medium: 1 / 3, hard: 1 / 3 },
  easy: { easy: 0.6, medium: 0.3, hard: 0.1 },
  hard: { easy: 0.1, medium: 0.3, hard: 0.6 },
};

export type ByTier = Record<Difficulty, string[]>;

export interface SelectionInput {
  byTier: ByTier; // Todos los cripticos disponibles, por dificultad.
  lastSeen: Map<string, number>; // Última vez (ms) que CUALQUIER jugador de la sala vio cada criptico.
  flow: GameFlow;
  tierMix: TierMix;
  count: number; // 'free': total; 'rounds': por dificultad.
  tierCounts?: Record<Difficulty, number>; // 'free': cantidades exactas por dificultad (Royale), en orden progresivo.
  random?: () => number;
}

export interface Selection {
  crypticIds: string[];
  pool: ByTier;
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Nunca vistos primero (en orden aleatorio); luego los vistos hace más tiempo. */
export function byFreshness(ids: string[], lastSeen: Map<string, number>, random: () => number = Math.random): string[] {
  return shuffle(ids, random).sort((a, b) => (lastSeen.get(a) ?? -1) - (lastSeen.get(b) ?? -1));
}

/** Une los historiales de varios jugadores: para cada criptico, la vista más reciente. */
export function mergeLastSeen(maps: Array<Record<string, number> | undefined>): Map<string, number> {
  const merged = new Map<string, number>();
  for (const seen of maps) {
    if (!seen) continue;
    for (const [id, at] of Object.entries(seen)) {
      if (typeof at === 'number' && at > (merged.get(id) ?? -1)) merged.set(id, at);
    }
  }
  return merged;
}

export function selectCryptics(input: SelectionInput): Selection {
  const random = input.random ?? Math.random;
  const ordered = Object.fromEntries(
    DIFFICULTIES.map((tier) => [tier, byFreshness(input.byTier[tier] ?? [], input.lastSeen, random)]),
  ) as ByTier;

  if (input.flow === 'rounds') {
    const pool = Object.fromEntries(DIFFICULTIES.map((tier) => [tier, ordered[tier].slice(0, input.count)])) as ByTier;
    return { crypticIds: DIFFICULTIES.flatMap((tier) => pool[tier]), pool };
  }

  // 'free': reparto según tierMix (o cantidades exactas); si una dificultad no alcanza, se completa con las demás.
  const shares = TIER_SHARES[input.tierMix];
  const chosen: ByTier = { easy: [], medium: [], hard: [] };
  for (const tier of DIFFICULTIES) {
    const wanted = input.tierCounts ? input.tierCounts[tier] : Math.round(input.count * shares[tier]);
    chosen[tier] = ordered[tier].slice(0, wanted);
  }
  let deficit = input.count - DIFFICULTIES.reduce((sum, tier) => sum + chosen[tier].length, 0);
  for (const tier of DIFFICULTIES) {
    if (deficit <= 0) break;
    const extra = ordered[tier].slice(chosen[tier].length, chosen[tier].length + deficit);
    chosen[tier].push(...extra);
    deficit -= extra.length;
  }

  const crypticIds =
    input.tierMix === 'progressive'
      ? DIFFICULTIES.flatMap((tier) => chosen[tier])
      : shuffle(DIFFICULTIES.flatMap((tier) => chosen[tier]), random);
  return { crypticIds: crypticIds.slice(0, input.count), pool: chosen };
}
