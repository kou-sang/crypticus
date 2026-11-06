// Carga datos públicos de cripticos bajo demanda, con caché en memoria compartida entre rondas.
import { useEffect, useState } from 'react';
import { getCryptics } from '../../lib/repo';
import { errorMessage } from '../../lib/utils';
import type { CrypticPublic } from '../../../shared/types';

const cache = new Map<string, CrypticPublic>();

export function useCryptics(rawIds: string[]): { cryptics: Map<string, CrypticPublic>; error: string | null } {
  const ids = rawIds.filter(Boolean); // Ids vacíos (criptico oculto durante la pausa) no se consultan.
  const key = ids.join(',');
  const [, forceRender] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    const missing = ids.filter((id) => !cache.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    getCryptics(missing)
      .then((loaded) => {
        loaded.forEach((cryptic, id) => cache.set(id, cryptic));
        if (!cancelled) forceRender((n) => n + 1);
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const result = new Map<string, CrypticPublic>();
  ids.forEach((id) => {
    const cryptic = cache.get(id);
    if (cryptic) result.set(id, cryptic);
  });
  return { cryptics: result, error };
}
