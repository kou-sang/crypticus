// Inicialización del SDK cliente. Caché persistente en IndexedDB => cargas instantáneas y menos lecturas.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // Mismo dominio que la app (el Worker hace proxy de /__/auth) => sin cookies de terceros.
  authDomain:
    import.meta.env.VITE_AUTH_SAME_ORIGIN === 'true' && typeof window !== 'undefined' && window.location.hostname !== 'localhost'
      ? window.location.host
      : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length > 0) {
  console.error(`[firebase] Faltan variables de entorno: ${missing.join(', ')}`);
}

export const firebaseApp = initializeApp(config);
export const auth = getAuth(firebaseApp);
export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
