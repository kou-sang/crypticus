# Crypticus — Instructivo de deploy (Firebase + Cloudflare)

Guía para **Windows + PowerShell**, con los datos del proyecto Firebase `crypticus-eh`. Los pasos 0 y 1 se hacen una sola vez.

> **Cambio respecto a la guía anterior:** la variante A (Vercel) se descartó. Este instructivo cubre solo la variante B (Cloudflare Workers + Durable Objects).

**Estado de tu proyecto:**

| Paso | Estado |
| --- | --- |
| Proyecto Firebase `crypticus-eh` | ✅ |
| Auth: correo/contraseña y Google | ✅ |
| Firestore en modo producción (*West1*) | ✅ |
| App web registrada | ✅ |
| Clave de servicio en base64 | ⚠️ Regenerar `encoded.txt` (paso 1.3) |

> **Sobre la región de Firestore:** en esta arquitectura la región no afecta la velocidad del juego. Las respuestas se validan en el Durable Object, cerca de los jugadores, y Firestore solo interviene al crear, iniciar y terminar la partida.

---

## 0. Requisitos (una vez)

Primero comprueba si ya tienes Node y Git:

```powershell
node -v          # debe ser v20.6 o superior (v22 recomendado)
git --version
```

Si alguno no está instalado, elige **una** de estas opciones.

**Opción A — instaladores oficiales (sin winget):**

1. **Node.js:** descarga el instalador *LTS* para Windows (`.msi`) desde <https://nodejs.org/es/download> y ejecútalo con las opciones por defecto.
2. **Git:** descarga el instalador desde <https://git-scm.com/download/win> y ejecútalo con las opciones por defecto.

**Opción B — activar `winget`:** el error *"El término 'winget' no se reconoce"* significa que falta el **Instalador de aplicación** (*App Installer*) de Microsoft. Instálalo o actualízalo desde Microsoft Store, abre una nueva ventana de PowerShell y ejecuta:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

**Después de instalar, cierra y vuelve a abrir PowerShell** y repite `node -v` y `git --version`.

**Permitir `npx` en PowerShell:** si al usar `npx` o `npm` aparece *"la ejecución de scripts está deshabilitada en este sistema"*, ejecuta una vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

---

## 1. Preparar el repositorio

### 1.1 Clonar

Clona el repo **en una carpeta distinta** de donde tienes `clave.json`. Ejemplo:

```powershell
cd D:\EH\EH\Personal
git clone https://github.com/kou-sang/crypticus.git crypticus-app
cd crypticus-app
npm ci
```

> `package.json` ya declara en `allowScripts` los scripts de instalación que se necesitan (`esbuild`, `workerd`). Con npm ≥ 11.16 no hace falta aprobar nada a mano. Los avisos de `@firebase/util` y `protobufjs` se pueden ignorar.
>
> `clave.json` y `encoded.txt` están en `.gitignore` como protección extra, pero lo más seguro es mantenerlos **fuera** de la carpeta del repo. Nunca los compartas ni los subas.

### 1.2 Lista de cripticos

Copia el archivo `cryptics.seed.json` que te envié a la carpeta `data\` del repo:

```powershell
Copy-Item "$HOME\Downloads\cryptics.seed.json" .\data\
```

Son 1130 cripticos originales, verificados por script: 1030 para las partidas (422 fáciles, 392 medios, 216 difíciles) y 100 de desempate, con respuestas de 2 o 3 palabras (`"tiebreak": true`). Los de desempate solo aparecen en la muerte súbita, cuando Race, Royale o Duel terminan empatados en la cima; su dificultad suma un nivel por cada palabra extra. Cada uno lleva su tipo (palabra escondida, selector, anagrama, sustracción, reverso, contenedor, homófono, doble definición o combinación). La dificultad sigue el estándar del proyecto: una sola operación con una palabra común es fácil; varias operaciones o una palabra poco común es medio; si además hace falta conocimiento externo, es difícil. Está en `.gitignore` porque contiene las respuestas y el repo es público. Para añadir más, usa el mismo formato (ver `data/cryptics.example.json`).

Antes de importar, revisa el archivo (no toca Firestore):

```powershell
npx tsx scripts/validate-cryptics.ts data/cryptics.seed.json
```

Comprueba enumeraciones, dificultad, que cada criptico tenga explicación y que no se repitan respuestas ni enunciados (la Ñ cuenta como N, igual que al jugar).

### 1.3 Regenerar la clave en base64 (importante)

En Windows PowerShell, `>` guarda el archivo en UTF-16 y el base64 queda corrupto. Regenéralo en ASCII y sin salto de línea:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("D:\EH\EH\Personal\crypticus\clave.json")) |
  Set-Content -NoNewline -Encoding ascii "D:\EH\EH\Personal\crypticus\encoded.txt"
```

