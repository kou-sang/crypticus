# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado: [SemVer](https://semver.org/lang/es/).

## [Unreleased]

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
