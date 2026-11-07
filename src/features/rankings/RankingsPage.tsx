// Ranking: una tabla por pool de Elo (Race, Royale por tiempo, Duel), global o entre amigos. Consultas puntuales con caché.
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../hooks/useAuth';
import { useFriends } from '../../hooks/useFriends';
import { useUsers } from '../../hooks/useUsers';
import { cx, errorMessage } from '../../lib/utils';
import { getModePosition, getTopByMode } from '../../lib/repo';
import { loadJson, saveJson } from '../../lib/storage';
import { RankingTable } from '../../components/RankingTable';
import { poolTitle, royalePool, statsOf } from '../../lib/pools';
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { GAME_LABELS } from '../../../shared/scoring';
import { RANKED_MODES, type RankedMode, type UserProfile } from '../../../shared/types';
import { ROYALE_CATEGORIES, ROYALE_CATEGORY_LABELS, type RatingPool, type RoyaleCategory } from '../../../shared/ratingPools';

const VIEW_KEY = 'crypticus.rankingView.v2';

interface RankingView {
  mode: RankedMode;
  royale: RoyaleCategory;
  scope: 'global' | 'friends';
}
const DEFAULT_VIEW: RankingView = { mode: 'race', royale: 'bullet', scope: 'global' };

export default function RankingsPage() {
  const { profile } = useSession();
  const [view, setView] = useState<RankingView>(() => loadJson(VIEW_KEY, DEFAULT_VIEW));
  const pool: RatingPool = view.mode === 'royale' ? royalePool(view.royale) : view.mode;
  const [top, setTop] = useState<UserProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const { friendIds } = useFriends(profile.uid);
  const friendProfiles = useUsers(friendIds);
  const myStats = statsOf(profile, pool);
  useEffect(() => saveJson(VIEW_KEY, view), [view]);

  useEffect(() => {
    let cancelled = false;
    setTop(null);
    setError(null);
    getTopByMode(pool)
      .then((rows) => !cancelled && setTop(rows))
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    if (myStats.played > 0) {
      getModePosition(pool, myStats.rating)
        .then((value) => !cancelled && setPosition(value))
        .catch((err: unknown) => console.error('[ranking] posición', err));
    } else setPosition(null);
    return () => {
      cancelled = true;
    };
  }, [pool, myStats.rating, myStats.played]);

  const friendsRows = useMemo(
    () =>
      [profile, ...friendProfiles.values()]
        .filter((user) => statsOf(user, pool).played > 0 || user.uid === profile.uid)
        .sort((a, b) => statsOf(b, pool).rating - statsOf(a, pool).rating),
    [profile, friendProfiles, pool],
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
      {view.mode === 'royale' && (
        <div role="tablist" aria-label="Tiempo de Royale" className="mb-3 grid grid-cols-3 border border-line">
          {ROYALE_CATEGORIES.map((category) => (
            <button
              key={category}
              role="tab"
              aria-selected={view.royale === category}
              onClick={() => setView((v) => ({ ...v, royale: category }))}
              className={cx('seg-tab py-1.5 text-sm font-semibold', view.royale === category ? 'bg-ink text-paper' : 'hover:bg-paper-2')}
            >
              {ROYALE_CATEGORY_LABELS[category].title}
              <span className="ml-1.5 font-mono text-xs font-normal opacity-70">{ROYALE_CATEGORY_LABELS[category].range}</span>
            </button>
          ))}
        </div>
      )}
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
        <EmptyState title={`Nadie jugó ${poolTitle(pool)} todavía`}>Las partidas de 2 o más jugadores suman al ranking.</EmptyState>
      ) : (
        <RankingTable rows={rows} meId={profile.uid} pool={pool} />
      )}
    </>
  );
}
