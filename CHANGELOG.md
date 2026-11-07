# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado: [SemVer](https://semver.org/lang/es/).

## [Unreleased]

## [1.2.0] - 2026-11-07

### Added

- **Perfil al estilo Lichess:** el modo se elige en una columna a la izquierda (en el celular, una fila deslizable arriba) y a la derecha se ve su panel. El modo queda en la URL (`?modo=royale_bullet`) para compartir el enlace.
- **Royale con un Elo por tiempo:** Hyperbullet (≤ 1 min), Bullet (≤ 2 min) y Rapid (> 2 min), según los minutos iniciales. También en el Ranking, con una fila de categorías bajo Royale. Cada categoría arranca desde el Elo de Royale anterior.
- **Novedades en Inicio:** cuadro con los cambios importantes, a la derecha en PC y debajo del criptico de ejemplo en el celular (`src/features/dashboard/updates.ts`).
- `scripts/backfill-royale-pools.ts`: migración única que clasifica las partidas de Royale anteriores y rehace las estadísticas de cada categoría.

### Changed

- La evolución del Elo es diaria: un punto por día con el Elo al cierre, y el detalle de partidas y resultados de ese día al pasar el puntero.
- El botón del historial es compacto y centrado («Historial (N)»), con el borde ajustado al texto.
- Resumen de la partida: cada criptico muestra «✓ A, B, C» (lo resolvieron) y «✗ D, E» (no lo resolvieron).
- El historial guarda el pool de Elo (`ratingPool`) y, en Royale, el control de tiempo.

### Fixed

- Contraste en Cripta y Cyber:
  - Cripta: textos secundarios, enlaces y aciertos sobre el pergamino (muted, accent y ok) más oscuros, con contraste AA (≥ 4,5:1).
  - Botones de peligro (Cerrar sesión, Abandonar, Terminar…): en Cripta, cuero rojo con letra clara; en Cyber, al pasar el puntero ya no quedan con letra casi negra sobre fondo negro.
  - Botones deshabilitados legibles: sin opacidad que los funda con el fondo (hueco punteado en Cripta, gris apagado en Cyber).
  - Textos secundarios dentro de una opción elegida heredan la letra clara (Cripta) u oscura (Cyber), en lugar del color pensado para el fondo.
  - Cyber: los rótulos con fuente de título dentro de un botón toman el color del botón.
- Repaso de la partida: cada criptico muestra «Lo resolvieron: …» y «No lo resolvieron: …» con todos los jugadores (tú como «Tú»), en lugar de «Lo resolviste · también …».

## [1.1.4] - 2026-11-07

### Fixed

- Cripta: con una ventana abierta (p. ej. Crear sala), pasar el mouse cerca de su borde hacía parpadear todo el fondo. El fondo oscuro de las ventanas es un botón a pantalla completa y recibía el brillo de antorcha del hover; ahora queda excluido.

## [1.1.3] - 2026-11-07

### Changed

- Cyber: la fuente de rotulación cyberpunk queda desactivada; los títulos usan Chakra Petch en negrita, con el mismo amarillo neón y eco cian. El archivo `public/fonts/cyber-display.ttf` se conserva para reactivarla (instrucciones en `src/themes/cyber.css`).

## [1.1.2] - 2026-11-07

### Fixed

- Cyber: la fuente de rotulación nunca dibuja tildes ni ñ (Á, é, ñ… se muestran como A, e, n), en cualquier texto que la use.
- Cyber: rotulación más legible y menos tenebrosa, como la referencia: trazo engrosado, amarillo neón con eco cian sólido y fondo bordó → azul noche con viñeta más suave. Los enunciados de los cripticos ya no usan esa fuente (siempre legibles y con tildes).
- Cripta: Públicas/De amigos (Jugar), Global/Amigos y los modos (Ranking) y demás opciones sobre el pergamino ahora tienen borde y fondo propios; la elegida va en cuero oscuro.

## [1.1.1] - 2026-11-07

### Performance

