// Siluetas negras (sombras) de jefes, personajes y objetos COOP. Dibujos propios y simples en SVG,
// sobre un halo del tema (`.coop-halo`) para que se lean también en los temas oscuros.
import { memo } from 'react';
import type { BossId, SummonId } from '../../../shared/coop/catalog/bosses';
import type { CharacterId } from '../../../shared/coop/catalog/characters';
import type { ItemId } from '../../../shared/coop/catalog/items';
import { cx } from '../../lib/utils';

const SHADOW = '#0b0b0d';

/** Cuerpo humano base (cabeza, torso y piernas) en un lienzo de 100×100. */
const HUMAN = 'M50 14a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z M38 34h24l6 30h-8l-2 30h-8l-2-22-2 22h-8l-2-30h-8Z';

const BOSS_PATHS: Record<BossId | SummonId, string> = {
  // Faraón: nemes (tocado) ancho y cetro cruzado.
  pharaonis:
    'M50 6c-12 0-20 8-22 18l-6 22h12v-6l3 6h26l3-6v6h12l-6-22C70 14 62 6 50 6Z M36 48h28l6 46H30Z M66 52l18-26 4 3-18 26Z M84 22a5 5 0 1 1 6 6Z',
  // Gigante con casco y lanza.
  goliath:
    'M50 2l10 6v12a10 10 0 1 1-20 0V8Z M32 30h36l10 34h-10l-3 34H35l-3-34H22Z M80 2h4v96h-4Z M76 2l6-2 6 2-6 10Z',
  // Serpiente en S con la cabeza erguida.
  serpentis:
    'M62 8c10 0 16 7 16 14 0 6-4 10-10 10-4 0-6-2-8-4-6 6-22 6-26 18-3 10 8 14 20 14 18 0 30 8 30 20 0 12-14 18-34 18H14v-8h36c12 0 20-3 20-9s-8-11-24-11c-18 0-28-8-26-20 2-14 18-18 28-24 2-10 6-18 14-18Z M66 14a2 2 0 1 0 0 4Z',
  // Monstruo marino: aletas y cola sobre olas.
  leviathan:
    'M8 70c10-18 30-30 52-28 14 1 24 8 30 4l4 10c-8 6-18 4-26 2l10 14H66l-8-10-6 12H40l2-14c-10 2-20 8-26 16Z M60 30l10-14 4 16Z M0 86c8-6 16-6 24 0s16 6 24 0 16-6 24 0 16 6 28 0v14H0Z',
  // Bestia maciza de patas como columnas.
  behemoth:
    'M14 40c4-14 20-22 40-22 14 0 22 4 30 10l10-6 2 10-6 6c2 6 2 12 0 18H82l-2 30H68l-2-22H38l-2 22H24l-2-30h-6c-4-6-4-12-2-16Z M84 28a3 3 0 1 1 0 6Z',
  // Ministro con sombrero alto y túnica.
  haman: 'M42 2h16l4 22H38Z M50 24a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z M34 44h32l10 54H24Z M62 50l20 6-2 6-18-4Z',
  // Reina con corona y vestido largo.
  jezabel:
    'M40 6l5 6 5-8 5 8 5-6v12H40Z M50 20a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z M38 40h24l4 18 14 40H20l14-40Z M30 44l-12 18 4 4 12-14Z M70 44l12 18-4 4-12-14Z',
  // Rey sentado con cetro.
  rexAssuerus:
    'M38 8l4 6 4-8 4 8 4-8 4 8 4-6v12H38Z M50 22a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z M32 42h36l4 22H28Z M24 64h52v34H64V76H36v22H24Z M72 30h4v40h-4Z M70 26a4 4 0 1 1 8 0 4 4 0 1 1-8 0Z',
};

/** Accesorio distintivo de cada personaje sobre el cuerpo base. */
const CHARACTER_PROPS: Record<CharacterId, string> = {
  enoch: 'M70 40l14-20 4 3-14 20Z M84 16a4 4 0 1 1 6 6Z', // Señal al cielo.
  mathusala: 'M26 30h4v66h-4Z M22 28h12v4H22Z', // Bastón de anciano.
  tubalcain: 'M72 44h18v8H72Z M78 52h6v20h-6Z', // Martillo de herrero.
  debbora: 'M20 34l10-4 6 26-10 4Z M34 10l16-6 16 6-16 4Z', // Palmera / tocado.
  gedeon: 'M76 30h10v6H76Z M80 36h4v20h-4Z M74 56h16l-8 10Z', // Antorcha y cántaro.
  samson: 'M24 16c-6 10-6 22 0 32l4-2c-4-10-4-18 0-28Z M76 16c6 10 6 22 0 32l-4-2c4-10 4-18 0-28Z', // Cabello largo.
  urias: 'M74 34l4-2 14 40-4 2Z M14 40h16v24H14Z', // Lanza y escudo.
  nathan: 'M18 40h14v18H18Z M20 44h10v2H20Z M20 50h10v2H20Z', // Pergamino profético.
  hiram: 'M70 60h22v6H70Z M74 50h14v10H74Z', // Bloque de construcción.
  naaman: 'M14 70c6-6 12-6 18 0s12 6 18 0v8c-6 6-12 6-18 0s-12-6-18 0Z', // Agua del Jordán.
  eliseus: 'M22 30h4v64h-4Z M18 28c4-4 8-4 12 0Z', // Báculo de profeta.
};