### 1.4 Generar la clave HMAC de respuestas

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$hmac = -join ($bytes | ForEach-Object { $_.ToString('x2') })
$hmac   # 64 caracteres hexadecimales: guárdala en tu gestor de contraseñas
```

Si pierdes esta clave, tendrás que reimportar los cripticos y volver a desplegar.

### 1.5 Crear `.env.local`

Desde la raíz del repo, en la **misma** ventana de PowerShell (usa `$hmac` del paso anterior):

```powershell
$sa = Get-Content -Raw "D:\EH\EH\Personal\crypticus\encoded.txt"
@"
VITE_FIREBASE_API_KEY=AIzaSyAuB1hI2x8qoslgeBdHumRo7yGURmDt5ns
VITE_FIREBASE_AUTH_DOMAIN=crypticus-eh.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=crypticus-eh
VITE_FIREBASE_APP_ID=1:354553835552:web:394079a752c87901074c45
FIREBASE_SERVICE_ACCOUNT=$sa
ANSWER_HMAC_KEY=$hmac
"@ | Set-Content -Encoding ascii .env.local
```

> Las variables `VITE_*` son la configuración web pública de Firebase: van al navegador y no son secretas. `FIREBASE_SERVICE_ACCOUNT` y `ANSWER_HMAC_KEY` **sí** son secretas: nunca llevan prefijo `VITE_` y no se envían al navegador.

`wrangler.jsonc` ya tiene `FIREBASE_PROJECT_ID = crypticus-eh`.

---

## 2. Firestore: reglas e índices

```powershell
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project crypticus-eh
```

Espera a que todos los índices estén **Habilitados** en *Firebase → Firestore → Índices* (unos minutos). Sin el índice `cryptics (tier, rand)` no se pueden crear partidas.

---

## 3. Importar los cripticos

```powershell
npx tsx --env-file=.env.local scripts/import-cryptics.ts data/cryptics.seed.json --dry-run
npx tsx --env-file=.env.local scripts/import-cryptics.ts data/cryptics.seed.json --replace
```

`--replace` deja el archivo como la lista completa: borra de Firestore y de los secretos los cripticos que ya no estén (por ejemplo, los de prueba). Sin esa opción, la importación solo agrega o actualiza.

Esto hace dos cosas:

- Publica en Firestore los datos visibles: enunciado, enumeración y dificultad.
- Genera `worker\generated\cryptic-secrets.json` con los hashes HMAC de las respuestas y las pistas. Ese archivo viaja dentro del Worker y nunca llega al navegador.

---

## 4. Desplegar en Cloudflare

### 4.1 Iniciar sesión y desplegar

```powershell
npx wrangler login
npm run deploy
```

Al terminar verás la URL: `https://crypticus.<tu-subdominio>.workers.dev`.

### 4.2 Secrets del Worker

Se pasan por tubería para evitar errores al pegar textos largos:

```powershell
Get-Content -Raw "D:\EH\EH\Personal\crypticus\encoded.txt" | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
$hmac | npx wrangler secret put ANSWER_HMAC_KEY
```

Si cerraste la ventana y perdiste `$hmac`, vuelve a asignarla con el valor guardado: `$hmac = "<tu clave>"`.

### 4.3 Autorizar el dominio en Firebase (necesario para Google)

*Firebase → Authentication → Configuración → Dominios autorizados → Agregar dominio* → `crypticus.<tu-subdominio>.workers.dev`

Sin este paso, el correo y la contraseña funcionan, pero **Google falla** con `auth/unauthorized-domain`. Revisa además que *Authentication → Método de acceso → Google* esté **Habilitado** y tenga un correo de asistencia.

### 4.4 Google en el mismo dominio (recomendado para móviles y Safari)

Safari, Brave y algunos navegadores móviles bloquean las cookies de terceros, y eso rompe el login de Google aunque el dominio esté autorizado. El Worker ya hace de proxy de `/__/auth/*`. Para activarlo:

1. *Google Cloud Console* (proyecto `crypticus-eh`) → *APIs y servicios → Credenciales* → abre **Web client (auto created by Google Service)**.
2. En *URI de redireccionamiento autorizados*, agrega `https://crypticus.<tu-subdominio>.workers.dev/__/auth/handler` y guarda.
3. En `.env.local`, agrega `VITE_AUTH_SAME_ORIGIN=true`.
4. `npm run deploy`.

