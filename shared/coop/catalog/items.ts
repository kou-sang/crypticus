// Objetos de la tienda COOP. `weight`: probabilidad de aparecer en cada opción al azar (en %, suman 100).
// `unique`: «solo puede tenerla un jugador» (única en la party). `onePerPlayer`: no se repite en el inventario.

export type ItemId =
  | 'healingPotion'
  | 'strengthPotion'
  | 'commonVest'
  | 'commonWeapon'
  | 'goliathSword'
  | 'jonathanBow'
  | 'mosesStaff'
  | 'pharaohRing'
  | 'hint'
  | 'eliasMantle'
  | 'apple'
  | 'balaamDonkey'
  | 'josephTunic'
  | 'jerichoTrumpet'
  | 'davidHarp'
  | 'jesusCross';

export type DamageKind = 'physical' | 'magic';
export type DamageRange = 'melee' | 'ranged';
export interface DamageType {
  kind: DamageKind;
  range: DamageRange;
}
export const DEFAULT_DAMAGE_TYPE: DamageType = { kind: 'physical', range: 'melee' };

export type WeaponVariant = 'sword' | 'ring' | 'bow' | 'staff';
export const WEAPON_TYPES: Record<WeaponVariant, DamageType> = {
  sword: { kind: 'physical', range: 'melee' },
  ring: { kind: 'magic', range: 'melee' },
  bow: { kind: 'physical', range: 'ranged' },
  staff: { kind: 'magic', range: 'ranged' },
};
export const WEAPON_VARIANT_NAMES: Record<WeaponVariant, string> = { sword: 'Espada común', ring: 'Anillo común', bow: 'Arco común', staff: 'Vara común' };

/** Cómo se guarda: ocupa casilla, se consume al usarse o se aplica al comprarlo. */
export type ItemStorage = 'equipped' | 'consumable' | 'instant';

export interface ItemDefinition {
  id: ItemId;
  name: string;
  description: string;
  /** `null`: no se puede comprar (Cruz de Jesús). */
  cost: number | null;
  weight: number;
  storage: ItemStorage;
  unique: boolean;
  onePerPlayer: boolean;
  /** Tipo de daño que impone al equiparse (las armas). La común lo toma de su variante. */
  damageType?: DamageType;
  /** Secreto: la descripción real solo se revela cuando alguien lo compra. */
  secret?: string;
}

export const ITEM_PARAMS = {
  healingPotion: { heal: 40 },
  strengthPotion: { attackBonus: 0.3, ms: 180_000 },
  commonVest: { armor: 10 },
  commonWeapon: { attackBonus: 0.1 },
  goliathSword: { attackBonus: 0.2, vsGoliathBonus: 1 },
  jonathanBow: { attackBonus: 0.2 },
  mosesStaff: { roundHeal: 25 },
  pharaohRing: { attackBonus: 0.2 },
  hint: { hints: 1 },
  eliasMantle: { evasion: 0.2 },
  apple: { maxHpLossShare: 0.2, hints: 2 },
  balaamDonkey: { damageTakenReduction: 0.3, hintDiscount: 0.2 },
  josephTunic: { redirectShare: 0.2, armor: 60 },
  jerichoTrumpet: { attackBonus: 0.3, holdersShare: 0.5 },
  davidHarp: { heal: 50 },
  jesusCross: {},
} as const;

