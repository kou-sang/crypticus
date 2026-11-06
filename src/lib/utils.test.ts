import { describe, expect, it } from 'vitest';
import { chunk, formatClock, otherMember, pairId, toHandle } from './utils';

describe('utils', () => {
  it('pairId es simétrico', () => {
    expect(pairId('b', 'a')).toBe('a_b');
    expect(pairId('a', 'b')).toBe('a_b');
    expect(otherMember('a_b', 'a')).toBe('b');
  });
  it('formatClock', () => {
    expect(formatClock(61_000)).toBe('01:01');
    expect(formatClock(-5)).toBe('00:00');
  });
  it('chunk', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
  it('toHandle', () => {
    expect(toHandle('José Pérez!')).toBe('joseperez');
  });
});
