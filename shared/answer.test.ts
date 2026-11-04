import { describe, expect, it } from 'vitest';
import { answerLengthFromEnumeration, deriveEnumeration, isCorrectAnswer, normalizeAnswer } from './answer';

describe('normalizeAnswer', () => {
  it('ignora acentos, mayúsculas, espacios y signos', () => {
    expect(normalizeAnswer("  Canción de cuna! ")).toBe('CANCIONDECUNA');
    expect(normalizeAnswer('rock-and-roll')).toBe('ROCKANDROLL');
  });
});

describe('isCorrectAnswer', () => {
  it('compara normalizado', () => {
    expect(isCorrectAnswer('arbol', 'ÁRBOL')).toBe(true);
    expect(isCorrectAnswer('', '')).toBe(false);
    expect(isCorrectAnswer('arbo', 'árbol')).toBe(false);
  });
});

describe('deriveEnumeration', () => {
  it('genera enumeraciones con comas y guiones', () => {
    expect(deriveEnumeration('cara dura')).toBe('(4,4)');
    expect(deriveEnumeration('rock-and-roll')).toBe('(4-3-4)');
    expect(deriveEnumeration('sol')).toBe('(3)');
  });
  it('calcula la longitud total', () => {
    expect(answerLengthFromEnumeration('(4-3-4)')).toBe(11);
  });
});
