import { describe, expect, it } from 'vitest';
import { enumerationGroups, nextPendingFree, toCellLetter } from './playUtils';

describe('nextPendingFree', () => {
  it('avanza circularmente saltando resueltos', () => {
    expect(nextPendingFree(['a', 'b', 'c'], [], null)).toBe('a');
    expect(nextPendingFree(['a', 'b', 'c'], ['b'], 'a')).toBe('c');
    expect(nextPendingFree(['a', 'b', 'c'], [], 'c')).toBe('a');
  });
  it('devuelve el mismo si es el único pendiente y null si no queda nada', () => {
    expect(nextPendingFree(['a', 'b'], ['b'], 'a')).toBe('a');
    expect(nextPendingFree(['a'], ['a'], 'a')).toBeNull();
  });
});

describe('toCellLetter', () => {
  it('normaliza tildes, conserva la Ñ y descarta lo que no es letra', () => {
    expect(toCellLetter('á')).toBe('A');
    expect(toCellLetter('ñ')).toBe('Ñ');
    expect(toCellLetter('b')).toBe('B');
    expect(toCellLetter('3')).toBeNull();
    expect(toCellLetter(' ')).toBeNull();
  });
});

describe('enumerationGroups', () => {
  it('lee grupos con comas y guiones', () => {
    expect(enumerationGroups('(4,3-2)')).toEqual([4, 3, 2]);
    expect(enumerationGroups('(5)')).toEqual([5]);
  });
});
