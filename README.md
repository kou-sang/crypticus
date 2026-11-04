# Crypticus

Plataforma web de competencias de cripticos en tiempo real: amigos, chat, rankings y varios modos de juego.

## Stack

| Capa | Tecnología |
| --- | --- |
| UI | React 19 + React Router 7 + Tailwind CSS 4 (Vite 7, SPA con rutas *lazy*) |
| Auth | Firebase Auth (email/contraseña y Google) |
| Datos y tiempo real | Cloud Firestore (`onSnapshot`, caché persistente en IndexedDB) |
| Lógica autoritativa | Vercel Functions (`api/`) con Firebase Admin SDK |
| Dominio compartido | `shared/` — funciones puras (puntaje, ranking, fin de partida, Elo) usadas por cliente y servidor |

> Firebase Spark (gratis) **no permite Cloud Functions**; por eso la validación de respuestas vive en Vercel Functions.

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
api/                 Vercel Functions (start, answer, hint, finalize)
shared/              Dominio puro + tests
src/
  features/          landing, auth, dashboard, competitions, play, friends, chat, rankings, profile
  components/        UI base, layout, guardas de ruta
  hooks/             auth, suscripciones Firestore, amigos, reloj
  lib/               firebase, cliente API, repositorio de datos
scripts/             import-cryptics.ts
firestore.rules      Seguridad: el cliente nunca escribe puntajes
```

## Puesta en marcha

1. **Firebase**: crea un proyecto, activa Auth (Email + Google) y Firestore. Genera una cuenta de servicio (Configuración → Cuentas de servicio → Generar clave).
2. **Variables**: copia `.env.example` a `.env.local` y completa los valores.
3. **Instalar y correr**:
   ```bash
   npm install
   npm run dev          # http://localhost:5173 (las /api requieren `vercel dev`)
   npx vercel dev       # front + funciones en local
   ```
4. **Reglas e índices**: `npx firebase-tools deploy --only firestore:rules,firestore:indexes`
5. **Cargar cripticos**: crea `data/cryptics.json` con el formato de `data/cryptics.example.json` y ejecuta:
   ```bash
   npm run import:cryptics -- data/cryptics.json --dry-run   # valida
   npm run import:cryptics -- data/cryptics.json             # escribe
   ```
   Los ids son deterministas: reimportar actualiza en vez de duplicar. Las respuestas y pistas van a `crypticSecrets` (inaccesible al cliente).
6. **Deploy**: importa el repo en Vercel y define las mismas variables (`FIREBASE_SERVICE_ACCOUNT` solo en servidor).

### Formato de cripticos

```json
{ "clue": "Texto de la pista (5)", "answer": "respuesta", "difficulty": 1-5,
  "hints": ["pista 1", "pista 2"], "explanation": "opcional", "enumeration": "opcional, se deriva" }
```

## Límites del plan gratuito (importante)

Firestore Spark: **50 000 lecturas/día y 20 000 escrituras/día**. Cada actualización de un documento escuchado cuesta una lectura **por cliente suscrito**. Una partida de 10 jugadores × 20 cripticos genera ~2 000–3 000 lecturas (marcador + chat). Mitigaciones ya aplicadas: caché persistente, rankings sin `onSnapshot`, chat limitado a 50 mensajes, perfiles cacheados en memoria.

## Scripts

| Comando | Acción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run typecheck` | TypeScript estricto |
| `npm test` | Tests de dominio (Vitest) |
| `npm run build` | Build de producción |

## Versionado

[SemVer](https://semver.org/lang/es/) + [Conventional Commits](https://www.conventionalcommits.org/es/). Cambios en [CHANGELOG.md](CHANGELOG.md).
