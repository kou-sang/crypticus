// Ranking: una tabla por modo (Race, Royale, Duel), global o entre amigos. Consultas puntuales con caché.
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../hooks/useAuth';
import { useFriends } from '../../hooks/useFriends';
import { useUsers } from '../../hooks/useUsers';
import { cx, errorMessage } from '../../lib/utils';
import { getModePosition, getTopByMode } from '../../lib/repo';
import { loadJson, saveJson } from '../../lib/storage';
import { RankingTable, statsOf } from '../../components/RankingTable';
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { GAME_LABELS } from '../../../shared/scoring';
import { RANKED_MODES, type RankedMode, type UserProfile } from '../../../shared/types';

const VIEW_KEY = 'crypticus.rankingView.v1';

export default function RankingsPage() {
  const { profile } = useSession();
  const [view, setView] = useState(() => loadJson(VIEW_KEY, { mode: 'race' as RankedMode, scope: 'global' as 'global' | 'friends' }));
  const [top, setTop] = useState<UserProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const { friendIds } = useFriends(profile.uid);
  const friendProfiles = useUsers(friendIds);
  const myStats = statsOf(profile, view.mode);
  useEffect(() => saveJson(VIEW_KEY, view), [view]);

  useEffect(() => {
    let cancelled = false;
    setTop(null);
    setError(null);
    getTopByMode(view.mode)
      .then((rows) => !cancelled && setTop(rows))
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    if (myStats.played > 0) {
      getModePosition(view.mode, myStats.rating)
        .then((value) => !cancelled && setPosition(value))
        .catch((err: unknown) => console.error('[ranking] posición', err));
    } else setPosition(null);
    return () => {
      cancelled = true;
    };
  }, [view.mode, myStats.rating, myStats.played]);

  const friendsRows = useMemo(
    () =>
      [profile, ...friendProfiles.values()]
        .filter((user) => statsOf(user, view.mode).played > 0 || user.uid === profile.uid)
        .sort((a, b) => statsOf(b, view.mode).rating - statsOf(a, view.mode).rating),
    [profile, friendProfiles, view.mode],
  );
  const rows = view.scope === 'global' ? top : friendsRows;

  return (
    <>
      <PageHeader kicker="Ranking" title="Tabla de posiciones" />
      <div role="tablist" className="mb-3 grid grid-cols-3 border border-ink">
        {RANKED_MODES.map((mode) => (
          <button
            key={mode}
            role="tab"
            aria-selected={view.mode === mode}
            onClick={() => setView((v) => ({ ...v, mode }))}
            className={cx('seg-tab py-2 font-display text-lg uppercase', view.mode === mode ? 'bg-ink text-paper' : 'hover:bg-paper-2')}
          >
            {GAME_LABELS[mode].title}
          </button>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {(['global', 'friends'] as const).map((scope) => (
          <button
            key={scope}
            onClick={() => setView((v) => ({ ...v, scope }))}
            aria-pressed={view.scope === scope}
            className={cx(
              'seg-tab border px-3 py-1.5 text-sm font-semibold transition-colors',
              view.scope === scope ? 'border-ink bg-ink text-paper' : 'border-line bg-paper-2/50 hover:border-ink',
            )}
          >
            {scope === 'global' ? 'Global' : 'Amigos'}
          </button>
        ))}
        <p className="ml-auto text-sm">
          Tú: <strong className="font-mono">{myStats.played > 0 ? `#${position ?? '…'} · ${myStats.rating}` : 'sin partidas'}</strong>
        </p>
      </div>
      <ErrorBanner error={error} />
      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title={`Nadie jugó ${GAME_LABELS[view.mode].title} todavía`}>Las partidas de 2 o más jugadores suman al ranking.</EmptyState>
      ) : (
        <RankingTable rows={rows} meId={profile.uid} mode={view.mode} />
      )}
    </>
  );
}
