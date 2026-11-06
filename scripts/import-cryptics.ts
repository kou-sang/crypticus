// Importa cripticos: datos públicos -> Firestore; secretos -> worker/generated/cryptic-secrets.json.
// Las respuestas se guardan como HMAC-SHA256 (clave ANSWER_HMAC_KEY), nunca en claro.
// Uso: FIREBASE_SERVICE_ACCOUNT=... ANSWER_HMAC_KEY=... npm run import:cryptics -- data/cryptics.json [--dry-run] [--secrets-only] [--replace]
// --replace: el archivo pasa a ser la lista completa (borra de Firestore y de los secretos lo que no esté).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { answerLengthFromEnumeration, deriveEnumeration, normalizeAnswer, splitClue } from '../shared/answer.js';
import { hashAnswer } from '../shared/answerHash.js';
import { parseDifficulty } from '../shared/scoring.js';
import type { CrypticImportItem, CrypticPublic, CrypticSecret } from '../shared/types.js';

const BATCH_SIZE = 400; // < límite de 500 escrituras por batch.
const SECRETS_PATH = 'worker/generated/cryptic-secrets.json';

interface ValidItem {
  id: string;
  publicData: Omit<CrypticPublic, 'id'>;
  secretData: CrypticSecret;
}

function stableId(item: CrypticImportItem): string {
  // Id determinista: reimportar el mismo criptico lo actualiza en vez de duplicarlo.
  return item.id ?? createHash('sha1').update(`${item.clue}|${normalizeAnswer(item.answer)}`).digest('hex').slice(0, 16);
}

function validateItem(item: unknown, index: number): ValidItem {
  if (typeof item !== 'object' || item === null) throw new Error(`#${index}: no es un objeto`);
  const raw = item as CrypticImportItem;
  if (typeof raw.clue !== 'string' || raw.clue.trim().length < 3) throw new Error(`#${index}: "clue" inválido`);
  if (typeof raw.answer !== 'string' || normalizeAnswer(raw.answer).length === 0) {
    throw new Error(`#${index}: "answer" inválido`);
  }
  const tier = parseDifficulty(raw.difficulty);
  if (!tier) throw new Error(`#${index}: "difficulty" debe ser fácil, medio o difícil`);
  // La enumeración escrita en el enunciado se separa: la UI la muestra aparte.
  const { text: clue, enumeration: clueEnumeration } = splitClue(raw.clue);
  const enumeration = raw.enumeration ?? clueEnumeration ?? deriveEnumeration(raw.answer);
  if (answerLengthFromEnumeration(enumeration) !== normalizeAnswer(raw.answer).length) {
    throw new Error(`#${index}: la enumeración ${enumeration} no coincide con "${raw.answer}"`);
  }
  const hints = Array.isArray(raw.hints) ? raw.hints.filter((h) => typeof h === 'string' && h.trim()) : [];

  return {
    id: stableId(raw),
    publicData: {
      clue,
      enumeration,
      tier,
      hintCount: hints.length,
      rand: Math.random(), // Para muestreo aleatorio eficiente (where rand >= x).
      ...(raw.setter ? { setter: raw.setter } : {}),
      ...(raw.tags ? { tags: raw.tags } : {}),
    },
    secretData: {
      answer: raw.answer.trim(),
      hints,
      ...(raw.explanation ? { explanation: raw.explanation } : {}),
    },
  };
}

async function main(): Promise<void> {
  const [filePath = 'data/cryptics.json', ...flags] = process.argv.slice(2);
  const dryRun = flags.includes('--dry-run');
  const secretsOnly = flags.includes('--secrets-only');
  const replace = flags.includes('--replace');
  const hmacKey = process.env.ANSWER_HMAC_KEY ?? '';
  if (!dryRun && hmacKey.length < 32) throw new Error('ANSWER_HMAC_KEY debe tener al menos 32 caracteres.');

  const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('El archivo debe contener un array de cripticos.');

  const items: ValidItem[] = [];
  const errors: string[] = [];
  parsed.forEach((entry, index) => {
    try {
      items.push(validateItem(entry, index));
    } catch (error) {
      errors.push((error as Error).message);
    }
  });

  console.log(`Válidos: ${items.length} · Con errores: ${errors.length}`);
  errors.forEach((message) => console.warn(`  ✗ ${message}`));
  if (dryRun || items.length === 0) return;

  // 1) Secretos para el Worker (se fusionan con los existentes para permitir importaciones parciales).
  let existing: Record<string, unknown> = {};
  if (!replace) {
    try {
      existing = JSON.parse(await readFile(SECRETS_PATH, 'utf8')) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  for (const item of items) {
    existing[item.id] = {
      hash: await hashAnswer(hmacKey, item.id, item.secretData.answer),
      tier: item.publicData.tier,
      hints: item.secretData.hints,
      answer: item.secretData.answer,
      ...(item.secretData.explanation ? { explanation: item.secretData.explanation } : {}),
    };
  }
  await mkdir('worker/generated', { recursive: true });
  await writeFile(SECRETS_PATH, `${JSON.stringify(existing)}\n`);
  console.log(`  ✓ ${SECRETS_PATH}: ${Object.keys(existing).length} cripticos (redeploya el Worker)`);
  if (secretsOnly) return;

  // 2) Datos públicos en Firestore.
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT.');
  const json = serviceAccount.trim().startsWith('{') ? serviceAccount : Buffer.from(serviceAccount, 'base64').toString('utf8');
  const db = getFirestore(initializeApp({ credential: cert(JSON.parse(json)) }));

  for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
    const batch = db.batch();
    for (const item of items.slice(offset, offset + BATCH_SIZE)) {
      batch.set(db.collection('cryptics').doc(item.id), item.publicData);
    }
    await batch.commit();
    console.log(`  ✓ Firestore ${Math.min(offset + BATCH_SIZE, items.length)}/${items.length}`);
  }

  // 3) Reemplazo: borra los documentos públicos que ya no están en el archivo.
  if (replace) {
    const keep = new Set(items.map((item) => item.id));
    const stale = (await db.collection('cryptics').select().get()).docs.filter((d) => !keep.has(d.id));
    for (let offset = 0; offset < stale.length; offset += BATCH_SIZE) {
      const batch = db.batch();
      stale.slice(offset, offset + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    console.log(`  ✓ Firestore: ${stale.length} cripticos obsoletos borrados`);
  }
}

main().catch((error: unknown) => {
  console.error('Importación fallida:', error instanceof Error ? error.message : error);
  process.exit(1);
});
