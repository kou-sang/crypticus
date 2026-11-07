// Valida un archivo de cripticos sin tocar Firestore ni los secretos.
// Uso: npm run validate:cryptics -- data/cryptics.seed.json
import { readFile } from 'node:fs/promises';
import { lintCryptics } from '../shared/crypticLint.js';

async function main(): Promise<void> {
  const filePath = process.argv[2] ?? 'data/cryptics.seed.json';
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`No se pudo leer ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const report = lintCryptics(parsed);
  for (const warning of report.warnings) console.warn(`  ! ${warning}`);
  for (const error of report.errors) console.error(`  ✗ ${error}`);
  const { easy, medium, hard } = report.counts;
  console.log(`${filePath}: ${report.total} cripticos (fáciles ${easy}, medios ${medium}, difíciles ${hard}; ${report.tiebreak} de desempate).`);
  if (report.errors.length > 0) {
    console.error(`${report.errors.length} error(es). Corrige el archivo antes de importarlo.`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
