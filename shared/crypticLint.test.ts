import { describe, expect, it } from 'vitest';
import { lintCryptics } from './crypticLint';

const valid = {
  clue: 'Rama rota para la guerra (4)',
  answer: 'arma',
  difficulty: 'facil',
  hints: ['Definición: «para la guerra».', 'Indicador: «rota».', 'Relleno: «Rama».'],
  parts: { definicion: ['para la guerra'], indicador: ['rota'], relleno: ['Rama'] },
  explanation: 'Anagrama de RAMA = ARMA.',
  tags: ['Anagrama'],
};

describe('lintCryptics', () => {
  it('acepta una lista correcta y cuenta por dificultad', () => {
    const tigre = {
      ...valid,
      clue: 'Felino: grite desaforado (5)',
      answer: 'tigre',
      difficulty: 'muy difícil',
      parts: { definicion: ['Felino'], indicador: ['desaforado'], relleno: ['grite'] },
    };
    const report = lintCryptics([valid, tigre]);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.counts).toEqual({ easy: 1, medium: 0, hard: 0, veryHard: 1 });
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

  it('detecta enunciados repetidos y avisa de partes o tipo faltantes', () => {
    const report = lintCryptics([valid, { ...valid, answer: 'rama', parts: undefined, tags: [] }]);
    expect(report.errors.some((e) => e.startsWith('Enunciado repetido'))).toBe(true);
    expect(report.warnings.length).toBe(2);
  });

  it('las partes deben estar en el enunciado; la doble definición lleva dos definiciones', () => {
    const missing = lintCryptics([{ ...valid, parts: { ...valid.parts, relleno: ['ramo'] } }]);
    expect(missing.errors.some((e) => e.includes('«ramo» no está en el enunciado'))).toBe(true);
    const doble = { ...valid, clue: 'Asno ignorante (5)', answer: 'burro', tags: ['Doble definición'], parts: { definicion: ['Asno'], indicador: [], relleno: [] } };
    expect(lintCryptics([doble]).errors.some((e) => e.includes('dos definiciones'))).toBe(true);
    const ok = { ...doble, parts: { definicion: ['Asno', 'ignorante'], indicador: [], relleno: [] } };
    expect(lintCryptics([ok]).errors).toEqual([]);
  });

  it('rechaza un archivo que no es un array', () => {
    expect(lintCryptics({}).errors).toEqual(['El archivo debe contener un array de cripticos.']);
  });
});
