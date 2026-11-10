// Motor del modo COOP: reductor puro y determinista. `reduceCoop(estado, acción, ahora)` primero avanza el reloj
// (fin de ronda, tienda, votaciones, ticks de 5 s) y después aplica la acción. Devuelve un estado nuevo y los
// eventos ocurridos, en orden. El azar sale de `rng.ts` (semilla + contexto): mismo evento, mismo resultado.
import {
  BOSS_INTRO_MS,
  DEAD_ROUND_CRYPTICS,
  DEAD_SOLVE_HEAL,
  DECISION_MS,
  GOLD_PER_ROUND_BASE,
  HARD_ROUND_CRYPTICS,
  HINTS_MAX,
  HINTS_START,
  INVENTORY_SLOTS,
  LEVELS,
  NORMAL_ROUND_CRYPTICS,
  PARTY_MAX,
  PARTY_MIN,
  PERIODIC_TICK_MS,
  REVIVE_HP_SHARE,
  SHOP_BASE_OPTIONS,
  SHOP_MS,
  SURRENDER_VOTE_MS,
  armorReduction,
  bossBaseDamage,
  partyFactor,
  BOSS_HP_PER_PLAYER,
  DEFAULT_COOP_STAGE,
  STAGE_FACTOR,
  normalizeStage,
  type CoopLevel,
  type CoopStage,
  type CoopTier,
} from './balance';
import {
  AT_BOSS_IDS,
  BEHEMOTH,
  BOSSES,
  GOLIATH,
  HAMAN,
  JEZABEL,
  LEVIATHAN,
  LOW_HP_EVASION,
  PHARAONIS,
  PHARAONIS_EFFECTS,
  SERPENTIS,
  type BossId,
} from './catalog/bosses';
import { CHARACTERS, CHARACTER_PARAMS, type CharacterId } from './catalog/characters';
import { DEFAULT_DAMAGE_TYPE, ITEMS, ITEM_IDS, ITEM_PARAMS, WEAPON_TYPES, type ItemId, type WeaponVariant } from './catalog/items';
import type { CoopEvent, DamageSource, HealSource } from './events';
import { chance, pickIndex, pickWeighted, roll, shuffled } from './rng';
import { drawTier, roundDurationMs, roundKind } from './schedule';
import {
  emptyStats,
  type BossState,
  type CoopState,
  type DecisionKind,
  type PlayerState,
  type ShopOffer,
  type ShopState,
} from './state';
import { armor, attackPower, damageTakenReduction, evasion, goldBonus, hasItem, itemEffectiveness, maxHp } from './stats';

// --- API ------------------------------------------------------------------------------------------------

export interface CoopPlayerSetup {
  id: string;
  name: string;
  character: CharacterId;
}

export type CoopAction =
  | { type: 'tick' }
  | { type: 'solve'; playerId: string; slot: number }
  | { type: 'useHint'; playerId: string }
  | { type: 'useActive'; playerId: string; targetId?: string; amount?: number }
  | { type: 'useItem'; playerId: string; itemUid: string; targetId?: string }
  | { type: 'buy'; playerId: string; offerId: string }
  | { type: 'shopSwap'; playerId: string; targetId: string }
  | { type: 'shopDone'; playerId: string }
  | { type: 'vote'; playerId: string; decisionId: string; accept: boolean }
  | { type: 'surrender'; playerId: string; accept: boolean }
  | { type: 'leave'; playerId: string };

export interface CoopResult {
  state: CoopState;
  events: CoopEvent[];
  /** Motivo si la acción no se aplicó (la UI lo muestra; el reloj igual avanzó). */
  rejected: string | null;
}

export class CoopSetupError extends Error {}

/** Jefes de la partida: elegidos y ordenados por la semilla (se pueden mostrar antes de empezar). */
export function pickBosses(seed: number, level: CoopLevel): BossId[] {
  return shuffled(seed >>> 0, ['bosses'], AT_BOSS_IDS).slice(0, LEVELS[level].categories.length);
}

/** Crea la partida. Elige y ordena los jefes al azar y arranca la presentación del primero. */
export function createCoopGame(input: {
  seed: number;
  level: CoopLevel;
  /** AT1/AT2/AT3: escala la vida y el daño base de los jefes. Por defecto, 2. */
  stage?: CoopStage;
  players: CoopPlayerSetup[];
  now: number;
}): CoopResult {
  const level = LEVELS[input.level];
  if (!level.available) throw new CoopSetupError(`El nivel ${input.level} todavía no está disponible.`);
  const count = input.players.length;
  if (count < PARTY_MIN || count > PARTY_MAX) throw new CoopSetupError(`COOP se juega de ${PARTY_MIN} a ${PARTY_MAX} jugadores.`);
  const characters = new Set(input.players.map((p) => p.character));
  if (characters.size !== count) throw new CoopSetupError('Cada personaje solo puede elegirlo un jugador.');
  if (new Set(input.players.map((p) => p.id)).size !== count) throw new CoopSetupError('Jugadores repetidos.');

  const seed = input.seed >>> 0;
  const bossIds = pickBosses(seed, input.level);
  const state: CoopState = {
    version: 1,
    seed,
    level: input.level,
    stage: normalizeStage(input.stage),
    totalMs: level.totalMs,
    partySize: count,
    phase: 'bossIntro',
    clock: { baseGt: 0, anchorWall: null },
    introEndsWall: null,
    nextTickGt: PERIODIC_TICK_MS,
    roundNumber: 0,
    roundKind: null,
    roundEndsGt: null,
    modifiers: { hideCells: false, shift: 0 },
    nextModifiers: { hideCells: false, shift: 0 },
    bosses: bossIds.map((id, index) => createBoss(id, level.categories[index]!, count, normalizeStage(input.stage))),
    bossIndex: 0,
    players: input.players.map((setup, seat) => createPlayer(setup, seat)),
    shop: null,
    shopsOpened: 0,
    shopSurcharge: 0,
    cross: { freeNextShop: false, healNextRound: false, seen: false },
    appleBought: false,
    pendingPharaonis: [],
    decisions: [],
    flow: [],
    surrender: null,
    result: null,
  };
  for (const player of state.players) player.hp = maxHp(state, player);
  const ctx: Ctx = { state, events: [], wall: input.now };
  beginBossIntro(ctx, input.now);
  return { state, events: ctx.events, rejected: null };
}

export function reduceCoop(previous: CoopState, action: CoopAction, now: number): CoopResult {
  const state = structuredClone(previous);
  const ctx: Ctx = { state, events: [], wall: now };
  advance(ctx, now);
  let rejected: string | null = null;
  if (action.type !== 'tick') {
    try {
      applyAction(ctx, action);
      advance(ctx, now); // La acción pudo cerrar la ronda o la tienda.
    } catch (error) {
      if (!(error instanceof RuleError)) throw error;
      rejected = error.message;
    }
  }
  return { state, events: ctx.events, rejected };
}

/** Tiempo de partida en `now` (ms). */
export function gameTime(state: CoopState, now: number): number {
  return state.clock.anchorWall === null ? state.clock.baseGt : state.clock.baseGt + Math.max(0, now - state.clock.anchorWall);
}

/** Próximo instante (wall) en que el motor tiene algo programado: el servidor pone ahí su alarma. */
export function nextDeadline(state: CoopState): number | null {
  if (state.phase === 'victory' || state.phase === 'defeat') return null;
  if (state.phase === 'bossIntro') return state.introEndsWall;
  const anchor = state.clock.anchorWall;
  if (anchor === null) return null;
  const toWall = (gt: number) => anchor + (gt - state.clock.baseGt);
  const candidates = [state.totalMs, state.nextTickGt];
  if (state.phase === 'round' && state.roundEndsGt !== null) candidates.push(state.roundEndsGt);
  if (state.phase === 'shop' && state.shop) candidates.push(state.shop.endsGt);
  if (state.phase === 'decision' && state.decisions[0]) candidates.push(state.decisions[0].endsGt);
  if (state.surrender) candidates.push(state.surrender.endsGt);
  return toWall(Math.min(...candidates));
}

export function currentBoss(state: CoopState): BossState | null {
  return state.bosses[state.bossIndex] ?? null;
}

