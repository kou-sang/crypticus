// Textos de los eventos COOP para la zona de cripticos (registro de lo que pasa) y los avisos grandes.
import { BOSSES, SUMMONS } from '../../../shared/coop/catalog/bosses';
import { CHARACTERS } from '../../../shared/coop/catalog/characters';
import { ITEMS } from '../../../shared/coop/catalog/items';
import type { CoopEvent } from '../../../shared/coop/events';
import type { CoopState } from '../../../shared/coop/state';
import { HINT_KIND_LABELS } from '../../../shared/hints';

const ABILITY_TEXT: Record<string, string> = {
  damage1: 'gana +5 % de daño.',
  groupOffer: 'ofrece 300 de oro a cada uno… a cambio de más daño.',
  lice: 'desata los piojos: manchas sobre los cripticos cada vez que recibe daño.',
  individualOffer: 'ofrece 300 de oro a quien acepte.',
  burst: 'golpea a todos por el 5 % de su vida máxima.',
  poison: 'envenena a todos: −1 de vida cada 5 s.',
  noCells: 'borra las casillas: las respuestas van en un campo libre.',
  summonRex: 'invoca a REX ASSUERUS: hay que derribarlo primero.',
  rexDown: 'REX ASSUERUS cayó.',
  hideCells: 'oculta las casillas en esta ronda.',
  shift: 'desfasa las letras que tipean en esta ronda',
  inhibit: 'inhibe a',
  burn: 'quema a',
  surcharge: 'sube los precios de la tienda.',
};

export function nameOf(state: CoopState | null, playerId: string | null | undefined): string {
  const player = state?.players.find((p) => p.id === playerId);
  return player ? player.name : 'Alguien';
}

/** Causa del daño directo (sin golpe del jefe) para el registro. `null`: no se registra. */
const DAMAGE_SOURCE_TEXT: Partial<Record<Extract<CoopEvent, { type: 'damage' }>['source'], string>> = {
  burn: 'quemadura de LEVIATHAN',
  pharaonis: 'estallido de PHARAONIS',
  apple: 'la manzana',
  offer: 'la oferta secreta',
};

const bossName = (state: CoopState | null): string => {
  const boss = state?.bosses[state.bossIndex];
  return boss ? BOSSES[boss.id].name : 'El jefe';
};

/** Portador de la Túnica de José que recibió parte del golpe (otro jugador vivo con la túnica). */
const tunicHolder = (state: CoopState | null, targetId: string): string =>
  nameOf(state, state?.players.find((p) => p.id !== targetId && p.status === 'alive' && p.inventory.some((i) => i.itemId === 'josephTunic'))?.id);

