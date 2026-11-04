import { describe, expect, it } from 'vitest';
import {
  computeRatingDeltas,
  computeSolvePoints,
  evaluateEnd,
  nextPendingClue,
  rankParticipants,
  validateConfig,
  DEFAULT_CONFIG,
} from './scoring';
import type { Participant } from './types';

const makeParticipant = (overrides: Partial<Participant> & { uid: string }): Participant => ({
  displayName: overrides.uid,
  score: 0,
  solvedIds: [],
  hintsByClue: {},
  hintsUsed: 0,
  attempts: 0,
  lastSolvedAt: null,
  lastAttemptAt: null,
  joinedAt: 0,
  ...overrides,
});

const baseCompetition = {
  mode: 'timed' as const,
  scoring: 'standard' as const,
  targetCount: 3,
  winByTwoMinScore: 3,
  endsAt: 10_000,
  crypticIds: ['a', 'b', 'c', 'd', 'e'],
};

describe('computeSolvePoints', () => {
  it('standard escala con la dificultad', () => {
    const easy = computeSolvePoints({ rule: 'standard', difficulty: 1, hintsUsed: 0, elapsedMs: 0, durationMs: 1 });
    const hard = computeSolvePoints({ rule: 'standard', difficulty: 5, hintsUsed: 0, elapsedMs: 0, durationMs: 1 });
    expect(easy).toBe(100);
    expect(hard).toBe(200);
  });

  it('fewestHints penaliza pistas con un mínimo', () => {
    expect(computeSolvePoints({ rule: 'fewestHints', difficulty: 1, hintsUsed: 1, elapsedMs: 0, durationMs: 1 })).toBe(70);
    expect(computeSolvePoints({ rule: 'fewestHints', difficulty: 1, hintsUsed: 10, elapsedMs: 0, durationMs: 1 })).toBe(10);
  });

  it('speed da más puntos al resolver antes', () => {
    const early = computeSolvePoints({ rule: 'speed', difficulty: 1, hintsUsed: 0, elapsedMs: 0, durationMs: 1000 });
    const late = computeSolvePoints({ rule: 'speed', difficulty: 1, hintsUsed: 0, elapsedMs: 1000, durationMs: 1000 });
    expect(early).toBe(200);
    expect(late).toBe(100);
  });

  it('winByTwo siempre vale 1', () => {
    expect(computeSolvePoints({ rule: 'winByTwo', difficulty: 5, hintsUsed: 3, elapsedMs: 0, durationMs: 1 })).toBe(1);
  });
});

describe('rankParticipants', () => {
  it('desempata por pistas y luego por tiempo', () => {
    const ranked = rankParticipants([
      makeParticipant({ uid: 'slow', score: 100, lastSolvedAt: 50 }),
      makeParticipant({ uid: 'hinty', score: 100, hintsUsed: 2, lastSolvedAt: 10 }),
      makeParticipant({ uid: 'fast', score: 100, lastSolvedAt: 20 }),
      makeParticipant({ uid: 'top', score: 200 }),
    ]);
    expect(ranked.map((p) => p.uid)).toEqual(['top', 'fast', 'slow', 'hinty']);
    expect(ranked.map((p) => p.rank)).toEqual([1, 2, 3, 4]);
  });

  it('empates exactos comparten posición', () => {
    const ranked = rankParticipants([
      makeParticipant({ uid: 'a', score: 50, joinedAt: 1 }),
      makeParticipant({ uid: 'b', score: 50, joinedAt: 2 }),
      makeParticipant({ uid: 'c', score: 10 }),
    ]);
    expect(ranked.map((p) => p.rank)).toEqual([1, 1, 3]);
  });
});

describe('evaluateEnd', () => {
  it('timed termina al cumplirse endsAt', () => {
    const players = [makeParticipant({ uid: 'a', score: 100 }), makeParticipant({ uid: 'b' })];
    expect(evaluateEnd(baseCompetition, players, 9_999).finished).toBe(false);
    expect(evaluateEnd(baseCompetition, players, 10_000)).toEqual({ finished: true, reason: 'time', winnerId: 'a' });
  });

  it('timed sin ganador si hay empate', () => {
    const players = [makeParticipant({ uid: 'a' }), makeParticipant({ uid: 'b' })];
    expect(evaluateEnd(baseCompetition, players, 10_000).winnerId).toBeNull();
  });

  it('count termina cuando alguien llega a la meta', () => {
    const competition = { ...baseCompetition, mode: 'count' as const };
    const players = [
      makeParticipant({ uid: 'a', solvedIds: ['a', 'b', 'c'], score: 300, lastSolvedAt: 5 }),
      makeParticipant({ uid: 'b', solvedIds: ['a', 'b'], score: 400, lastSolvedAt: 3 }),
    ];
    expect(evaluateEnd(competition, players, 0)).toEqual({ finished: true, reason: 'target', winnerId: 'a' });
  });

  it('winByTwo exige mínimo y ventaja de 2', () => {
    const competition = { ...baseCompetition, scoring: 'winByTwo' as const, endsAt: null };
    const notYet = [makeParticipant({ uid: 'a', score: 3 }), makeParticipant({ uid: 'b', score: 2 })];
    expect(evaluateEnd(competition, notYet, 0).finished).toBe(false);
    const tooLow = [makeParticipant({ uid: 'a', score: 2 }), makeParticipant({ uid: 'b', score: 0 })];
    expect(evaluateEnd(competition, tooLow, 0).finished).toBe(false);
    const done = [makeParticipant({ uid: 'a', score: 5 }), makeParticipant({ uid: 'b', score: 3 })];
    expect(evaluateEnd(competition, done, 0)).toEqual({ finished: true, reason: 'winByTwo', winnerId: 'a' });
  });

  it('termina si todos agotaron los cripticos', () => {
    const all = baseCompetition.crypticIds;
    const players = [makeParticipant({ uid: 'a', solvedIds: all, score: 5 }), makeParticipant({ uid: 'b', solvedIds: all, score: 4 })];
    expect(evaluateEnd({ ...baseCompetition, endsAt: null }, players, 0).reason).toBe('exhausted');
  });
});

describe('computeRatingDeltas', () => {
  it('es de suma cero entre ratings iguales', () => {
    const ranked = rankParticipants([makeParticipant({ uid: 'a', score: 2 }), makeParticipant({ uid: 'b', score: 1 })]);
    const deltas = computeRatingDeltas(ranked, { a: 1200, b: 1200 });
    expect(deltas).toEqual({ a: 16, b: -16 });
  });

  it('un único jugador no cambia rating', () => {
    const ranked = rankParticipants([makeParticipant({ uid: 'a' })]);
    expect(computeRatingDeltas(ranked, {})).toEqual({ a: 0 });
  });
});

describe('validateConfig', () => {
  it('acepta la configuración por defecto', () => {
    expect(validateConfig(DEFAULT_CONFIG, 8)).toEqual([]);
  });
  it('winByTwo exige 2 jugadores', () => {
    expect(validateConfig({ ...DEFAULT_CONFIG, scoring: 'winByTwo' }, 4)).toHaveLength(1);
  });
});

describe('nextPendingClue', () => {
  it('devuelve el primer no resuelto', () => {
    expect(nextPendingClue(['a', 'b', 'c'], ['a'])).toBe('b');
    expect(nextPendingClue(['a'], ['a'])).toBeNull();
  });
});
