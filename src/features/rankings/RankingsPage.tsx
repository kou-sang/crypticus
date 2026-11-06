// Rankings: top global (consulta puntual, no en vivo, para ahorrar lecturas) y entre amigos.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { useFriends } from '../../hooks/useFriends';
import { useUsers } from '../../hooks/useUsers';
import { cx, errorMessage } from '../../lib/utils';
import { getGlobalPosition } from '../../lib/repo';
import { ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import type { UserProfile } from '../../../shared/types';

const TOP_LIMIT = 50;

export function RankingTable({ rows, meId }: { rows: UserProfile[]; meId: string }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b-2 border-ink text-left text-[11px] uppercase tracking-widest text-muted">
          <th className="w-12 py-2">#</th>
          <th className="py-2">Jugador</th>
          <th className="py-2 text-right">Partidas</th>
          <th className="hidden py-2 text-right sm:table-cell">% Vict.</th>
          <th className="hidden py-2 text-right sm:table-cell">Resueltos</th>
          <th className="py-2 text-right">Rating</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((user, index) => (
          <tr key={user.uid} className={cx('border-b border-line', user.uid === meId && 'bg-accent/10')}>
            <td className={cx('py-2.5 font-mono', index < 3 && 'font-bold text-accent')}>{index + 1}</td>
            <td className="py-2.5">
              <Link to={`/u/${user.uid}`} className="font-semibold hover:underline">
                {user.displayName}
              </Link>{' '}
              <span className="font-mono text-xs text-muted">@{user.handle}</span>
            </td>
            <td className="py-2.5 text-right font-mono">{user.stats.played}</td>
            <td className="hidden py-2.5 text-right font-mono sm:table-cell">
              {user.stats.played > 0 ? `${Math.round((user.stats.wins / user.stats.played) * 100)}%` : '—'}
            </td>
            <td className="hidden py-2.5 text-right font-mono sm:table-cell">{user.stats.solved}</td>
            <td className="py-2.5 text-right font-mono font-semibold">{user.rating}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RankingsPage() {
  const { profile } = useSession();
  const [tab, setTab] = useState<'global' | 'friends'>('global');
  const [top, setTop] = useState<UserProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const { friendIds } = useFriends(profile.uid);
  const friendProfiles = useUsers(friendIds);

  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(db, 'users'), orderBy('rating', 'desc'), limit(TOP_LIMIT)))
      .then((snap) => !cancelled && setTop(snap.docs.map((d) => d.data() as UserProfile)))
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    getGlobalPosition(profile.rating)
      .then((value) => !cancelled && setPosition(value))
      .catch((err: unknown) => console.error('[ranking] posición', err));
    return () => {
      cancelled = true;
    };
  }, [profile.rating]);

  const friendsRows = [profile, ...friendProfiles.values()].sort((a, b) => b.rating - a.rating);

  return (
    <>
      <PageHeader kicker="Ranking" title="Tabla de posiciones" />
      <div className="mb-6 flex gap-1">
        {(['global', 'friends'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cx('px-4 py-2 text-sm font-semibold', tab === value ? 'bg-ink text-paper' : 'hover:bg-paper-2')}
          >
            {value === 'global' ? 'Global' : 'Amigos'}
          </button>
        ))}
      </div>
      <p className="mb-6 border-l-4 border-accent pl-3 text-sm">
        Tu posición global: <strong className="font-mono">{position ? `#${position}` : '…'}</strong> · rating{' '}
        <strong className="font-mono">{profile.rating}</strong>
      </p>
      <ErrorBanner error={error} />
      {tab === 'global' ? (
        top === null ? <Spinner /> : <RankingTable rows={top} meId={profile.uid} />
      ) : (
        <RankingTable rows={friendsRows} meId={profile.uid} />
      )}
    </>
  );
}
