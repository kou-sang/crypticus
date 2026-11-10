import { describe, expect, it } from 'vitest';
import { applyCoopAction, advanceCoop, coopDeadline, coopRatingDelta, coopSolutions, coopView, createCoopRoom, type CoopStartInput } from './coopRoom';
import { COOP_BRIEFING_MS, COOP_DRAFT_MS } from '../shared/coop/protocol';
import type { CharacterId } from '../shared/coop/catalog/characters';

const T0 = 1_000_000;
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

const pools = () => ({ easy: ids('e', 50), medium: ids('m', 50), hard: ids('h', 50), veryHard2: ids('v', 10), veryHard3: [] as string[] });

function input(): CoopStartInput {
  return {
    competitionId: 'c1',
    title: 'ABCD · Ana',
    level: 'AT',
    players: [
      { uid: 'a', name: 'Ana' },
      { uid: 'b', name: 'Beto' },
      { uid: 'c', name: 'Caro' },
      { uid: 'd', name: 'Dani' },
    ],
    // Misma lista para todos (peor caso): en una ronda no deben repetirse entre aliados.
    pools: Object.fromEntries(['a', 'b', 'c', 'd'].map((uid) => [uid, pools()])),
    seed: 7,
    now: T0,
  };
}

/** Respuesta correcta si el id empieza por "e" o "m" (fáciles y medios), para el test. */
const verify = async (crypticId: string, guess: string) => guess === 'ok' && /^[em]/.test(crypticId);

const PICKS: Record<string, CharacterId> = { a: 'enoch', b: 'mathusala', c: 'urias', d: 'eliseus' };

/** Selección completa: cada uno elige y confirma. */
async function drafted(now = T0 + 1_000) {
  const room = createCoopRoom(input());
  for (const [uid, character] of Object.entries(PICKS)) {
    await applyCoopAction(room, uid, { kind: 'pick', character }, now, verify);
    await applyCoopAction(room, uid, { kind: 'lock' }, now, verify);
  }
  return room;
}

describe('selección de personajes', () => {
  it('no deja repetir y termina cuando todos confirman', async () => {
    const room = createCoopRoom(input());
    expect(coopDeadline(room)).toBe(T0 + COOP_DRAFT_MS);
    await applyCoopAction(room, 'a', { kind: 'pick', character: 'samson' }, T0, verify);
    await expect(applyCoopAction(room, 'b', { kind: 'pick', character: 'samson' }, T0, verify)).rejects.toThrow('ya fue elegido');
    const done = await drafted();
    expect(done.draft).toBeNull();
    expect(done.players.map((p) => p.character)).toEqual(['enoch', 'mathusala', 'urias', 'eliseus']);
    expect(done.briefing).not.toBeNull();
  });

  it('al vencer, quien no eligió recibe un personaje libre', async () => {
    const room = createCoopRoom(input());
    await applyCoopAction(room, 'a', { kind: 'pick', character: 'nathan' }, T0, verify);
    advanceCoop(room, T0 + COOP_DRAFT_MS);
    const characters = room.players.map((p) => p.character);
    expect(characters[0]).toBe('nathan');
    expect(new Set(characters).size).toBe(4);
    expect(characters.every(Boolean)).toBe(true);
  });
});

