// Rankings: top global (consulta puntual, no en vivo, para ahorrar lecturas) y entre amigos.
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../hooks/useAuth';
import { useFriends } from '../../hooks/useFriends';
import { useUsers } from '../../hooks/useUsers';
import { cx, errorMessage } from '../../lib/utils';
import { getGlobalPosition, getTopPlayers } from '../../lib/repo';
import { RankingTable } from '../../components/RankingTable';
import { ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import type { UserProfile } from '../../../shared/types';

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
    getTopPlayers()
      .then((rows) => !cancelled && setTop(rows))
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    getGlobalPosition(profile.rating)
      .then((value) => !cancelled && setPosition(value))
      .catch((err: unknown) => console.error('[ranking] posición', err));
    return () => {
      cancelled = true;
    };
  }, [profile.rating]);

  const friendsRows = useMemo(
    () => [profile, ...friendProfiles.values()].sort((a, b) => b.rating - a.rating),
    [profile, friendProfiles],
  );

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
