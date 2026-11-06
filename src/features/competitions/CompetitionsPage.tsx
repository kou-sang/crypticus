// Listado de competencias abiertas: públicas y de amigos.
import { useState } from 'react';
import { Link } from 'react-router';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { useLiveQuery } from '../../hooks/useFirestore';
import { useFriends } from '../../hooks/useFriends';
import type { Competition } from '../../../shared/types';
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { cx } from '../../lib/utils';
import { CompetitionCard } from './CompetitionCard';

type Tab = 'public' | 'friends';

export default function CompetitionsPage() {
  const { profile } = useSession();
  const [tab, setTab] = useState<Tab>('public');
  const { friendIds } = useFriends(profile.uid);
  // Firestore limita `in` a 30 valores: se usan los primeros 30 amigos.
  const friendKey = friendIds.slice(0, 30).sort().join(',');

  const publicLive = useLiveQuery<Competition>(
    tab === 'public'
      ? query(
          collection(db, 'competitions'),
          where('visibility', '==', 'public'),
          where('status', 'in', ['lobby', 'live']),
          orderBy('createdAt', 'desc'),
          limit(30),
        )
      : null,
    [tab],
  );

  const friendsLive = useLiveQuery<Competition>(
    tab === 'friends' && friendKey
      ? query(
          collection(db, 'competitions'),
          where('visibility', '==', 'friends'),
          where('hostId', 'in', friendKey.split(',')),
          limit(30),
        )
      : null,
    [tab, friendKey],
  );

  const source = tab === 'public' ? publicLive : friendsLive;
  const items =
    tab === 'public'
      ? source.data
      : source.data.filter((c) => c.status !== 'finished').sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <PageHeader
        kicker="Competir"
        title="Salas abiertas"
        action={
          <Link to="/jugar/nueva" className="inline-flex h-10 items-center bg-ink px-4 text-sm font-semibold text-paper hover:bg-accent">
            + Crear
          </Link>
        }
      />

      <div className="mb-6 flex gap-1">
        {(['public', 'friends'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cx('px-4 py-2 text-sm font-semibold', tab === value ? 'bg-ink text-paper' : 'hover:bg-paper-2')}
          >
            {value === 'public' ? 'Públicas' : 'De amigos'}
          </button>
        ))}
      </div>

      <ErrorBanner error={source.error?.message ?? null} />

      {source.loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title={tab === 'public' ? 'No hay salas públicas ahora' : 'Tus amigos no tienen salas abiertas'}>
          Sé el primero con «+ Crear».
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => <CompetitionCard key={c.id} competition={c} />)}
        </div>
      )}
    </>
  );
}
