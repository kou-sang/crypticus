# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado: [SemVer](https://semver.org/lang/es/).

## [Unreleased]

## [1.8.0] - 2026-11-10

### Changed

- Race Hardcore, votación de dificultad: ya no se vota durante el criptico. Cuando todos terminan (o cierra la cuenta atrás) se abre una votación de 7 s (`DIFFICULTY_VOTE_MS`) mientras se muestra la solución anterior; al cerrar se sortea el criptico de la dificultad ganadora y abre en el acto. Reemplaza la pausa entre rondas (se usa la mayor de las dos).
- Sala: los avisos de la partida («Nueva ronda: medio», «X quitó N de vida», aciertos, eliminaciones, prórroga…) van dentro del chat de sala, intercalados por hora y en gris, en vez de una lista aparte. Durante la partida los espectadores ven el chat en solo lectura.
- Gana siempre la mayoría. En empate se sortea entre las más votadas (antes decidía el voto de quien iba perdiendo). Sin votos: medio.

### Fixed

- Al resolver un criptico (sobre todo en Royale, que pasa al siguiente sin pausa) la página bajaba sola: cada grilla nueva se centraba en pantalla. Ahora solo se desplaza si las casillas no se ven enteras (por ejemplo, tapadas por el teclado del celular).
- Chat de sala: alto fijo con barra de desplazamiento siempre visible (antes empezaba con el alto de un renglón y crecía con los mensajes).

## [1.7.0] - 2026-11-10

### Added

- COOP: chat de sala desplegable al costado durante la selección, la carga y la partida (botón «Chat»), con aviso de mensajes nuevos. Es el mismo chat de la sala.
- COOP: efectos de estado en la información del jugador (arena, panel propio y detalle): quemadura, veneno, inhibición, soldado, resguardo de Enoch, armadura, furia, ataque, oro, fuerza, sacrificio, pila de Samson y bendición de Urias, con su duración restante (`shared/coop/effects.ts`).
- COOP: el registro muestra cada golpe (jugador → jefe o REX, jefe → jugador, con crítico, evasión, soldado y Túnica de José) y el daño directo con su causa. Los números flotantes de daño directo llevan la causa («−7 quemadura», «−1 veneno»).

- COOP: el jefe muestra sus efectos en la tarjeta (daño extra, plagas en curso, la próxima plaga y a qué % de vida; armadura y curación de GOLIATH). Clic en el jefe: detalle con habilidades y, en PHARAONIS, la lista de las 7 plagas con su estado.
- COOP: aviso grande cuando PHARAONIS activa una plaga, con qué hace (6 s en pantalla).

### Changed

- COOP, ronda normal: cada criptico resuelto es un golpe al jefe en el momento (antes, un solo golpe al resolver los 2). El daño de los jugadores por ronda se duplica; la vida de los jefes no cambia.
- COOP: el oro es 15 + número de la ronda en curso **por cada criptico resuelto**, en el momento (antes, 15 + ronda por ronda normal ganada, al cerrarla). Vale también en la ronda difícil y aunque no se complete la ronda; solo cobran los vivos.
- COOP, ronda difícil (grupal): cripticos medios o difíciles hasta la ronda 10; desde la 11, difíciles o muy difíciles (`HARD_ROUND_TIER_TABLE`).
- COOP, piojos de PHARAONIS: 10 manchas por golpe (antes 3), translúcidas (14–24 %) y con tamaño, proporción, giro y contorno distintos; donde se superponen se oscurecen. Usan el color de tinta del tema (se ven también en temas oscuros). Hasta 60 a la vez.
- COOP: el registro muestra lo más reciente arriba (antes quedaba oculto bajo el desborde) y guarda 12 líneas.
- Las grillas de respuesta ya no le quitan el foco a otro campo de texto (por ejemplo, el chat) al aparecer un criptico nuevo.

### Fixed

- COOP: DEBBORA no podía usar su activa: empezaba con 0 cargas y solo recargaba en la tienda, que casi nunca abre. Ahora empieza con 1 (máximo 2). El botón dice «Sin cargas» cuando no le quedan.
- COOP: una curación (o la regeneración de GOLIATH) volvía a reproducir la sacudida de daño en la tarjeta del jugador o del jefe, y parecía daño sin causa.

## [1.6.0] - 2026-11-10

### Changed

- COOP, ronda normal: cada jugador golpea al jefe en el momento en que resuelve sus cripticos (antes, todos al cerrar la ronda). Si el golpe derriba al jefe, la ronda termina ahí y nadie más recibe daño. El oro llega al cerrar la ronda. La ronda difícil no cambia.
- Perfil → COOP: el historial muestra Nivel (AT1–AT3), Resultado, Ronda, Jefes derrotados y Rating, en vez de Puesto y Resueltos. Las entradas nuevas guardan `coop.rounds` y `coop.bosses`; las anteriores muestran «—» en Ronda.

## [1.5.0] - 2026-11-10

### Added

- COOP: dificultad AT1, AT2 y AT3 al crear la sala. AT2 es la dificultad anterior. AT1 resta 1/3 a la vida y al daño base de los jefes, y AT3 los suma (`STAGE_FACTOR` en `balance.ts`).
- Elo COOP: el rating del nivel depende de la dificultad (AT1 1350, AT2 1500, AT3 1650).
- Simulador: `--stage 1|2|3`.

### Compatibilidad

- Salas, partidas y resultados sin dificultad cuentan como AT2.

## [1.4.1] - 2026-11-10

### Changed

