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
git checkout feat/cloudflare-durable-objects   # o main, después de hacer merge del PR #2
npm install
```

> `clave.json` y `encoded.txt` están en `.gitignore` como protección extra, pero lo más seguro es mantenerlos **fuera** de la carpeta del repo. Nunca los compartas ni los subas.

### 1.2 Lista de cripticos

Copia el archivo `cryptics.seed.json` que te envié a la carpeta `data\` del repo:

```powershell
Copy-Item "$HOME\Downloads\cryptics.seed.json" .\data\
```

Son 30 cripticos originales (10 fáciles, 11 medios, 9 difíciles). Está en `.gitignore` porque contiene las respuestas y el repo es público. Para añadir más, usa el mismo formato (ver `data/cryptics.example.json`).

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
npx tsx --env-file=.env.local scripts/import-cryptics.ts data/cryptics.seed.json
```

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

### 4.3 Autorizar el dominio en Firebase

*Firebase → Authentication → Configuración → Dominios autorizados → Agregar dominio* → `crypticus.<tu-subdominio>.workers.dev`

---

## 5. Prueba rápida

1. Abre la URL, crea una cuenta y elige tu `@usuario`.
2. *Competir → Crear* → preset **Rápida** → *Crear sala* → *Iniciar*. Puedes jugar solo para probar.
3. Responde, por ejemplo, «Capital italiana con amor alterado (4)». Deberías ver la animación, oír el sonido y sumar puntos.
4. Prueba con dos navegadores (o PC + móvil):
   - **Duelo:** rondas, votación de dificultad, cuenta atrás con efecto desmayo y aviso de partida mixta móvil/PC.
   - **Jefe:** golpes, curación al fallar y figura animada.
5. Al terminar, revisa *Historial*, tu *Perfil* (gráfico de rating) y *Ranking*.

Logs en vivo del Worker:

```powershell
npx wrangler tail
```

---

## 6. Actualizar en el futuro

| Cambio | Qué ejecutar |
| --- | --- |
| Código nuevo | `git pull` → `npm install` → `npm run deploy` |
| Cripticos nuevos | Importar (paso 3) → `npm run deploy` |
| Reglas o índices | Paso 2 |

> **Despliega siempre desde tu PC** (`npm run deploy`). Los hashes de las respuestas no están en git, así que la integración Git de Cloudflare compilaría el Worker sin cripticos.

---

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
| Error de índice al crear partida | Índices construyéndose | Esperar al paso 2 |
| `No hay cripticos cargados todavía` | No se importaron | Paso 3 |
| `missing_cryptic` al responder | Worker desplegado antes de importar | Paso 3 → `npm run deploy` |
| Siempre «No es correcto» | Clave HMAC distinta entre import y Worker | Usar la misma clave, reimportar y redesplegar |
| `invalid_token` | `FIREBASE_PROJECT_ID` incorrecto | Revisar `wrangler.jsonc` y redesplegar |
| `--env-file` no reconocido | Node anterior a 20.6 | Actualizar Node (paso 0) |
| `'winget' no se reconoce…` | Falta el Instalador de aplicación | Paso 0, opción A u opción B |
| `la ejecución de scripts está deshabilitada` | Política de ejecución de PowerShell | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| `'node' / 'git' no se reconoce` tras instalar | PowerShell abierto antes de instalar | Cerrar y abrir PowerShell |

## Límites del plan gratuito

- **Workers Free:** 100 000 peticiones al día a `/api/*`. Los archivos estáticos (la web) son gratis e ilimitados.
- **Firestore Spark:** 50 000 lecturas y 20 000 escrituras al día. El juego en vivo no consume cuota de Firestore; sí la consumen el lobby, el chat, los perfiles, el ranking y el cierre de cada partida (resultados + historial: unas `1 + 2 × jugadores` escrituras).
- **Durable Objects (plan Free):** tiene cuotas propias. Revisa el panel de Cloudflare si el volumen crece.