/** Precio actual de una oferta para un jugador (HAMAN puede subirlo durante la tienda). */
export function offerPrice(state: CoopState, player: PlayerState, offer: ShopOffer): number {
  if (state.shop?.free) return 0;
  let base: number;
  if (offer.kind === 'rechargeUrias') base = CHARACTER_PARAMS.urias.rechargeCost;
  else if (offer.kind === 'rechargeDebbora')
    base = CHARACTER_PARAMS.debbora.rechargeBaseCost + CHARACTER_PARAMS.debbora.rechargeCostStep * player.debboraRecharges;
  else {
    const item = ITEMS[offer.itemId!];
    if (item.cost === null) return Number.POSITIVE_INFINITY;
    if (offer.itemId === 'eliasMantle' && player.character === 'enoch') return 0;
    base = item.cost;
    if (player.character === 'tubalcain') base *= 1 - CHARACTER_PARAMS.tubalcain.priceDiscount;
    if (offer.itemId === 'hint') {
      const donkey = player.inventory.find((i) => i.itemId === 'balaamDonkey');
      if (donkey) base *= 1 - ITEM_PARAMS.balaamDonkey.hintDiscount * itemEffectiveness(player, donkey);
    }
  }
  return base > 0 ? Math.round(base) + state.shopSurcharge : 0;
}

// --- Interno: contexto y errores ------------------------------------------------------------------------

interface Ctx {
  state: CoopState;
  events: CoopEvent[];
  wall: number;
}

class RuleError extends Error {}

function reject(message: string): never {
  throw new RuleError(message);
}

function createBoss(id: BossId, category: CoopState['bosses'][number]['category'], players: number, stage: CoopStage): BossState {
  const hpBonus = id === 'leviathan' ? LEVIATHAN.hpBonus : 0;
  const hp = Math.round(partyFactor(players) * players * BOSS_HP_PER_PLAYER[category] * STAGE_FACTOR[stage] * (1 + hpBonus));
  return {
    id,
    category,
    maxHp: hp,
    hp,
    damageBonus: id === 'behemoth' ? BEHEMOTH.damageBonus : 0,
    spawnGt: null,
    defeatedGt: null,
    roundsFought: 0,
    roundDamageBy: {},
    damageTaken: 0,
    damageDealt: 0,
    pharaonis: { triggered: 0, lice: false, poison: false, noCells: false },
    haman: { gold: 0, summons: 0, rex: null },
  };
}

function createPlayer(setup: CoopPlayerSetup, seat: number): PlayerState {
  const character = CHARACTERS[setup.character];
  return {
    id: setup.id,
    name: setup.name,
    seat,
    character: setup.character,
    status: 'alive',
    hp: 0,
    winStacks: 0,
    uriasBlessing: 0,
    gold: 0,
    hints: HINTS_START,
    charges: character.startCharges,
    activeUsedRound: null,
    inventory: [],
    damageType: DEFAULT_DAMAGE_TYPE,
    buffs: [],
    soldierHp: 0,
    burns: [],
    inhibitedRound: null,
    enochGuardUntilGt: null,
    sacrificePending: false,
    harpReady: false,
    rechargeProgress: 0,
    rechargeNeeded: setup.character === 'nathan' ? CHARACTER_PARAMS.nathan.firstNormalWinsPerCharge : 0,
    usesCount: 0,
    debboraRecharges: 0,
    hiramSwapArmed: false,
    assignments: [],
    stats: emptyStats(),
  };
}

const gtOf = (ctx: Ctx) => gameTime(ctx.state, ctx.wall);
const isOver = (state: CoopState) => state.phase === 'victory' || state.phase === 'defeat';
const alivePlayers = (state: CoopState) => state.players.filter((p) => p.status === 'alive');
const playerById = (state: CoopState, id: string) => state.players.find((p) => p.id === id);

function requirePlayer(state: CoopState, id: string): PlayerState {
  return playerById(state, id) ?? reject('Jugador desconocido.');
}

// --- Reloj ----------------------------------------------------------------------------------------------

/** Procesa en orden cronológico todo lo programado hasta `now`. */
function advance(ctx: Ctx, now: number): void {
  const { state } = ctx;
  for (let guard = 0; guard < 10_000 && !isOver(state); guard += 1) {
    if (state.phase === 'bossIntro') {
      if (state.introEndsWall === null || now < state.introEndsWall) return;
      // Fin de la presentación: el reloj de partida retoma desde el fin del intervalo.
      ctx.wall = state.introEndsWall;
      state.clock.anchorWall = state.introEndsWall;
      state.introEndsWall = null;
      startNextStep(ctx);
      continue;
    }
    const gtNow = gameTime(state, now);
    const deadlines: Array<{ at: number; run: () => void }> = [];
    if (state.phase === 'round' && state.roundEndsGt !== null) deadlines.push({ at: state.roundEndsGt, run: () => endRound(ctx) });
    if (state.phase === 'shop' && state.shop) deadlines.push({ at: state.shop.endsGt, run: () => closeShop(ctx) });
    if (state.phase === 'decision' && state.decisions[0]) deadlines.push({ at: state.decisions[0].endsGt, run: () => resolveDecision(ctx) });
    if (state.surrender) deadlines.push({ at: state.surrender.endsGt, run: () => closeSurrender(ctx, false) });
    deadlines.push({ at: state.nextTickGt, run: () => periodicTick(ctx) });
    deadlines.push({ at: state.totalMs, run: () => finish(ctx, false) });
    // Empates: fin de ronda/tienda/votación antes que el tick y que el fin del tiempo total.
    const next = deadlines.reduce((best, item) => (item.at < best.at ? item : best));
    if (next.at > gtNow) {
      ctx.wall = now;
      return;
    }
    ctx.wall = state.clock.anchorWall! + (next.at - state.clock.baseGt);
    next.run();
  }
}

function pauseClock(ctx: Ctx): void {
  const { clock } = ctx.state;
  clock.baseGt = gtOf(ctx);
  clock.anchorWall = null;
}

function periodicTick(ctx: Ctx): void {
  const { state } = ctx;
  const gt = state.nextTickGt;
  state.nextTickGt += PERIODIC_TICK_MS;
  const boss = currentBoss(state);
  // Solo el jefe presente (tras una muerte, el siguiente aún no apareció).
  if (!boss || boss.hp <= 0 || boss.spawnGt === null) return;
  if (boss.id === 'pharaonis' && boss.pharaonis.poison) {
    for (const player of alivePlayers(state)) loseHp(ctx, player, PHARAONIS.poisonDamage, 'poison');
    if (checkWipe(ctx)) return;
  }
  if (boss.id === 'goliath') {
    const regen = goliathBand(boss).regen;
    const healed = Math.min(regen, boss.maxHp - boss.hp);
    if (healed > 0) {
      boss.hp += healed;
      ctx.events.push({ type: 'bossHeal', gt, amount: healed, source: 'goliath' });
    }
  }
}

// --- Flujo entre fases ----------------------------------------------------------------------------------

function beginBossIntro(ctx: Ctx, wall: number): void {
  const { state } = ctx;
  const boss = currentBoss(state)!;
  pauseClock(ctx);
  state.phase = 'bossIntro';
  state.introEndsWall = wall + BOSS_INTRO_MS;
  const gt = state.clock.baseGt;
  boss.spawnGt = gt;
  if (boss.id === 'goliath') {
    // +30 % + porcentaje de tiempo transcurrido, a vida y daño, al aparecer.
    const bonus = GOLIATH.spawnBonus + gt / state.totalMs;
    boss.maxHp = Math.round(boss.maxHp * (1 + bonus));
    boss.hp = boss.maxHp;
    boss.damageBonus += bonus;
  }
  if (boss.id === 'jezabel') boss.damageBonus += JEZABEL.damagePerPreviousBoss * state.bossIndex;
  ctx.events.push({ type: 'bossIntro', gt, bossIndex: state.bossIndex, bossId: boss.id });
}

/** Ejecuta el siguiente paso pendiente (votaciones → tienda → presentación → ronda). */
function startNextStep(ctx: Ctx): void {
  const { state } = ctx;
  while (!isOver(state)) {
    const step = state.flow.shift() ?? 'round';
    if (step === 'decisions') {
      if (state.decisions.length === 0) continue;
      openDecision(ctx);
      return;
    }
    if (step === 'shop') {
      openShop(ctx);
      return;
    }
    if (step === 'bossIntro') {
      beginBossIntro(ctx, ctx.wall);
      return;
    }
    startRound(ctx);
    return;
  }
}