Si algo falla, el mensaje de error ahora incluye el código entre paréntesis (por ejemplo `auth/unauthorized-domain`). Ese código indica la causa.

---

## 5. Prueba rápida

1. Abre la URL, crea una cuenta y elige tu `@usuario`.
2. *Jugar → + Crear* → *Crear sala* → *Iniciar*. Puedes jugar solo para probar.
3. Responde un criptico escribiendo en las casillas. Deberías ver la animación, oír el sonido, sumar puntos y leer la explicación.
4. Prueba con dos navegadores (o PC + móvil):
   - **Race Hardcore:** muerte súbita, pausa de 3 s con la solución y votación de dificultad.
   - **Royale 1+5:** relojes de todos, alarma de poco tiempo y eliminación.
   - **Duel:** barras de vida, daño al acertar primero y nocaut.
5. Al terminar, revisa tu *Perfil* (botón del avatar: historial y gráfico de rating) y *Ranking*.

Logs en vivo del Worker:

```powershell
npx wrangler tail
```

---

## 6. Actualizar en el futuro

Cada mejora llega como un PR. Después de hacer **merge** en GitHub:

```powershell
cd D:\EH\EH\Personal\crypticus-app
git switch main
git pull
git log -1 --oneline          # debe mostrar el merge del último PR
npm ci
npx tsx --env-file=.env.local scripts/import-cryptics.ts data/cryptics.seed.json --replace   # solo si el PR lo pide
npm run deploy
```

Ejecuta los comandos **de a uno** (no en una sola línea). `npm run deploy` termina mostrando `Uploaded crypticus` y un `Current Version ID`. Si dice `No updated asset files`, no había cambios que subir: revisa que `git pull` haya traído el commit.

**Comprobar la versión desplegada:** abre *Ajustes* (engranaje). Al pie aparece `Crypticus vX.Y.Z`, que debe coincidir con `version` en `package.json`. Si ves una versión anterior, recarga con `Ctrl + Shift + R`.

| Cambio | Qué ejecutar |
| --- | --- |
| Código nuevo | `git pull` → `npm ci` → `npm run deploy` |
| Cripticos nuevos | Importar (paso 3) → `npm run deploy` |
| Quitar cripticos | Borrarlos del archivo → importar con `--replace` → `npm run deploy` |
| Reglas o índices | Paso 2 |

### 6.1 Pasar a v1.0 (una vez)

Primero haz **merge** del PR en GitHub. Después, en PowerShell y **de a un comando**:

```powershell
cd D:\EH\EH\Personal\crypticus-app
git switch main
git pull
npm ci
npm i @fontsource-variable/cinzel @fontsource/chakra-petch
git add package.json package-lock.json
git commit -m "chore: fuentes de los temas Medieval y Cyber"
git push
npx tsx --env-file=.env.local scripts/import-cryptics.ts data/cryptics.seed.json --secrets-only
npm run deploy
```

- `npm i …` instala las fuentes de los temas (Cinzel y Chakra Petch). Sin ellas, los temas usan fuentes de respaldo.
- `--secrets-only` no toca Firestore: regenera `worker\generated\cryptic-secrets.json` con el tipo de cada criptico (`kind`, el primer `tag`) para que no salgan dos seguidos del mismo tipo.
- **Opcional, cuando los tengas:** el fondo del tema Cripta (`public\themes\crypt\wall.webp` y `wall-mobile.webp`) y la fuente de títulos de Cyber (`public\fonts\cyber-display.woff2`). Ver `docs/THEME_ASSETS.md`. Después: `git add public`, `git commit`, `git push` y `npm run deploy`.

> **Despliega siempre desde tu PC** (`npm run deploy`). Los hashes de las respuestas no están en git, así que la integración Git de Cloudflare compilaría el Worker sin cripticos.

---

### 6.2 Pasar a v1.2 (una vez): Royale por tiempo

Después del merge, **de a un comando**:

```powershell
cd D:\EH\EH\Personal\crypticus-app
git switch main
git pull
npm ci
npm run deploy
npx tsx --env-file=.env.local scripts/backfill-royale-pools.ts --dry-run
npx tsx --env-file=.env.local scripts/backfill-royale-pools.ts
```

