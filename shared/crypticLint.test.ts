import { describe, expect, it } from 'vitest';
import { lintCryptics } from './crypticLint';

const valid = {
  clue: 'Rama rota para la guerra (4)',
  answer: 'arma',
  difficulty: 'facil',
  hints: ['La definición es «para la guerra».', 'Reordena RAMA.'],
  explanation: 'Anagrama de RAMA = ARMA.',
  tags: ['Anagrama'],
};

describe('lintCryptics', () => {
  it('acepta una lista correcta y cuenta por dificultad', () => {
    const report = lintCryptics([valid, { ...valid, clue: 'Felino: grite desaforado (5)', answer: 'tigre', difficulty: 'medio' }]);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.counts).toEqual({ easy: 1, medium: 1, hard: 0 });
  });

  it('exige explicación y enumeración coherente', () => {
    const report = lintCryptics([{ ...valid, explanation: '' }, { ...valid, clue: 'Otro enunciado (5)', answer: 'oso' }]);
    expect(report.errors.some((e) => e.includes('falta la explicación'))).toBe(true);
    expect(report.errors.some((e) => e.includes('enumeración'))).toBe(true);
  });

  it('detecta respuestas repetidas aunque difieran en acentos o eñe', () => {
    const report = lintCryptics([
      { ...valid, clue: 'Tallo hueco (4)', answer: 'caña' },
      { ...valid, clue: 'Pelo blanco (4)', answer: 'cana' },
    ]);
    expect(report.errors.some((e) => e.startsWith('Respuesta repetida'))).toBe(true);
  });

  it('detecta enunciados repetidos y avisa de pistas o tipo faltantes', () => {
    const report = lintCryptics([valid, { ...valid, answer: 'rama', hints: ['una'], tags: [] }]);
    expect(report.errors.some((e) => e.startsWith('Enunciado repetido'))).toBe(true);
    expect(report.warnings.length).toBe(2);
  });

  it('los de desempate tienen 2 o 3 palabras y enumeración por palabra', () => {
    const ok = { ...valid, clue: 'Pareja ideal o mitad de un cítrico (5,7)', answer: 'media naranja', tiebreak: true };
    expect(lintCryptics([ok]).errors).toEqual([]);
    expect(lintCryptics([ok]).tiebreak).toBe(1);
    const oneWord = lintCryptics([{ ...valid, tiebreak: true }]);
    expect(oneWord.errors.some((e) => e.includes('2 o 3 palabras'))).toBe(true);
    const badEnum = lintCryptics([{ ...ok, clue: 'Pareja ideal o mitad de un cítrico (12)' }]);
    expect(badEnum.errors.some((e) => e.includes('(5,7)'))).toBe(true);
  });

  it('rechaza un archivo que no es un array', () => {
    expect(lintCryptics({}).errors).toEqual(['El archivo debe contener un array de cripticos.']);
  });
});