function finish(ctx: Ctx, won: boolean, surrendered = false): void {
  const { state } = ctx;
  if (isOver(state)) return;
  const gt = Math.min(gtOf(ctx), state.totalMs);
  pauseClock(ctx);
  state.clock.baseGt = gt;
  state.phase = won ? 'victory' : 'defeat';
  state.result = surrendered ? { won, endedGt: gt, surrendered } : { won, endedGt: gt };
  state.roundEndsGt = null;
  state.shop = null;
  state.surrender = null;
  ctx.events.push(surrendered ? { type: 'gameOver', gt, won, surrendered } : { type: 'gameOver', gt, won });
}

function checkWipe(ctx: Ctx): boolean {
  if (alivePlayers(ctx.state).length > 0) return false;
  finish(ctx, false);
  return true;
}

// --- Rondas ---------------------------------------------------------------------------------------------

function startRound(ctx: Ctx): void {
  const { state } = ctx;
  const gt = gtOf(ctx);
  const boss = currentBoss(state)!;
  state.roundNumber += 1;
  const kind = roundKind(state.roundNumber);
  state.roundKind = kind;
  state.phase = 'round';
  state.roundEndsGt = gt + roundDurationMs(kind, boss.category);
  state.modifiers = { ...state.nextModifiers, hideCells: state.nextModifiers.hideCells || boss.pharaonis.noCells };
  state.nextModifiers = { hideCells: false, shift: 0 };
  boss.roundsFought += 1;
  boss.roundDamageBy = {};

  // Cruz de Jesús: curación total y resurrección al empezar la ronda.
  if (state.cross.healNextRound) {
    state.cross.healNextRound = false;
    for (const player of state.players) {
      if (player.status === 'left') continue;
      if (player.status === 'dead') revive(ctx, player, 1);
      else heal(ctx, player, maxHp(state, player) - player.hp, 'cross', null);
    }
  }
  // Vara de Moisés: cura a todos al empezar cada ronda.
  for (const holder of alivePlayers(state)) {
    const staff = holder.inventory.find((i) => i.itemId === 'mosesStaff');
    if (!staff) continue;
    const amount = ITEM_PARAMS.mosesStaff.roundHeal * itemEffectiveness(holder, staff);
    for (const player of alivePlayers(state)) heal(ctx, player, amount, 'moses', holder);
  }
  // Arpa de David: se recarga al empezar cada ronda difícil.
  if (kind === 'hard') for (const player of state.players) if (hasItem(player, 'davidHarp')) player.harpReady = true;

  const tiers: Record<string, CoopTier[]> = {};
  for (const player of state.players) {
    player.assignments = [];
    if (player.status === 'left' || player.inhibitedRound === state.roundNumber) continue;
    const role = player.status === 'dead' ? 'dead' : kind;
    const count = role === 'dead' ? DEAD_ROUND_CRYPTICS : role === 'hard' ? HARD_ROUND_CRYPTICS : NORMAL_ROUND_CRYPTICS;
    for (let slot = 0; slot < count; slot += 1) {
      player.assignments.push({ tier: drawTier(state.seed, state.roundNumber, player.id, slot, role), solved: false, hintsRevealed: 0 });
    }
    tiers[player.id] = player.assignments.map((a) => a.tier);
  }
  ctx.events.push({ type: 'roundStart', gt, round: state.roundNumber, kind, endsGt: state.roundEndsGt, tiers });
  if (state.modifiers.hideCells) ctx.events.push({ type: 'bossAbility', gt, bossId: boss.id, ability: 'hideCells' });
  if (state.modifiers.shift !== 0) ctx.events.push({ type: 'bossAbility', gt, bossId: boss.id, ability: 'shift', detail: String(state.modifiers.shift) });
}

/** Participantes de la ronda: vivos y no inhibidos (los muertos resuelven aparte y no la retienen). */
const roundParticipants = (state: CoopState) =>
  state.players.filter((p) => p.status === 'alive' && p.inhibitedRound !== state.roundNumber && p.assignments.length > 0);

function allSolved(player: PlayerState): boolean {
  return player.assignments.every((a) => a.solved);
}

function endRound(ctx: Ctx): void {
  const { state } = ctx;
  const gt = gtOf(ctx);
  const boss = currentBoss(state)!;
  const kind = state.roundKind!;
  const round = state.roundNumber;
  state.roundEndsGt = null;
  const participants = roundParticipants(state);
  const winners = participants.filter(allSolved);
  const hardSuccess = kind === 'hard' ? participants.length > 0 && winners.length === participants.length : null;
  ctx.events.push({ type: 'roundEnd', gt, round, kind, winners: winners.map((p) => p.id), hardSuccess });

  // 1) Ataques pendientes, en orden de asiento. En la normal ya atacaron al resolver (salvo estados viejos).
  //    SAMSON sacrificado ataca aunque esté muerto.
  const attackers = kind === 'normal' ? winners.filter((p) => p.attackedRound !== round) : hardSuccess ? participants : [];
  for (const player of state.players) {
    if (boss.hp <= 0) break;
    if (attackers.includes(player)) playerAttack(ctx, player, false);
    if (player.sacrificePending && boss.hp > 0) playerAttack(ctx, player, true);
  }
  for (const player of state.players) player.sacrificePending = false;
  applyPharaonisEffects(ctx);

  // 2) Quemaduras de LEVIATHAN acumuladas en rondas anteriores (las nuevas arden desde la próxima).
  for (const player of alivePlayers(state)) {
    if (player.burns.length === 0) continue;
    loseHp(ctx, player, (LEVIATHAN.burnTotal / LEVIATHAN.burnTicks) * player.burns.length, 'burn');
    player.burns = player.burns.map((left) => left - 1).filter((left) => left > 0);
  }

  // 3) Golpes del jefe: en normal, a quienes no resolvieron; en difícil fallida, a todos los vivos (inhibidos incluidos).
  if (boss.hp > 0) {
    const targets =
      kind === 'normal' ? participants.filter((p) => !allSolved(p)) : hardSuccess ? [] : alivePlayers(state);
    for (const target of targets) {
      if (target.status === 'alive') bossAttack(ctx, target);
    }
  }

  // 4) Oro y progreso de las rondas ganadas.
  if (kind === 'normal') {
    for (const player of winners) {
      if (player.status !== 'alive') continue;
      gainGold(ctx, player, GOLD_PER_ROUND_BASE + round, 'round');
      player.stats.roundsWon += 1;
      onNormalWin(state, player);
    }
  } else if (hardSuccess) {
    for (const player of alivePlayers(state)) {
      player.stats.roundsWon += participants.includes(player) ? 1 : 0;
      onHardWin(state, player);
    }
  }

  // 5) JEZABEL bajo el 40 %: inhibe en la próxima ronda a quien más daño le hizo en esta.
  if (boss.id === 'jezabel' && boss.hp > 0 && boss.hp < boss.maxHp * JEZABEL.inhibitBelowShare) {
    const top = Object.entries(boss.roundDamageBy).sort((a, b) => b[1] - a[1] || seatOf(state, a[0]) - seatOf(state, b[0]))[0];
    const target = top && top[1] > 0 ? playerById(state, top[0]) : undefined;
    if (target && target.status === 'alive') {
      target.inhibitedRound = round + 1;
      ctx.events.push({ type: 'bossAbility', gt, bossId: boss.id, ability: 'inhibit', detail: target.id });
    }
  }

  if (checkWipe(ctx)) return;

  // 6) Jefe derrotado: siguiente o victoria.
  let bossDown = false;
  if (boss.hp <= 0) {
    bossDown = true;
    boss.hp = 0;
    boss.defeatedGt = gt;
    state.pendingPharaonis = [];
    state.decisions = [];
    state.nextModifiers = { hideCells: false, shift: 0 };
    for (const player of state.players) if (player.inhibitedRound === round + 1) player.inhibitedRound = null;
    ctx.events.push({ type: 'bossDefeated', gt, bossIndex: state.bossIndex, bossId: boss.id });
    if (state.bossIndex === state.bosses.length - 1) {
      finish(ctx, true);
      return;
    }
    state.bossIndex += 1;
  }

  state.flow = [];
  if (!bossDown && state.decisions.length > 0) state.flow.push('decisions');
  if (hardSuccess) state.flow.push('shop');
  if (bossDown) state.flow.push('bossIntro');
  state.flow.push('round');
  startNextStep(ctx);
}

function seatOf(state: CoopState, id: string): number {
  return playerById(state, id)?.seat ?? Number.MAX_SAFE_INTEGER;
}

