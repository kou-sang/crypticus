# Despliegue de Crypticus — Variante A (Vercel) y Variante B (Cloudflare)

Ambas variantes pueden usar **el mismo proyecto de Firebase**: comparten usuarios, amigos, chat y rankings, y también la cuota diaria de Firestore. Las competencias no son intercambiables: una sala creada en A se juega en A.

Requisitos: Node 22+, git, una cuenta de Google (Firebase), una de Vercel (A) y una de Cloudflare (B).

---

## 0. Firebase (una sola vez, común a A y B)

1. **Crear proyecto**: <https://console.firebase.google.com> → *Agregar proyecto* (Analytics opcional).
2. **Auth**: *Compilación → Authentication → Comenzar* → habilita **Correo/contraseña** y **Google**.
3. **Firestore**: *Compilación → Firestore Database → Crear base de datos* → **modo producción** → ubicación cercana a tus jugadores. **No se puede cambiar después.** Anota la región; la usarás en A.
4. **App web**: *Configuración del proyecto → General → Tus apps → `</>`* → registra la app → copia `apiKey`, `authDomain`, `projectId`, `appId`.
5. **Cuenta de servicio**: *Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada* → descarga el JSON. Conviértelo a una línea en base64:
   ```bash
   base64 -w0 clave.json        # Linux
   base64 -i clave.json         # macOS
   ```
   Guarda el JSON fuera del repo y **nunca** lo subas.
6. **Clona el repo** (si no lo tienes):
   ```bash
   git clone https://github.com/kou-sang/crypticus.git && cd crypticus
   ```
7. **Reglas e índices** (desde cualquiera de las dos ramas, son idénticas):
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <TU_PROJECT_ID>
   ```
   Los índices tardan unos minutos en construirse (*Firestore → Índices*).
8. **Lista de cripticos**: crea `data/cryptics.json` con el formato de `data/cryptics.example.json`. El archivo está en `.gitignore`.

---

## A. Deploy con Vercel (rama `feat/initial-platform`)

1. **Rama y dependencias**
   ```bash
   git checkout feat/initial-platform && npm install
   ```
2. **Variables locales**: crea `.env.local`:
   ```bash
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=<id>.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=<id>
   VITE_FIREBASE_APP_ID=...
   FIREBASE_SERVICE_ACCOUNT=<base64 del paso 0.5>
   ```
3. **Importar cripticos** (públicos en `cryptics`, respuestas y pistas en `crypticSecrets`):
   ```bash
   npx tsx --env-file=.env.local scripts/import-cryptics.ts data/cryptics.json --dry-run
   npx tsx --env-file=.env.local scripts/import-cryptics.ts data/cryptics.json
   ```
4. **Región de las funciones** (clave para la latencia): en `vercel.json` agrega `"regions"` con la región de Vercel más cercana a tu Firestore y haz commit:

   | Firestore | Vercel |
   | --- | --- |
   | `southamerica-east1` | `gru1` |
   | `nam5` / `us-east1` / `us-east4` | `iad1` |
   | `us-central1` | `cle1` |
   | `eur3` / `europe-west1` | `cdg1` o `fra1` |

   ```json
   "regions": ["gru1"],
   ```
5. **Crear el proyecto en Vercel**: <https://vercel.com/new> → *Import* `kou-sang/crypticus`. Vite y `vercel.json` se detectan solos.
   - En **Environment Variables** agrega las 5 variables del paso 2.
   - Pulsa **Deploy**. El primer deploy usa `main`, que aún no tiene la app y puede fallar; es normal.
6. **Rama de producción**: *Settings → Environments → Production → Branch Tracking* → `feat/initial-platform` → *Deployments → Redeploy*. Alternativa: haz merge del PR #1 a `main`.
7. **Dominio autorizado**: Firebase → *Authentication → Configuración → Dominios autorizados* → agrega `<proyecto>.vercel.app`.
8. **Probar**: abre la URL, crea cuenta y una sala, iníciala y responde un criptico.

---

## B. Deploy con Cloudflare (rama `feat/cloudflare-durable-objects`)

1. **Rama y dependencias**
   ```bash
   git checkout feat/cloudflare-durable-objects && npm install
   ```
2. **Id del proyecto**: en `wrangler.jsonc` reemplaza `REPLACE_WITH_FIREBASE_PROJECT_ID` por tu `projectId`.
3. **Clave HMAC** (guárdala en un gestor de contraseñas; si la pierdes, debes reimportar):
   ```bash
   openssl rand -hex 32
   ```
4. **Variables locales**: crea `.env.local` con las 4 `VITE_*`, `FIREBASE_SERVICE_ACCOUNT` y `ANSWER_HMAC_KEY=<clave del paso 3>`.
5. **Importar cripticos** (públicos en Firestore; hashes y pistas en `worker/generated/cryptic-secrets.json`, fuera de git):
   ```bash
   npx tsx --env-file=.env.local scripts/import-cryptics.ts data/cryptics.json --dry-run
   npx tsx --env-file=.env.local scripts/import-cryptics.ts data/cryptics.json
   ```
6. **Login en Cloudflare**
   ```bash
   npx wrangler login
   ```
7. **Desplegar** (build de Vite + Worker + Durable Object):
   ```bash
   npm run deploy
   ```
   Al terminar muestra la URL `https://crypticus.<tu-subdominio>.workers.dev`.
8. **Secrets del Worker** (pega el base64 y la clave HMAC cuando los pida):
   ```bash
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
   npx wrangler secret put ANSWER_HMAC_KEY
   ```
9. **Dominio autorizado**: Firebase → *Authentication → Configuración → Dominios autorizados* → agrega `crypticus.<tu-subdominio>.workers.dev`.
10. **Probar** y ver logs en vivo:
    ```bash
    npx wrangler tail
    ```

> **Importante (B):** despliega siempre desde tu máquina con `npm run deploy`. Los hashes viajan dentro del bundle y no están en git, así que la integración Git de Cloudflare compilaría sin cripticos. **Cada vez que importes cripticos nuevos, vuelve a ejecutar `npm run deploy`.**

### Desarrollo local de B

```bash
printf 'FIREBASE_SERVICE_ACCOUNT=<base64>\nANSWER_HMAC_KEY=<clave>\n' > .dev.vars
npm run dev:worker     # http://localhost:8787
```

---

## Cómo comparar A vs B

1. Abre cada URL con DevTools → **Network**.
2. **A**: filtra `answer` y mira el *Timing* de `POST /api/competitions/answer`.
3. **B**: filtra `WS` → abre `/ws` → pestaña **Messages**. La diferencia entre el `answer` enviado y el `reply` recibido es la latencia de validación.
4. Mide unas 20 respuestas por variante, desde la misma red, y compara mediana y p95. Haz la primera respuesta de A tras unos minutos de inactividad para ver el arranque en frío.

## Problemas frecuentes

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `auth/unauthorized-domain` | Dominio no autorizado | Paso 0 → dominios autorizados |
| Error de índice en consola | Índices aún construyéndose | Esperar o revisar *Firestore → Índices* |
| A: `500` en `/api/*` | `FIREBASE_SERVICE_ACCOUNT` mal pegado | Reexportar en base64 sin saltos de línea |
| B: `missing_cryptic` | Worker desplegado sin secretos | Importar y luego `npm run deploy` |
| B: siempre "No es correcto" | `ANSWER_HMAC_KEY` distinta entre import y Worker | Usar la misma clave y reimportar + redeploy |
| B: `invalid_token` | `FIREBASE_PROJECT_ID` incorrecto en `wrangler.jsonc` | Corregir y redeploy |
