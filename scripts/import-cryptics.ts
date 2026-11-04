// Importa cripticos desde un JSON a Firestore, separando datos públicos y secretos.
// Uso: FIREBASE_SERVICE_ACCOUNT=... npm run import:cryptics -- data/cryptics.json [--dry-run]
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { deriveEnumeration, normalizeAnswer } from '../shared/answer.js';
import type { CrypticImportItem, CrypticPublic, CrypticSecret, Difficulty } from '../shared/types.js';

const BATCH_SIZE = 200; // 2 escrituras por criptico -> 400 < límite de 500 por batch.

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
  const difficulty = (raw.difficulty ?? 3) as Difficulty;
  if (![1, 2, 3, 4, 5].includes(difficulty)) throw new Error(`#${index}: "difficulty" debe ser 1..5`);
  const hints = Array.isArray(raw.hints) ? raw.hints.filter((h) => typeof h === 'string' && h.trim()) : [];

  return {
    id: stableId(raw),
    publicData: {
      clue: raw.clue.trim(),
      enumeration: raw.enumeration ?? deriveEnumeration(raw.answer),
      difficulty,
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

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT.');
  const json = serviceAccount.trim().startsWith('{') ? serviceAccount : Buffer.from(serviceAccount, 'base64').toString('utf8');
  const db = getFirestore(initializeApp({ credential: cert(JSON.parse(json)) }));

  for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
    const batch = db.batch();
    for (const item of items.slice(offset, offset + BATCH_SIZE)) {
      batch.set(db.collection('cryptics').doc(item.id), item.publicData);
      batch.set(db.collection('crypticSecrets').doc(item.id), item.secretData);
    }
    await batch.commit();
    console.log(`  ✓ ${Math.min(offset + BATCH_SIZE, items.length)}/${items.length}`);
  }
}

main().catch((error: unknown) => {
  console.error('Importación fallida:', error instanceof Error ? error.message : error);
  process.exit(1);
});
