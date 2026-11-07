# Recursos gráficos de los temas

El tema **Medieval** usa dos imágenes de fondo. Hasta que existan, se ve un muro procedural (sillares, moho y penumbra generados con CSS/SVG), así que la app funciona igual sin ellas.

| Archivo | Uso | Tamaño | Peso objetivo |
| --- | --- | --- | --- |
| `public/themes/medieval/wall.webp` | PC y tablets en horizontal | 2560 × 1440 (16:9) | < 450 KB |
| `public/themes/medieval/wall-mobile.webp` | Celulares (vertical) | 1080 × 2340 (9:19.5) | < 300 KB |

Las antorchas, su luz y el titileo los dibuja el CSS encima de la imagen. Por eso la imagen **no** debe tener antorchas ni fuentes de luz propias: quedarían desalineadas con las llamas animadas.

El centro de la imagen queda tapado por la losa de contenido. El detalle interesante (nichos, arcos y moho) va hacia los costados y las esquinas.

## Prompts para Gemini (Nano Banana Pro)

Los prompts están en inglés porque el modelo responde con más precisión. Si el resultado sale demasiado claro, pide «darker, lower key, -1 EV».

### PC — `wall.webp`

```text
Ultra-detailed realistic digital painting of the inside wall of an ancient underground crypt, viewed straight on, flat frontal perspective, no floor and no ceiling visible. Massive rough-hewn limestone and granite blocks with deep, uneven mortar joints, chipped edges and old chisel marks. Damp stone: dark green moss and black-green mildew growing out of the joints, thicker near the bottom corners, with a few thin trails of water stains running down. On the far left and far right, recessed burial niches (loculi) carved into the wall, arched in a simple Romanesque style, some sealed with cracked stone slabs, one partly open and dark inside. A worn carved stone arch frames the composition near the edges. The central area is calmer and plainer stone with less detail, because UI content will cover it. Lighting: very dark, low-key, as if lit only by distant dim firelight off-frame; deep shadows, almost black corners, subtle warm rim light on stone edges, cold green-grey tones in the shadows. Absolutely no torches, no flames, no candles, no visible light sources, no people, no skeletons, no text, no symbols, no logos. Cinematic, moody, painterly realism, fine stone texture, 16:9, 2560x1440.
```

### Celular — `wall-mobile.webp`

```text
Ultra-detailed realistic digital painting of the inside wall of an ancient underground crypt, tall vertical composition, flat frontal view. Large rough-hewn stone blocks stacked in irregular courses with deep mortar joints, chips and chisel marks. Dark green moss and mildew creeping from the joints, heavier at the bottom, with thin dripping water stains. Near the top and near the bottom, narrow arched burial niches (loculi) carved into the stone, one sealed with a cracked slab, one dark and empty. The middle band of the image is plainer stone with little detail because interface panels will cover it. Very dark low-key lighting, as if from faint firelight off-frame, warm highlights only on a few stone edges, cold green-grey shadows, near-black corners. No torches, no flames, no candles, no visible light sources, no people, no skeletons, no text, no symbols. Moody painterly realism, 9:19.5 portrait, 1080x2340.
```

### Si la imagen sale mal

- **Muy clara o con contraste suave:** «Make it much darker and more low-key; corners almost black; keep only faint warm highlights.»
- **Aparecen antorchas o velas:** «Remove every torch, flame and light source; keep the same wall.»
- **Detalle en el centro:** «Simplify the central third into plain, slightly blurred stone blocks.»
- **Repetitiva o de videojuego:** «More photographic stone texture, irregular block sizes, natural weathering.»

## Convertir a WebP

1. Abre <https://squoosh.app>, arrastra la imagen y elige **WebP** con calidad 70–78 y el tamaño de la tabla de arriba.
2. Guarda con el nombre exacto en `public/themes/medieval/`.
3. `npm run deploy`. Los archivos de `public/` se publican tal cual.
