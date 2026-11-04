// Inicialización perezosa y única del Admin SDK (reutilizada entre invocaciones "warm").
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App | null = null;

function parseServiceAccount(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  const json = trimmed.startsWith('{') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8');
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch (error) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT no es JSON válido: ${(error as Error).message}`);
  }
}

export function getAdminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT.');
  app = initializeApp({ credential: cert(parseServiceAccount(raw)) });
  return app;
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function adminAuth() {
  return getAuth(getAdminApp());
}
