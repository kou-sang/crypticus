import { describe, expect, it } from 'vitest';
import { shiftLetter } from './letters';

describe('shiftLetter', () => {
  it('desfasa con alfabeto cíclico que incluye la Ñ', () => {
    expect(shiftLetter('A', 2)).toBe('C');
    expect(shiftLetter('N', 1)).toBe('Ñ');
    expect(shiftLetter('Ñ', 1)).toBe('O');
    expect(shiftLetter('Z', 1)).toBe('A');
    expect(shiftLetter('A', -2)).toBe('Y');
    expect(shiftLetter('B', 0)).toBe('B');
  });
});
