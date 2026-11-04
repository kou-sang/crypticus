// Perfil público de un jugador con historial reciente.
import { useState } from 'react';
import { useParams } from 'react-router';
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { useLiveDoc, useLiveQuery } from '../../hooks/useFirestore';
import { useFriends } from '../../hooks/useFriends';
import { sendFriendRequest } from '../../lib/repo';
import { errorMessage, pairId } from '../../lib/utils';
import { Avatar, Button, EmptyState, ErrorBanner, PageLoader } from '../../components/ui';
import type { Competition, UserProfile } from '../../../shared/types';
import { CompetitionCard } from '../competitions/CompetitionCard';

export default function ProfilePage() {
  const { uid = '' } = useParams();
  const { profile: me } = useSession();
  const { all } = useFriends(me.uid);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const user = useLiveDoc<UserProfile>(uid ? doc(db, 'users', uid) : null, [uid]);
  const history = useLiveQuery<Competition>(
    uid
      ? query(
          collection(db, 'competitions'),
          where('participantIds', 'array-contains', uid),
          orderBy('createdAt', 'desc'),
          limit(6),
        )
      : null,
    [uid],
  );

  if (user.loading) return <PageLoader />;
  if (!user.data) return <EmptyState title="Jugador no encontrado" />;

  const profile = user.data;
  const relation = all.find((r) => r.id === pairId(me.uid, profile.uid));
  const isMe = me.uid === profile.uid;

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

      <h2 className="mb-4 font-display text-2xl">Historial</h2>
      {history.data.length === 0 ? (
        <EmptyState title="Sin partidas todavía" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {history.data.map((c) => <CompetitionCard key={c.id} competition={c} />)}
        </div>
      )}
    </>
  );
}
