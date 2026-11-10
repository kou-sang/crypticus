import { describe, expect, it } from 'vitest';
import { BOSS_HP_PER_PLAYER, partyFactor } from './balance';
import type { BossId } from './catalog/bosses';
import type { CharacterId } from './catalog/characters';
import { CoopSetupError, bossDamage, createCoopGame, currentBoss, gameTime, offerPrice, reduceCoop, type CoopAction } from './engine';
import type { CoopEvent } from './events';
import type { CoopState } from './state';

const T0 = 1_000_000;
const BASIC: CharacterId[] = ['enoch', 'mathusala', 'urias', 'eliseus'];

/** Primera semilla cuyo primer jefe es `boss`. */
function seedFor(boss: BossId, characters = BASIC): number {
  for (let seed = 1; seed < 5_000; seed += 1) {
    const { state } = createCoopGame({ seed, level: 'AT', players: setup(characters), now: T0 });
    if (state.bosses[0]!.id === boss) return seed;
  }
  throw new Error(`Sin semilla para ${boss}`);
}

function setup(characters: CharacterId[]) {
  return characters.map((character, i) => ({ id: `p${i}`, name: `P${i}`, character }));
}

/** Partida en la ronda 1 (después de la presentación de 5 s). */
function startGame(boss: BossId, characters = BASIC) {
  const seed = seedFor(boss, characters);
  const created = createCoopGame({ seed, level: 'AT', players: setup(characters), now: T0 });
  const started = reduceCoop(created.state, { type: 'tick' }, T0 + 5_000);
  return { state: started.state, now: T0 + 5_000, events: [...created.events, ...started.events] };
}

function act(state: CoopState, action: CoopAction, now: number) {
  const result = reduceCoop(state, action, now);
  if (result.rejected) throw new Error(result.rejected);
  return result;
}

/** Todos los vivos (salvo `except`) resuelven sus cripticos en `now`. */
function solveAll(state: CoopState, now: number, except: string[] = []) {
  let current = state;
  const events: CoopEvent[] = [];
  for (const player of state.players) {
    if (player.status !== 'alive' || except.includes(player.id)) continue;
    player.assignments.forEach((_, slot) => {
      const result = act(current, { type: 'solve', playerId: player.id, slot }, now);
      current = result.state;
      events.push(...result.events);
    });
  }
  return { state: current, events };
}

const ofType = <T extends CoopEvent['type']>(events: CoopEvent[], type: T) =>
  events.filter((e): e is Extract<CoopEvent, { type: T }> => e.type === type);

describe('createCoopGame', () => {
  it('valida party, personajes únicos y nivel', () => {
    expect(() => createCoopGame({ seed: 1, level: 'AT', players: setup(['enoch', 'mathusala', 'urias']), now: T0 })).toThrow(CoopSetupError);
    expect(() => createCoopGame({ seed: 1, level: 'AT', players: setup(['enoch', 'enoch', 'urias', 'nathan']), now: T0 })).toThrow(CoopSetupError);
    expect(() => createCoopGame({ seed: 1, level: 'NT', players: setup(BASIC), now: T0 })).toThrow(CoopSetupError);
  });

  it('4 jefes distintos con categorías Easy → Expert y vida según la fórmula', () => {
    const { state } = createCoopGame({ seed: 42, level: 'AT', players: setup(BASIC), now: T0 });
    expect(state.bosses.map((b) => b.category)).toEqual(['easy', 'medium', 'difficult', 'expert']);
    expect(new Set(state.bosses.map((b) => b.id)).size).toBe(4);
    for (const boss of state.bosses) {
      const base = Math.round(partyFactor(4) * 4 * BOSS_HP_PER_PLAYER[boss.category] * (boss.id === 'leviathan' ? 1.3 : 1));
      expect(boss.maxHp).toBe(base); // GOLIATH recibe su bonus al aparecer, no al crearse.
    }
    expect(state.players.find((p) => p.character === 'mathusala')!.hp).toBe(900);
  });

  it('presentación de 5 s con el reloj detenido y ronda 1 normal con 2 cripticos', () => {
    const { state, events } = startGame('serpentis');
    expect(state.phase).toBe('round');
    expect(state.roundNumber).toBe(1);
    expect(gameTime(state, T0 + 5_000)).toBe(0);
    expect(state.players.every((p) => p.assignments.length === 2)).toBe(true);
    expect(ofType(events, 'bossIntro')).toHaveLength(1);
  });
});