const ITEM_PATHS: Record<ItemId, string> = {
  healingPotion: 'M42 10h16v14l14 20v40a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8V44l14-20Z M46 58h8v-8h6v8h8v6h-8v8h-6v-8h-8Z',
  strengthPotion: 'M42 10h16v14l14 20v40a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8V44l14-20Z M44 52l12-6-4 12 8 2-14 12 4-12-8-2Z',
  commonVest: 'M30 16l12 6h16l12-6 14 20-10 8v42H26V44l-10-8Z',
  commonWeapon: 'M70 8l8 8-40 40 6 6-6 6-6-6-12 12-8-8 12-12-6-6 6-6 6 6Z',
  goliathSword: 'M74 4l10 10-44 44 8 8-8 8-8-8-14 14-10-10 14-14-8-8 8-8 8 8Z',
  jonathanBow: 'M24 8c40 8 56 34 56 42S64 84 24 92l-2-6c34-8 48-28 48-36S56 22 22 14Z M24 12h4v76h-4Z',
  mosesStaff: 'M46 14h8v80h-8Z M40 8c4-6 16-6 20 0l-4 8H44Z',
  pharaohRing: 'M50 26a26 26 0 1 1 0 52a26 26 0 1 1 0-52Zm0 10a16 16 0 1 0 0 32a16 16 0 1 0 0-32Z M40 12h20l-4 14H44Z',
  hint: 'M50 10a26 26 0 0 1 16 46c-4 4-6 8-6 14H40c0-6-2-10-6-14a26 26 0 0 1 16-46Z M40 76h20v8H40Z M44 88h12v6H44Z',
  eliasMantle: 'M30 10h40l18 80H12Z M44 10h12v20H44Z',
  apple: 'M50 30c10-8 30-6 32 14 2 20-12 44-32 44S16 64 18 44c2-20 22-22 32-14Z M48 30c0-10 4-18 12-20l2 4c-6 2-8 8-8 16Z',
  balaamDonkey: 'M14 44c6-10 20-14 40-12l14-12 4 4 4-6 4 6-2 10 8 10-4 6-10-4v14l-4 26h-8l-2-20H34l-2 20h-8l-2-26c-6-4-10-10-8-16Z',
  josephTunic: 'M28 10l14 8h16l14-8 18 22-12 10-4-6v58H26V36l-4 6-12-10Z M26 50h48v6H26Z M26 70h48v6H26Z',
  jerichoTrumpet: 'M10 44h40l30-20v52L50 56H10Z M14 56h8v12h-8Z',
  davidHarp: 'M24 8h8v84h-8Z M32 10c30 4 44 30 44 60v22H32Z M40 30v56 M52 34v52 M64 46v40',
  jesusCross: 'M44 6h12v26h24v12H56v50H44V44H20V32h24Z',
};

interface SilhouetteProps {
  className?: string;
  title?: string;
}

function Svg({ path, className, title }: { path: string } & SilhouetteProps) {
  return (
    <svg viewBox="0 0 100 100" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} className={cx('block', className)}>
      {title && <title>{title}</title>}
      <path d={path} fill={SHADOW} fillRule="evenodd" />
    </svg>
  );
}

export const BossSilhouette = memo(function BossSilhouette({ id, ...props }: { id: BossId | SummonId } & SilhouetteProps) {
  return <Svg path={BOSS_PATHS[id]} {...props} />;
});

export const CharacterSilhouette = memo(function CharacterSilhouette({ id, ...props }: { id: CharacterId } & SilhouetteProps) {
  return <Svg path={`${HUMAN} ${CHARACTER_PROPS[id]}`} {...props} />;
});

export const ItemSilhouette = memo(function ItemSilhouette({ id, ...props }: { id: ItemId } & SilhouetteProps) {
  return <Svg path={ITEM_PATHS[id]} {...props} />;
});
