// Simulador de balance del modo COOP: juega partidas completas con bots y resume victorias, tiempo y rondas por jefe.
// No toca Firestore ni el Worker: usa el mismo motor puro que el servidor.
// Uso: npx tsx scripts/simulate-coop.ts [--games 200] [--party 4,6,8] [--skill normal|weak|strong] [--stage 1|2|3] [--seed 1]
import { LEVELS, normalizeStage, type CoopStage, type CoopTier } from '../shared/coop/balance';
import { AT_CHARACTER_IDS, type CharacterId } from '../shared/coop/catalog/characters';
import { createCoopGame, nextDeadline, offerPrice, reduceCoop, type CoopAction } from '../shared/coop/engine';
import type { CoopEvent } from '../shared/coop/events';
import type { CoopState } from '../shared/coop/state';

type Skill = 'weak' | 'normal' | 'strong';

/** Probabilidad de resolver y segundos promedio por dificultad, para un jugador "normal". */
const SOLVE_MODEL: Record<CoopTier, { p: number; meanSec: number }> = {
  easy: { p: 0.95, meanSec: 15 },
  medium: { p: 0.85, meanSec: 25 },
  hard: { p: 0.65, meanSec: 38 },
  veryHard2: { p: 0.45, meanSec: 50 },
  veryHard3: { p: 0.3, meanSec: 60 },
};
const SKILL_FACTOR: Record<Skill, { p: number; time: number }> = {
  weak: { p: 0.8, time: 1.3 },
  normal: { p: 1, time: 1 },
  strong: { p: 1.1, time: 0.75 },
};

/** PRNG de los bots (mulberry32): independiente de la semilla del motor. */
function botRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GameSummary {
  won: boolean;
  minutes: number;
  bossesDown: number;
  roundsPerBoss: number[];
  deaths: number;
  shops: number;
}

function simulateGame(partySize: number, skill: Skill, seed: number, stage: CoopStage): GameSummary {
  const random = botRandom(seed * 7919 + partySize);
  const characters = [...AT_CHARACTER_IDS].sort(() => random() - 0.5).slice(0, partySize) as CharacterId[];
  const players = characters.map((character, i) => ({ id: `p${i}`, name: `Bot ${i}`, character }));
  let now = 1_000_000;
  const created = createCoopGame({ seed, level: 'AT', stage, players, now });
  let state = created.state;
  /** Respuestas programadas: [wall, acción]. */
  let queue: Array<{ at: number; action: CoopAction }> = [];

  const schedule = (events: CoopEvent[]) => {
    for (const event of events) {
      if (event.type === 'roundStart') {
        queue = [];
        const factor = SKILL_FACTOR[skill];
        for (const [playerId, tiers] of Object.entries(event.tiers)) {
          let at = now;
          tiers.forEach((tier, slot) => {
            const model = SOLVE_MODEL[tier];
            at += model.meanSec * factor.time * (0.5 + random()) * 1000;
            if (random() < Math.min(0.98, model.p * factor.p)) queue.push({ at, action: { type: 'solve', playerId, slot } });
          });
        }
        queueActives(state, now);
      }
      if (event.type === 'shopOpen') queueShopping(state, now);
      if (event.type === 'decisionOpen') {
        for (const p of state.players) {
          if (p.status !== 'alive') continue;
          queue.push({ at: now + 2_000 + random() * 5_000, action: { type: 'vote', playerId: p.id, decisionId: event.id, accept: random() < 0.6 } });
        }
      }
    }
  };

  const queueActives = (s: CoopState, at: number) => {
    for (const p of s.players) {
      if (p.status !== 'alive' || (p.charges !== null && p.charges <= 0)) continue;
      const lowAlly = s.players.filter((o) => o.status === 'alive' && o.id !== p.id).sort((a, b) => a.hp - b.hp)[0];
      const when = at + 3_000 + random() * 10_000;
      if (['mathusala', 'urias', 'eliseus', 'enoch', 'debbora', 'hiram'].includes(p.character)) queue.push({ at: when, action: { type: 'useActive', playerId: p.id } });
      if (p.character === 'nathan' && s.players.some((o) => o.status === 'alive' && o.hp < 150)) queue.push({ at: when, action: { type: 'useActive', playerId: p.id } });
      if ((p.character === 'tubalcain' || p.character === 'gedeon') && lowAlly) queue.push({ at: when, action: { type: 'useActive', playerId: p.id, targetId: lowAlly.id } });
      for (const item of p.inventory) {
        if (item.itemId === 'strengthPotion' || (item.itemId === 'healingPotion' && p.hp < 120)) {
          queue.push({ at: when + 500, action: { type: 'useItem', playerId: p.id, itemUid: item.uid } });
        }
      }
    }
  };

  const queueShopping = (s: CoopState, at: number) => {
    for (const p of s.players) {
      const offers = s.shop?.offers[p.id] ?? [];
      let gold = p.gold;
      let delay = 1_500;
      for (const offer of [...offers].sort(() => random() - 0.5)) {
        const price = offerPrice(s, p, offer);
        if (!Number.isFinite(price) || price > gold) continue;
        gold -= price;
        queue.push({ at: at + delay, action: { type: 'buy', playerId: p.id, offerId: offer.id } });
        delay += 1_000;
      }
      queue.push({ at: at + delay + 2_000, action: { type: 'shopDone', playerId: p.id } });
    }
  };

  schedule(created.events);
  for (let steps = 0; steps < 50_000 && state.result === null; steps += 1) {
    queue.sort((a, b) => a.at - b.at);
    const deadline = nextDeadline(state) ?? Number.POSITIVE_INFINITY;
    const next = queue[0];
    if (next && next.at <= deadline) {
      queue.shift();
      now = Math.max(now, next.at);
      const result = reduceCoop(state, next.action, now);
      state = result.state;
      schedule(result.events);
    } else {
      now = Math.max(now, deadline);
      const result = reduceCoop(state, { type: 'tick' }, now);
      state = result.state;
      schedule(result.events);
    }
  }
  const roundsPerBoss = state.bosses.filter((b) => b.defeatedGt !== null).map((b) => b.roundsFought);
  return {
    won: state.result?.won ?? false,
    minutes: (state.result?.endedGt ?? state.totalMs) / 60_000,
    bossesDown: roundsPerBoss.length,
    roundsPerBoss,
    deaths: state.players.reduce((sum, p) => sum + p.stats.deaths, 0),
    shops: state.shopsOpened,
  };
}

