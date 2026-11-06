// Normalización y comparación de respuestas.
// Las respuestas de cripticos ignoran mayúsculas, acentos, espacios y puntuación.

/** Normaliza una respuesta: sin diacríticos, solo letras/dígitos, en mayúsculas. */
export function normalizeAnswer(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Quita diacríticos (á -> a). La Ñ se convierte en N.
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function isCorrectAnswer(guess: string, answer: string): boolean {
  const normalizedGuess = normalizeAnswer(guess);
  return normalizedGuess.length > 0 && normalizedGuess === normalizeAnswer(answer);
}

/** Deriva la enumeración "(5,3)" o "(4-4)" a partir de la respuesta. */
export function deriveEnumeration(answer: string): string {
  const groups = answer
    .trim()
    .split(/(\s+|-)/)
    .filter((part) => part.length > 0 && !/^\s+$/.test(part));
  const parts: string[] = [];
  for (const group of groups) {
    if (group === '-') {
      parts.push('-');
      continue;
    }
    const length = normalizeAnswer(group).length;
    if (length === 0) continue;
    const previous = parts[parts.length - 1];
    if (parts.length > 0 && previous !== '-') parts.push(',');
    parts.push(String(length));
  }
  return `(${parts.join('')})`;
}

/** Longitud total de letras esperada, útil para validar el input en el cliente. */
export function answerLengthFromEnumeration(enumeration: string): number {
  const numbers = enumeration.match(/\d+/g) ?? [];
  return numbers.reduce((sum, value) => sum + Number(value), 0);
}

const TRAILING_ENUMERATION = /\s*\((\d+(?:\s*[,-]\s*\d+)*)\)\s*$/;

/**
 * Separa la enumeración final de un enunciado: "Hueso del brazo (5)" -> { text: "Hueso del brazo", enumeration: "(5)" }.
 * Evita mostrarla dos veces cuando el enunciado ya la trae escrita.
 */
export function splitClue(clue: string): { text: string; enumeration: string | null } {
  const match = clue.match(TRAILING_ENUMERATION);
  if (!match) return { text: clue.trim(), enumeration: null };
  return { text: clue.slice(0, match.index).trim(), enumeration: `(${(match[1] ?? '').replace(/\s+/g, '')})` };
}
