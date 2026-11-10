// Personajes del modo COOP (nivel AT). Cada uno tiene 1 pasiva y 1 activa; no se repiten en la party.
// Aquí van los textos y los números; las reglas están en el motor.

export type CharacterId =
  | 'enoch'
  | 'mathusala'
  | 'tubalcain'
  | 'debbora'
  | 'gedeon'
  | 'samson'
  | 'urias'
  | 'nathan'
  | 'hiram'
  | 'naaman'
  | 'eliseus';

/** Qué necesita la activa al usarse. */
export type ActiveTarget = 'none' | 'ally' | 'allyAndAmount' | 'player';

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  passive: string;
  active: string;
  /** Cargas al empezar y máximo. `null`: sin límite (JSON no admite Infinity). */
  startCharges: number | null;
  maxCharges: number | null;
  target: ActiveTarget;
  /** Pide confirmación antes de usarse (efecto irreversible). */
  confirm: boolean;
}

export const CHARACTER_PARAMS = {
  enoch: { reviveShare: 0.5, guardMs: 20_000 },
  mathusala: { hpBonus: 2, armor: 60, armorMs: 60_000 }, // 300 % de vida = +200 %.
  tubalcain: { priceDiscount: 0.3, itemEffectBonus: 0.2, hardWinsPerCharge: 2, allyGold: 100, allyItemBonus: 0.2 },
  debbora: { statsBonus: 0.35, rechargeBaseCost: 150, rechargeCostStep: 50 },
  gedeon: { statsPerPlayer: 0.12, armor: 30, soldierHp: 50, soldierDamageShare: 0.3, hpCost: 100 },
  samson: { statsPerWin: 0.1, femaleDamageTakenBonus: 3, sacrificeMultiplier: 5 },
  urias: { deathHeal: 250, deathAttackBonus: 0.15, rageMs: 120_000, rageFactor: 1.5, rechargeCost: 150 },
  nathan: { hpPerGold: 10, heal: 150, firstNormalWinsPerCharge: 2 },
  hiram: { itemEffectBonus: 0.2 },
  naaman: { healReceivedBonus: 0.3, minHpShare: 0.2, healPerHp: 2 },
  eliseus: { attackBonus: 0.33, goldBonus: 0.33, buffMs: 120_000, hardWinsPerCharge: 2 },
} as const;

export const CHARACTERS: Record<CharacterId, CharacterDefinition> = {
  enoch: {
    id: 'enoch',
    name: 'Enoch',
    passive: 'El Manto de Elías no le cuesta oro. Cada vez que revive, vuelve con 50 % de vida.',
    active: 'Durante 20 s, si muere, vuelve a la vida con 50 % de vida. Una sola vez.',
    startCharges: 1,
    maxCharges: 1,
    target: 'none',
    confirm: true,
  },
  mathusala: {
    id: 'mathusala',
    name: 'Mathusala',
    passive: 'Tiene 300 % de vida.',
    active: 'Gana 60 de armadura durante 1 minuto.',
    startCharges: 1,
    maxCharges: 1,
    target: 'none',
    confirm: false,
  },
  tubalcain: {
    id: 'tubalcain',
    name: 'Tubalcain',
    passive: 'Los objetos le cuestan 30 % menos y sus efectos son 20 % mayores. Una opción más en la tienda.',
    active: 'Un aliado recibe 100 de oro y sus objetos actuales mejoran un 20 %. Gana una carga cada 2 rondas difíciles superadas.',
    startCharges: 0,
    maxCharges: 1,
    target: 'ally',
    confirm: false,
  },
  debbora: {
    id: 'debbora',
    name: 'Debbora',
    passive: 'Estadísticas básicas +35 %. Cada tienda ofrece recargar su activa (150 de oro + 50 por recarga comprada). Acumula pistas sin límite.',
    active: 'Revela una pista del criptico que tiene en pantalla, sin gastar las suyas. Hasta 2 cargas.',
    startCharges: 0,
    maxCharges: 2,
    target: 'none',
    confirm: false,
  },
  gedeon: {
    id: 'gedeon',
    name: 'Gedeon',
    passive: 'Estadísticas básicas +12 % por cada jugador en la sala. 30 de armadura.',
    active: 'Por 100 de vida, envía un soldado (50 de vida) a un aliado: ataca con él por el 30 % de su daño y recibe primero los golpes del jefe. Recupera la carga con cada ronda difícil superada.',
    startCharges: 1,
    maxCharges: 1,
    target: 'ally',
    confirm: false,
  },
  samson: {
    id: 'samson',
    name: 'Samson',
    passive: 'Estadísticas básicas +10 % por cada ronda superada (normales propias, difíciles del equipo). Recibe +300 % de daño de los jefes femeninos.',
    active: 'Muere al instante, pero al final de la ronda hace 500 % de su daño al jefe. Sin límite mientras viva.',
    startCharges: null,
    maxCharges: null,
    target: 'none',
    confirm: true,
  },
  urias: {
    id: 'urias',
    name: 'Urias',
    passive: 'Al morir, los jugadores vivos se curan 250 de vida y ganan +15 % de ataque por el resto de la partida.',
    active: 'Durante 120 s, su ataque sube 1,5 × el porcentaje de vida que le falta. Se recarga en la tienda por 150 de oro.',
    startCharges: 1,
    maxCharges: 1,
    target: 'none',
    confirm: false,
  },
  nathan: {
    id: 'nathan',
    name: 'Nathan',
    passive: 'Gana 1 de oro por cada 10 de vida que pierde cualquier jugador. Recupera una carga cada 2 rondas normales que gana (+1 ronda por cada uso).',
    active: 'Cura 150 de vida a todos los jugadores vivos. Hasta 2 cargas.',
    startCharges: 2,
    maxCharges: 2,
    target: 'none',
    confirm: false,
  },
  hiram: {
    id: 'hiram',
    name: 'Hiram',
    passive: 'Recupera una carga con cada tienda. Una opción más en la tienda. Sus objetos equipados son 20 % más eficaces.',
    active: 'En la próxima tienda puede intercambiar sus opciones con las de otro jugador vivo.',
    startCharges: 1,
    maxCharges: 1,
    target: 'none',
    confirm: false,
  },
  naaman: {
    id: 'naaman',
    name: 'Naaman',
    passive: 'Las curaciones que recibe son 30 % más efectivas.',
    active: 'Con al menos 20 % de vida, cura a un aliado 2 de vida por cada 1 de la suya. Sin límite de cargas.',
    startCharges: null,
    maxCharges: null,
    target: 'allyAndAmount',
    confirm: false,
  },
  eliseus: {
    id: 'eliseus',
    name: 'Eliseus',
    passive: 'Una opción más en la tienda, y siempre tiene la Poción de curación disponible.',
    active: 'Durante 2 minutos, todos los aliados ganan +33 % de ataque y +33 % de oro. Recupera la carga cada 2 rondas difíciles superadas.',
    startCharges: 1,
    maxCharges: 1,
    target: 'none',
    confirm: false,
  },
};

export const AT_CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];
