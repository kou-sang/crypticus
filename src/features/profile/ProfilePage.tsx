// Perfil de un jugador: estadísticas, rating e historial. Para el propio usuario reemplaza a la antigua página Historial.
import { useEffect, useState } from 'react';

const OWN_HISTORY = 50;
const OTHER_HISTORY = 10;
import { useParams } from 'react-router';
import { doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { useLiveDoc } from '../../hooks/useFirestore';
import { useFriends } from '../../hooks/useFriends';
import { getHistory, sendFriendRequest } from '../../lib/repo';
import { errorMessage, pairId } from '../../lib/utils';
import { Avatar, Button, EmptyState, ErrorBanner, PageLoader, Spinner } from '../../components/ui';
import type { HistoryEntry, UserProfile } from '../../../shared/types';
import { RatingChart } from '../../components/RatingChart';
import { HistoryTable } from '../../components/HistoryTable';

export default function ProfilePage() {
  const { uid = '' } = useParams();
  const { profile: me } = useSession();
  const { all } = useFriends(me.uid);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const user = useLiveDoc<UserProfile>(uid ? doc(db, 'users', uid) : null, [uid]);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const isMe = me.uid === uid;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setHistory(null);
    getHistory(uid, isMe ? OWN_HISTORY : OTHER_HISTORY)
      .then((list) => !cancelled && setHistory(list))
      .catch((err: unknown) => {
        console.error('[perfil] historial', err);
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, isMe]);

  if (user.loading) return <PageLoader />;
  if (!user.data) return <EmptyState title="Jugador no encontrado" />;

  const profile = user.data;
  const relation = all.find((r) => r.id === pairId(me.uid, profile.uid));

  const handleAdd = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendFriendRequest(me.uid, profile.uid);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="mb-10 flex flex-wrap items-center gap-6 border-b-2 border-ink pb-6">
        <Avatar name={profile.displayName} size="lg" />
        <div className="flex-1">
          <h1 className="font-display text-4xl font-semibold">{profile.displayName}</h1>
          <p className="font-mono text-sm text-muted">@{profile.handle}</p>
        </div>
        {!isMe &&
          (relation ? (
            <span className="text-sm text-muted">{relation.status === 'accepted' ? '✓ Amigos' : 'Solicitud pendiente'}</span>
          ) : (
            <Button onClick={handleAdd} loading={busy}>
              Agregar amigo
            </Button>
          ))}
      </header>
      <ErrorBanner error={error} />

      <dl className="mb-10 grid grid-cols-2 gap-6 md:grid-cols-5">
        {[
          ['Rating', profile.rating],
          ['Partidas', profile.stats.played],
          ['Victorias', profile.stats.wins],
          ['Resueltos', profile.stats.solved],
          ['Pistas', profile.stats.hintsUsed],
        ].map(([label, value]) => (
          <div key={label} className="border-l-2 border-ink pl-3">
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</dt>
            <dd className="font-mono text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <h2 className="mb-4 font-display text-2xl">Historial</h2>
          {history === null ? (
            <Spinner />
          ) : history.length === 0 ? (
            <EmptyState title="Sin partidas todavía" />
          ) : (
            <HistoryTable entries={history} />
          )}
        </section>
        <section>
          <h2 className="mb-4 font-display text-2xl">Rating</h2>
          <RatingChart history={history ?? []} />
        </section>
      </div>
    </>
  );
}