function onNormalWin(state: CoopState, player: PlayerState): void {
  if (player.character === 'samson') gainWinStack(state, player);
  if (player.character === 'nathan' && player.charges !== null && player.charges < CHARACTERS.nathan.maxCharges!) {
    player.rechargeProgress += 1;
    if (player.rechargeProgress >= player.rechargeNeeded) {
      player.charges += 1;
      player.rechargeProgress = 0;
    }
  }
}

function onHardWin(state: CoopState, player: PlayerState): void {
  if (player.character === 'samson') gainWinStack(state, player);
  const everyTwo = player.character === 'tubalcain' || player.character === 'eliseus';
  if (everyTwo || player.character === 'gedeon') {
    player.rechargeProgress += 1;
    const needed = everyTwo ? 2 : 1;
    if (player.rechargeProgress >= needed) {
      player.rechargeProgress = 0;
      addCharge(player);
    }
  }
}

/** SAMSON: +10 % de estadísticas por ronda superada; la vida actual sube lo mismo que la máxima. */
function gainWinStack(state: CoopState, player: PlayerState): void {
  const before = maxHp(state, player);
  player.winStacks += 1;
  player.hp += maxHp(state, player) - before;
}

function addCharge(player: PlayerState): void {
  const max = CHARACTERS[player.character].maxCharges;
  if (player.charges === null || max === null) return;
  player.charges = Math.min(max, player.charges + 1);
}

// --- Combate --------------------------------------------------------------------------------------------

function goliathBand(boss: BossState) {
  const share = boss.hp / boss.maxHp;
  return GOLIATH.bands.find((band) => share > band.above) ?? GOLIATH.bands[GOLIATH.bands.length - 1]!;
}

/** El jugador con más ataque físico en el momento (JEZABEL). */
function topPhysicalAttacker(state: CoopState, gt: number, boss: BossState): string | null {
  let best: { id: string; power: number } | null = null;
  for (const player of alivePlayers(state)) {
    if (player.damageType.kind !== 'physical') continue;
    const power = attackPower(state, player, gt, boss.id === 'goliath');
    if (!best || power > best.power) best = { id: player.id, power };
  }
  return best?.id ?? null;
}

function playerAttack(ctx: Ctx, player: PlayerState, sacrifice: boolean): void {
  const { state } = ctx;
  const gt = gtOf(ctx);
  const boss = currentBoss(state)!;
  const rex = boss.haman.rex;
  let raw = attackPower(state, player, gt, boss.id === 'goliath');
  if (sacrifice) raw *= CHARACTER_PARAMS.samson.sacrificeMultiplier;
  let amount = raw;
  let evaded = false;
  if (!rex) {
    const type = player.damageType;
    if (boss.id === 'goliath') {
      if (type.range === 'ranged') amount *= GOLIATH.rangedTakenMultiplier;
      if (type.kind === 'physical') amount *= 1 - armorReduction(goliathBand(boss).armor);
    }
    if (boss.id === 'leviathan' && type.range === 'ranged') amount *= LEVIATHAN.rangedTakenMultiplier;
    if (boss.id === 'behemoth' && type.kind === 'magic') amount *= BEHEMOTH.magicTakenMultiplier;
    if (boss.id === 'jezabel' && (type.kind === 'physical' || type.range === 'melee') && topPhysicalAttacker(state, gt, boss) === player.id) {
      amount *= 1 - JEZABEL.topPhysicalReduction;
    }
    const lowHpEvasion = (boss.id === 'leviathan' || boss.id === 'behemoth') && boss.hp < boss.maxHp * LOW_HP_EVASION.belowShare;
    if (lowHpEvasion && chance(state.seed, ['evade', state.roundNumber, player.id, sacrifice ? 1 : 0], LOW_HP_EVASION.chance)) {
      evaded = true;
      amount *= LOW_HP_EVASION.evadedShare;
    }
  }
  dealToBoss(ctx, player, Math.round(amount), { evaded, soldier: false, sacrifice });
  // Soldado de GEDEON: ataca junto al aliado por el 30 % de su daño.
  if (!sacrifice && player.soldierHp > 0 && boss.hp > 0) {
    dealToBoss(ctx, player, Math.round(amount * CHARACTER_PARAMS.gedeon.soldierDamageShare), { evaded, soldier: true, sacrifice: false });
  }
}

function dealToBoss(ctx: Ctx, player: PlayerState, amount: number, flags: { evaded: boolean; soldier: boolean; sacrifice: boolean }): void {
  const { state } = ctx;
  const gt = gtOf(ctx);
  const boss = currentBoss(state)!;
  if (amount <= 0) return;
  const rex = boss.haman.rex;
  if (rex) {
    // REX ASSUERUS recibe los ataques hasta caer; su daño no cuenta para HAMAN.
    rex.hp -= amount;
    player.stats.damageDealt += amount;
    ctx.events.push({ type: 'playerHit', gt, playerId: player.id, target: 'rex', amount, ...flags });
    if (rex.hp <= 0) {
      boss.haman.rex = null;
      ctx.events.push({ type: 'bossAbility', gt, bossId: boss.id, ability: 'rexDown' });
    }
    return;
  }
  const dealt = Math.min(amount, boss.hp);
  boss.hp -= amount;
  boss.damageTaken += dealt;
  boss.roundDamageBy[player.id] = (boss.roundDamageBy[player.id] ?? 0) + dealt;
  player.stats.damageDealt += dealt;
  ctx.events.push({ type: 'playerHit', gt, playerId: player.id, target: 'boss', amount, ...flags });
  onBossDamaged(ctx, boss, amount);
}

function onBossDamaged(ctx: Ctx, boss: BossState, amount: number): void {
  const { state } = ctx;
  const gt = gtOf(ctx);
  if (boss.hp <= 0) return;
  const share = boss.hp / boss.maxHp;
  if (boss.id === 'pharaonis') {
    if (boss.pharaonis.lice) ctx.events.push({ type: 'lice', gt, seed: Math.floor(roll(state.seed, ['lice', gt, boss.hp]) * 1e9) });
    const reached = Math.min(PHARAONIS_EFFECTS.length, Math.floor((1 - share + 1e-9) / PHARAONIS.thresholdShare));
    while (boss.pharaonis.triggered < reached) {
      state.pendingPharaonis.push(PHARAONIS_EFFECTS[boss.pharaonis.triggered]!);
      boss.pharaonis.triggered += 1;
    }
  }
  if (boss.id === 'serpentis' && share < SERPENTIS.belowShare) {
    const key = ['serpentis', state.roundNumber, boss.hp];
    if (chance(state.seed, [...key, 'cells'], SERPENTIS.hideCellsChance)) state.nextModifiers.hideCells = true;
    if (chance(state.seed, [...key, 'shift'], SERPENTIS.shiftChance)) {
      state.nextModifiers.shift = SERPENTIS.shifts[pickIndex(state.seed, [...key, 'shiftValue'], SERPENTIS.shifts.length)]!;
    }
  }
  if (
    boss.id === 'haman' &&
    !boss.haman.rex &&
    boss.haman.summons < HAMAN.maxSummons &&
    amount >= boss.maxHp * HAMAN.summonThresholdShare
  ) {
    boss.haman.summons += 1;
    boss.haman.rex = { hp: boss.hp, maxHp: boss.hp };
    ctx.events.push({ type: 'bossAbility', gt, bossId: boss.id, ability: 'summonRex' });
  }
}

function applyPharaonisEffects(ctx: Ctx): void {
  const { state } = ctx;
  const boss = currentBoss(state)!;
  const gt = gtOf(ctx);
  const effects = state.pendingPharaonis;
  state.pendingPharaonis = [];
  if (boss.id !== 'pharaonis' || boss.hp <= 0) return;
  for (const effect of effects) {
    ctx.events.push({ type: 'bossAbility', gt, bossId: boss.id, ability: effect });
    switch (effect) {
      case 'damage1':
        boss.damageBonus += PHARAONIS.damageBonus;
        break;
      case 'groupOffer':
      case 'individualOffer':
        queueDecision(state, effect, gt);
        break;
      case 'lice':
        boss.pharaonis.lice = true;
        break;
      case 'burst':
        for (const player of alivePlayers(state)) loseHp(ctx, player, maxHp(state, player) * PHARAONIS.burstMaxHpShare, 'pharaonis');
        break;
      case 'poison':
        boss.pharaonis.poison = true;
        break;
      case 'noCells':
        boss.pharaonis.noCells = true;
        break;
    }
  }
}

