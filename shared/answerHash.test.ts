import { describe, expect, it } from 'vitest';
import { hashAnswer, safeEqualHex, verifyAnswer } from './answerHash';

describe('answerHash', () => {
  it('es determinista e ignora formato', async () => {
    const a = await hashAnswer('k', 'c1', 'Árbol');
    const b = await hashAnswer('k', 'c1', ' arbol ');
    expect(a).toBe(b);
    expect(a.length).toBe(64);
  });

  it('cambia con la clave y con el id', async () => {
    const base = await hashAnswer('k', 'c1', 'arbol');
    expect(base === (await hashAnswer('otra', 'c1', 'arbol'))).toBe(false);
    expect(base === (await hashAnswer('k', 'c2', 'arbol'))).toBe(false);
  });

  it('verifica respuestas', async () => {
    const hash = await hashAnswer('k', 'c1', 'cara dura');
    expect(await verifyAnswer('k', 'c1', 'CARADURA', hash)).toBe(true);
    expect(await verifyAnswer('k', 'c1', 'caradur', hash)).toBe(false);
    expect(await verifyAnswer('k', 'c1', '', hash)).toBe(false);
  });

  it('safeEqualHex', () => {
    expect(safeEqualHex('ab', 'ab')).toBe(true);
    expect(safeEqualHex('ab', 'ac')).toBe(false);
    expect(safeEqualHex('ab', 'abc')).toBe(false);
  });
});
