// Arena COOP (boceto): el jefe al centro de una elipse y los jugadores alrededor, en el mismo orden para todos.
import { memo } from 'react';
import { BOSSES, SUMMONS } from '../../../shared/coop/catalog/bosses';
import { CHARACTERS } from '../../../shared/coop/catalog/characters';
import type { BossState, CoopState, PlayerState } from '../../../shared/coop/state';
import { maxHp } from '../../../shared/coop/stats';
import { cx } from '../../lib/utils';
import { BossSilhouette, CharacterSilhouette } from './silhouettes';
import type { Floater, FxTarget } from './useCoopFx';

const CATEGORY_LABELS: Record<BossState['category'], string> = {
  easy: 'Easy',
  medium: 'Medium',
  difficult: 'Difficult',
  expert: 'Expert',
  nightmare: 'Nightmare',
};

/** Ángulo de cada asiento (grados, 0 = derecha, sentido horario en pantalla), como en el boceto. */
const SEAT_ANGLES = [90, 270, 0, 180, 315, 45, 225, 135];

export function HpBar({ hp, max, tone = 'ok', className }: { hp: number; max: number; tone?: 'ok' | 'accent'; className?: string }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.max(0, hp)}
      aria-label="Vida"
      className={cx('relative h-3 w-full overflow-hidden border border-ink bg-paper', className)}
    >
      <div
        className={cx('h-full transition-[width] duration-500 ease-out', tone === 'ok' ? (ratio < 0.25 ? 'bg-accent' : 'bg-ok') : 'bg-accent')}
        style={{ width: `${ratio * 100}%` }}
      />
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-semibold leading-none text-ink mix-blend-difference">
        {Math.max(0, Math.round(hp))}/{max}
      </span>
    </div>
  );
}

function Floaters({ items }: { items: Floater[] }) {
  return (
    <>
      {items.map((floater) => (
        <span
          key={floater.id}
          className={cx(
            'coop-float absolute left-1/2 top-0 z-10 whitespace-nowrap font-mono font-bold',
            floater.tone === 'damage' && 'text-accent',
            floater.tone === 'heal' && 'text-ok',
            floater.tone === 'gold' && 'text-ink',
            floater.tone === 'miss' && 'text-muted',
          )}
          style={{ fontSize: floater.size }}
        >
          {floater.text}
        </span>
      ))}
    </>
  );
}

const Seat = memo(function Seat({
  player,
  state,
  isMe,
  floaters,
  hit,
  heal,
  onSelect,
}: {
  player: PlayerState;
  state: CoopState;
  isMe: boolean;
  floaters: Floater[];
  hit: number;
  heal: number;
  onSelect: (id: string) => void;
}) {
  const angle = ((SEAT_ANGLES[player.seat] ?? 0) * Math.PI) / 180;
  const left = 50 + 44 * Math.cos(angle);
  const top = 50 + 40 * Math.sin(angle);
  const below = Math.sin(angle) > 0.3; // Mitad de abajo: la barra va debajo del nombre (como en el boceto).
  const hpMax = maxHp(state, player);
  const down = player.status !== 'alive';
  const bar = <HpBar hp={player.hp} max={hpMax} className="w-28" />;
  return (
    <button
      type="button"
      onClick={() => onSelect(player.id)}
      className={cx('coop-enter absolute flex w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 text-center', down && 'opacity-50 grayscale')}
      style={{ left: `${left}%`, top: `${top}%` }}
      aria-label={`${player.name}, ${CHARACTERS[player.character].name}: ${player.status === 'alive' ? `${player.hp} de vida` : 'fuera de combate'}`}
    >
      <Floaters items={floaters} />
      {!below && bar}
      <span key={`h${hit}-${heal}`} className={cx('coop-halo flex size-12 items-center justify-center', hit > 0 && 'coop-shake', heal > 0 && 'coop-heal-glow')}>
        <CharacterSilhouette id={player.character} className="size-10" />
      </span>
      <span className="font-display text-base font-semibold uppercase leading-tight">{CHARACTERS[player.character].name}</span>
      <span className={cx('text-xs leading-tight', isMe ? 'font-bold text-accent' : 'text-muted')}>
        {player.name}
        {player.status === 'dead' && ' · caído'}
        {player.status === 'left' && ' · salió'}
      </span>
      {below && bar}
      <span className="flex gap-1 text-[10px] text-muted">
        {player.soldierHp > 0 && <span title="Soldado de Gedeon">🛡 {player.soldierHp}</span>}
        {player.burns.length > 0 && <span title="Quemaduras">🔥×{player.burns.length}</span>}
        {player.inhibitedRound === state.roundNumber && <span title="Inhibido por JEZABEL">⛓</span>}
      </span>
    </button>
  );
});

export const Arena = memo(function Arena({
  state,
  meId,
  floaters,
  hits,
  heals,
  onSelect,
}: {
  state: CoopState;
  meId: string;
  floaters: Floater[];
  hits: Record<string, number>;
  heals: Record<string, number>;
  onSelect: (playerId: string) => void;
}) {
  const boss = state.bosses[state.bossIndex];
  const rex = boss?.haman.rex ?? null;
  const at = (target: FxTarget) => floaters.filter((f) => f.target === target);
  return (
    <div className="relative h-full min-h-[18rem] w-full">
      {/* Elipse del boceto. */}
      <div aria-hidden className="absolute inset-x-[12%] inset-y-[14%] rounded-[50%] border-2 border-ink/60" />
      {boss && (
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-end gap-6">
          <div className="relative flex flex-col items-center">
            <Floaters items={at('boss')} />
            <span key={`b${hits.boss ?? 0}-${heals.boss ?? 0}`} className={cx('coop-halo block', (hits.boss ?? 0) > 0 && 'coop-shake', (heals.boss ?? 0) > 0 && 'coop-heal-glow')}>
              <BossSilhouette id={boss.id} title={BOSSES[boss.id].name} className={cx('size-36 xl:size-44', boss.hp <= 0 && 'opacity-30')} />
            </span>
            <p className="mt-1 font-display text-xl font-semibold uppercase">{BOSSES[boss.id].name}</p>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              {CATEGORY_LABELS[boss.category]}
              {BOSSES[boss.id].tag ? ` · ${BOSSES[boss.id].tag}` : ''}
            </p>
            <HpBar hp={boss.hp} max={boss.maxHp} tone="accent" className="mt-1 h-4 w-56" />
          </div>
          {rex && (
            <div className="relative flex flex-col items-center">
              <Floaters items={at('rex')} />
              <span key={`r${hits.rex ?? 0}`} className={cx('coop-halo block', (hits.rex ?? 0) > 0 && 'coop-shake')}>
                <BossSilhouette id="rexAssuerus" title={SUMMONS.rexAssuerus.name} className="size-24" />
              </span>
              <p className="font-display text-sm font-semibold uppercase">{SUMMONS.rexAssuerus.name}</p>
              <HpBar hp={rex.hp} max={rex.maxHp} tone="accent" className="w-36" />
            </div>
          )}
        </div>
      )}
      {state.players.map((player) => (
        <Seat
          key={player.id}
          player={player}
          state={state}
          isMe={player.id === meId}
          floaters={at(player.id)}
          hit={hits[player.id] ?? 0}
          heal={heals[player.id] ?? 0}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
});