describe('sala COOP', () => {
  it('la carga termina cuando todos están listos y arranca la presentación del primer jefe', async () => {
    const room = await drafted();
    expect(coopDeadline(room)).toBe(T0 + 1_000 + COOP_BRIEFING_MS);
    for (const uid of ['a', 'b', 'c']) await applyCoopAction(room, uid, { kind: 'ready' }, T0 + 1_000, verify);
    expect(room.briefing).not.toBeNull();
    const { events } = await applyCoopAction(room, 'd', { kind: 'ready' }, T0 + 2_000, verify);
    expect(room.briefing).toBeNull();
    expect(events.some((e) => e.type === 'bossIntro')).toBe(true);
  });

  it('asigna cripticos distintos al abrir la ronda y solo muestra los propios, sin semilla', async () => {
    const room = await drafted(T0);
    advanceCoop(room, T0 + COOP_BRIEFING_MS + 6_000); // Carga vencida + presentación de 5 s.
    expect(room.game?.phase).toBe('round');
    const all = Object.values(room.assigned).flat();
    expect(all).toHaveLength(8);
    expect(new Set(all).size).toBe(8);
    const view = coopView(room, 'a', [], T0);
    expect(view.game?.seed).toBe(0);
    // Solo el criptico en pantalla viaja con id y enunciado; el siguiente aparece al resolver el anterior.
    expect(view.mine.cryptics.map((c) => c.crypticId)).toEqual([room.assigned.a![0], '']);
    expect(room.shown?.a).toEqual([room.assigned.a![0]]);
  });

  it('cada jugador sigue su propio historial: lo que vio un aliado no cuenta', async () => {
    const base = input();
    base.pools.a = { ...pools(), easy: ['fresco-a', ...ids('e', 49)], medium: ['fresco-a-m', ...ids('m', 49)] };
    const room = createCoopRoom(base);
    for (const [uid, character] of Object.entries(PICKS)) {
      await applyCoopAction(room, uid, { kind: 'pick', character }, T0, verify);
      await applyCoopAction(room, uid, { kind: 'lock' }, T0, verify);
    }
    advanceCoop(room, T0 + COOP_BRIEFING_MS + 6_000);
    expect(['fresco-a', 'fresco-a-m']).toContain(room.assigned.a![0]);
  });

  it('respuesta incorrecta: espera de 2 s; correcta: marca el criptico', async () => {
    const room = await drafted(T0);
    const start = T0 + COOP_BRIEFING_MS + 6_000;
    advanceCoop(room, start);
    const slot = room.assigned.a!.findIndex((id) => /^[em]/.test(id));
    const wrong = await applyCoopAction(room, 'a', { kind: 'answer', slot, guess: 'mal' }, start + 1_000, verify);
    expect(wrong.reply.correct).toBe(false);
    await expect(applyCoopAction(room, 'a', { kind: 'answer', slot, guess: 'ok' }, start + 2_000, verify)).rejects.toThrow('Espera');
    const right = await applyCoopAction(room, 'a', { kind: 'answer', slot, guess: 'ok' }, start + 3_500, verify);
    expect(right.reply.correct).toBe(true);
    expect(room.game?.players[0]!.assignments[slot]!.solved).toBe(true);
    const solution = coopSolutions(room, 'a').find((s) => s.crypticId === room.assigned.a![slot]);
    expect(solution?.solvedBy).toEqual(['a']);
    // Los aliados no ven en sus soluciones los cripticos de «a».
    const others = new Set(coopSolutions(room, 'b').map((s) => s.crypticId));
    for (const id of room.assigned.a!) expect(others.has(id)).toBe(false);
    // Resolver el primero deja ver el segundo.
    if (slot === 0) expect(room.shown?.a).toEqual(room.assigned.a);
  });

  it('quien sale antes de empezar queda fuera desde el primer instante', async () => {
    const room = await drafted(T0);
    await applyCoopAction(room, 'd', { kind: 'leave' }, T0 + 1_000, verify);
    expect(room.game).toBeNull();
    for (const uid of ['a', 'b', 'c']) await applyCoopAction(room, uid, { kind: 'ready' }, T0 + 2_000, verify);
    expect(room.game?.players.find((p) => p.id === 'd')?.status).toBe('left');
  });

  it('Elo contra el rating del nivel', () => {
    expect(coopRatingDelta(1500, 1500, true)).toBe(12);
    expect(coopRatingDelta(1500, 1500, false)).toBe(-12);
    expect(coopRatingDelta(1200, 1500, true)).toBeGreaterThan(12);
  });
});