/** Daño del golpe del jefe actual en `gt` (antes de las defensas del jugador). */
export function bossDamage(state: CoopState, boss: BossState, gt: number): number {
  const stage = STAGE_FACTOR[state.stage ?? DEFAULT_COOP_STAGE];
  return partyFactor(state.partySize) * bossBaseDamage(boss.category) * stage * (1 + gt / state.totalMs) * (1 + boss.damageBonus);
}

function bossAttack(ctx: Ctx, target: PlayerState): void {
  const { state } = ctx;
  const gt = gtOf(ctx);
  const boss = currentBoss(state)!;
  const key = ['bossHit', state.roundNumber, target.id];
  let raw = bossDamage(state, boss, gt);
  const crit = boss.id === 'behemoth' && chance(state.seed, [...key, 'crit'], BEHEMOTH.critChance);
  if (crit) raw *= 1 + BEHEMOTH.critBonus;
  if (target.character === 'samson' && BOSSES[boss.id].female) raw *= 1 + CHARACTER_PARAMS.samson.femaleDamageTakenBonus;
  if (chance(state.seed, [...key, 'evade'], evasion(target))) {
    ctx.events.push({ type: 'bossHit', gt, playerId: target.id, amount: 0, crit, evaded: true, absorbed: 0, redirected: 0 });
    return;
  }
  let amount = raw * (1 - armorReduction(armor(target, gt))) * (1 - damageTakenReduction(target));
  // Túnica de José: el portador recibe el 20 % del daño de sus aliados (con sus propias defensas).
  let redirected = 0;
  const tunicHolder = alivePlayers(state).find((p) => p.id !== target.id && hasItem(p, 'josephTunic'));
  if (tunicHolder) {
    const tunic = tunicHolder.inventory.find((i) => i.itemId === 'josephTunic')!;
    const share = Math.min(1, ITEM_PARAMS.josephTunic.redirectShare * itemEffectiveness(tunicHolder, tunic));
    redirected = amount * share;
    amount -= redirected;
  }
  // Soldado de GEDEON: recibe primero.
  let absorbed = 0;
  if (target.soldierHp > 0) {
    absorbed = Math.min(target.soldierHp, Math.round(amount));
    target.soldierHp -= absorbed;
    amount -= absorbed;
  }
  const lost = Math.round(Math.max(0, amount));
  ctx.events.push({ type: 'bossHit', gt, playerId: target.id, amount: lost, crit, evaded: false, absorbed, redirected: Math.round(redirected) });
  boss.damageDealt += lost;
  const died = loseHp(ctx, target, lost, 'boss');
  onPlayerDamagedByBoss(ctx, boss, target, lost, died);
  if (tunicHolder && redirected > 0 && tunicHolder.status === 'alive') {
    const holderLost = Math.round(redirected * (1 - armorReduction(armor(tunicHolder, gt))) * (1 - damageTakenReduction(tunicHolder)));
    const holderDied = loseHp(ctx, tunicHolder, holderLost, 'boss');
    boss.damageDealt += holderLost;
    onPlayerDamagedByBoss(ctx, boss, tunicHolder, holderLost, holderDied);
  }
}

function onPlayerDamagedByBoss(ctx: Ctx, boss: BossState, target: PlayerState, lost: number, died: boolean): void {
  const gt = gtOf(ctx);
  if (lost <= 0) return;
  if (boss.id === 'haman') {
    const stolen = Math.min(target.gold, HAMAN.goldStolenPerHit);
    if (stolen > 0) {
      target.gold -= stolen;
      ctx.events.push({ type: 'gold', gt, playerId: target.id, amount: -stolen, source: 'stolen' });
    }
    addHamanGold(ctx, boss, stolen);
  }
  if (boss.id === 'leviathan' && target.status === 'alive' && target.burns.length < LEVIATHAN.burnMaxStacks) {
    target.burns.push(LEVIATHAN.burnTicks);
    ctx.events.push({ type: 'bossAbility', gt, bossId: boss.id, ability: 'burn', detail: target.id });
  }
  if (boss.id === 'jezabel' && boss.hp > 0) {
    const share = died ? JEZABEL.healOnKillMissingShare : JEZABEL.healOnHitMissingShare;
    const healed = Math.round((boss.maxHp - boss.hp) * share);
    if (healed > 0) {
      boss.hp += healed;
      ctx.events.push({ type: 'bossHeal', gt, amount: healed, source: 'jezabel' });
    }
  }
}

function addHamanGold(ctx: Ctx, boss: BossState, amount: number): void {
  if (amount <= 0) return;
  const { state } = ctx;
  boss.haman.gold += amount;
  const surcharge = Math.floor(boss.haman.gold / HAMAN.surchargeStep) * HAMAN.surchargePerStep;
  if (surcharge > state.shopSurcharge) {
    state.shopSurcharge = surcharge; // Permanente: no baja aunque HAMAN muera.
    ctx.events.push({ type: 'bossAbility', gt: gtOf(ctx), bossId: boss.id, ability: 'surcharge', detail: String(surcharge) });
  }
}

// --- Vida, oro y muerte ---------------------------------------------------------------------------------

/** Quita vida (ya con defensas aplicadas). Devuelve true si el jugador murió. */
function loseHp(ctx: Ctx, player: PlayerState, rawAmount: number, source: DamageSource): boolean {
  const { state } = ctx;
  const amount = Math.round(rawAmount);
  if (player.status !== 'alive' || amount <= 0) return false;
  player.hp -= amount;
  player.stats.damageTaken += amount;
  ctx.events.push({ type: 'damage', gt: gtOf(ctx), playerId: player.id, amount, source });
  // NATHAN: 1 de oro por cada 10 de vida que pierde cualquier jugador (acumulado por jugador).
  const nathan = state.players.find((p) => p.character === 'nathan' && p.status === 'alive');
  if (nathan) {
    const before = Math.floor((player.stats.damageTaken - amount) / CHARACTER_PARAMS.nathan.hpPerGold);
    const after = Math.floor(player.stats.damageTaken / CHARACTER_PARAMS.nathan.hpPerGold);
    if (after > before) gainGold(ctx, nathan, after - before, 'nathan', false);
  }
  if (player.hp > 0) return false;
  return kill(ctx, player);
}

/** Mata al jugador. Devuelve false si revivió en el acto (ENOCH). */
function kill(ctx: Ctx, player: PlayerState): boolean {
  const { state } = ctx;
  const gt = gtOf(ctx);
  // ENOCH (activa): si muere dentro de los 20 s, vuelve con 50 %.
  if (player.enochGuardUntilGt !== null && gt <= player.enochGuardUntilGt) {
    player.enochGuardUntilGt = null;
    player.status = 'dead';
    player.stats.deaths += 1;
    ctx.events.push({ type: 'death', gt, playerId: player.id });
    revive(ctx, player, CHARACTER_PARAMS.enoch.reviveShare);
    return false;
  }
  player.status = 'dead';
  player.hp = 0;
  player.stats.deaths += 1;
  player.soldierHp = 0;
  player.burns = [];
  player.buffs = [];
  player.enochGuardUntilGt = null;
  ctx.events.push({ type: 'death', gt, playerId: player.id });
  // URIAS: al morir, los vivos se curan 250 y ganan +15 % de ataque para siempre.
  if (player.character === 'urias') {
    for (const ally of alivePlayers(state)) {
      ally.uriasBlessing += CHARACTER_PARAMS.urias.deathAttackBonus;
      heal(ctx, ally, CHARACTER_PARAMS.urias.deathHeal, 'urias', player);
    }
  }
  return true;
}

function revive(ctx: Ctx, player: PlayerState, share: number): void {
  const { state } = ctx;
  if (player.status !== 'dead') return;
  const enochShare = player.character === 'enoch' ? CHARACTER_PARAMS.enoch.reviveShare : REVIVE_HP_SHARE;
  player.status = 'alive';
  player.hp = Math.max(1, Math.round(maxHp(state, player) * Math.max(share, enochShare)));
  ctx.events.push({ type: 'revive', gt: gtOf(ctx), playerId: player.id, hp: player.hp });
}