- Cripta: la luz de las antorchas anima solo `transform` y `opacity` en capas propias, a 20 fps, sin `mix-blend-mode`, filtros variables ni variables CSS heredadas; el paralaje se suaviza en el mismo bucle. El pergamino usa una textura WebP de 4 KB en lugar de ruido SVG generado al pintar; se quitó el muro SVG de respaldo que se dibujaba debajo de la imagen. El muro, la antorcha y el pergamino se precargan desde el HTML y la escena aparece con un fundido cuando el muro ya está decodificado. Medido en Chrome: 27 → 57 fps en escritorio y 46 → 60 fps en celular con CPU ×4 más lenta, sin tareas largas.
- Cyber: el suelo de rejilla avanza con `transform` (antes repintaba toda la superficie en cada cuadro) y el cambio de pantalla ya no aplica desenfoque a toda la página.
- Sonido: la reverb de cada tema se genera en segundo plano y no dentro del primer clic.

### Fixed

- Cyber: la fuente de títulos tenía las letras muy separadas; se ajustó el archivo para que se toquen, como la rotulación de referencia. Los títulos van en amarillo neón con eco cian.

## [1.1.0] - 2026-11-07

### Added

- Cripta: antorchas de Gemini a los costados, con llama viva, chispas y luz que respira; ráfagas de viento al azar doblan las llamas, desplazan la luz y oscurecen la cripta.
- Cripta: el muro se desplaza al cambiar de sección y sigue levemente al puntero (paralaje).
- Cripta: el contenido, las ventanas, los ajustes y los avisos son pergaminos; las pantallas y ventanas se desenrollan al entrar y se enrollan al cerrar.
- Cripta: todos los elementos interactivos (botones, pestañas, opciones, campos y tarjetas) se iluminan al pasar el puntero, como si se les acercara una antorcha.
- Cyber: fuente de títulos incluida (`public/fonts/cyber-display.ttf`).

### Fixed

- Relojes con sonido y animación: el reloj de partida late cada segundo en los últimos 30 s, avisa al quedar 1 minuto y 30 segundos y hace tic en los últimos 10; la cuenta 3-2-1 suena en cada número, entra con un anillo que se expande y cierra con un sonido de arranque propio de cada tema.
- iPhone/iPad: el alta del perfil (nombre y @usuario) podía quedar colgada sin salir de la bienvenida. En iOS Firestore usa caché en memoria y long polling; el alta tiene un límite de 15 s con un mensaje claro y tolera reintentos.
- Celular en partida: el teclado ya no se cierra al cambiar de criptico ni durante la pausa entre rondas (un único input de juego que nunca se desmonta), y tocar las celdas o los botones del juego no lo cierra. El criptico se centra encima del teclado.
- Celular en partida: se oculta la barra inferior (un toque accidental en «Inicio» sacaba del juego); los enlaces de la barra superior piden confirmación y cerrar o recargar la pestaña avisa antes.

### Changed

- En rondas (Race Hardcore, Duel) la solución anterior solo se muestra en la pausa entre rondas; ya no queda al costado del criptico nuevo.
- Fondos de Cripta nuevos (rocas más chicas) y antorchas recortadas del croma verde (`torch-1/2/3.webp`; se usa la 1).
- El tema Medieval pasa a llamarse **Cripta**. Quien lo tenía elegido lo conserva; sus recursos pasan a `public/themes/crypt/`.

## [1.0.1] - 2026-11-07

### Changed

- Medieval: el muro de respaldo es una ilustración oscura de piedras redondeadas con moho y enredaderas, en línea con la referencia visual. Prompts de Gemini actualizados.
- Cyber: el texto usa Chakra Petch y los títulos admiten una fuente de exhibición propia (`public/fonts/cyber-display.woff2`).

## [1.0.0] - 2026-11-07

Primera versión estable.

### Added

