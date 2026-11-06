# Crypticus

Plataforma web de competencias de cripticos en tiempo real: amigos, chat, rankings y varios modos de juego.


## Stack

| Capa | Tecnología |
| --- | --- |
| UI | React 19 + React Router 7 + Tailwind CSS 4 (Vite 7, SPA con rutas *lazy*) |
| Auth | Firebase Auth (email/contraseña y Google) |
| Datos y tiempo real | Cloud Firestore (`onSnapshot`, caché persistente en IndexedDB) |
| Juego en vivo | Cloudflare Durable Object por competencia (`worker/competitionRoom.ts`), WebSocket con hibernación |
| Hosting + API | Cloudflare Workers con Static Assets (`worker/index.ts`) |
| Respuestas | HMAC-SHA256 empaquetadas con el Worker (`worker/generated/`, fuera de git) |
| Dominio compartido | `shared/` — funciones puras (puntaje, ranking, fin de partida, Elo) usadas por cliente y servidor |

### Flujo de una partida

1. Lobby en Firestore (crear, unirse, salir).
2. El anfitrión llama `POST /api/competitions/start`: el Worker lee la sala por REST, inicializa el Durable Object y marca `live` en Firestore.
3. Cada cliente abre `wss://…/api/competitions/:id/ws`, se autentica con su ID token y juega: **respuestas y pistas se validan en memoria del DO** (sin base de datos en el camino crítico).
4. Al terminar (meta, ventaja de dos o alarma de tiempo), el DO escribe resultados, rating y estadísticas en Firestore y reintenta por alarma si falla.

## Modos y reglas

Se configuran antes de empezar (ver `CreateCompetitionPage`):

- **Modo**: `timed` (más puntos al acabar el reloj) · `count` (primero en N cripticos o rondas) · `boss` (cooperativo contra un jefe).
- **Flujo**: `free` (cada uno a su ritmo por la lista) · `rounds` (todos el mismo criptico; el primero en acertar se lo lleva).
- **Puntaje** (competitivo): `standard` · `fewestHints` · `speed`. Base = 100 × dificultad (fácil 1 · medio 1,5 · difícil 2).
- **Remontada**: × (1 + k · peso · (líder − tú) / líder). Peso: fácil 0, medio 0,5, difícil 1; k: suave 0,5, fuerte 1.
- **Modificadores**: diferencia de dos (ventaja de 2 resueltos, con prórroga del 50 %), votar dificultad (rondas; en empate decide quien va último), cuenta atrás tras acierto (rondas; efecto desmayo), tiempo extra por unanimidad, penalización por error, mezcla de dificultades y marcador oculto.
- **Jefe**: vida = 350 / 500 / 700 por jugador. Daño = 100 × dificultad × tiempo restante en proporción (mínimo 10 %). Fallar cura 15 / 25 / 40. No cambia el rating.
- **Rating**: Elo multijugador por pares (K = 32 / (n − 1)).

## Estructura

```
worker/              Worker (HTTP + assets), Durable Object, auth JWT, cliente REST de Firestore
shared/              Dominio puro + protocolo WS + HMAC + tests
src/
  features/          landing, auth, dashboard, competitions, play, friends, chat, rankings, profile
  components/        UI base, layout, guardas de ruta
  hooks/             auth, suscripciones Firestore, amigos, reloj
  lib/               firebase, cliente API, repositorio de datos
scripts/             import-cryptics.ts
firestore.rules      Seguridad: el cliente nunca escribe puntajes
```

## Puesta en marcha

Guía completa en [`docs/DEPLOY.md`](docs/DEPLOY.md). Resumen:

```bash
npm install
cp .env.example .env.local                      # credenciales web de Firebase
printf 'FIREBASE_SERVICE_ACCOUNT=...\nANSWER_HMAC_KEY=...\n' > .dev.vars
npm run import:cryptics -- data/cryptics.json   # Firestore + worker/generated/cryptic-secrets.json
npm run dev:worker                              # build + wrangler dev (http://localhost:8787)
npm run deploy                                  # build + wrangler deploy
```

> Cada vez que importes cripticos nuevos, **vuelve a desplegar** el Worker: los hashes viajan dentro del bundle.

### Formato de cripticos

```json
{ "clue": "Texto de la pista (5)", "answer": "respuesta", "difficulty": "facil | medio | dificil",
  "hints": ["pista 1", "pista 2"], "explanation": "opcional", "enumeration": "opcional, se deriva" }
```

## Límites del plan gratuito (importante)

- **Firestore Spark**: 50 000 lecturas/día y 20 000 escrituras/día. El juego en vivo **no** consume Firestore; solo lobby, chat, perfiles y resultados finales.
- **Workers Free**: 100 000 peticiones/día a `/api/*` (los assets estáticos son gratis e ilimitados). Durable Objects tiene cuotas propias en el plan Free; revisa el panel de Cloudflare si el volumen crece.

## Scripts

| Comando | Acción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run typecheck` | TypeScript estricto |
| `npm test` | Tests de dominio (Vitest) |
| `npm run build` | Build de producción |
| `npm run dev:worker` | Build + Worker local con Durable Objects |
| `npm run deploy` | Build + despliegue a Cloudflare |

## Versionado

[SemVer](https://semver.org/lang/es/) + [Conventional Commits](https://www.conventionalcommits.org/es/). Cambios en [CHANGELOG.md](CHANGELOG.md).
