import { describe, expect, it } from 'vitest';
import { applyAnswer, createLiveState, isOnWinningSide, rankState, reserveAttempt, type LiveState } from './engine';
import { buildConfig, DEFAULT_MODE_SETTINGS } from './gameModes';
import { computeRatingDeltas, validateConfig } from './scoring';
import { assignTeams, startBlocker } from './teams';
import { makeParticipant } from './testUtils';
import type { Difficulty } from './types';

const ids = ['e1', 'e2', 'm1', 'm2', 'h1', 'h2'];
const catalog = Object.fromEntries(
  ids.map((id) => [id, { tier: (id[0] === 'e' ? 'easy' : id[0] === 'h' ? 'hard' : 'medium') as Difficulty, hintCount: 2 }]),
);
const first = () => 0;

function duelConfig(format: '1v1' | '2v2', extra: Partial<typeof DEFAULT_MODE_SETTINGS.duel> = {}) {
  return buildConfig({
    ...DEFAULT_MODE_SETTINGS,
    game: 'duel',
    duel: { ...DEFAULT_MODE_SETTINGS.duel, hp: 100, damage: 'speed', comeback: 'off', cooldownSec: 0, format, ...extra },
  });
}

function start(format: '1v1' | '2v2', players: Array<{ uid: string; team?: 0 | 1 }>, extra = {}): LiveState {
  return createLiveState({
    competitionId: 'c',
    config: duelConfig(format, extra).config,
    participants: players.map((p) => makeParticipant(p)),
    crypticIds: ids,
    pool: { easy: ['e1', 'e2'], medium: ['m1', 'm2'], hard: ['h1', 'h2'] },
    catalog,
    startedAt: 0,
    random: first,
  });
}

/** Responde bien al instante (daño por velocidad: 40 base). */
function hit(state: LiveState, uid: string) {
  const at = state.round!.opensAt ?? 0;
  reserveAttempt(state, uid, state.round!.crypticId, at);
  return applyAnswer(state, { uid, crypticId: state.round!.crypticId, correct: true, now: at, random: first });
}

const team2v2 = [
  { uid: 'a', team: 0 as const },
  { uid: 'b', team: 0 as const },
  { uid: 'c', team: 1 as const },
  { uid: 'd', team: 1 as const },
];

describe('Duel: jugadores necesarios', () => {
  it('no se puede jugar solo (antes el daño era 0)', () => {
    expect(() => start('1v1', [{ uid: 'a' }])).toThrow();
    expect(startBlocker(duelConfig('1v1').config, ['a'])).toMatch(/falta 1/);
    expect(startBlocker(duelConfig('1v1').config, ['a', 'b'])).toBeNull();
  });

  it('2 vs 2 exige 4 jugadores y equipos parejos', () => {
    expect(() => start('2v2', team2v2.slice(0, 3))).toThrow();
    expect(() => start('2v2', team2v2.map((p) => ({ ...p, team: 0 as const })))).toThrow();
    const built = duelConfig('2v2');
    expect(built.maxPlayers).toBe(4);
    expect(validateConfig(built.config, built.maxPlayers)).toEqual([]);
    expect(validateConfig(built.config, 2).length).toBe(1);
  });

  it('Race y Royale se pueden jugar solos (práctica)', () => {
    expect(startBlocker(buildConfig(DEFAULT_MODE_SETTINGS).config, ['a'])).toBeNull();
  });
});

describe('Duel 2 vs 2', () => {
  it('vida compartida: cualquiera del equipo responde y el daño baja la barra del otro equipo', () => {
    const state = start('2v2', team2v2);
    hit(state, 'b');
    expect(state.participants.c!.score).toBe(60);
    expect(state.participants.d!.score).toBe(60);
    expect(state.participants.a!.score).toBe(100);
  });

  it('el combo es del equipo: aciertos seguidos de compañeros distintos lo suman', () => {
    const state = start('2v2', team2v2);
    hit(state, 'a'); // 40
    hit(state, 'b'); // 50 (×1.25)
    expect(state.participants.c!.score).toBe(10);
    expect(state.participants.a!.streak).toBe(2);
    hit(state, 'd'); // corta el combo de A-B
    expect(state.participants.a!.streak).toBe(0);
  });

  it('nocaut: gana el equipo; los dos comparten el puesto y el Elo no enfrenta a compañeros', () => {
    const state = start('2v2', team2v2, { combo: false });
    while (state.status === 'live') hit(state, state.round!.index % 2 ? 'a' : 'b');
    expect(state.endReason).toBe('knockout');
    expect(isOnWinningSide(state, 'a')).toBe(true);
    expect(isOnWinningSide(state, 'b')).toBe(true);
    expect(isOnWinningSide(state, 'c')).toBe(false);
    const ranked = rankState(state);
    const rank = Object.fromEntries(ranked.map((p) => [p.uid, p.rank]));
    expect(rank).toEqual({ a: 1, b: 1, c: 3, d: 3 });
    const deltas = computeRatingDeltas(ranked, { a: 1200, b: 1200, c: 1200, d: 1200 });
    expect(deltas).toEqual({ a: 16, b: 16, c: -16, d: -16 });
  });
});

describe('assignTeams', () => {
  it('respeta la elección y completa por orden de llegada', () => {
    expect(assignTeams(['a', 'b', 'c', 'd'], { c: 0, d: 0 })).toEqual({ c: 0, d: 0, a: 1, b: 1 });
    // Un tercero que eligió un equipo lleno pasa al otro.
    expect(assignTeams(['a', 'b', 'c', 'd'], { a: 1, b: 1, c: 1 })).toEqual({ a: 1, b: 1, c: 0, d: 0 });
  });
});
