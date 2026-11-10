// Azar determinista del modo COOP: cada tirada es un hash de (semilla, contexto). El mismo evento con la misma
// semilla da siempre el mismo resultado, sin importar cuántas tiradas hubo antes (no hay estado que avanzar).

/** FNV-1a de 32 bits sobre el texto del contexto. */
function hashKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mezcla final (murmur3 fmix32): distribuye bien bits cercanos. */
function mix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export type RollKey = ReadonlyArray<string | number>;

/** Número en [0, 1) para el contexto dado. */
export function roll(seed: number, key: RollKey): number {
  return mix32(hashKey(key.join('|')) ^ mix32(seed)) / 0x1_0000_0000;
}

/** true con probabilidad `chance` (0–1). */
export function chance(seed: number, key: RollKey, probability: number): boolean {
  return probability > 0 && roll(seed, key) < probability;
}

/** Entero en [0, max). */
export function pickIndex(seed: number, key: RollKey, max: number): number {
  return Math.min(max - 1, Math.floor(roll(seed, key) * max));
}

/** Elige por pesos (no hace falta que sumen 1). `null` si no hay pesos positivos. */
export function pickWeighted<T>(seed: number, key: RollKey, options: ReadonlyArray<{ value: T; weight: number }>): T | null {
  const total = options.reduce((sum, option) => sum + Math.max(0, option.weight), 0);
  if (total <= 0) return null;
  let target = roll(seed, key) * total;
  for (const option of options) {
    if (option.weight <= 0) continue;
    target -= option.weight;
    if (target < 0) return option.value;
  }
  // Redondeo flotante en el borde: el último con peso positivo.
  for (let i = options.length - 1; i >= 0; i -= 1) if (options[i]!.weight > 0) return options[i]!.value;
  return null;
}

/** Barajado determinista (Fisher-Yates con una tirada por posición). */
export function shuffled<T>(seed: number, key: RollKey, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = pickIndex(seed, [...key, i], i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