function heal(ctx: Ctx, target: PlayerState, rawAmount: number, source: HealSource, healer: PlayerState | null): number {
  const { state } = ctx;
  if (target.status !== 'alive' || rawAmount <= 0) return 0;
  const bonus = target.character === 'naaman' ? 1 + CHARACTER_PARAMS.naaman.healReceivedBonus : 1;
  const amount = Math.min(Math.round(rawAmount * bonus), maxHp(state, target) - target.hp);
  if (amount <= 0) return 0;
  target.hp += amount;
  target.stats.healingReceived += amount;
  if (healer) healer.stats.healingDone += amount;
  ctx.events.push({ type: 'heal', gt: gtOf(ctx), playerId: target.id, amount, source });
  return amount;
}

function gainGold(ctx: Ctx, player: PlayerState, raw: number, source: 'round' | 'offer' | 'tubalcain' | 'nathan', withBonus = true): void {
  const amount = Math.round(raw * (withBonus ? 1 + goldBonus(player, gtOf(ctx)) : 1));
  if (amount <= 0) return;
  player.gold += amount;
  player.stats.goldEarned += amount;
  ctx.events.push({ type: 'gold', gt: gtOf(ctx), playerId: player.id, amount, source });
}

// --- Votaciones de PHARAONIS ----------------------------------------------------------------------------

function queueDecision(state: CoopState, kind: DecisionKind, gt: number): void {
  state.decisions.push({ id: `${kind}-${state.roundNumber}-${state.decisions.length}`, kind, endsGt: gt, votes: {} });
}

function openDecision(ctx: Ctx): void {
  const { state } = ctx;
  const gt = gtOf(ctx);
  const decision = state.decisions[0]!;
  decision.endsGt = gt + DECISION_MS;
  state.phase = 'decision';
  ctx.events.push({ type: 'decisionOpen', gt, id: decision.id, kind: decision.kind, endsGt: decision.endsGt });
}

function resolveDecision(ctx: Ctx): void {
  const { state } = ctx;
  const gt = gtOf(ctx);
  const decision = state.decisions.shift()!;
  const boss = currentBoss(state)!;
  const voters = alivePlayers(state);
  const accepted = voters.filter((p) => decision.votes[p.id] === true);
  let approved = false;
  let secret = false;
  if (decision.kind === 'groupOffer') {
    approved = accepted.length * 2 > voters.length; // Mayoría estricta; sin voto = rechazo.
    if (approved) {
      boss.damageBonus += PHARAONIS.groupOfferDamageBonus;
      for (const player of voters) gainGold(ctx, player, PHARAONIS.groupOfferGold, 'offer', false);
    }
  } else {
    approved = accepted.length > 0;
    boss.damageBonus += PHARAONIS.individualOfferDamagePerAccept * accepted.length;
    secret = accepted.length === 1 && voters.length > 1;
    if (secret) {
      const lone = accepted[0]!;
      gainGold(ctx, lone, PHARAONIS.loneAcceptGold, 'offer', false);
      for (const player of voters) if (player !== lone) loseHp(ctx, player, PHARAONIS.loneAcceptPenaltyHp, 'offer');
      ctx.events.push({ type: 'secretRevealed', gt, secret: 'loneAccept', playerId: lone.id });
    } else {
      for (const player of accepted) gainGold(ctx, player, PHARAONIS.individualOfferGold, 'offer', false);
    }
  }
  ctx.events.push({ type: 'decisionResult', gt, id: decision.id, kind: decision.kind, accepted: accepted.map((p) => p.id), approved, secret });
  if (checkWipe(ctx)) return;
  if (state.decisions.length > 0) {
    openDecision(ctx);
    return;
  }
  startNextStep(ctx);
}

// --- Tienda ---------------------------------------------------------------------------------------------

function extraShopOptions(player: PlayerState): number {
  return player.character === 'tubalcain' || player.character === 'hiram' || player.character === 'eliseus' ? 1 : 0;
}

function ownedByAnyone(state: CoopState, itemId: ItemId): boolean {
  return state.players.some((p) => hasItem(p, itemId));
}

function eligibleItems(state: CoopState, player: PlayerState): ItemId[] {
  return ITEM_IDS.filter((id) => {
    const item = ITEMS[id];
    if (item.unique && (ownedByAnyone(state, id) || (id === 'apple' && state.appleBought))) return false;
    if (id === 'jesusCross' && state.cross.seen) return false; // Aparece una sola vez por partida.
    if (item.onePerPlayer && hasItem(player, id)) return false;
    return true;
  });
}

function openShop(ctx: Ctx): void {
  const { state } = ctx;
  const gt = gtOf(ctx);
  state.shopsOpened += 1;
  const number = state.shopsOpened;
  const shop: ShopState = {
    number,
    endsGt: gt + SHOP_MS,
    free: state.cross.freeNextShop,
    offers: {},
    done: [],
    swapAvailable: [],
  };
  state.cross.freeNextShop = false;
  let crossAppeared = false;
  for (const player of alivePlayers(state)) {
    const offers: ShopOffer[] = [];
    const pool = eligibleItems(state, player);
    const draws = SHOP_BASE_OPTIONS + extraShopOptions(player);
    for (let i = 0; i < draws; i += 1) {
      const key = ['shop', number, player.id, i];
      const itemId = pickWeighted(
        state.seed,
        key,
        pool.filter((id) => !offers.some((o) => o.itemId === id)).map((id) => ({ value: id, weight: ITEMS[id].weight })),
      );
      if (!itemId) break;
      if (itemId === 'jesusCross') crossAppeared = true;
      const variant: WeaponVariant | undefined =
        itemId === 'commonWeapon' ? (['sword', 'ring', 'bow', 'staff'] as const)[pickIndex(state.seed, [...key, 'variant'], 4)] : undefined;
      offers.push({ id: `${number}-${player.id}-${i}`, kind: 'item', itemId, variant, sold: false });
    }
    if (player.character === 'eliseus' && !offers.some((o) => o.itemId === 'healingPotion')) {
      offers.push({ id: `${number}-${player.id}-potion`, kind: 'item', itemId: 'healingPotion', sold: false });
    }
    if (player.character === 'urias' && (player.charges ?? 0) < CHARACTERS.urias.maxCharges!) {
      offers.push({ id: `${number}-${player.id}-urias`, kind: 'rechargeUrias', sold: false });
    }
    if (player.character === 'debbora' && (player.charges ?? 0) < CHARACTERS.debbora.maxCharges!) {
      offers.push({ id: `${number}-${player.id}-debbora`, kind: 'rechargeDebbora', sold: false });
    }
    shop.offers[player.id] = offers;
    if (player.hiramSwapArmed) {
      player.hiramSwapArmed = false;
      shop.swapAvailable.push(player.id);
    }
  }
  state.shop = shop;
  state.phase = 'shop';
  ctx.events.push({ type: 'shopOpen', gt, number, endsGt: shop.endsGt, free: shop.free });
  if (crossAppeared) {
    // Cruz de Jesús: no se compra; con solo aparecer, la próxima tienda es gratis y la próxima ronda cura a todos.
    state.cross = { freeNextShop: true, healNextRound: true, seen: true };
    ctx.events.push({ type: 'secretRevealed', gt, secret: 'cross', playerId: null });
  }
}

function closeShop(ctx: Ctx): void {
  const { state } = ctx;
  state.shop = null;
  ctx.events.push({ type: 'shopClose', gt: gtOf(ctx) });
  // HIRAM: recupera una carga por cada tienda completada.
  for (const player of state.players) if (player.character === 'hiram' && player.status === 'alive') addCharge(player);
  startNextStep(ctx);
}

