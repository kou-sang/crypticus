// Jefes del modo COOP: textos para la UI y parámetros de sus habilidades. Las reglas viven en el motor
// (`engine.ts`); aquí solo hay datos. Las etiquetas (ZOMBIE, CIBERNÉTICO) son decorativas.
import type { CoopLevel } from '../balance';

export type BossId = 'pharaonis' | 'goliath' | 'serpentis' | 'leviathan' | 'behemoth' | 'haman' | 'jezabel';
export type SummonId = 'rexAssuerus';

export interface BossDefinition {
  id: BossId;
  name: string;
  tag: 'ZOMBIE' | 'CIBERNÉTICO' | null;
  level: CoopLevel;
  female: boolean; // SAMSON recibe +300 % de daño de los jefes femeninos.
  /** Presentación: 4 oraciones del relato bíblico, con palabras propias. */
  story: string;
  abilities: string[];
}

export const PHARAONIS = {
  thresholdShare: 0.12, // Cada 12 % de HP perdido activa el siguiente efecto.
  damageBonus: 0.05,
  groupOfferGold: 300,
  groupOfferDamageBonus: 0.05,
  individualOfferGold: 300,
  individualOfferDamagePerAccept: 0.01,
  loneAcceptGold: 1000,
  loneAcceptPenaltyHp: 100,
  burstMaxHpShare: 0.05,
  poisonDamage: 1, // Por tick de 5 s.
} as const;

/** Efectos de PHARAONIS en orden de activación. */
export type PharaonisEffect = 'damage1' | 'groupOffer' | 'lice' | 'individualOffer' | 'burst' | 'poison' | 'noCells';
export const PHARAONIS_EFFECTS: readonly PharaonisEffect[] = ['damage1', 'groupOffer', 'lice', 'individualOffer', 'burst', 'poison', 'noCells'];

export const GOLIATH = {
  spawnBonus: 0.3, // + % del tiempo transcurrido, a HP y daño, al aparecer.
  rangedTakenMultiplier: 3,
  /** Bandas por HP restante (proporción): armadura y curación cada 5 s. */
  bands: [
    { above: 0.8, armor: 140, regen: 0 },
    { above: 0.6, armor: 100, regen: 0 },
    { above: 0.4, armor: 60, regen: 10 },
    { above: 0.2, armor: 20, regen: 15 },
    { above: -Infinity, armor: 0, regen: 20 },
  ],
} as const;

export const SERPENTIS = {
  belowShare: 0.3,
  hideCellsChance: 0.3,
  shiftChance: 0.3,
  shifts: [1, 2, -1, -2] as const,
} as const;

export const LEVIATHAN = {
  hpBonus: 0.3,
  rangedTakenMultiplier: 0.8,
  burnTotal: 21,
  burnTicks: 3,
  burnMaxStacks: 3,
} as const;

export const BEHEMOTH = {
  damageBonus: 0.3,
  magicTakenMultiplier: 0.8,
  critChance: 0.3,
  critBonus: 0.4,
} as const;

/** LEVIATHAN y BEHEMOTH bajo el 25 %: evasión. Un ataque evadido hace el 15 %. */
export const LOW_HP_EVASION = { belowShare: 0.25, chance: 0.2, evadedShare: 0.15 } as const;

export const HAMAN = {
  goldStolenPerHit: 50,
  goldPerPurchase: 10,
  surchargeStep: 200, // Por cada 200 de oro de HAMAN…
  surchargePerStep: 10, // …+10 a los precios, permanente.
  summonThresholdShare: 0.1, // Un golpe ≥ 10 % de su HP total invoca a REX ASSUERUS.
  maxSummons: 2,
} as const;

export const JEZABEL = {
  topPhysicalReduction: 0.3,
  healOnHitMissingShare: 0.1,
  healOnKillMissingShare: 0.3,
  damagePerPreviousBoss: 0.1,
  inhibitBelowShare: 0.4,
} as const;

