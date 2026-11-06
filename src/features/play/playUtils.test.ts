import { describe, expect, it } from 'vitest';
import { nextPendingFree } from './playUtils';

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