function parseArgs(): { games: number; party: number[]; skill: Skill; seed: number; stage: CoopStage } {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const skill = (get('skill') ?? 'normal') as Skill;
  if (!(skill in SKILL_FACTOR)) throw new Error(`--skill debe ser weak, normal o strong (recibí ${skill}).`);
  return {
    games: Number(get('games') ?? 200),
    party: (get('party') ?? '4,5,6,7,8').split(',').map(Number),
    skill,
    seed: Number(get('seed') ?? 1),
    stage: normalizeStage(Number(get('stage') ?? 2)),
  };
}

function main(): void {
  const { games, party, skill, seed, stage } = parseArgs();
  const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  console.log(`COOP nivel AT${stage} · ${games} partidas por tamaño · bots ${skill} · ${LEVELS.AT.totalMs / 60_000} min`);
  console.log('Jugadores | Victorias | Min. usados | Jefes caídos | Rondas por jefe (1°/2°/3°/4°) | Muertes | Tiendas');
  for (const size of party) {
    const results = Array.from({ length: games }, (_, i) => simulateGame(size, skill, seed + i, stage));
    const perBoss = [0, 1, 2, 3].map((index) => average(results.flatMap((r) => (r.roundsPerBoss[index] !== undefined ? [r.roundsPerBoss[index]!] : []))));
    console.log(
      [
        String(size).padStart(9),
        `${Math.round(100 * average(results.map((r) => (r.won ? 1 : 0))))} %`.padStart(9),
        average(results.map((r) => r.minutes)).toFixed(1).padStart(11),
        average(results.map((r) => r.bossesDown)).toFixed(2).padStart(12),
        perBoss.map((n) => n.toFixed(1)).join(' / ').padStart(29),
        average(results.map((r) => r.deaths)).toFixed(1).padStart(7),
        average(results.map((r) => r.shops)).toFixed(1).padStart(7),
      ].join(' | '),
    );
  }
}

try {
  main();
} catch (error) {
  console.error('Simulación fallida:', error instanceof Error ? error.message : error);
  process.exit(1);
}
