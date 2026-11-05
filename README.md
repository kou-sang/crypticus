# Crypticus

Plataforma web de competencias de cripticos en tiempo real: amigos, chat, rankings y varios modos de juego.

> **Variante B — Firebase + Cloudflare.** La variante A (Firebase + Vercel) vive en la rama `feat/initial-platform`.

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

1. Lobby en Firestore (crear, unirse, salir) — igual que la variante A.
2. El anfitrión llama `POST /api/competitions/start`: el Worker lee la sala por REST, inicializa el Durable Object y marca `live` en Firestore.
3. Cada cliente abre `wss://…/api/competitions/:id/ws`, se autentica con su ID token y juega: **respuestas y pistas se validan en memoria del DO** (sin base de datos en el camino crítico).
4. Al terminar (meta, ventaja de dos o alarma de tiempo), el DO escribe resultados, rating y estadísticas en Firestore y reintenta por alarma si falla.

## Modos y puntajes

- **Tipo**: `timed` (gana quien tenga más puntos al acabar el reloj) · `count` (carrera: primero en resolver N).
- **Puntaje**:
  - `standard` — 100 × multiplicador de dificultad (1.00–2.00).
  - `fewestHints` — base − 30 por pista (mínimo 10).
  - `speed` — base + bonus de hasta 100 decreciente con el tiempo.
  - `winByTwo` — duelo 1v1; 1 punto por criptico; termina cuando el líder alcanza el mínimo y saca **2 de ventaja**.
- **Desempate**: puntos → menos pistas → resolvió antes → se unió antes.
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

Ver la guía completa de despliegue en la descripción del PR. Resumen:

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
{ "clue": "Texto de la pista (5)", "answer": "respuesta", "difficulty": 1-5,
  "hints": ["pista 1", "pista 2"], "explanation": "opcional", "enumeration": "opcional, se deriva" }
```

## Límites del plan gratuito (importante)

- **Firestore Spark**: 50 000 lecturas/día y 20 000 escrituras/día. En esta variante el marcador en vivo **no** consume Firestore; solo lobby, chat, perfiles y resultados finales.
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
