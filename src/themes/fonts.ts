// Fuentes de los temas Medieval (Cinzel) y Cyber (Rajdhani): self-hosted vía @fontsource y cargadas solo al
// elegir el tema, para no sumar peso a quien juega con el Normal.
// Instalación (una vez): npm i @fontsource-variable/cinzel @fontsource/rajdhani
// Se resuelven con import.meta.glob: si el paquete aún no está instalado, el tema usa fuentes de respaldo
// (ver --font-* en themes.css) y el build no falla.
import { getSettings, subscribeSettings, type Skin } from '../lib/settings';

const SKIN_FONTS: Record<Exclude<Skin, 'normal'>, Record<string, () => Promise<unknown>>> = {
  medieval: import.meta.glob('/node_modules/@fontsource-variable/cinzel/index.css', { exhaustive: true }),
  cyber: import.meta.glob(
    ['/node_modules/@fontsource/rajdhani/500.css', '/node_modules/@fontsource/rajdhani/600.css', '/node_modules/@fontsource/rajdhani/700.css'],
    { exhaustive: true },
  ),
};

const loaded = new Set<Skin>();

function load(skin: Skin): void {
  if (skin === 'normal' || loaded.has(skin)) return;
  loaded.add(skin);
  for (const importer of Object.values(SKIN_FONTS[skin])) {
    importer().catch((error: unknown) => {
      loaded.delete(skin);
      console.warn('[fonts] no se pudo cargar la fuente del tema', skin, error);
    });
  }
}

/** Carga las fuentes del tema actual y de cada tema que se elija después. */
export function loadSkinFonts(): void {
  load(getSettings().skin);
  subscribeSettings(() => load(getSettings().skin));
}
