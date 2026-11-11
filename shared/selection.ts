// Selección de cripticos al iniciar una partida, sin repetir los que ya vieron los jugadores.
// Pura y determinista con `random` inyectable: la usa el Worker y se prueba sin red.
import { DIFFICULTIES, type Difficulty, type GameFlow, type TierMix } from './types';

export const TIER_SHARES: Record<TierMix, Record<Difficulty, number>> = {
  balanced: { easy: 0.25, medium: 0.25, hard: 0.25, veryHard: 0.25 },
  progressive: { easy: 0.25, medium: 0.25, hard: 0.25, veryHard: 0.25 },
  easy: { easy: 0.6, medium: 0.3, hard: 0.1, veryHard: 0 },
  hard: { easy: 0.1, medium: 0.2, hard: 0.4, veryHard: 0.3 },
};

/**
 * Probabilidad de cada tipo al sortear (v1.9). La clave es el tipo en minúsculas (primer tag del criptico).
 * Dentro de cada dificultad se reparte entre los tipos que haya; los tipos sin peso cuentan como 1 %.
 */
export const CRYPTIC_KIND_WEIGHTS: Readonly<Record<string, number>> = {
  'palabra escondida': 7,
  selector: 10,
  anagrama: 8,
  'sustracción': 11,
  reverso: 7,
  contenedor: 10,
  charada: 7,
  'homófono': 7,
  'doble definición': 7,
  'misceláneas': 10,
  'combinación': 16,
};

export type ByTier = Record<Difficulty, string[]>;

export interface SelectionInput {
  byTier: ByTier; // Todos los cripticos disponibles, por dificultad.
  lastSeen: Map<string, number>; // Última vez (ms) que CUALQUIER jugador de la sala vio cada criptico.
  flow: GameFlow;
  tierMix: TierMix;
  count: number; // 'free': total; 'rounds': por dificultad.
  tierCounts?: Record<Difficulty, number>; // 'free': cantidades exactas por dificultad (Royale, Race Pacífico), en orden progresivo.
  kindOf?: (id: string) => string | undefined; // Tipo de criptico (anagrama, contenedor…): evita dos seguidos del mismo.
  kindWeights?: Readonly<Record<string, number>>; // Reparto por tipo dentro de cada dificultad (ver CRYPTIC_KIND_WEIGHTS).
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

/**
 * Orden de sorteo con reparto por tipo: en cada paso elige un tipo según su peso (entre los que quedan)
 * y toma el criptico más fresco de ese tipo (nunca visto primero, después el visto hace más tiempo).
 */
export function kindWeightedOrder(
  ids: string[],
  kindOf: (id: string) => string | undefined,
  weights: Readonly<Record<string, number>>,
  lastSeen: Map<string, number>,
  random: () => number = Math.random,
): string[] {
  const groups = new Map<string, string[]>();
  for (const id of byFreshness(ids, lastSeen, random)) {
    const kind = kindOf(id) ?? '';
    const group = groups.get(kind);
    if (group) group.push(id);
    else groups.set(kind, [id]);
  }
  const weightOf = (kind: string) => Math.max(weights[kind] ?? 1, 0.0001);
  const out: string[] = [];
  while (groups.size > 0) {
    const entries = [...groups.entries()];
    const total = entries.reduce((sum, [kind]) => sum + weightOf(kind), 0);
    let roll = random() * total;
    let pick = entries[entries.length - 1]!;
    for (const entry of entries) {
      roll -= weightOf(entry[0]);
      if (roll < 0) {
        pick = entry;
        break;
      }
    }
    out.push(pick[1].shift()!);
    if (pick[1].length === 0) groups.delete(pick[0]);
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
  const order = (ids: string[]) =>
    input.kindWeights && input.kindOf
      ? kindWeightedOrder(ids, input.kindOf, input.kindWeights, input.lastSeen, random)
      : byFreshness(ids, input.lastSeen, random);
  const ordered = Object.fromEntries(DIFFICULTIES.map((tier) => [tier, order(input.byTier[tier] ?? [])])) as ByTier;

  if (input.flow === 'rounds') {
    const pool = Object.fromEntries(DIFFICULTIES.map((tier) => [tier, ordered[tier].slice(0, input.count)])) as ByTier;
    return { crypticIds: DIFFICULTIES.flatMap((tier) => pool[tier]), pool };
  }

  // 'free': reparto según tierMix (o cantidades exactas); si una dificultad no alcanza, se completa con las demás.
  const shares = TIER_SHARES[input.tierMix];
  const chosen: ByTier = { easy: [], medium: [], hard: [], veryHard: [] };
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
    // Progresivo: bloques fácil → medio → difícil → muy difícil; dentro de cada bloque, sin rachas de tipo.
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
