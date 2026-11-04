// Hooks de suscripción en tiempo real con manejo de errores y limpieza automática.
import { useEffect, useState } from 'react';
import { onSnapshot, type DocumentReference, type Query } from 'firebase/firestore';

export interface LiveState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/** Suscribe a un documento. Pasa `null` para desactivar (p. ej. sin sesión). */
export function useLiveDoc<T>(ref: DocumentReference | null, deps: unknown[]): LiveState<T | null> {
  const [state, setState] = useState<LiveState<T | null>>({ data: null, loading: ref !== null, error: null });

  useEffect(() => {
    if (!ref) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null, loading: false, error: null }),
      (error) => setState({ data: null, loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

/** Suscribe a una consulta. Pasa `null` para desactivar. */
export function useLiveQuery<T>(query: Query | null, deps: unknown[]): LiveState<T[]> {
  const [state, setState] = useState<LiveState<T[]>>({ data: [], loading: query !== null, error: null });

  useEffect(() => {
    if (!query) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    return onSnapshot(
      query,
      (snap) => setState({ data: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as T), loading: false, error: null }),
      (error) => {
        console.error('[firestore] query error', error);
        setState({ data: [], loading: false, error });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
