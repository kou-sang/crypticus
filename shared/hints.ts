// Pistas elegibles (v1.9): el jugador elige qué parte del criptico revelar.
// Puro: lo usan el importador, el motor, el Worker y el cliente.
import type { CrypticParts } from './types';

/** Definición, indicador, relleno o una letra de la respuesta (al azar entre las ocultas). */
export type HintKind = 'definicion' | 'indicador' | 'relleno' | 'letra';
export const HINT_KINDS: readonly HintKind[] = ['definicion', 'indicador', 'relleno', 'letra'];

/** Usos máximos de cada tipo de pista en un criptico (0 o ausente = no disponible). */
export type HintKinds = Partial<Record<HintKind, number>>;

export const HINT_KIND_LABELS: Record<HintKind, string> = {
  definicion: 'Definición',
  indicador: 'Indicador',
  relleno: 'Relleno',
  letra: 'Letra',
};

/** Una pista ya revelada, lista para mostrar. */
export type RevealedHint =
  | { kind: 'definicion' | 'indicador' | 'relleno'; parts: string[] }
  | { kind: 'letra'; index: number; letter: string };

/** Letras de la respuesta para mostrar (sin tildes, conserva la Ñ), sin espacios ni signos. */
export function displayLetters(answer: string): string[] {
  const out: string[] = [];
  for (const char of answer.toUpperCase()) {
    if (char === 'Ñ') out.push('Ñ');
    else {
      const base = char.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (/^[A-Z0-9]$/.test(base)) out.push(base);
    }
  }
  return out;
}

/**
 * Pistas disponibles según las partes del criptico. La doble definición (dos definiciones y sin
 * indicador ni relleno) solo admite pistas de definición; la charada no tiene indicador.
 * Siempre queda al menos una letra oculta.
 */
export function hintKindsFor(parts: Partial<CrypticParts> | undefined, answer: string): HintKinds {
  const definicion = parts?.definicion?.filter(Boolean).length ?? 0;
  const indicador = parts?.indicador?.filter(Boolean).length ? 1 : 0;
  const relleno = parts?.relleno?.filter(Boolean).length ? 1 : 0;
  const letters = displayLetters(answer).length;
  const onlyDefinitions = definicion >= 2 && indicador === 0 && relleno === 0;
  return {
    ...(definicion ? { definicion: Math.min(definicion, 2) } : {}),
    ...(indicador ? { indicador } : {}),
    ...(relleno ? { relleno } : {}),
    ...(!onlyDefinitions && letters > 1 ? { letra: letters - 1 } : {}),
  };
}

export function totalHints(kinds: HintKinds | undefined): number {
  return Object.values(kinds ?? {}).reduce((sum, n) => sum + (n ?? 0), 0);
}

/** Tipo de una entrada del registro de pistas («letra:3» → 'letra'). */
export function logKind(entry: string): HintKind {
  return entry.split(':')[0] as HintKind;
}

/** Posiciones de letra ya reveladas en el registro de un criptico. */
export function revealedLetterIndexes(log: readonly string[] | undefined): number[] {
  return (log ?? []).filter((e) => e.startsWith('letra:')).map((e) => Number(e.slice(6)));
}

/** Cuántas veces se usó cada tipo en el registro. */
export function usedByKind(log: readonly string[] | undefined): Record<HintKind, number> {
  const used: Record<HintKind, number> = { definicion: 0, indicador: 0, relleno: 0, letra: 0 };
  for (const entry of log ?? []) used[logKind(entry)] += 1;
  return used;
}

/** Tipos que todavía se pueden pedir en un criptico. */
export function availableKinds(kinds: HintKinds | undefined, log: readonly string[] | undefined): HintKind[] {
  const used = usedByKind(log);
  return HINT_KINDS.filter((kind) => (kinds?.[kind] ?? 0) > used[kind]);
}

/**
 * Convierte el registro de pistas en pistas para mostrar. Las de definición se acumulan: la primera
 * muestra la primera definición; la segunda (doble definición), la otra.
 */
export function revealHints(log: readonly string[] | undefined, parts: Partial<CrypticParts> | undefined, answer: string): RevealedHint[] {
  const letters = displayLetters(answer);
  const out: RevealedHint[] = [];
  let defs = 0;
  for (const entry of log ?? []) {
    const kind = logKind(entry);
    if (kind === 'letra') {
      const index = Number(entry.slice(6));
      out.push({ kind, index, letter: letters[index] ?? '?' });
    } else if (kind === 'definicion') {
      const def = parts?.definicion?.[defs++];
      if (def) out.push({ kind, parts: [def] });
    } else {
      out.push({ kind, parts: [...(parts?.[kind] ?? [])] });
    }
  }
  return out;
}

/** Texto plano de una pista (para listas y lectores de pantalla). */
export function hintText(hint: RevealedHint): string {
  if (hint.kind === 'letra') return `Letra ${hint.index + 1}: ${hint.letter}`;
  return `${HINT_KIND_LABELS[hint.kind]}: ${hint.parts.map((p) => `«${p}»`).join(', ')}`;
}
