import { describe, expect, it } from 'vitest';
import { decodeFields, encodeFields } from './firestoreCodec';

describe('firestoreCodec', () => {
  it('ida y vuelta conserva los datos', () => {
    const data = {
      status: 'finished',
      score: 300,
      ratio: 0.5,
      winnerId: null,
      ok: true,
      solvedIds: ['a', 'b'],
      hintsByClue: { a: 1 },
      finalStandings: [{ uid: 'u', rank: 1 }],
    };
    expect(decodeFields(encodeFields(data))).toEqual(data);
  });

  it('enteros como integerValue (string) y omite undefined', () => {
    const fields = encodeFields({ n: 3, skip: undefined });
    expect(fields).toEqual({ n: { integerValue: '3' } });
  });
});
