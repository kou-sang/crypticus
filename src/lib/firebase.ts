// Inicialización del SDK cliente. Caché persistente en IndexedDB => cargas instantáneas y menos lecturas.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

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
/**
 * iPhone y iPad (todos los navegadores usan WebKit): el IndexedDB de Safari puede colgar la caché persistente
 * con varias pestañas, y el streaming de Firestore puede no llegar nunca (bloqueadores de contenido, Private Relay).
 * Resultado: escrituras y lecturas que no terminan (p. ej. el alta del perfil). Ahí se usa caché en memoria y
 * long polling forzado; en el resto, caché persistente y detección automática.
 */
function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1; // iPad con "versión de escritorio".
  return iOS || iPadOS;
}

export const db = isAppleMobile()
  ? initializeFirestore(firebaseApp, { localCache: memoryLocalCache(), experimentalForceLongPolling: true })
  : initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalAutoDetectLongPolling: true,
    });
