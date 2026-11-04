// Carga perfiles por uid con caché en memoria (evita lecturas repetidas entre pantallas).
import { useEffect, useState } from 'react';
import { getUsers } from '../lib/repo';
import type { UserProfile } from '../../shared/types';

const cache = new Map<string, UserProfile>();

export function useUsers(uids: string[]): Map<string, UserProfile> {
  const key = [...uids].sort().join(',');
  const [, forceRender] = useState(0);

  useEffect(() => {
    const missing = uids.filter((uid) => !cache.has(uid));
    if (missing.length === 0) return;
    let cancelled = false;
    getUsers(missing)
      .then((profiles) => {
        profiles.forEach((p) => cache.set(p.uid, p));
        if (!cancelled) forceRender((n) => n + 1);
      })
      .catch((error: unknown) => console.error('[users] carga fallida', error));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const result = new Map<string, UserProfile>();
  uids.forEach((uid) => {
    const profile = cache.get(uid);
    if (profile) result.set(uid, profile);
  });
  return result;
}
