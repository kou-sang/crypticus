// Carga perfiles por uid con caché en memoria (TTL corto: ratings frescos sin lecturas repetidas).
import { useEffect, useMemo, useState } from 'react';
import { getUsers } from '../lib/repo';
import type { UserProfile } from '../../shared/types';

const TTL_MS = 2 * 60_000;
const cache = new Map<string, { at: number; profile: UserProfile }>();

const isFresh = (uid: string) => {
  const entry = cache.get(uid);
  return entry !== undefined && Date.now() - entry.at < TTL_MS;
};

export function useUsers(uids: string[]): Map<string, UserProfile> {
  const key = [...uids].sort().join(',');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const missing = uids.filter((uid) => !isFresh(uid));
    if (missing.length === 0) return;
    let cancelled = false;
    getUsers(missing)
      .then((profiles) => {
        const at = Date.now();
        profiles.forEach((profile) => cache.set(profile.uid, { at, profile }));
        if (!cancelled) setVersion((n) => n + 1);
      })
      .catch((error: unknown) => console.error('[users] carga fallida', error));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Referencia estable mientras no cambien los uids ni lleguen datos nuevos (permite memoizar consumidores).
  return useMemo(() => {
    const result = new Map<string, UserProfile>();
    key.split(',').forEach((uid) => {
      const entry = cache.get(uid);
      if (entry) result.set(uid, entry.profile);
    });
    return result;
  }, [key, version]);
}