export const ITEMS: Record<ItemId, ItemDefinition> = {
  healingPotion: {
    id: 'healingPotion',
    name: 'Poción de curación',
    description: 'Al usarla se consume y te cura 40 de vida.',
    cost: 50,
    weight: 10,
    storage: 'consumable',
    unique: false,
    onePerPlayer: false,
  },
  strengthPotion: {
    id: 'strengthPotion',
    name: 'Poción de fuerza',
    description: 'Al usarla se consume y te da +30 % de daño durante 3 minutos.',
    cost: 50,
    weight: 10,
    storage: 'consumable',
    unique: false,
    onePerPlayer: false,
  },
  commonVest: {
    id: 'commonVest',
    name: 'Chaleco común',
    description: '+10 de armadura.',
    cost: 50,
    weight: 10,
    storage: 'equipped',
    unique: false,
    onePerPlayer: true,
  },
  commonWeapon: {
    id: 'commonWeapon',
    name: 'Arma común',
    description: '+10 % de ataque. Espada: físico cuerpo a cuerpo · Anillo: mágico cuerpo a cuerpo · Arco: físico a distancia · Vara: mágico a distancia. Cambia tu tipo de daño.',
    cost: 100,
    weight: 16,
    storage: 'equipped',
    unique: false,
    onePerPlayer: true,
  },
  goliathSword: {
    id: 'goliathSword',
    name: 'Espada de Goliat',
    description: '+20 % de ataque. Contra GOLIATH, +100 % de daño. Físico cuerpo a cuerpo.',
    cost: 150,
    weight: 5,
    storage: 'equipped',
    unique: true,
    onePerPlayer: true,
    damageType: WEAPON_TYPES.sword,
  },
  jonathanBow: {
    id: 'jonathanBow',
    name: 'Arco de Jonatán',
    description: '+20 % de ataque. Físico a distancia.',
    cost: 150,
    weight: 6,
    storage: 'equipped',
    unique: false,
    onePerPlayer: true,
    damageType: WEAPON_TYPES.bow,
  },
  mosesStaff: {
    id: 'mosesStaff',
    name: 'Vara de Moisés',
    description: 'Al empezar cada ronda, cura 25 de vida a todos los jugadores.',
    cost: 150,
    weight: 6,
    storage: 'equipped',
    unique: true,
    onePerPlayer: true,
  },
  pharaohRing: {
    id: 'pharaohRing',
    name: 'Anillo del Faraón',
    description: '+20 % de ataque. Mágico cuerpo a cuerpo.',
    cost: 150,
    weight: 6,
    storage: 'equipped',
    unique: false,
    onePerPlayer: true,
    damageType: WEAPON_TYPES.ring,
  },
  hint: {
    id: 'hint',
    name: 'Pista',
    description: 'Suma una pista de un tipo al azar: definición, indicador, relleno o letra (máximo 2 en total). No ocupa casilla.',
    cost: 200,
    weight: 10,
    storage: 'instant',
    unique: false,
    onePerPlayer: false,
  },
  eliasMantle: {
    id: 'eliasMantle',
    name: 'Manto de Elías',
    description: '20 % de evasión contra los golpes del jefe.',
    cost: 150,
    weight: 5,
    storage: 'equipped',
    unique: true,
    onePerPlayer: true,
  },
  apple: {
    id: 'apple',
    name: 'Solo una manzana',
    description: '¿?',
    cost: 0,
    weight: 3,
    storage: 'instant',
    unique: true,
    onePerPlayer: true,
    secret: 'Al comprarla, todos pierden el 20 % de su vida máxima y ganan 2 pistas de tipos al azar (por encima del máximo).',
  },
  balaamDonkey: {
    id: 'balaamDonkey',
    name: 'Burra de Balaam',
    description: 'Reduce un 30 % todo el daño que recibes. Las pistas de tu tienda cuestan 20 % menos.',
    cost: 200,
    weight: 3,
    storage: 'equipped',
    unique: true,
    onePerPlayer: true,
  },
  josephTunic: {
    id: 'josephTunic',
    name: 'Túnica de José',
    description: 'El 20 % del daño que reciben tus aliados pasa a ti. +60 de armadura.',
    cost: 200,
    weight: 3.3,
    storage: 'equipped',
    unique: true,
    onePerPlayer: true,
  },
  jerichoTrumpet: {
    id: 'jerichoTrumpet',
    name: 'Trompeta de Jericó',
    description: 'Si al menos la mitad de los jugadores tiene una, todos ganan +30 % de daño.',
    cost: 200,
    weight: 3.3,
    storage: 'equipped',
    unique: false,
    onePerPlayer: true,
  },
  davidHarp: {
    id: 'davidHarp',
    name: 'Arpa de David',
    description: 'Habilidad: cura 50 de vida a cualquier jugador. Se recarga al empezar cada ronda difícil.',
    cost: 200,
    weight: 3.3,
    storage: 'equipped',
    unique: true,
    onePerPlayer: true,
  },
  jesusCross: {
    id: 'jesusCross',
    name: 'Cruz de Jesús',
    description: 'No se puede comprar. Si aparece, en la próxima tienda todo es gratis para todos, y al empezar la próxima ronda todos se curan al 100 % y los muertos reviven.',
    cost: null,
    weight: 0.1,
    storage: 'instant',
    unique: true,
    onePerPlayer: true,
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
