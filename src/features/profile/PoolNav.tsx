// Selector de modo del perfil, al estilo Lichess: columna a la izquierda en PC y fila deslizable en móvil.
// Royale se abre en sus categorías de tiempo; COOP aparece deshabilitado hasta tener su panel (PR 4 de COOP).
import { memo } from 'react';
import { GAME_LABELS } from '../../../shared/scoring';
import { ROYALE_CATEGORIES, ROYALE_CATEGORY_LABELS, type RatingPool } from '../../../shared/ratingPools';
import type { UserProfile } from '../../../shared/types';
import { MODE_GLYPH, royalePool, statsOf } from '../../lib/pools';
import { cx } from '../../lib/utils';

interface Item {
  pool: RatingPool;
  glyph: string;
  title: string;
  kicker?: string; // Solo móvil: «Royale» sobre la categoría.
  hint?: string;
  nested?: boolean;
}

const ITEMS: Item[] = [
  { pool: 'race', glyph: MODE_GLYPH.race, title: GAME_LABELS.race.title },
  ...ROYALE_CATEGORIES.map<Item>((category) => ({
    pool: royalePool(category),
    glyph: MODE_GLYPH.royale,
    title: ROYALE_CATEGORY_LABELS[category].title,
    kicker: GAME_LABELS.royale.title,
    hint: ROYALE_CATEGORY_LABELS[category].range,
    nested: true,
  })),
  { pool: 'duel', glyph: MODE_GLYPH.duel, title: GAME_LABELS.duel.title },
];

function PoolButton({ item, user, active, onSelect }: { item: Item; user: UserProfile; active: boolean; onSelect: (pool: RatingPool) => void }) {
  const stats = statsOf(user, item.pool);
  const played = stats.played > 0;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(item.pool)}
      className={cx(
        'seg-tab flex w-full shrink-0 items-center gap-3 border px-3 py-2 text-left transition-colors lg:border-0 lg:border-l-4',
        item.nested && 'lg:pl-7',
        active ? 'border-ink bg-ink text-paper lg:border-accent' : 'border-line hover:bg-paper-2 lg:border-transparent',
      )}
    >
      <span aria-hidden className="w-5 text-center text-lg">
        {item.glyph}
      </span>
      <span className="min-w-0">
        <span className="block whitespace-nowrap text-[11px] font-semibold uppercase tracking-widest">
          {item.kicker && <span className="opacity-70 lg:hidden">{item.kicker} · </span>}
          {item.title}
          {item.hint && <span className="ml-1.5 hidden font-mono font-normal normal-case tracking-normal opacity-70 lg:inline">{item.hint}</span>}
        </span>
        <span className="block whitespace-nowrap font-mono text-sm">
          <strong className={cx(!played && 'opacity-60')}>{played ? stats.rating : '—'}</strong>
          <span className="opacity-70">
            {' '}
            · {stats.played} {stats.played === 1 ? 'partida' : 'partidas'}
          </span>
        </span>
      </span>
    </button>
  );
}

export const PoolNav = memo(function PoolNav({
  user,
  selected,
  onSelect,
}: {
  user: UserProfile;
  selected: RatingPool;
  onSelect: (pool: RatingPool) => void;
}) {
  return (
    <nav aria-label="Modos de juego" className="min-w-0">
      <div role="tablist" aria-orientation="vertical" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-2 lg:border-ink lg:p-0">
        {ITEMS.map((item, index) => (
          <div key={item.pool} className="contents">
            {item.nested && !ITEMS[index - 1]?.nested && (
              <p className="hidden items-center gap-3 border-t border-line px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted lg:flex">
                <span aria-hidden className="w-5 text-center text-lg">
                  {MODE_GLYPH.royale}
                </span>
                {GAME_LABELS.royale.title}
              </p>
            )}
            <PoolButton item={item} user={user} active={item.pool === selected} onSelect={onSelect} />
          </div>
        ))}
        <p
          aria-disabled
          className="flex shrink-0 items-center gap-3 border border-dashed border-line px-3 py-2 text-muted lg:border-0 lg:border-t lg:border-solid"
        >
          <span aria-hidden className="w-5 text-center text-lg">
            ♛
          </span>
          <span>
            <span className="block whitespace-nowrap text-[11px] font-semibold uppercase tracking-widest">{GAME_LABELS.coop.title}</span>
            <span className="block text-xs">Pronto</span>
          </span>
        </p>
      </div>
    </nav>
  );
});
