import { describe, expect, it } from 'vitest';
import { answerLengthFromEnumeration, deriveEnumeration, isCorrectAnswer, normalizeAnswer, splitClue } from './answer';

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

describe('splitClue', () => {
  it('separa la enumeración final', () => {
    expect(splitClue('Hueso del brazo que transmite (5)')).toEqual({ text: 'Hueso del brazo que transmite', enumeration: '(5)' });
    expect(splitClue('Cara dura (4, 4) ')).toEqual({ text: 'Cara dura', enumeration: '(4,4)' });
    expect(splitClue('Uno-dos (3-3)')).toEqual({ text: 'Uno-dos', enumeration: '(3-3)' });
  });
  it('deja intacto un enunciado sin enumeración', () => {
    expect(splitClue('Sin números (al final)')).toEqual({ text: 'Sin números (al final)', enumeration: null });
  });
});