describe('ronda normal', () => {
  it('termina cuando todos resuelven: cada uno ataca y gana 15 + ronda de oro por criptico', () => {
    const game = startGame('serpentis');
    const boss = currentBoss(game.state)!;
    const { state, events } = solveAll(game.state, game.now + 20_000);
    expect(ofType(events, 'roundEnd')[0]!.winners).toHaveLength(4);
    expect(currentBoss(state)!.hp).toBe(boss.maxHp - 4 * 30);
    expect(state.players.every((p) => p.gold === 2 * 16)).toBe(true);
    expect(state.roundNumber).toBe(2);
  });

  it('quien no resuelve a tiempo recibe el golpe del jefe', () => {
    const game = startGame('serpentis');
    const solved = solveAll(game.state, game.now + 10_000, ['p0']);
    const { state, events } = reduceCoop(solved.state, { type: 'tick' }, game.now + 80_000);
    const hit = ofType(events, 'bossHit');
    expect(hit.map((h) => h.playerId)).toEqual(['p0']);
    // 1,5 × 50 × (1 + 80/1320) ≈ 79,5 → 80.
    expect(hit[0]!.amount).toBe(80);
    expect(state.players[0]!.hp).toBe(300 - 80);
    expect(state.players[0]!.gold).toBe(0);
  });

  it('es determinista: mismas acciones, mismo estado', () => {
    const run = () => {
      const game = startGame('behemoth');
      const solved = solveAll(game.state, game.now + 10_000, ['p1', 'p2']);
      return reduceCoop(solved.state, { type: 'tick' }, game.now + 200_000).state;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe('ronda difícil y tienda', () => {
  /** Avanza resolviendo todo hasta la primera ronda difícil. */
  function toHardRound() {
    let { state, now } = startGame('serpentis');
    for (let i = 0; i < 2; i += 1) {
      now += 10_000;
      state = solveAll(state, now).state;
    }
    expect(state.roundKind).toBe('hard');
    expect(state.players.every((p) => p.assignments.length === 1)).toBe(true);
    return { state, now };
  }

  it('si alguno falla, todos reciben daño y no hay tienda', () => {
    const { state, now } = toHardRound();
    const solved = solveAll(state, now + 5_000, ['p3']);
    const result = reduceCoop(solved.state, { type: 'tick' }, now + 30_000);
    expect(ofType(result.events, 'bossHit')).toHaveLength(4);
    expect(result.state.phase).toBe('round');
    expect(result.state.shopsOpened).toBe(0);
  });

  it('si todos resuelven, todos atacan y se abre la tienda por 45 s', () => {
    const { state, now } = toHardRound();
    const { state: shopState, events } = solveAll(state, now + 5_000);
    expect(ofType(events, 'playerHit')).toHaveLength(4);
    expect(shopState.phase).toBe('shop');
    expect(shopState.shop!.endsGt - gameTime(shopState, now + 5_000)).toBe(45_000);
    // ELISEUS: una opción más y siempre la poción de curación.
    const eliseus = shopState.players.find((p) => p.character === 'eliseus')!;
    const offers = shopState.shop!.offers[eliseus.id]!;
    expect(offers.length).toBeGreaterThanOrEqual(3);
    expect(offers.some((o) => o.itemId === 'healingPotion')).toBe(true);
    // Todos listos: la tienda se cierra antes.
    let current = shopState;
    for (const p of current.players) current = act(current, { type: 'shopDone', playerId: p.id }, now + 6_000).state;
    expect(current.phase).toBe('round');
  });

  it('comprar descuenta oro, ocupa casilla y respeta el inventario lleno', () => {
    const { state, now } = toHardRound();
    const { state: shopState } = solveAll(state, now + 5_000);
    const buyer = shopState.players[3]!; // ELISEUS
    buyer.gold = 1_000;
    const potion = shopState.shop!.offers[buyer.id]!.find((o) => o.itemId === 'healingPotion')!;
    const price = offerPrice(shopState, buyer, potion);
    const after = act(shopState, { type: 'buy', playerId: buyer.id, offerId: potion.id }, now + 6_000).state;
    expect(after.players[3]!.gold).toBe(1_000 - price);
    expect(after.players[3]!.inventory).toHaveLength(1);
    expect(reduceCoop(after, { type: 'buy', playerId: buyer.id, offerId: potion.id }, now + 7_000).rejected).toBe('Ya lo compraste.');
  });
});

describe('personajes', () => {
  it('URIAS al morir cura a los vivos y les da +15 % de ataque', () => {
    const game = startGame('serpentis');
    game.state.players[2]!.hp = 1; // URIAS
    game.state.players[0]!.hp = 100;
    const solved = solveAll(game.state, game.now + 10_000, ['p2']);
    const { state, events } = reduceCoop(solved.state, { type: 'tick' }, game.now + 80_000);
    expect(state.players[2]!.status).toBe('dead');
    expect(ofType(events, 'death').map((e) => e.playerId)).toEqual(['p2']);
    expect(state.players[0]!.hp).toBe(300);
    expect(state.players[0]!.uriasBlessing).toBeCloseTo(0.15);
  });

  it('ENOCH: si muere dentro de los 20 s de su activa, vuelve con 50 %; después, no', () => {
    // Ronda difícil (30 s): activa a los 15 s y el golpe llega a los 30 s, dentro de la ventana.
    let { state, now } = startGame('serpentis');
    for (let i = 0; i < 2; i += 1) {
      now += 10_000;
      state = solveAll(state, now).state;
    }
    state.players[0]!.hp = 1;
    state = act(state, { type: 'useActive', playerId: 'p0' }, now + 15_000).state;
    state = solveAll(state, now + 16_000, ['p0']).state;
    const saved = reduceCoop(state, { type: 'tick' }, now + 30_000);
    expect(ofType(saved.events, 'revive').map((e) => e.playerId)).toEqual(['p0']);
    expect(saved.state.players[0]!.hp).toBe(150);

    // En una ronda normal (80 s), la protección vence antes del golpe.
    const game = startGame('serpentis');
    game.state.players[0]!.hp = 1;
    const guarded = act(game.state, { type: 'useActive', playerId: 'p0' }, game.now + 1_000).state;
    const late = reduceCoop(solveAll(guarded, game.now + 2_000, ['p0']).state, { type: 'tick' }, game.now + 80_000).state;
    expect(late.players[0]!.status).toBe('dead');
  });

  it('SAMSON se sacrifica y al final de la ronda hace 500 % de daño', () => {
    const game = startGame('serpentis', ['samson', 'mathusala', 'urias', 'eliseus']);
    const boss = currentBoss(game.state)!;
    const used = act(game.state, { type: 'useActive', playerId: 'p0' }, game.now + 1_000);
    expect(used.state.players[0]!.status).toBe('dead');
    const { state, events } = solveAll(used.state, game.now + 10_000, ['p0']);
    const sacrifice = ofType(events, 'playerHit').find((h) => h.sacrifice)!;
    expect(sacrifice.amount).toBe(150);
    expect(currentBoss(state)!.hp).toBe(boss.maxHp - 150 - 3 * 30);
  });

  it('una sola activa por ronda y sin cargas no se usa', () => {
    const game = startGame('serpentis');
    const once = act(game.state, { type: 'useActive', playerId: 'p1' }, game.now + 1_000).state;
    expect(reduceCoop(once, { type: 'useActive', playerId: 'p1' }, game.now + 2_000).rejected).toBe('Ya usaste tu habilidad en esta ronda.');
    expect(once.players[1]!.charges).toBe(0);
  });
});

describe('jefes', () => {
  it('PHARAONIS: al cruzar umbrales del 12 % activa efectos en orden y abre la votación', () => {
    const game = startGame('pharaonis');
    const boss = currentBoss(game.state)!;
    boss.hp = Math.floor(boss.maxHp * 0.77); // Ya perdió 23 %: el primer umbral (12 %) se cruza con el próximo golpe.
    const { state, events } = solveAll(game.state, game.now + 10_000);
    const abilities = ofType(events, 'bossAbility').map((e) => e.ability);
    expect(abilities.slice(0, 2)).toEqual(['damage1', 'groupOffer']);
    expect(state.phase).toBe('decision');
    let current = state;
    const decision = current.decisions[0]!;
    for (const p of current.players) current = act(current, { type: 'vote', playerId: p.id, decisionId: decision.id, accept: true }, game.now + 12_000).state;
    expect(current.players.every((p) => p.gold === 2 * 16 + 300)).toBe(true);
    expect(currentBoss(current)!.damageBonus).toBeCloseTo(0.1);
    expect(current.phase).toBe('round');
  });

  it('HAMAN: un golpe de al menos 10 % invoca a REX ASSUERUS, que recibe los ataques', () => {
    const game = startGame('haman', ['samson', 'mathusala', 'urias', 'eliseus']);
    const used = act(game.state, { type: 'useActive', playerId: 'p0' }, game.now + 1_000).state;
    // El sacrificio de SAMSON (al cerrar la ronda) invoca a REX; en la ronda siguiente los golpes van a REX.
    const first = solveAll(used, game.now + 10_000, ['p0']);
    expect(ofType(first.events, 'bossAbility').some((e) => e.ability === 'summonRex')).toBe(true);
    expect(currentBoss(first.state)!.haman.rex).not.toBeNull();
    const second = solveAll(first.state, game.now + 11_000);
    expect(ofType(second.events, 'playerHit').filter((h) => h.target === 'rex').length).toBeGreaterThan(0);
  });

  it('se pierde si se acaba el tiempo total', () => {
    const game = startGame('serpentis');
    const { state, events } = reduceCoop(game.state, { type: 'tick' }, game.now + 23 * 60_000);
    expect(state.phase === 'defeat' || state.phase === 'victory').toBe(true);
    expect(ofType(events, 'gameOver')[0]!.won).toBe(false);
  });

  it('se pierde si todos salen o mueren', () => {
    let { state, now } = startGame('serpentis');
    for (const p of state.players) state = act(state, { type: 'leave', playerId: p.id }, now).state;
    expect(state.phase).toBe('defeat');
  });
});

describe('rendición', () => {
  it('pasa solo con el sí de todos; un «no» retira el voto pero no cierra la votación', () => {
    let { state, now } = startGame('leviathan');
    state = act(state, { type: 'surrender', playerId: 'p0', accept: true }, now).state;
    expect(state.surrender?.yes).toEqual(['p0']);
    state = act(state, { type: 'surrender', playerId: 'p1', accept: false }, now).state;
    expect(state.surrender).not.toBeNull();
    state = act(state, { type: 'surrender', playerId: 'p1', accept: true }, now).state;
    state = act(state, { type: 'surrender', playerId: 'p2', accept: true }, now).state;
    expect(state.result).toBeNull();
    const last = act(state, { type: 'surrender', playerId: 'p3', accept: true }, now);
    expect(last.state.result).toMatchObject({ won: false, surrendered: true });
    expect(last.state.phase).toBe('defeat');
    expect(ofType(last.events, 'surrenderEnd')[0]?.passed).toBe(true);
  });

  it('vence a los 30 s sin unanimidad y no se abre con un «no»', () => {
    let { state, now } = startGame('leviathan');
    expect(reduceCoop(state, { type: 'surrender', playerId: 'p0', accept: false }, now).rejected).not.toBeNull();
    state = act(state, { type: 'surrender', playerId: 'p0', accept: true }, now).state;
    const expired = reduceCoop(state, { type: 'tick' }, now + 30_000);
    expect(expired.state.surrender).toBeNull();
    expect(expired.state.result).toBeNull();
    expect(ofType(expired.events, 'surrenderEnd')[0]?.passed).toBe(false);
  });

  it('quien sale deja de contar: el resto puede completar la unanimidad', () => {
    let { state, now } = startGame('leviathan');
    for (const id of ['p0', 'p1', 'p2']) state = act(state, { type: 'surrender', playerId: id, accept: true }, now).state;
    const after = act(state, { type: 'leave', playerId: 'p3' }, now);
    expect(after.state.result).toMatchObject({ won: false, surrendered: true });
  });
});

describe('subniveles AT1/AT2/AT3', () => {
  it('escalan la vida y el daño base de los jefes en 2/3, 1 y 4/3', () => {
    const make = (stage: 1 | 2 | 3) => createCoopGame({ seed: 3, level: 'AT', stage, players: setup(BASIC), now: T0 }).state;
    const [at1, at2, at3] = [make(1), make(2), make(3)];
    expect(at2.stage).toBe(2);
    at2.bosses.forEach((boss, i) => {
      expect(at1.bosses[i]!.maxHp).toBe(Math.round((boss.maxHp * 2) / 3));
      expect(at3.bosses[i]!.maxHp).toBe(Math.round((boss.maxHp * 4) / 3));
    });
    const gt = 60_000;
    const base = bossDamage(at2, at2.bosses[0]!, gt);
    expect(bossDamage(at1, at1.bosses[0]!, gt)).toBeCloseTo((base * 2) / 3);
    expect(bossDamage(at3, at3.bosses[0]!, gt)).toBeCloseTo((base * 4) / 3);
  });

  it('sin subnivel es AT2 (partidas anteriores)', () => {
    const created = createCoopGame({ seed: 3, level: 'AT', players: setup(BASIC), now: T0 }).state;
    expect(created.stage).toBe(2);
    const legacy = { ...created, stage: undefined };
    expect(bossDamage(legacy, legacy.bosses[0]!, 0)).toBeCloseTo(bossDamage(created, created.bosses[0]!, 0));
  });
});

describe('ronda normal: golpe inmediato', () => {
  it('quien resuelve sus cripticos ataca en el momento y gana oro por cada criptico', () => {
    const { state, now } = startGame('serpentis');
    const hp = currentBoss(state)!.hp;
    let current = state;
    const p0 = current.players[0]!;
    const events: CoopEvent[] = [];
    p0.assignments.forEach((_, slot) => {
      const result = act(current, { type: 'solve', playerId: 'p0', slot }, now + 1_000);
      current = result.state;
      events.push(...result.events);
    });
    expect(ofType(events, 'playerHit').filter((h) => h.playerId === 'p0')).toHaveLength(1);
    expect(currentBoss(current)!.hp).toBeLessThan(hp);
    expect(current.phase).toBe('round');
    // 15 + ronda 1 por cada criptico, en el momento de resolverlo.
    expect(ofType(events, 'gold').map((g) => g.amount)).toEqual([16, 16]);
    // Al cerrar la ronda no vuelve a atacar ni cobra de nuevo.
    const end = solveAll(current, now + 2_000, ['p0']);
    expect(ofType(end.events, 'playerHit').filter((h) => h.playerId === 'p0')).toHaveLength(0);
    expect(ofType(end.events, 'gold').some((g) => g.playerId === 'p0')).toBe(false);
    expect(end.state.players[0]!.gold).toBe(32);
  });

  it('si el golpe derriba al jefe, la ronda termina ya y nadie recibe daño', () => {
    const { state, now } = startGame('serpentis');
    currentBoss(state)!.hp = 1;
    let current = state;
    const events: CoopEvent[] = [];
    current.players[0]!.assignments.forEach((_, slot) => {
      const result = act(current, { type: 'solve', playerId: 'p0', slot }, now + 1_000);
      current = result.state;
      events.push(...result.events);
    });
    expect(ofType(events, 'bossDefeated')).toHaveLength(1);
    expect(ofType(events, 'bossHit')).toHaveLength(0);
  });
});

describe('oro por criptico', () => {
  it('cobra 15 + ronda por cada criptico aunque no complete la ronda', () => {
    const { state, now } = startGame('serpentis');
    const first = act(state, { type: 'solve', playerId: 'p0', slot: 0 }, now + 1_000);
    expect(ofType(first.events, 'gold')).toEqual([{ type: 'gold', gt: 1_000, playerId: 'p0', amount: 16, source: 'cryptic' }]);
    expect(ofType(first.events, 'playerHit')).toHaveLength(0); // El golpe llega con el 2/2.
    const end = reduceCoop(first.state, { type: 'tick' }, now + 80_000);
    expect(end.state.players[0]!.gold).toBe(16);
  });
});
