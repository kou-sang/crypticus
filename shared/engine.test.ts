import { describe, expect, it } from 'vitest';
import {
  applyAnswer,
  applyDifficultyVote,
  applyHint,
  createLiveState,
  reserveAttempt,
  resolveVote,
  revealableIds,
  tick,
  toggleExtraTime,
  toggleSkip,
  type LiveState,
} from './engine';
import { DEFAULT_CONFIG, rankParticipants } from './scoring';
import { makeParticipant } from './testUtils';
import type { CompetitionConfig, Difficulty } from './types';

const catalog = {
  e1: { tier: 'easy' as Difficulty, hintCount: 2 },
  e2: { tier: 'easy' as Difficulty, hintCount: 2 },
  m1: { tier: 'medium' as Difficulty, hintCount: 2 },
  m2: { tier: 'medium' as Difficulty, hintCount: 2 },
  h1: { tier: 'hard' as Difficulty, hintCount: 2 },
  h2: { tier: 'hard' as Difficulty, hintCount: 2 },
};
const pool = { easy: ['e1', 'e2'], medium: ['m1', 'm2'], hard: ['h1', 'h2'] };
const first = () => 0; // RNG determinista: siempre el primero disponible

function setup(config: Partial<CompetitionConfig> = {}, players = ['a', 'b']): LiveState {
  return createLiveState({
    competitionId: 'c',
    config: { ...DEFAULT_CONFIG, durationSec: 100, ...config },
    participants: players.map((uid) => makeParticipant({ uid })),
    crypticIds: ['e1', 'm1', 'h1'],
    pool,
    catalog,
    startedAt: 0,
    random: first,
  });
}

function answer(state: LiveState, uid: string, crypticId: string, correct: boolean, now: number) {
  reserveAttempt(state, uid, crypticId, now);
  return applyAnswer(state, { uid, crypticId, correct, now, random: first });
}

describe('flujo libre por tiempo', () => {
  it('suma puntos y termina al acabar el tiempo', () => {
    const state = setup();
    expect(answer(state, 'a', 'h1', true, 1000).points).toBe(200);
    expect(tick(state, 99_999).finished).toBe(false);
    expect(tick(state, 100_000).finished).toBe(true);
    expect(state.winnerId).toBe('a');
    expect(state.endReason).toBe('time');
  });

  it('anti fuerza bruta y penalización por error', () => {
    const state = setup({ wrongPenalty: 20 });
    answer(state, 'a', 'e1', true, 1000);
    answer(state, 'a', 'm1', false, 2000);
    expect(state.participants.a!.score).toBe(80);
    expect(() => reserveAttempt(state, 'a', 'm1', 2100)).toThrow();
  });

  it('no permite repetir un criptico resuelto', () => {
    const state = setup();
    answer(state, 'a', 'e1', true, 1000);
    expect(() => reserveAttempt(state, 'a', 'e1', 5000)).toThrow();
  });
});

describe('modo cantidad + diferencia de dos', () => {
  it('no termina sin 2 de ventaja; sí con ella', () => {
    const state = setup({ mode: 'count', targetCount: 1, winByTwo: true });
    answer(state, 'a', 'e1', true, 1000);
    expect(state.status).toBe('live');
    answer(state, 'a', 'm1', true, 2000);
    expect(state.status).toBe('finished');
    expect(state.endReason).toBe('winByTwo');
    expect(state.winnerId).toBe('a');
  });

  it('abre prórroga al acabar el tiempo sin ventaja', () => {
    const state = setup({ winByTwo: true });
    answer(state, 'a', 'e1', true, 1000);
    expect(tick(state, 100_000).finished).toBe(false);
    expect(state.overtimeEndsAt).toBe(150_000);
    answer(state, 'a', 'm1', true, 110_000);
    expect(state.endReason).toBe('winByTwo');
  });

  it('la prórroga expira', () => {
    const state = setup({ winByTwo: true });
    tick(state, 100_000);
    expect(tick(state, 150_000).finished).toBe(true);
    expect(state.endReason).toBe('time');
  });
});

describe('rondas y votación', () => {
  it('el primero en acertar gana la ronda y se abre otra', () => {
    const state = setup({ flow: 'rounds' });
    expect(state.round?.crypticId).toBe('m1');
    answer(state, 'a', 'm1', true, 1000);
    expect(state.round?.index).toBe(2);
    // B llega tarde a la ronda anterior
    expect(() => reserveAttempt(state, 'b', 'm1', 1500)).toThrow();
  });

  it('respuesta correcta pero obsoleta tras el await', () => {
    const state = setup({ flow: 'rounds' });
    reserveAttempt(state, 'a', 'm1', 1000);
    reserveAttempt(state, 'b', 'm1', 1000);
    applyAnswer(state, { uid: 'a', crypticId: 'm1', correct: true, now: 1000, random: first });
    const late = applyAnswer(state, { uid: 'b', crypticId: 'm1', correct: true, now: 1001, random: first });
    expect(late.stale).toBe(true);
    expect(state.participants.b!.score).toBe(0);
  });

  it('la votación elige la dificultad del siguiente', () => {
    const state = setup({ flow: 'rounds', difficultyVote: true });
    applyDifficultyVote(state, { uid: 'a', tier: 'hard', now: 500 });
    applyDifficultyVote(state, { uid: 'b', tier: 'hard', now: 500 });
    answer(state, 'a', 'm1', true, 1000);
    expect(state.round?.tier).toBe('hard');
  });

  it('empate: gana el voto del que va perdiendo', () => {
    const ranked = rankParticipants([makeParticipant({ uid: 'lead', score: 500 }), makeParticipant({ uid: 'last', score: 100 })]);
    expect(resolveVote({ lead: 'easy', last: 'hard' }, ranked)).toBe('hard');
    expect(resolveVote({}, ranked)).toBeNull();
  });

  it('pasar requiere unanimidad', () => {
    const state = setup({ flow: 'rounds' });
    expect(toggleSkip(state, { uid: 'a', now: 1000, random: first }).skipped).toBe(false);
    expect(toggleSkip(state, { uid: 'b', now: 1000, random: first }).skipped).toBe(true);
    expect(state.round?.index).toBe(2);
  });

  it('termina al agotar el pool', () => {
    const state = createLiveState({
      competitionId: 'c',
      config: { ...DEFAULT_CONFIG, flow: 'rounds' },
      participants: [makeParticipant({ uid: 'a' })],
      crypticIds: ['m1'],
      pool: { easy: [], medium: ['m1'], hard: [] },
      catalog,
      startedAt: 0,
      random: first,
    });
    answer(state, 'a', 'm1', true, 1000);
    expect(state.endReason).toBe('exhausted');
  });
});

