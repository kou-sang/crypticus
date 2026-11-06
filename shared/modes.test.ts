import { describe, expect, it } from 'vitest';
import {
  applyAnswer,
  createLiveState,
  nextDeadline,
  passCryptic,
  revealableIds,
  surrender,
  toggleEndVote,
  duelOneHitFromDeath,
  rankState,
  reserveAttempt,
  royaleRemaining,
  tick,
  type LiveState,
} from './engine';
import { buildConfig, DEFAULT_MODE_SETTINGS, type ModeSettings } from './gameModes';
import { validateConfig } from './scoring';
import { makeParticipant } from './testUtils';
import type { Difficulty } from './types';

const catalog = Object.fromEntries(
  ['e1', 'e2', 'm1', 'm2', 'h1', 'h2'].map((id) => [id, { tier: (id[0] === 'e' ? 'easy' : id[0] === 'm' ? 'medium' : 'hard') as Difficulty, hintCount: 2 }]),
);
const pool = { easy: ['e1', 'e2'], medium: ['m1', 'm2'], hard: ['h1', 'h2'] };
const first = () => 0;

function start(settings: Partial<ModeSettings>, players = ['a', 'b']): LiveState {
  const { config } = buildConfig({ ...DEFAULT_MODE_SETTINGS, ...settings });
  return createLiveState({
    competitionId: 'c',
    config,
    participants: players.map((uid) => makeParticipant({ uid })),
    crypticIds: ['e1', 'e2', 'm1', 'm2', 'h1', 'h2'],
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

describe('buildConfig', () => {
  it('cada modo produce una configuración válida', () => {
    for (const game of ['race', 'royale', 'duel'] as const) {
      const built = buildConfig({ ...DEFAULT_MODE_SETTINGS, game });
      expect(validateConfig(built.config, built.maxPlayers)).toEqual([]);
    }
    const peaceful = buildConfig({ ...DEFAULT_MODE_SETTINGS, race: { ...DEFAULT_MODE_SETTINGS.race, intensity: 'peaceful', difficultyVote: true } });
    expect(peaceful.config.flow).toBe('free');
    expect(peaceful.config.difficultyVote).toBe(false);
  });

  it('Boss queda deshabilitado (próximamente)', () => {
    const built = buildConfig({ ...DEFAULT_MODE_SETTINGS, game: 'boss' });
    expect(validateConfig(built.config, built.maxPlayers).length > 0).toBe(true);
  });
});

describe('Royale', () => {
  const royale = { game: 'royale' as const, royale: { baseSec: 60, incrementSec: 5, cooldownSec: 0 } };

  it('acertar suma segundos y avanza; el criptico es secuencial', () => {
    const state = start(royale);
    expect(() => reserveAttempt(state, 'a', 'e2', 1000)).toThrow();
    answer(state, 'a', 'e1', true, 1000);
    expect(state.participants.a!.cursor).toBe(1);
    expect(royaleRemaining(state, state.participants.a!, 1000)).toBe(64_000);
  });

  it('el último en pie gana; el ranking sigue el orden de eliminación', () => {
    const state = start(royale, ['a', 'b', 'c']);
    answer(state, 'a', 'e1', true, 1000); // a: 65 s
    answer(state, 'b', 'e1', true, 1000); // b: 65 s
    passCryptic(state, { uid: 'b', now: 2000 });
    expect(nextDeadline(state, 2000)).toBe(60_000); // c cae primero
    tick(state, 60_000);
    expect(state.participants.c!.eliminatedAt).toBe(60_000);
    answer(state, 'a', 'e2', true, 62_000); // a: 70 s
    tick(state, 65_000);
    expect(state.status).toBe('finished');
    expect(state.endReason).toBe('lastStanding');
    expect(state.winnerId).toBe('a');
    const ranked = rankState(state);
    expect(ranked.map((p) => p.uid)).toEqual(['a', 'b', 'c']);
  });
});

describe('Duel', () => {
  const duel = { game: 'duel' as const, duel: { hp: 100, damage: 'difficulty' as const, comeback: 'off' as const, cooldownSec: 0 } };

  it('acertar primero daña al rival, cierra el criptico y abre otro tras 3 s', () => {
    const state = start(duel);
    const round = state.round!;
    answer(state, 'a', round.crypticId, true, 1000);
    expect(state.participants.b!.score).toBe(100 - (round.tier === 'easy' ? 20 : round.tier === 'medium' ? 30 : 40));
    expect(state.round!.index).toBe(2);
    expect(state.round!.opensAt).toBe(4000);
    // Durante el intervalo no se puede responder.
    expect(() => reserveAttempt(state, 'b', state.round!.crypticId, 3000)).toThrow();
    expect(nextDeadline(state, 3000)).toBe(4000);
  });

  it('combo: aciertos seguidos pegan más fuerte; el acierto del rival lo corta', () => {
    const state = start({ ...duel, duel: { ...duel.duel, damage: 'speed' } });
    const hit = (uid: string) => {
      const before = Object.values(state.participants).find((p) => p.uid !== uid)!.score;
      const at = state.round!.opensAt!;
      answer(state, uid, state.round!.crypticId, true, at); // respuesta instantánea: base 40
      return before - Object.values(state.participants).find((p) => p.uid !== uid)!.score;
    };
    expect(hit('a')).toBe(40);
    expect(hit('a')).toBe(50); // ×1.25
    expect(state.participants.a!.streak).toBe(2);
    expect(hit('b')).toBe(40); // b corta el combo de a
    expect(state.participants.a!.streak).toBe(0);
  });

  it('avisa cuando un jugador está a un golpe de perder', () => {
    const state = start(duel);
    expect(duelOneHitFromDeath(state, 'b')).toBe(false);
    state.participants.b!.score = 40; // un difícil quita 40
    expect(duelOneHitFromDeath(state, 'b')).toBe(true);
  });

  it('nocaut: gana quien deja al rival sin vida', () => {
    const state = start(duel);
    let now = 1000;
    while (state.status === 'live' && state.round) {
      answer(state, 'a', state.round.crypticId, true, now);
      now = (state.round?.opensAt ?? now) + 1000;
    }
    expect(state.endReason).toBe('knockout');
    expect(state.winnerId).toBe('a');
  });
});

describe('Race hardcore', () => {
  it('muerte súbita: el rival tiene N segundos tras el primer acierto', () => {
    const state = start({ race: { ...DEFAULT_MODE_SETTINGS.race, suddenDeathSec: 5, target: 3 } });
    const id = state.round!.crypticId;
    answer(state, 'a', id, true, 1000);
    expect(state.round!.closesAt).toBe(6000);
    answer(state, 'b', id, true, 3000);
    expect(state.round!.index).toBe(2);
  });
});

describe('Race Pacífico (secuencial)', () => {
  const peaceful = { race: { ...DEFAULT_MODE_SETTINGS.race, intensity: 'peaceful' as const, target: 2 } };

  it('siempre el actual: no se puede responder el siguiente ni durante la pausa', () => {
    const state = start(peaceful);
    expect(() => reserveAttempt(state, 'a', 'e2', 1000)).toThrow();
    answer(state, 'a', 'e1', true, 1000);
    expect(state.participants.a!.cursor).toBe(1);
    expect(() => reserveAttempt(state, 'a', 'e2', 2000)).toThrow(); // pausa de 3 s
    expect(nextDeadline(state, 2000)).toBe(4000);
    answer(state, 'a', 'e2', true, 4500);
    expect(state.status).toBe('finished');
    expect(state.winnerId).toBe('a');
  });

  it('al terminar solo se revelan los cripticos que se llegaron a jugar', () => {
    const state = start(peaceful);
    answer(state, 'a', 'e1', true, 1000);
    answer(state, 'a', 'e2', true, 4500);
    expect(revealableIds(state)).toEqual(['e1', 'e2']);
  });

  it('rendirse pasa al siguiente y tiene usos limitados', () => {
    const state = start({ race: { ...peaceful.race, surrender: { enabled: true, maxUses: 1 } } });
    surrender(state, { uid: 'b', now: 1000 });
    expect(state.participants.b!.cursor).toBe(1);
    expect(() => surrender(state, { uid: 'b', now: 5000 })).toThrow();
  });

  it('cooldown entre respuestas', () => {
    const state = start({ race: { ...peaceful.race, cooldownSec: 3 } });
    answer(state, 'a', 'e1', false, 1000);
    expect(() => reserveAttempt(state, 'a', 'e1', 3000)).toThrow();
    expect(() => reserveAttempt(state, 'a', 'e1', 4000)).not.toThrow();
  });
});

describe('Race Hardcore: rendirse', () => {
  it('da 5 s al resto; si todos se rinden, pasa al siguiente', () => {
    const state = start({ race: { ...DEFAULT_MODE_SETTINGS.race, intensity: 'hardcore', suddenDeathSec: 0 } }, ['a', 'b', 'c']);
    surrender(state, { uid: 'a', now: 1000 });
    expect(state.round!.closesAt).toBe(6000);
    expect(() => reserveAttempt(state, 'a', state.round!.crypticId, 1500)).toThrow();
    surrender(state, { uid: 'b', now: 2000 });
    surrender(state, { uid: 'c', now: 2500 });
    expect(state.round!.index).toBe(2);
    expect(state.round!.opensAt).toBe(5500);
  });

  it('una ronda que no llegó a abrir no se revela al terminar', () => {
    const state = start({ race: { ...DEFAULT_MODE_SETTINGS.race, intensity: 'hardcore', suddenDeathSec: 0 } });
    const first = state.round!.crypticId;
    answer(state, 'a', first, true, 1000);
    toggleEndVote(state, { uid: 'a', now: 1500 });
    toggleEndVote(state, { uid: 'b', now: 1600 });
    expect(revealableIds(state)).toEqual([first]);
  });
});
