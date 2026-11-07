import { describe, expect, it } from 'vitest';
import {
  applyAnswer,
  createLiveState,
  inTiebreak,
  nextDeadline,
  rankState,
  reserveAttempt,
  revealableIds,
  surrender,
  tick,
  TIEBREAK_INTRO_MS,
  TIEBREAK_TIME_MS,
  type LiveState,
} from './engine';
import { buildConfig, DEFAULT_MODE_SETTINGS, type ModeSettings } from './gameModes';
import { selectTiebreakers } from './selection';
import { makeParticipant } from './testUtils';
import type { Difficulty } from './types';

const ids = ['e1', 'e2', 'm1', 'm2', 'h1', 'h2', 't1', 't2'];
const catalog = Object.fromEntries(
  ids.map((id) => [id, { tier: (id[0] === 'e' ? 'easy' : id[0] === 'h' ? 'hard' : 'medium') as Difficulty, hintCount: 2 }]),
);
const first = () => 0;
const END = 600_000; // Race: 10 minutos.
const peaceful = { race: { ...DEFAULT_MODE_SETTINGS.race, intensity: 'peaceful' as const, target: 6 } };

function start(settings: Partial<ModeSettings>, players = ['a', 'b'], tiebreakIds = ['t1', 't2']): LiveState {
  const { config } = buildConfig({ ...DEFAULT_MODE_SETTINGS, ...settings });
  return createLiveState({
    competitionId: 'c',
    config,
    participants: players.map((uid) => makeParticipant({ uid })),
    crypticIds: ids.slice(0, 6),
    pool: { easy: ['e1', 'e2'], medium: ['m1', 'm2'], hard: ['h1', 'h2'] },
    catalog,
    tiebreakIds,
    startedAt: 0,
    random: first,
  });
}

function answer(state: LiveState, uid: string, crypticId: string, correct: boolean, now: number) {
  reserveAttempt(state, uid, crypticId, now);
  return applyAnswer(state, { uid, crypticId, correct, now, random: first });
}

describe('Muerte súbita de desempate', () => {
  it('un empate al final abre el desempate y gana el primero que acierta', () => {
    const state = start(peaceful);
    tick(state, END);
    expect(state.status).toBe('live');
    expect(inTiebreak(state)).toBe(true);
    expect(state.tiebreak!.uids).toEqual(['a', 'b']);
    expect(nextDeadline(state, END)).toBe(END + TIEBREAK_INTRO_MS);
    // No se responde antes de que abra, ni los cripticos normales.
    expect(() => reserveAttempt(state, 'a', 't1', END + 1000)).toThrow();
    expect(() => reserveAttempt(state, 'a', 'e1', END + TIEBREAK_INTRO_MS)).toThrow();

    const opened = END + TIEBREAK_INTRO_MS;
    expect(answer(state, 'a', 't1', false, opened + 1000).finished).toBe(false);
    const won = answer(state, 'b', 't1', true, opened + 2000);
    expect(won.correct).toBe(true);
    expect(state.status).toBe('finished');
    expect(state.endReason).toBe('tiebreak');
    expect(state.winnerId).toBe('b');
    const ranked = rankState(state);
    expect(ranked[0]!.uid).toBe('b');
    expect(ranked[1]!.rank).toBe(2);
    // Un acierto que llega tarde (arbitraje) se informa como tardío, sin error.
    expect(applyAnswer(state, { uid: 'a', crypticId: 't1', correct: true, now: opened + 2001 }).stale).toBe(true);
    expect(revealableIds(state)).toContain('t1');
    expect(revealableIds(state)).not.toContain('t2');
  });

  it('sin acierto pasa al siguiente; agotados, se mantiene el empate', () => {
    const state = start(peaceful);
    tick(state, END);
    const firstClose = state.tiebreak!.closesAt;
    expect(firstClose).toBe(END + TIEBREAK_INTRO_MS + TIEBREAK_TIME_MS);
    tick(state, firstClose);
    expect(state.tiebreak!.crypticId).toBe('t2');
    expect(state.tiebreak!.index).toBe(1);
    expect(revealableIds(state)).toEqual(['t1']); // el anterior ya se puede mostrar
    tick(state, state.tiebreak!.closesAt);
    expect(state.status).toBe('finished');
    expect(state.endReason).toBe('time');
    expect(state.winnerId).toBeNull();
  });

  it('solo responden los empatados en la cima', () => {
    const state = start(peaceful, ['a', 'b', 'c']);
    answer(state, 'a', 'e1', true, 1000);
    answer(state, 'b', 'e1', true, 1000); // mismo instante: mismos puntos
    tick(state, END);
    expect(state.tiebreak!.uids.sort()).toEqual(['a', 'b']);
    expect(() => reserveAttempt(state, 'c', 't1', END + TIEBREAK_INTRO_MS)).toThrow();
    // Durante el desempate no hay rendiciones ni pistas.
    expect(() => surrender(state, { uid: 'a', now: END + TIEBREAK_INTRO_MS })).toThrow();
  });

  it('sin cripticos de desempate termina como antes', () => {
    const state = start(peaceful, ['a', 'b'], []);
    tick(state, END);
    expect(state.status).toBe('finished');
    expect(state.tiebreak).toBeNull();
  });

  it('con un ganador claro no hay desempate', () => {
    const state = start(peaceful);
    answer(state, 'a', 'e1', true, 1000);
    tick(state, END);
    expect(state.status).toBe('finished');
    expect(state.winnerId).toBe('a');
  });
});

describe('selectTiebreakers', () => {
  it('uno por dificultad, de fácil a difícil', () => {
    const picked = selectTiebreakers({ easy: ['te'], medium: ['tm'], hard: ['th'] }, new Map(), first);
    expect(picked).toEqual(['te', 'tm', 'th']);
  });

  it('completa con otras dificultades y prefiere los no vistos', () => {
    const seen = new Map([['m1', 5]]);
    const picked = selectTiebreakers({ easy: [], medium: ['m1', 'm2', 'm3'], hard: [] }, seen, first);
    expect(picked).toHaveLength(3);
    expect(picked[0]).not.toBe('m1');
  });
});
