import { describe, expect, it } from 'vitest';
import { enumerationGroups, toCellLetter } from './playUtils';

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
