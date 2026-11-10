import { describe, expect, it } from 'vitest';
import { applyCoopAction, advanceCoop, coopDeadline, coopRatingDelta, coopView, createCoopRoom, type CoopStartInput } from './coopRoom';
import { COOP_BRIEFING_MS } from '../shared/coop/protocol';

const T0 = 1_000_000;
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

function input(): CoopStartInput {
  return {
    competitionId: 'c1',
    title: 'ABCD · Ana',
    level: 'AT',
    players: [
      { uid: 'a', name: 'Ana', character: 'enoch' },
      { uid: 'b', name: 'Beto', character: 'mathusala' },
      { uid: 'c', name: 'Caro', character: 'urias' },
      { uid: 'd', name: 'Dani', character: 'eliseus' },
    ],
    pools: { easy: ids('e', 50), medium: ids('m', 50), hard: ids('h', 50), veryHard2: ids('v', 10), veryHard3: [] },
    seed: 7,
    now: T0,
  };
}

/** Respuesta correcta si el id empieza por "e" o "m" (fáciles y medios), para el test. */
const verify = async (crypticId: string, guess: string) => guess === 'ok' && /^[em]/.test(crypticId);

describe('sala COOP', () => {
  it('la explicación termina cuando todos están listos y arranca la presentación del primer jefe', async () => {
    const room = createCoopRoom(input());
    expect(coopDeadline(room)).toBe(T0 + COOP_BRIEFING_MS);
    for (const uid of ['a', 'b', 'c']) await applyCoopAction(room, uid, { kind: 'ready' }, T0 + 1_000, verify);
    expect(room.briefing).not.toBeNull();
    const { events } = await applyCoopAction(room, 'd', { kind: 'ready' }, T0 + 2_000, verify);
    expect(room.briefing).toBeNull();
    expect(events.some((e) => e.type === 'bossIntro')).toBe(true);
  });

  it('asigna cripticos distintos al abrir la ronda y solo muestra los propios, sin semilla', async () => {
    const room = createCoopRoom(input());
    advanceCoop(room, T0 + COOP_BRIEFING_MS + 6_000); // Explicación vencida + presentación de 5 s.
    expect(room.game?.phase).toBe('round');
    const all = Object.values(room.assigned).flat();
    expect(all).toHaveLength(8);
    expect(new Set(all).size).toBe(8);
    const view = coopView(room, 'a', [], T0);
    expect(view.game?.seed).toBe(0);
    expect(view.mine.cryptics.map((c) => c.crypticId)).toEqual(room.assigned.a);
  });

  it('respuesta incorrecta: espera de 2 s; correcta: marca el criptico', async () => {
    const room = createCoopRoom(input());
    const start = T0 + COOP_BRIEFING_MS + 6_000;
    advanceCoop(room, start);
    const slot = room.assigned.a!.findIndex((id) => /^[em]/.test(id));
    const wrong = await applyCoopAction(room, 'a', { kind: 'answer', slot, guess: 'mal' }, start + 1_000, verify);
    expect(wrong.reply.correct).toBe(false);
    await expect(applyCoopAction(room, 'a', { kind: 'answer', slot, guess: 'ok' }, start + 2_000, verify)).rejects.toThrow('Espera');
    const right = await applyCoopAction(room, 'a', { kind: 'answer', slot, guess: 'ok' }, start + 3_500, verify);
    expect(right.reply.correct).toBe(true);
    expect(room.game?.players[0]!.assignments[slot]!.solved).toBe(true);
  });

  it('Elo contra el rating del nivel', () => {
    expect(coopRatingDelta(1500, 1500, true)).toBe(12);
    expect(coopRatingDelta(1500, 1500, false)).toBe(-12);
    expect(coopRatingDelta(1200, 1500, true)).toBeGreaterThan(12);
  });
});
