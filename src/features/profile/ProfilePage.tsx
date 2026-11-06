// Perfil al estilo Lichess: ratings por modo a un lado; estadísticas, historial y evolución en el centro.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
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
import { ModeRatings } from '../../components/ModeRatings';
import { BackLink } from '../../components/BackLink';

const OWN_HISTORY = 50;
const OTHER_HISTORY = 20;
const MEMBER_SINCE = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' });

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
  if (!user.data)
    return (
      <>
        <BackLink />
        <EmptyState title="Jugador no encontrado" />
      </>
    );

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

  const challengeLink = `/jugar/nueva?rival=${encodeURIComponent(profile.uid)}&name=${encodeURIComponent(profile.displayName)}`;

  return (
    <>
      <BackLink />
      <header className="mb-8 flex flex-wrap items-center gap-5 border-b-2 border-ink pb-6">
        <Avatar name={profile.displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-4xl font-semibold">{profile.displayName}</h1>
          <p className="font-mono text-sm text-muted">
            @{profile.handle}
            {profile.createdAt ? ` · desde ${MEMBER_SINCE.format(new Date(profile.createdAt))}` : ''}
          </p>
        </div>
        {!isMe && (
          <div className="flex flex-wrap gap-2">
            <Link
              to={challengeLink}
              className="inline-flex h-10 items-center bg-ink px-4 text-sm font-semibold text-paper hover:bg-accent"
            >
              Desafiar
            </Link>
            {relation ? (
              <span className="inline-flex h-10 items-center text-sm text-muted">
                {relation.status === 'accepted' ? '✓ Amigos' : 'Solicitud pendiente'}
              </span>
            ) : (
              <Button variant="secondary" onClick={handleAdd} loading={busy}>
                Agregar amigo
              </Button>
            )}
          </div>
        )}
      </header>
      <ErrorBanner error={error} />

      <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <ModeRatings user={profile} />
          <dl className="grid grid-cols-2 gap-4">
            {[
              ['Partidas', profile.stats.played],
              ['Victorias', profile.stats.wins],
              ['Resueltos', profile.stats.solved],
              ['Pistas', profile.stats.hintsUsed],
            ].map(([label, value]) => (
              <div key={label} className="border-l-2 border-ink pl-3">
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</dt>
                <dd className="font-mono text-xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </aside>

        <section className="min-w-0 space-y-8">
          <div>
            <h2 className="mb-4 font-display text-2xl">Partidas</h2>
            {history === null ? (
              <Spinner />
            ) : history.length === 0 ? (
              <EmptyState title="Sin partidas todavía" />
            ) : (
              <HistoryTable entries={history} />
            )}
          </div>
          <div>
            <h2 className="mb-4 font-display text-2xl">Evolución</h2>
            <RatingChart history={history ?? []} />
          </div>
        </section>
      </div>
    </>
  );
}