export const BOSSES: Record<BossId, BossDefinition> = {
  pharaonis: {
    id: 'pharaonis',
    name: 'PHARAONIS',
    tag: 'ZOMBIE',
    level: 'AT',
    female: false,
    story:
      'Rey de Egipto que esclavizó a los hebreos y les impuso trabajos forzados. Moisés le pidió una y otra vez que dejara ir al pueblo, y él endureció su corazón. Diez plagas cayeron sobre su tierra: aguas en sangre, ranas, piojos, tinieblas y la muerte de los primogénitos. Cuando por fin persiguió a Israel, su ejército quedó sepultado en el mar.',
    abilities: [
      'Cada 12 % de vida perdida activa el siguiente efecto, en orden:',
      '1) +5 % de daño. 2) Oferta grupal: 300 de oro a cada uno si la mayoría acepta, y él gana +5 % de daño.',
      '3) Piojos: manchas en los cripticos cada vez que recibe daño. 4) Oferta individual: 300 de oro a quien acepte, +1 % de daño por cada uno.',
      '5) Daña a todos un 5 % de su vida máxima. 6) Veneno: −1 de vida cada 5 s. 7) Sin casillas: la respuesta se escribe en un campo libre.',
    ],
  },
  goliath: {
    id: 'goliath',
    name: 'GOLIATH',
    tag: 'ZOMBIE',
    level: 'AT',
    female: false,
    story:
      'Gigante filisteo de Gat, armado con casco de bronce, cota de malla y una lanza enorme. Durante cuarenta días desafió al ejército de Israel a enviarle un solo hombre. Nadie se atrevía, hasta que un joven pastor llamado David aceptó, confiando en Dios. Con una honda y una piedra, David lo derribó y lo venció con su propia espada.',
    abilities: [
      'Al aparecer, su vida y su daño aumentan un 30 % más el porcentaje de tiempo transcurrido.',
      'El daño a distancia le hace el triple.',
      'Armadura que se pierde al bajar su vida (140 → 100 → 60 → 20 → 0), a cambio de curarse cada 5 s (0 → 10 → 15 → 20).',
    ],
  },
  serpentis: {
    id: 'serpentis',
    name: 'SERPENTIS',
    tag: null,
    level: 'AT',
    female: false,
    story:
      'La serpiente era el más astuto de los animales del campo que Dios había hecho. En el huerto del Edén se acercó a la mujer y puso en duda lo que Dios había dicho. Le prometió que, al comer del fruto prohibido, serían como Dios. Por su engaño fue maldita a arrastrarse sobre su vientre.',
    abilities: [
      'Bajo el 30 % de vida, cada golpe que recibe puede (30 %) ocultar las casillas en la próxima ronda.',
      'Y puede (30 %) desfasar las letras que se tipean (+1, +2, −1 o −2) en la próxima ronda.',
    ],
  },
  leviathan: {
    id: 'leviathan',
    name: 'LEVIATHAN',
    tag: 'CIBERNÉTICO',
    level: 'AT',
    female: false,
    story:
      'Monstruo de los mares descrito en el libro de Job, cubierto de escamas como escudos. De su boca salen llamas y de su nariz, humo. Ninguna espada ni lanza logra atravesarlo, y no hay en la tierra nada que se le compare. Isaías anuncia el día en que Dios lo castigará con su espada poderosa.',
    abilities: [
      'Vida +30 %. El daño a distancia le hace un 20 % menos.',
      'Sus golpes queman: 21 de daño en 3 rondas (acumulable hasta 3 veces).',
      'Bajo el 25 % de vida, 20 % de evasión: un ataque evadido hace solo el 15 %.',
    ],
  },
  behemoth: {
    id: 'behemoth',
    name: 'BEHEMOTH',
    tag: 'CIBERNÉTICO',
    level: 'AT',
    female: false,
    story:
      'Bestia descrita en el libro de Job, la primera entre las obras de Dios. Come hierba como el buey, pero su fuerza está en sus lomos y sus huesos son como barras de hierro. Se echa bajo los lotos y no se inquieta aunque el río crezca. Solo su Creador puede acercarle la espada.',
    abilities: [
      'Daño +30 %. El daño mágico le hace un 20 % menos.',
      '30 % de probabilidad de golpe crítico (+40 % de daño).',
      'Bajo el 25 % de vida, 20 % de evasión: un ataque evadido hace solo el 15 %.',
    ],
  },
  haman: {
    id: 'haman',
    name: 'HAMAN',
    tag: 'CIBERNÉTICO',
    level: 'AT',
    female: false,
    story:
      'Alto funcionario del rey Asuero de Persia, orgulloso y ávido de honores. Como Mardoqueo no se inclinaba ante él, planeó exterminar a todos los judíos del reino. La reina Ester arriesgó su vida para revelar el complot ante el rey. Haman terminó colgado en la horca que había preparado para Mardoqueo.',
    abilities: [
      'Sus golpes roban 50 de oro. Gana 10 de oro con cada compra de los jugadores.',
      'Por cada 200 de oro que acumula, la tienda sube 10 de oro para siempre.',
      'Un golpe de al menos el 10 % de su vida total invoca a REX ASSUERUS (máximo 2 veces), que recibe los ataques hasta caer.',
    ],
  },
  jezabel: {
    id: 'jezabel',
    name: 'JEZABEL',
    tag: 'ZOMBIE',
    level: 'AT',
    female: true,
    story:
      'Princesa fenicia, esposa del rey Acab de Israel. Promovió el culto a Baal y persiguió a los profetas del Señor. Mandó matar a Nabot para quitarle su viña y amenazó de muerte al profeta Elías. Murió arrojada desde una ventana, como había anunciado Elías.',
    abilities: [
      'El daño físico o cuerpo a cuerpo del jugador con más ataque físico se reduce un 30 %.',
      'Dañar a un jugador la cura un 10 % de su vida faltante; matarlo, un 30 %.',
      '+10 % de daño por cada jefe ya derrotado.',
      'Bajo el 40 % de vida, inhibe en la próxima ronda al jugador que más daño le hizo.',
    ],
  },
};

export const SUMMONS: Record<SummonId, { name: string; story: string }> = {
  rexAssuerus: {
    name: 'REX ASSUERUS',
    story: 'Rey de Persia que gobernó desde la India hasta Etiopía. Ester fue su reina.',
  },
};

export const AT_BOSS_IDS: readonly BossId[] = ['pharaonis', 'goliath', 'serpentis', 'leviathan', 'behemoth', 'haman', 'jezabel'];