function buy(ctx: Ctx, player: PlayerState, offerId: string): void {
  const { state } = ctx;
  const shop = state.shop;
  if (state.phase !== 'shop' || !shop) reject('La tienda está cerrada.');
  if (player.status !== 'alive') reject('Los jugadores muertos no acceden a la tienda.');
  const offer = shop.offers[player.id]?.find((o) => o.id === offerId) ?? reject('Esa opción no está en tu tienda.');
  if (offer.sold) reject('Ya lo compraste.');
  const price = offerPrice(state, player, offer);
  if (!Number.isFinite(price)) reject('No se puede comprar.');
  if (player.gold < price) reject('No te alcanza el oro.');
  const gt = gtOf(ctx);
  if (offer.kind === 'item') {
    const item = ITEMS[offer.itemId!];
    if (item.unique && (ownedByAnyone(state, item.id) || (item.id === 'apple' && state.appleBought))) reject('Otro jugador ya lo tiene.');
    if (item.onePerPlayer && hasItem(player, item.id)) reject('Ya tienes uno.');
    if (item.storage !== 'instant' && player.inventory.length >= INVENTORY_SLOTS) reject('Inventario lleno.');
    if (item.id === 'hint' && player.character !== 'debbora' && player.hints >= HINTS_MAX) reject('Ya tienes el máximo de pistas.');
  }
  player.gold -= price;
  player.stats.goldSpent += price;
  offer.sold = true;
  ctx.events.push({ type: 'purchase', gt, playerId: player.id, offerId, itemId: offer.itemId ?? null, price });
  const boss = currentBoss(state);
  if (boss && boss.id === 'haman' && boss.hp > 0 && boss.spawnGt !== null) addHamanGold(ctx, boss, HAMAN.goldPerPurchase);

  if (offer.kind === 'rechargeUrias') return addCharge(player);
  if (offer.kind === 'rechargeDebbora') {
    player.debboraRecharges += 1;
    return addCharge(player);
  }
  const item = ITEMS[offer.itemId!];
  if (item.id === 'hint') {
    player.hints += ITEM_PARAMS.hint.hints;
    return;
  }
  if (item.id === 'apple') {
    state.appleBought = true;
    ctx.events.push({ type: 'secretRevealed', gt, secret: 'apple', playerId: player.id });
    for (const target of alivePlayers(state)) {
      loseHp(ctx, target, maxHp(state, target) * ITEM_PARAMS.apple.maxHpLossShare, 'apple');
      if (target.status === 'alive') target.hints += ITEM_PARAMS.apple.hints; // No cuenta para el máximo.
    }
    checkWipe(ctx);
    return;
  }
  player.inventory.push({ uid: `${offer.id}`, itemId: item.id, variant: offer.variant, effectBonus: 0 });
  // Al equipar un arma, cambia el tipo de daño del portador.
  const type = item.id === 'commonWeapon' && offer.variant ? WEAPON_TYPES[offer.variant] : item.damageType;
  if (type) player.damageType = type;
}

// --- Acciones -------------------------------------------------------------------------------------------

function applyAction(ctx: Ctx, action: Exclude<CoopAction, { type: 'tick' }>): void {
  const { state } = ctx;
  if (isOver(state)) reject('La partida terminó.');
  const player = requirePlayer(state, action.playerId);
  switch (action.type) {
    case 'solve':
      return solve(ctx, player, action.slot);
    case 'useHint':
      return useHint(ctx, player);
    case 'useActive':
      return useActive(ctx, player, action.targetId, action.amount);
    case 'useItem':
      return useItem(ctx, player, action.itemUid, action.targetId);
    case 'buy':
      return buy(ctx, player, action.offerId);
    case 'shopSwap':
      return shopSwap(ctx, player, action.targetId);
    case 'shopDone':
      return shopDone(ctx, player);
    case 'vote':
      return vote(ctx, player, action.decisionId, action.accept);
    case 'surrender':
      return surrenderVote(ctx, player, action.accept);
    case 'leave':
      return leave(ctx, player);
  }
}

function solve(ctx: Ctx, player: PlayerState, slot: number): void {
  const { state } = ctx;
  if (state.phase !== 'round') reject('No hay una ronda en curso.');
  const assignment = player.assignments[slot] ?? reject('Ese criptico no es tuyo.');
  if (assignment.solved) reject('Ya lo resolviste.');
  if (player.status === 'left') reject('Saliste de la partida.');
  assignment.solved = true;
  player.stats.crypticsSolved += 1;
  ctx.events.push({ type: 'solved', gt: gtOf(ctx), playerId: player.id, slot });
  if (player.status === 'dead') {
    // Un muerto que resuelve cura 20 al aliado vivo con menos vida.
    const target = alivePlayers(state).sort((a, b) => a.hp - b.hp || a.seat - b.seat)[0];
    if (target) heal(ctx, target, DEAD_SOLVE_HEAL, 'deadSolve', player);
    return;
  }
  // Ronda normal: quien resuelve todos sus cripticos golpea al jefe en el momento (el oro llega al cerrar la ronda).
  if (state.roundKind === 'normal' && allSolved(player)) {
    const boss = currentBoss(state);
    if (boss && boss.hp > 0 && player.attackedRound !== state.roundNumber) {
      player.attackedRound = state.roundNumber;
      playerAttack(ctx, player, false);
    }
    // Si el golpe derribó al jefe, la ronda termina ya: nadie más recibe daño.
    if (boss && boss.hp <= 0) {
      endRound(ctx);
      return;
    }
  }
  const participants = roundParticipants(state);
  if (participants.length > 0 && participants.every(allSolved)) endRound(ctx);
}

function useHint(ctx: Ctx, player: PlayerState): void {
  if (ctx.state.phase !== 'round') reject('Las pistas se usan durante la ronda.');
  if (player.hints <= 0) reject('No te quedan pistas.');
  revealNextHint(ctx, player);
  player.hints -= 1;
  player.stats.hintsUsed += 1;
}

/** Revela la siguiente pista del primer criptico sin resolver. */
function revealNextHint(ctx: Ctx, player: PlayerState): void {
  const slot = player.assignments.findIndex((a) => !a.solved);
  const assignment = player.assignments[slot] ?? reject('No tienes un criptico en pantalla.');
  if (assignment.hintsRevealed >= 2) reject('Ese criptico no tiene más pistas.');
  assignment.hintsRevealed += 1;
  ctx.events.push({ type: 'hintRevealed', gt: gtOf(ctx), playerId: player.id, slot, level: assignment.hintsRevealed });
}

function requireAlly(state: CoopState, player: PlayerState, targetId: string | undefined): PlayerState {
  const target = targetId ? playerById(state, targetId) : undefined;
  if (!target || target.id === player.id) reject('Elige a un aliado.');
  if (target.status !== 'alive') reject('Ese aliado no está vivo.');
  return target;
}

function useActive(ctx: Ctx, player: PlayerState, targetId: string | undefined, amount: number | undefined): void {
  const { state } = ctx;
  if (state.phase !== 'round' && state.phase !== 'shop' && state.phase !== 'decision') reject('Ahora no se pueden usar habilidades.');
  if (player.status !== 'alive') reject('Solo los vivos usan su habilidad.');
  if (player.activeUsedRound === state.roundNumber) reject('Ya usaste tu habilidad en esta ronda.');
  if (player.charges !== null && player.charges <= 0) reject('Sin cargas.');
  const gt = gtOf(ctx);
  const p = CHARACTER_PARAMS;
  let target: PlayerState | null = null;
  switch (player.character) {
    case 'enoch':
      player.enochGuardUntilGt = gt + p.enoch.guardMs;
      break;
    case 'mathusala':
      player.buffs.push({ source: 'mathusala', stat: 'armor', amount: p.mathusala.armor, untilGt: gt + p.mathusala.armorMs });
      break;
    case 'tubalcain':
      target = requireAlly(state, player, targetId);
      gainGold(ctx, target, p.tubalcain.allyGold, 'tubalcain', false);
      for (const item of target.inventory) item.effectBonus += p.tubalcain.allyItemBonus;
      break;
    case 'debbora':
      if (state.phase !== 'round') reject('Se usa con un criptico en pantalla.');
      revealNextHint(ctx, player);
      break;
    case 'gedeon':
      target = requireAlly(state, player, targetId);
      if (player.hp <= p.gedeon.hpCost) reject('No te alcanza la vida.');
      player.hp -= p.gedeon.hpCost;
      player.stats.damageTaken += p.gedeon.hpCost;
      ctx.events.push({ type: 'damage', gt, playerId: player.id, amount: p.gedeon.hpCost, source: 'gedeon' });
      target.soldierHp = p.gedeon.soldierHp;
      break;
    case 'samson':
      player.sacrificePending = true;
      ctx.events.push({ type: 'activeUsed', gt, playerId: player.id, targetId: null });
      player.activeUsedRound = state.roundNumber;
      player.usesCount += 1;
      player.stats.activesUsed += 1;
      player.enochGuardUntilGt = null;
      kill(ctx, player);
      checkWipe(ctx);
      return;
    case 'urias':
      player.buffs.push({ source: 'urias', stat: 'rage', amount: p.urias.rageFactor, untilGt: gt + p.urias.rageMs });
      break;
    case 'nathan':
      for (const ally of alivePlayers(state)) heal(ctx, ally, p.nathan.heal, 'nathan', player);
      player.rechargeNeeded = p.nathan.firstNormalWinsPerCharge + player.usesCount; // 2, 3, 4…
      break;
    case 'hiram':
      player.hiramSwapArmed = true;
      break;
    case 'naaman': {
      target = requireAlly(state, player, targetId);
      const hpMax = maxHp(state, player);
      if (player.hp < hpMax * p.naaman.minHpShare) reject('Necesitas al menos 20 % de tu vida.');
      const cost = Math.floor(amount ?? 0);
      if (cost < 1 || cost >= player.hp) reject('Cantidad de vida inválida.');
      player.hp -= cost;
      player.stats.damageTaken += cost;
      ctx.events.push({ type: 'damage', gt, playerId: player.id, amount: cost, source: 'naaman' });
      heal(ctx, target, cost * p.naaman.healPerHp, 'naaman', player);
      break;
    }
    case 'eliseus':
      for (const ally of alivePlayers(state)) {
        ally.buffs.push({ source: 'eliseus', stat: 'attack', amount: p.eliseus.attackBonus, untilGt: gt + p.eliseus.buffMs });
        ally.buffs.push({ source: 'eliseus', stat: 'gold', amount: p.eliseus.goldBonus, untilGt: gt + p.eliseus.buffMs });
      }
      break;
  }
  if (player.charges !== null) player.charges -= 1;
  player.activeUsedRound = state.roundNumber;
  player.usesCount += 1;
  player.stats.activesUsed += 1;
  ctx.events.push({ type: 'activeUsed', gt, playerId: player.id, targetId: target?.id ?? null });
}

