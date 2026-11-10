import { describe, expect, it } from 'vitest';
import { createCoopGame, reduceCoop } from './engine';
import { bossEffects, pharaonisPlagues, statusEffects } from './effects';

const T0 = 1_000_000;

function game() {
  const players = (['enoch', 'mathusala', 'urias', 'eliseus'] as const).map((character, i) => ({ id: `p${i}`, name: `P${i}`, character }));
  const created = createCoopGame({ seed: 5, level: 'AT', players, now: T0 });
  return reduceCoop(created.state, { type: 'tick' }, T0 + 5_000).state;
}

describe('statusEffects', () => {
  it('sin efectos al empezar', () => {
    const state = game();
    expect(statusEffects(state, state.players[0]!, 0)).toEqual([]);
  });

  it('quemaduras, inhibición y soldado', () => {
    const state = game();
    const player = state.players[0]!;
    player.burns = [3, 1];
    player.soldierHp = 50;
    player.inhibitedRound = state.roundNumber;
    const keys = statusEffects(state, player, 0).map((e) => e.key);
    expect(keys).toEqual(['burn', 'inhibit', 'soldier']);
    expect(statusEffects(state, player, 0)[0]!.label).toBe('Quemado ×2');
  });

  it('veneno de PHARAONIS solo con el jefe presente y vivo', () => {
    const state = game();
    const boss = state.bosses[state.bossIndex]!;
    boss.id = 'pharaonis';
    boss.pharaonis.poison = true;
    expect(statusEffects(state, state.players[1]!, 0).map((e) => e.key)).toContain('poison');
    boss.hp = 0;
    expect(statusEffects(state, state.players[1]!, 0)).toEqual([]);
  });

  it('buffs con tiempo restante; vencidos no aparecen', () => {
    const state = game();
    const player = state.players[3]!;
    player.buffs.push({ source: 'eliseus', stat: 'attack', amount: 0.33, untilGt: 10_000 });
    expect(statusEffects(state, player, 4_000)[0]!.label).toBe('Ataque +33 % · 6 s');
    expect(statusEffects(state, player, 10_000)).toEqual([]);
  });
});

describe('bossEffects', () => {
  it('PHARAONIS: plagas activas, pendientes y la próxima', () => {
    const state = game();
    const boss = state.bosses[state.bossIndex]!;
    boss.id = 'pharaonis';
    expect(bossEffects(state, boss).map((e) => e.label)).toEqual(['Próxima: Furia al 88 %']);
    boss.pharaonis.triggered = 3;
    boss.pharaonis.lice = true;
    boss.damageBonus = 0.05;
    state.pendingPharaonis = ['lice'];
    const labels = bossEffects(state, boss).map((e) => e.label);
    expect(labels).toEqual(['Daño +5 %', 'Piojos', 'Piojos al cerrar la ronda', 'Próxima: Oferta individual al 52 %']);
    expect(pharaonisPlagues(state, boss).map((p) => p.status)).toEqual(['active', 'active', 'pending', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });
});