- El script clasifica las partidas de Royale anteriores en Hyperbullet, Bullet o Rapid (lee el tiempo de cada sala) y rehace las estadísticas de cada categoría. Se puede repetir sin problema.
- Consumo: una lectura por usuario, por partida de Royale y por sala de Royale. Con la base actual queda muy por debajo de la cuota gratuita.
- Sin el script, las partidas de Royale anteriores no aparecen en ninguna categoría, y el primer Elo de cada una arranca desde el Royale anterior.

### 6.3 Pasar a v1.3 (una vez): modo COOP

Después del merge, **de a un comando**:

```powershell
cd D:\EH\EH\Personal\crypticus-app
git switch main
git pull
npm ci
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project crypticus-eh
npx tsx --env-file=.env.local scripts/import-cryptics.ts data/cryptics.seed.json --secrets-only
npm run deploy
```

- Las reglas nuevas dejan que cada jugador elija su personaje en la sala.
- `--secrets-only` agrega el enunciado y la enumeración a los secretos: el servidor los manda con cada ronda, sin lecturas a Firestore. Sin este paso, COOP igual funciona, pero lee los enunciados de Firestore.

### Novedades en Inicio

En cada versión, agrega una entrada **al principio** de `src/features/dashboard/updates.ts`, con la misma versión de `package.json` y en lenguaje común: `news` para lo nuevo y `fixes` para los arreglos. Marca `highlight: true` solo si trae algo importante para los jugadores: Inicio muestra las 3 últimas destacadas, y «Mostrar todo» abre el historial completo.

## 7. Desarrollo local (opcional)

```powershell
@"
FIREBASE_SERVICE_ACCOUNT=$sa
ANSWER_HMAC_KEY=$hmac
"@ | Set-Content -Encoding ascii .dev.vars
npm run dev:worker    # http://localhost:8787
```

---

## Problemas frecuentes

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT no es JSON válido` | base64 en UTF-16 o con salto de línea | Regenerar con el paso 1.3 |
| `auth/unauthorized-domain` | Dominio no autorizado | Paso 4.3 |
| Google se cierra sin entrar (móvil o Safari) | Cookies de terceros bloqueadas | Paso 4.4 |
| `redirect_uri_mismatch` al usar Google | Falta la URI del paso 4.4.2 | Paso 4.4 |
| Error de índice al crear partida | Índices construyéndose | Esperar al paso 2 |
| `No hay cripticos cargados todavía` | No se importaron | Paso 3 |
| `No hay cripticos disponibles` al iniciar | `worker\generated\cryptic-secrets.json` vacío al desplegar | Paso 3 (`--secrets-only` basta) → `npm run deploy` |
| `missing_cryptic` al responder | Worker desplegado antes de importar | Paso 3 → `npm run deploy` |
| Siempre «No es correcto» | Clave HMAC distinta entre import y Worker | Usar la misma clave, reimportar y redesplegar |
| `invalid_token` | `FIREBASE_PROJECT_ID` incorrecto | Revisar `wrangler.jsonc` y redesplegar |
| `--env-file` no reconocido | Node anterior a 20.6 | Actualizar Node (paso 0) |
| `'winget' no se reconoce…` | Falta el Instalador de aplicación | Paso 0, opción A u opción B |
| `la ejecución de scripts está deshabilitada` | Política de ejecución de PowerShell | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| `Unknown command: "install-scripts"` en CI | Ese comando es solo para tu PC (npm ≥ 11.16) | No editar `ci.yml`; `allowScripts` ya está en `package.json` |
| Siguen saliendo varios del mismo tipo seguidos | Secretos importados antes de v1.0 (sin `kind`) | `--secrets-only` (paso 6.1) → `npm run deploy` |
| `No hay ninguna sala abierta con el código…` | La sala terminó, se canceló o el código está mal escrito | Pedir el código otra vez o el enlace `/s/CÓDIGO` |
| Cripta sin muro (fondo casi negro) | Faltan `wall.webp` / `wall-mobile.webp` | Paso 6.1 (opcional) |
| `'node' / 'git' no se reconoce` tras instalar | PowerShell abierto antes de instalar | Cerrar y abrir PowerShell |

## Límites del plan gratuito

- **Workers Free:** 100 000 peticiones al día a `/api/*`. Los archivos estáticos (la web) son gratis e ilimitados.
- **Firestore Spark:** 50 000 lecturas y 20 000 escrituras al día. El juego en vivo no consume cuota de Firestore; sí la consumen el lobby, el chat, los perfiles, el ranking y el cierre de cada partida (resultados + historial: unas `1 + 2 × jugadores` escrituras).
- **Durable Objects (plan Free):** tiene cuotas propias. Revisa el panel de Cloudflare si el volumen crece.