function useItem(ctx: Ctx, player: PlayerState, itemUid: string, targetId: string | undefined): void {
  const { state } = ctx;
  if (state.phase !== 'round' && state.phase !== 'shop' && state.phase !== 'decision') reject('Ahora no se pueden usar objetos.');
  if (player.status !== 'alive') reject('Solo los vivos usan objetos.');
  const index = player.inventory.findIndex((i) => i.uid === itemUid);
  const item = player.inventory[index] ?? reject('No tienes ese objeto.');
  const gt = gtOf(ctx);
  const effect = itemEffectiveness(player, item);
  let target: PlayerState | null = null;
  switch (item.itemId) {
    case 'healingPotion':
      heal(ctx, player, ITEM_PARAMS.healingPotion.heal * effect, 'potion', player);
      player.inventory.splice(index, 1);
      break;
    case 'strengthPotion':
      player.buffs.push({ source: 'strengthPotion', stat: 'attack', amount: ITEM_PARAMS.strengthPotion.attackBonus * effect, untilGt: gt + ITEM_PARAMS.strengthPotion.ms });
      player.inventory.splice(index, 1);
      break;
    case 'davidHarp':
      if (!player.harpReady) reject('El arpa se recarga al empezar la próxima ronda difícil.');
      target = targetId ? (playerById(state, targetId) ?? null) : player;
      if (!target || target.status !== 'alive') reject('Elige a un jugador vivo.');
      heal(ctx, target, ITEM_PARAMS.davidHarp.heal * effect, 'harp', player);
      player.harpReady = false;
      break;
    default:
      reject('Ese objeto no se usa: actúa solo.');
  }
  ctx.events.push({ type: 'itemUsed', gt, playerId: player.id, itemId: item.itemId, targetId: target?.id ?? null });
}

function shopSwap(ctx: Ctx, player: PlayerState, targetId: string): void {
  const { state } = ctx;
  const shop = state.shop;
  if (state.phase !== 'shop' || !shop) reject('La tienda está cerrada.');
  if (!shop.swapAvailable.includes(player.id)) reject('No tienes el intercambio disponible.');
  const target = requireAlly(state, player, targetId);
  const mine = shop.offers[player.id] ?? [];
  const theirs = shop.offers[target.id] ?? [];
  // Se intercambian los objetos sin vender; las recargas propias de cada personaje se quedan con su dueño.
  const movable = (offers: ShopOffer[]) => offers.filter((o) => o.kind === 'item' && !o.sold);
  const fixed = (offers: ShopOffer[]) => offers.filter((o) => o.kind !== 'item' || o.sold);
  shop.offers[player.id] = [...fixed(mine), ...movable(theirs)];
  shop.offers[target.id] = [...fixed(theirs), ...movable(mine)];
  shop.swapAvailable = shop.swapAvailable.filter((id) => id !== player.id);
  ctx.events.push({ type: 'shopSwap', gt: gtOf(ctx), playerId: player.id, targetId: target.id });
}

function shopDone(ctx: Ctx, player: PlayerState): void {
  const { state } = ctx;
  const shop = state.shop;
  if (state.phase !== 'shop' || !shop) reject('La tienda está cerrada.');
  if (!shop.done.includes(player.id)) shop.done.push(player.id);
  // Todos listos: se cierra antes de los 45 s.
  if (alivePlayers(state).every((p) => shop.done.includes(p.id))) closeShop(ctx);
}

function vote(ctx: Ctx, player: PlayerState, decisionId: string, accept: boolean): void {
  const { state } = ctx;
  const decision = state.decisions[0];
  if (state.phase !== 'decision' || !decision || decision.id !== decisionId) reject('No hay una votación abierta.');
  if (player.status !== 'alive') reject('Solo votan los vivos.');
  decision.votes[player.id] = accept;
  if (alivePlayers(state).every((p) => p.id in decision.votes)) resolveDecision(ctx);
}

// --- Rendición --------------------------------------------------------------------------------------------

/** Votan todos los que siguen en la partida (vivos y caídos); los que salieron no cuentan. */
const surrenderVoters = (state: CoopState) => state.players.filter((p) => p.status !== 'left');

/**
 * «Sí» abre la votación (o suma el voto); «no» solo retira el voto propio: la votación sigue abierta hasta que
 * vence (30 s) o todos dicen que sí. Con unanimidad la partida termina en derrota.
 */
function surrenderVote(ctx: Ctx, player: PlayerState, accept: boolean): void {
  const { state } = ctx;
  if (player.status === 'left') reject('Saliste de la partida.');
  const gt = gtOf(ctx);
  if (!state.surrender) {
    if (!accept) reject('No hay una votación de rendición abierta.');
    state.surrender = { startedBy: player.id, endsGt: gt + SURRENDER_VOTE_MS, yes: [] };
  }
  const vote = state.surrender;
  vote.yes = vote.yes.filter((id) => id !== player.id);
  if (accept) vote.yes.push(player.id);
  ctx.events.push({
    type: 'surrenderVote',
    gt,
    playerId: player.id,
    accept,
    yes: vote.yes.length,
    needed: surrenderVoters(state).length,
    endsGt: vote.endsGt,
  });
  checkSurrender(ctx);
}

function checkSurrender(ctx: Ctx): void {
  const vote = ctx.state.surrender;
  if (!vote) return;
  const voters = surrenderVoters(ctx.state);
  if (voters.length > 0 && voters.every((p) => vote.yes.includes(p.id))) closeSurrender(ctx, true);
}

function closeSurrender(ctx: Ctx, passed: boolean): void {
  if (!ctx.state.surrender) return;
  ctx.state.surrender = null;
  ctx.events.push({ type: 'surrenderEnd', gt: gtOf(ctx), passed });
  if (passed) finish(ctx, false, true);
}

function leave(ctx: Ctx, player: PlayerState): void {
  const { state } = ctx;
  if (player.status === 'left') return;
  if (player.status === 'alive') player.stats.deaths += 1;
  player.status = 'left';
  player.hp = 0;
  player.assignments = [];
  ctx.events.push({ type: 'death', gt: gtOf(ctx), playerId: player.id });
  if (checkWipe(ctx)) return;
  // Sin su voto, la rendición puede quedar unánime.
  checkSurrender(ctx);
  if (isOver(state)) return;
  // Si era el último pendiente, la ronda/tienda/votación puede terminar ya.
  if (state.phase === 'round') {
    const participants = roundParticipants(state);
    if (participants.length > 0 && participants.every(allSolved)) endRound(ctx);
  } else if (state.phase === 'shop' && state.shop && alivePlayers(state).every((p) => state.shop!.done.includes(p.id))) {
    closeShop(ctx);
  } else if (state.phase === 'decision' && state.decisions[0] && alivePlayers(state).every((p) => p.id in state.decisions[0]!.votes)) {
    resolveDecision(ctx);
  }
}