- **Salas con código de 4 letras** (`ABCD`): se crean al instante eligiendo visibilidad y modo, y cada sala se llama «CÓDIGO · anfitrión». Las privadas solo se abren con el código o el enlace corto `/s/CÓDIGO`. Jugar tiene un campo para entrar con código.
- **Parámetros en una ventana** dentro de la sala: el anfitrión cambia las reglas cuando quiera mientras la sala está en espera.
- **Temas** Normal, Medieval y Cyber, con colores, tipografía, fondo, animaciones y sonidos propios. Medieval: muro de cripta ilustrado y oscuro, con moho y enredaderas y antorchas que titilan, botones de piedra que se hunden, ventanas que caen como losas y grietas al fallar. Cyber (texto en Chakra Petch y títulos con una fuente propia en `public/fonts/`): visor de realidad virtual con suelo de rejilla que gira al cambiar de sección, cristal translúcido, hologramas e interferencias. En el celular, Cyber pide confirmar una advertencia de fotosensibilidad, mareo y batería.
- **Motor de sonido por tema** (Web Audio, sin archivos): ruido filtrado, reverb y variación aleatoria en lugar de pitidos. Nuevos sonidos de interfaz para botones, pestañas, ventanas y tipeo, con interruptores propios en Ajustes.
- **Transiciones** entre pantallas, ventanas con animación de entrada y salida, destello en la pista cuando un rival suma en Race.

### Changed

- **Selección de cripticos**: sigue siendo aleatoria, pero nunca pone dos seguidos del mismo tipo (anagrama, doble definición…) si hay alternativa, en todos los modos. Requiere reimportar con `--secrets-only` para que el Worker conozca el tipo.
- Ajustes más compactos: dos columnas en PC y los sonidos como interruptores en cuadrícula.
- Los desafíos desde Amigos y Perfil usan la creación rápida (sala privada con invitación).

### Notas

- Las versiones 0.3 a 0.12 no se registraron en este archivo; su detalle está en los PR #1–#17.

## [0.2.0] - 2026-11-05

### Added

- Motor de juego compartido (`shared/engine.ts`) ejecutado por un Durable Object por competencia.
- Modo **Jefe** cooperativo con tres jefes ilustrados, barra de vida, daño proporcional al tiempo restante y curación al fallar.
- Flujo **por rondas** (criptico compartido) con **votación de dificultad** del siguiente; en empate decide quien va perdiendo.
- **Cuenta atrás tras acierto** configurable, con efecto de desmayo (viñeta oscura progresiva).
- **Tiempo extra** por unanimidad (segundos y usos configurables) y **pasar ronda** por unanimidad.
- **Remontada**: bonus proporcional a la distancia con el líder para cripticos medios y difíciles.
- Dificultades fácil / medio / difícil, mezcla configurable (equilibrada, fácil, difícil, progresiva), penalización por error y marcador oculto.
- Animaciones y sonidos de acierto (Web Audio, sin archivos), notificaciones laterales cuando un rival acierta.
- Aviso de partida mixta móvil/PC.
- Historial de partidas y evolución del rating por jugador, posición global en ranking y top 5 en el panel.
- Botones de perfil y configuración; página de ajustes (nombre, sonido, volumen, tema, animaciones).

### Changed

- "Diferencia de dos" pasa a ser un modificador (ventaja de 2 cripticos, con prórroga) en lugar de un criterio de puntaje.
- Las respuestas se guardan como HMAC-SHA256 empaquetadas con el Worker; ya no se guardan en Firestore.
- Hosting en Cloudflare Workers Static Assets. Se eliminan las Vercel Functions.

## [0.1.0] - 2026-11-04

### Added

- Landing pública, registro/login (email y Google) y onboarding con @usuario único.
- Competencias por tiempo y por cantidad; puntajes Clásico, Menos pistas, Velocidad y Diferencia de dos.
- Sala con lobby, cuenta regresiva, juego en vivo, pistas, marcador en tiempo real y resultados.
- Validación de respuestas y puntaje en servidor (Vercel Functions + Admin SDK).
- Amigos (solicitudes, aceptar, eliminar), chat global, directo y por sala.
- Rankings global y de amigos con rating Elo multijugador.
- Reglas de Firestore, índices, script de importación de cripticos y CI.