describe('tiempo extra', () => {
  it('se aplica por unanimidad y descuenta usos', () => {
    const state = setup({ extraTime: { enabled: true, seconds: 30, maxUses: 1 } });
    toggleExtraTime(state, { uid: 'a', now: 1000 });
    expect(state.endsAt).toBe(100_000);
    expect(toggleExtraTime(state, { uid: 'b', now: 1000 }).applied).toBe(true);
    expect(state.endsAt).toBe(130_000);
    expect(() => toggleExtraTime(state, { uid: 'a', now: 2000 })).toThrow();
  });

  it('deshabilitado lanza error', () => {
    const state = setup();
    expect(() => toggleExtraTime(state, { uid: 'a', now: 1000 })).toThrow();
  });
});

describe('modo jefe', () => {
  it('el daño depende del tiempo restante', () => {
    const state = setup({ mode: 'boss', bossLevel: 'normal' }, ['a']);
    expect(state.boss).toEqual({ maxHp: 350, hp: 350 });
    expect(answer(state, 'a', 'h1', true, 0).points).toBe(200);
    expect(answer(state, 'a', 'm1', true, 50_000).points).toBe(75);
    expect(state.boss?.hp).toBe(75);
    // Último criptico disponible sin derrotarlo: el jefe sobrevive.
    answer(state, 'a', 'e1', true, 51_000);
    expect(state.boss?.hp).toBe(26);
    expect(state.endReason).toBe('bossSurvived');
  });

  it('victoria al llegar a 0', () => {
    const state = setup({ mode: 'boss', bossLevel: 'normal' }, ['a']);
    state.boss = { maxHp: 350, hp: 100 };
    answer(state, 'a', 'h1', true, 0);
    expect(state.endReason).toBe('bossDefeated');
    expect(state.boss.hp).toBe(0);
  });
});

describe('pistas', () => {
  it('limita por configuración y por cantidad disponible', () => {
    const state = setup({ maxHintsPerClue: 1 });
    expect(applyHint(state, { uid: 'a', crypticId: 'e1', reveal: true, now: 1000 }).used).toBe(1);
    expect(() => applyHint(state, { uid: 'a', crypticId: 'e1', reveal: true, now: 1000 })).toThrow();
    expect(applyHint(state, { uid: 'a', crypticId: 'e1', reveal: false, now: 1000 })).toEqual({ used: 1, maxAllowed: 1 });
  });
});

describe('cuenta atrás tras acierto (rondas)', () => {
  it('el rival tiene N segundos; al vencer, nueva ronda', () => {
    const state = setup({ flow: 'rounds', rivalCountdownSec: 10 });
    answer(state, 'a', 'm1', true, 1000);
    expect(state.round?.closesAt).toBe(11_000);
    expect(state.round?.index).toBe(1);
    expect(() => reserveAttempt(state, 'a', 'm1', 3000)).toThrow(); // ya lo resolvió
    tick(state, 11_000, first);
    expect(state.round?.index).toBe(2);
  });

  it('si todos aciertan, avanza sin esperar', () => {
    const state = setup({ flow: 'rounds', rivalCountdownSec: 10 });
    answer(state, 'a', 'm1', true, 1000);
    answer(state, 'b', 'm1', true, 3000);
    expect(state.round?.index).toBe(2);
    expect(state.participants.b!.score).toBeGreaterThan(0);
  });
});

describe('jefe: fallar lo cura', () => {
  it('recupera vida sin superar el máximo', () => {
    const state = setup({ mode: 'boss', bossLevel: 'normal' }, ['a']);
    answer(state, 'a', 'h1', false, 1000);
    expect(state.boss?.hp).toBe(350);
    answer(state, 'a', 'h1', true, 2000);
    const afterHit = state.boss!.hp;
    answer(state, 'a', 'm1', false, 3000);
    expect(state.boss?.hp).toBe(afterHit + 15);
  });
});

describe('revealableIds', () => {
  it('flujo libre: nada en vivo, todo al terminar', () => {
    const state = setup();
    expect(revealableIds(state)).toEqual([]);
    tick(state, 200_000);
    expect(state.status).toBe('finished');
    expect(revealableIds(state)).toEqual(['e1', 'm1', 'h1']);
  });

  it('rondas: solo las cerradas, nunca la actual', () => {
    const state = setup({ flow: 'rounds' });
    expect(revealableIds(state)).toEqual([]);
    answer(state, 'a', 'm1', true, 1000);
    expect(revealableIds(state)).toEqual(['m1']);
    expect(revealableIds(state)).not.toContain(state.round?.crypticId);
  });
});
