// /s/:code — enlace corto de una sala: busca la sala abierta con ese código y redirige a /c/:id.
import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { findOpenRoomByCode } from '../../lib/repo';
import { normalizeRoomCode } from '../../../shared/roomCode';
import { errorMessage } from '../../lib/utils';
import { BackLink } from '../../components/BackLink';
import { EmptyState, PageLoader } from '../../components/ui';

type Lookup = { status: 'loading' } | { status: 'found'; id: string } | { status: 'missing'; message: string };

export default function JoinByCodePage() {
  const { code: raw = '' } = useParams();
  const code = normalizeRoomCode(raw);
  const [lookup, setLookup] = useState<Lookup>({ status: 'loading' });

  useEffect(() => {
    if (!code) {
      setLookup({ status: 'missing', message: 'El enlace no tiene un código de sala válido.' });
      return;
    }
    let cancelled = false;
    findOpenRoomByCode(code)
      .then((room) => {
        if (cancelled) return;
        setLookup(room ? { status: 'found', id: room.id } : { status: 'missing', message: `La sala ${code} ya terminó o no existe.` });
      })
      .catch((err: unknown) => !cancelled && setLookup({ status: 'missing', message: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (lookup.status === 'found') return <Navigate to={`/c/${lookup.id}`} replace />;
  if (lookup.status === 'loading') return <PageLoader />;
  return (
    <>
      <BackLink to="/jugar" label="Volver a Jugar" />
      <EmptyState title={lookup.message} />
    </>
  );
}
