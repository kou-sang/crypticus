// Crea un placeholder vacío de secretos si no existe, para que typecheck/build/CI no fallen.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const path = 'worker/generated/cryptic-secrets.json';
try {
  if (!existsSync(path)) {
    mkdirSync('worker/generated', { recursive: true });
    writeFileSync(path, '{}\n');
    console.log(`[ensure-secrets] creado placeholder vacío: ${path}`);
  }
} catch (error) {
  console.error('[ensure-secrets] no se pudo crear el placeholder', error);
  process.exit(1);
}
