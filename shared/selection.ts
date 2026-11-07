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
  kindOf?: (id: string) => string | undefined; // Tipo de criptico (anagrama, contenedor…): evita dos seguidos del mismo.
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

/**
 * Orden aleatorio sin dos cripticos seguidos del mismo tipo (si se puede).
 * En cada paso elige un tipo distinto al anterior con probabilidad proporcional a lo que queda de cada uno:
 * respeta la mezcla real del catálogo y evita quedarse al final con una racha del tipo más abundante.
 * Los ids sin tipo conocido nunca chocan entre sí. `previous` encadena bloques (p. ej. orden progresivo).
 */
export function spreadByKind(
  ids: string[],
  kindOf: (id: string) => string | undefined,
  random: () => number = Math.random,
  previous?: string,
): string[] {
  const buckets = new Map<string, string[]>();
  let untyped = 0;
  for (const id of shuffle(ids, random)) {
    const kind = kindOf(id) ?? `\u0000${untyped++}`; // Sin tipo: bucket propio.
    const bucket = buckets.get(kind);
    if (bucket) bucket.push(id);
    else buckets.set(kind, [id]);
  }
  const out: string[] = [];
  let last = previous;
  while (buckets.size > 0) {
    // Si el tipo anterior es el único que queda, se acepta la repetición.
    const candidates = [...buckets.entries()].filter(([kind]) => kind !== last);
    const pool = candidates.length > 0 ? candidates : [...buckets.entries()];
    // Ponderado por tamaño restante, con prioridad al tipo que ya no cabe sin repetir (más de la mitad).
    const remaining = pool.reduce((sum, [, bucket]) => sum + bucket.length, 0);
    const total = [...buckets.values()].reduce((sum, bucket) => sum + bucket.length, 0);
    const forced = pool.find(([, bucket]) => bucket.length * 2 > total);
    let pick = forced ?? pool[pool.length - 1]!;
    if (!forced) {
      let roll = random() * remaining;
      for (const entry of pool) {
        roll -= entry[1].length;
        if (roll < 0) {
          pick = entry;
          break;
        }
      }
    }
    const [kind, bucket] = pick;
    out.push(bucket.shift()!);
    if (bucket.length === 0) buckets.delete(kind);
    last = kind;
  }
  return out;
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

  const kindOf = input.kindOf ?? (() => undefined);
  let crypticIds: string[];
  if (input.tierMix === 'progressive') {
    // Progresivo: bloques fácil → medio → difícil; dentro de cada bloque, aleatorio sin rachas de tipo.
    crypticIds = [];
    for (const tier of DIFFICULTIES) {
      const previous = crypticIds.length > 0 ? kindOf(crypticIds[crypticIds.length - 1]!) : undefined;
      crypticIds.push(...spreadByKind(chosen[tier], kindOf, random, previous));
    }
  } else {
    crypticIds = spreadByKind(DIFFICULTIES.flatMap((tier) => chosen[tier]), kindOf, random);
  }
  return { crypticIds: crypticIds.slice(0, input.count), pool: chosen };
}

/** Cripticos de desempate por partida: uno por dificultad, de menor a mayor. */
export const TIEBREAK_COUNT = 3;

/**
 * Elige los cripticos de muerte súbita (pool aparte, respuestas de 2 o 3 palabras):
 * el menos visto de cada dificultad, en orden fácil → medio → difícil. Si una dificultad
 * no tiene, se completa con las otras para llegar a `TIEBREAK_COUNT`.
 */
export function selectTiebreakers(byTier: ByTier, lastSeen: Map<string, number>, random: () => number = Math.random): string[] {
  const ordered = DIFFICULTIES.map((tier) => byFreshness(byTier[tier] ?? [], lastSeen, random));
  const picked = ordered.map((ids) => ids[0]).filter((id): id is string => id !== undefined);
  for (const ids of ordered) {
    for (const id of ids.slice(1)) {
      if (picked.length >= TIEBREAK_COUNT) break;
      picked.push(id);
    }
  }
  return picked.slice(0, TIEBREAK_COUNT);
}