- COOP: los cripticos se reparten por jugador. Cada uno recibe primero los que **él** nunca vio, según su propio historial (lo que vieron sus aliados no cuenta). En una misma ronda se evita repetir entre aliados si hay alternativa.
- COOP: el servidor solo envía el criptico en pantalla; el siguiente de la ronda viaja oculto hasta resolver el anterior.

### Fixed

- COOP: al terminar se mostraban los cripticos de todos, incluso los que nadie llegó a ver. Ahora «Tus cripticos» muestra solo los que vio cada jugador, con su propio ✓/✗, y solo esos cuentan como vistos para no repetírselos.

## [1.4.0] - 2026-11-10

### Added

- COOP: rendición por votación. «Rendirse» abre una votación de 30 s; solo pasa con el sí de todos los que siguen en la partida (un «no» no la cierra). Termina en derrota.
- COOP: pantalla completa automática al empezar (o con el primer clic si el navegador lo exige) y botón para volver a ella.

### Changed

- COOP: durante la partida no hay figuras (solo en la selección). Jefe y jugadores son tarjetas con nombre, vida y estados con nombre («Quemado ×N», «Soldado», «Inhibido») en vez de emojis.
- COOP: textos y tamaños reajustados para que entren en sus cajas; números de vida legibles sobre la barra.

### Fixed

- COOP: la partida se veía vacía o recortada (los demás jugadores no veían nada). La pantalla se montaba dentro de la página animada, que recortaba lo `fixed`; ahora va en un portal sobre `<body>`.
- COOP: en la carga, el texto largo empujaba el botón y cortaba la parte de arriba; ahora solo se desplaza el contenido de la pestaña.

## [1.3.0] - 2026-11-10

### Added

- **Modo COOP** (nivel AT; NT «Pronto»): de 4 a 8 jugadores contra 4 jefes en 22 minutos, solo en PC o laptop.
  - Motor determinista en `shared/coop` (rondas normales y difíciles, tienda, votaciones, 7 jefes, 11 personajes y 16 objetos).
  - Al iniciar, ventana de selección de personajes (60 s, sin repetir; quien no elige recibe uno libre) y luego pantalla de carga con las tarjetas de la party, la explicación salteable, los jefes y los personajes.
  - Pantalla completa según los bocetos: arena con el jefe al centro y los jugadores alrededor, zona de cripticos, panel propio con objetos y habilidades, y ventana de tienda.
  - Siluetas propias de jefes, personajes y objetos; números de daño y curación proporcionales; avisos de muerte y resurrección; sonidos nuevos por tema (oro, habilidad, resurrección).
  - Elo COOP contra el rating del nivel (AT 1500), con su panel en el Perfil y su pestaña en el Ranking.
  - Resultados propios: estadísticas por jugador (daño, recibido, curación, oro, cripticos, caídas, pistas, activas y Elo), totales del equipo, estado de cada jefe y soluciones de los cripticos jugados.
  - Simulador de balance: `npx tsx scripts/simulate-coop.ts`.

- Jugar: sección «Tus salas pendientes» con las salas abiertas en las que estás (también privadas y de amigos), hasta cancelarlas o que venzan.

### Removed

- Modo Jefe de la v0.2 (nunca habilitado): lo reemplaza COOP.

### Deploy

- Secretos con enunciado: `import-cryptics.ts --secrets-only` (ver DEPLOY 6.3).

## [1.2.2] - 2026-11-08

### Changed

- Revancha: al aceptar entras a la sala y el anfitrión inicia la partida (antes empezaba sola cuando aceptaban todos).
- Novedades en Inicio: solo las 3 últimas versiones destacadas y un botón «Mostrar todo» que abre el historial completo en lenguaje común (novedades y arreglos de cada versión, desde la 0.1). `updates.ts` pasa a `RELEASES` con `highlight`, `news` y `fixes`.

### Fixed

- Aviso «Hay una versión nueva» sin haber desplegado: ahora solo aparece si lo desplegado es más nuevo que lo que corre en el navegador, y muestra las versiones (`v1.2.1 → v1.2.2`).
- Salas fantasma en Amigos y en Jugar → Amigos:
  - Se ignoraba el orden: con `limit(30)`, Firestore devolvía 30 salas cualquiera (casi todas viejas) y la lista cambiaba sola. Ahora van las más recientes.
  - Se mostraba primero la caché local, con salas ya borradas o empezadas como «en espera», hasta que llegaba la respuesta del servidor. Ahora se espera al servidor.
  - Las salas abandonadas (en espera más de 6 h, o «en vivo» más de 3 h) ya no aparecen.
- Requiere dos índices nuevos en Firestore (paso 2 del deploy).

## [1.2.1] - 2026-11-08

### Fixed

- Alta trabada en «Firma tu primera partida» (Brave y Safari en iPhone, Firefox en PC): tras «Continuar» volvía a la misma pantalla.
  - «Sin perfil» ahora solo se decide con respuesta del servidor; la caché vacía o un listener caído ya no mandan al alta.
  - El listener del perfil se reconecta solo si falla (antes, un error lo dejaba muerto hasta recargar) y, si no confirma en 8 s, se consulta una vez al servidor.
  - El perfil recién creado se usa al instante, sin esperar al listener.
  - El alta es idempotente: si el perfil ya existía, se devuelve en vez de reescribirlo (las reglas lo rechazaban).
  - Si el servidor no responde, se muestra «No pudimos cargar tu perfil» con el código de error y un botón para reintentar, en lugar del alta.

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
- Ranking más compacto: ancho acotado, controles (modo, tiempo de Royale y Global/Amigos) en una sola franja, tu posición junto al título, filas de una línea y el enlace al perfil del tamaño del nombre (la celda vacía ya no es clicable).

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
