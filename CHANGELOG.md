# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado: [SemVer](https://semver.org/lang/es/).

## [Unreleased]

## [1.0.0] - 2026-11-07

Primera versión estable.

### Added

- **Salas con código de 4 letras** (`ABCD`): se crean al instante eligiendo visibilidad y modo, y cada sala se llama «CÓDIGO · anfitrión». Las privadas solo se abren con el código o el enlace corto `/s/CÓDIGO`. Jugar tiene un campo para entrar con código.
- **Parámetros en una ventana** dentro de la sala: el anfitrión cambia las reglas cuando quiera mientras la sala está en espera.
- **Temas** Normal, Medieval y Cyber, con colores, tipografía, fondo, animaciones y sonidos propios. Medieval: muro de cripta con moho y antorchas que titilan, botones de piedra que se hunden, ventanas que caen como losas y grietas al fallar. Cyber: visor de realidad virtual con suelo de rejilla que gira al cambiar de sección, cristal translúcido, hologramas e interferencias. En el celular, Cyber pide confirmar una advertencia de fotosensibilidad, mareo y batería.
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
