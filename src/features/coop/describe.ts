// Textos de los eventos COOP para la zona de cripticos (registro de lo que pasa) y los avisos grandes.
import { BOSSES, SUMMONS } from '../../../shared/coop/catalog/bosses';
import { CHARACTERS } from '../../../shared/coop/catalog/characters';
import { ITEMS } from '../../../shared/coop/catalog/items';
import type { CoopEvent } from '../../../shared/coop/events';
import type { CoopState } from '../../../shared/coop/state';

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

/** Línea para el registro de la zona de cripticos. `null`: no se registra (lo muestran otras animaciones). */
export function describeEvent(event: CoopEvent, state: CoopState | null): string | null {
  switch (event.type) {
    case 'bossIntro':
      return `Aparece ${BOSSES[event.bossId].name}.`;
    case 'roundStart':
      return `Ronda ${event.round} · ${event.kind === 'hard' ? 'difícil (grupal)' : 'normal'}.`;
    case 'roundEnd':
      if (event.kind === 'hard') return event.hardSuccess ? '¡Todos resolvieron! Atacan y se abre la tienda.' : 'Alguien no resolvió: todos reciben daño.';
      return event.winners.length > 0
        ? `Atacan: ${event.winners.map((id) => nameOf(state, id)).join(', ')}.`
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
      if (event.secret === 'apple') return `${nameOf(state, event.playerId)} compró la manzana: todos pierden el 20 % de su vida y ganan 2 pistas.`;
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
    case 'death':
      return `${nameOf(state, event.playerId)} cayó.`;
    case 'revive':
      return `${nameOf(state, event.playerId)} volvió a la vida.`;
    case 'shopSwap':
      return `${nameOf(state, event.playerId)} intercambió su tienda con ${nameOf(state, event.targetId)}.`;
    case 'gameOver':
      return event.won ? '¡Victoria! Todos los jefes cayeron.' : 'Derrota.';
    default:
      return null;
  }
}