/** Línea para el registro de la zona de cripticos. `null`: no se registra (lo muestran otras animaciones). */
export function describeEvent(event: CoopEvent, state: CoopState | null, meId?: string): string | null {
  const who = (playerId: string) => (playerId === meId ? 'Tú' : nameOf(state, playerId));
  switch (event.type) {
    case 'playerHit': {
      const target = event.target === 'rex' ? SUMMONS.rexAssuerus.name : bossName(state);
      const how = [event.soldier && 'soldado', event.sacrifice && 'sacrificio', event.evaded && 'esquivó parte'].filter(Boolean).join(', ');
      return `${who(event.playerId)} → ${target}: −${event.amount}${how ? ` (${how})` : ''}.`;
    }
    case 'bossHit': {
      if (event.evaded) return event.playerId === meId ? `Esquivaste el golpe de ${bossName(state)}.` : `${nameOf(state, event.playerId)} esquivó el golpe de ${bossName(state)}.`;
      const extra = [
        event.crit && 'crítico',
        event.absorbed > 0 && `soldado absorbe ${event.absorbed}`,
        event.redirected > 0 && `${tunicHolder(state, event.playerId)} recibe ${event.redirected} por la Túnica de José`,
      ].filter(Boolean);
      return `${bossName(state)} → ${who(event.playerId)}: −${event.amount}${extra.length > 0 ? ` (${extra.join(', ')})` : ''}.`;
    }
    case 'damage': {
      const cause = DAMAGE_SOURCE_TEXT[event.source];
      return cause ? `${who(event.playerId)}: −${event.amount} por ${cause}.` : null;
    }
    case 'bossIntro':
      return `Aparece ${BOSSES[event.bossId].name}.`;
    case 'roundStart':
      return `Ronda ${event.round} · ${event.kind === 'hard' ? 'difícil (grupal)' : 'normal'}.`;
    case 'roundEnd':
      if (event.kind === 'hard') return event.hardSuccess ? '¡Todos resolvieron! Atacan y se abre la tienda.' : 'Alguien no resolvió: todos reciben daño.';
      return event.winners.length > 0
        ? `Ganaron la ronda: ${event.winners.map((id) => nameOf(state, id)).join(', ')}.`
        : 'Nadie resolvió a tiempo.';
    case 'bossAbility': {
      const boss = BOSSES[event.bossId].name;
      if (event.ability === 'rexDown') return `${SUMMONS.rexAssuerus.name} cayó: ${boss} vuelve a recibir los golpes.`;
      if (event.ability === 'shift') return `${boss} ${ABILITY_TEXT.shift} (${Number(event.detail) > 0 ? '+' : ''}${event.detail}).`;
      if (event.ability === 'inhibit' || event.ability === 'burn') return `${boss} ${ABILITY_TEXT[event.ability]} ${nameOf(state, event.detail)}.`;
      if (event.ability === 'surcharge') return `${boss} ${ABILITY_TEXT.surcharge} (+${event.detail} de oro).`;
      return `${boss} ${ABILITY_TEXT[event.ability] ?? ''}`.trim();
    }
    case 'bossDefeated':
      return `¡${BOSSES[event.bossId].name} fue derrotado!`;
    case 'decisionResult':
      if (event.secret) return `Secreto: solo ${nameOf(state, event.accepted[0])} aceptó. Recibe 1000 de oro y los demás pierden 100 de vida.`;
      if (event.kind === 'groupOffer') return event.approved ? 'La mayoría aceptó la oferta: +300 de oro para todos.' : 'Oferta rechazada.';
      return event.accepted.length > 0 ? `Aceptaron: ${event.accepted.map((id) => nameOf(state, id)).join(', ')}.` : 'Nadie aceptó.';
    case 'secretRevealed':
      if (event.secret === 'apple') return `${nameOf(state, event.playerId)} compró la manzana: todos pierden el 20 % de su vida y ganan 2 pistas de tipos al azar.`;
      if (event.secret === 'cross') return '¡Apareció la Cruz de Jesús! La próxima tienda es gratis y la próxima ronda cura y revive a todos.';
      return null;
    case 'purchase':
      return event.itemId ? `${nameOf(state, event.playerId)} compró ${ITEMS[event.itemId].name}.` : null;
    case 'activeUsed': {
      const player = state?.players.find((p) => p.id === event.playerId);
      if (!player) return null;
      const target = event.targetId ? ` sobre ${nameOf(state, event.targetId)}` : '';
      return `${player.name} usó la activa de ${CHARACTERS[player.character].name}${target}.`;
    }
    case 'hintGained':
      // Solo la propia: el tipo de pista de los demás no aporta al registro.
      return event.playerId === meId ? `Ganaste una pista de ${HINT_KIND_LABELS[event.kind].toLowerCase()}.` : null;
    case 'death':
      return `${nameOf(state, event.playerId)} cayó.`;
    case 'revive':
      return `${nameOf(state, event.playerId)} volvió a la vida.`;
    case 'shopSwap':
      return `${nameOf(state, event.playerId)} intercambió su tienda con ${nameOf(state, event.targetId)}.`;
    case 'surrenderVote':
      if (event.accept && event.yes === 1) return `${nameOf(state, event.playerId)} propone rendirse (${event.yes}/${event.needed}).`;
      return event.accept
        ? `${nameOf(state, event.playerId)} vota rendirse (${event.yes}/${event.needed}).`
        : `${nameOf(state, event.playerId)} no quiere rendirse (${event.yes}/${event.needed}).`;
    case 'surrenderEnd':
      return event.passed ? 'La party se rindió por unanimidad.' : 'Venció la votación de rendición: siguen jugando.';
    case 'gameOver':
      return event.won ? '¡Victoria! Todos los jefes cayeron.' : event.surrendered ? 'Derrota por rendición.' : 'Derrota.';
    default:
      return null;
  }
}
