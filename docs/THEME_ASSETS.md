# Recursos gráficos de los temas

## Cripta (antes Medieval): fondo y antorchas

| Archivo | Uso | Tamaño | Peso objetivo |
| --- | --- | --- | --- |
| `public/themes/crypt/wall.webp` | PC y tablets en horizontal | 2560 × 1440 (16:9) | < 450 KB |
| `public/themes/crypt/wall-mobile.webp` | Celulares (vertical) | 1080 × 2340 (9:19.5) | < 300 KB |

Mientras no existan, se ve `wall-fallback.svg`, un muro repetible del mismo estilo (piedras redondeadas, juntas negras, moho y enredaderas) ya incluido en el repo.

- **Estilo:** ilustración digital con volumen y textura realistas, como la referencia de piedras con moho. Paleta **oscura**, con pocos blancos, para que el texto se lea encima.
- **Sin antorchas ni fuentes de luz en el muro.** Las antorchas son un recurso aparte (`torch.webp`) y la luz, la llama, el viento y las chispas se animan por código encima.
- **Centro tranquilo.** La losa de contenido tapa el centro, así que el detalle (moho, enredaderas, piedras grandes) va hacia los costados.

### Antorcha

`public/themes/crypt/torch.webp` es la antorcha de la izquierda de la imagen de Gemini, recortada con fondo transparente (115 × 445). La de la derecha es la misma, espejada. Para cambiarla, pide a Gemini la antorcha sola sobre fondo verde puro (`#00FF00`) y recórtala; con fondo de muro el recorte automático pierde partes.

### Cómo pedírselo a Gemini (Nano Banana Pro)

1. Adjunta tu imagen de referencia de piedras con moho (la primera que compartiste).
2. Pega el prompt de abajo. Está en inglés porque el modelo responde con más precisión.
3. Si sale clara, responde: «Much darker, low-key, -1.5 EV, no bright highlights».

**PC (`wall.webp`):**

```text
Use the attached image only as a style reference: a wall of large rounded, irregular stones with dark mortar gaps, moss and hanging ivy, drawn as a digital illustration. Create a new, original image of the inner wall of an ancient underground crypt in that same illustrated style, but pushed toward realism: believable stone volume, subtle surface texture, small chips and hairline cracks, soft painterly shading instead of flat cel shading, thin dark outlines kept very subtle.

Color and light: very dark and low-key. Stones in deep charcoal, umber and cold slate grey; mortar gaps almost black; moss in deep forest and olive greens with only a few small muted lime specks; ivy vines trailing down from the joints, denser near the bottom corners and the left and right edges. No bright highlights, no white or pale stones; the lightest value in the image should be a dim warm grey. Dark vignette toward all four corners, as if lit faintly from off-frame.

Composition: flat frontal view of the wall, no floor or ceiling. The central area is calmer, with less moss and less contrast, because interface panels will cover it. Absolutely no torches, flames, candles or any visible light source, no doors, no windows, no people, no skulls, no text, no symbols, no logos, no watermark. 16:9, 2560x1440.
```

**Celular (`wall-mobile.webp`):**

```text
Use the attached image only as a style reference: a wall of large rounded, irregular stones with dark mortar gaps, moss and hanging ivy, drawn as a digital illustration. Create a new, original tall vertical image of the inner wall of an ancient underground crypt in that same illustrated style, pushed toward realism: believable stone volume, subtle texture, chips and hairline cracks, soft painterly shading, very subtle dark outlines.

Very dark, low-key palette: charcoal, umber and slate-grey stones, near-black mortar, deep green moss with only a few muted lime specks, ivy trailing down from the joints, heavier at the top and bottom edges. No bright highlights, no pale stones; dark vignette in the corners. The middle band is calmer and lower in contrast because interface panels will cover it. No torches, flames, candles or light sources, no doors, no people, no skulls, no text, no symbols, no watermark. Portrait 9:19.5, 1080x2340.
```

### Si la imagen sale mal

- **Muy clara:** «Make it much darker; corners almost black; remove pale highlights.»
- **Muy caricaturesca:** «Less cartoon: softer shading, real stone texture, thinner outlines.»
- **Aparecen antorchas o velas:** «Remove every torch, flame and light source; keep the same wall.»
- **Mucho detalle en el centro:** «Simplify the central third: fewer plants, lower contrast.»

### Convertir a WebP

1. Abre <https://squoosh.app>, arrastra la imagen y elige **WebP**, calidad 70–78, con el tamaño de la tabla.
2. Guárdala con el nombre exacto en `public/themes/crypt/` y despliega.

## Cyber: fuente de títulos

El texto usa **Chakra Petch** (libre, se instala con npm). Los títulos usan una fuente de exhibición que descargas tú: `public/fonts/cyber-display.woff2` (también acepta `.ttf` u `.otf` con ese nombre).

1. Busca una fuente de estilo cyberpunk (trazos cortados, inclinados y en punta), por ejemplo en DaFont buscando «cyberpunk».
2. **Revisa la licencia.** Muchas son gratis solo para uso personal; para una web pública necesitas una que permita uso comercial o web, o comprar la licencia.
3. Si viene en `.ttf` u `.otf`, puedes subirla tal cual o convertirla a `.woff2` (más liviana) en <https://cloudconvert.com/ttf-to-woff2>.
4. Guárdala como `public/fonts/cyber-display.woff2` y despliega.

Si la fuente no trae Ñ o tildes, el navegador dibuja solo esas letras con Chakra Petch. Sin el archivo, todos los títulos usan Chakra Petch.
