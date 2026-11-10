// Arena COOP (boceto): el jefe al centro de una elipse y los jugadores alrededor, en el mismo orden para todos.
// Sin figuras durante la partida (solo en la selección): tarjetas de texto con vida y estados.
import { memo } from 'react';
import { BOSSES, SUMMONS } from '../../../shared/coop/catalog/bosses';
import { CHARACTERS } from '../../../shared/coop/catalog/characters';
import type { BossState, CoopState, PlayerState } from '../../../shared/coop/state';
import { maxHp } from '../../../shared/coop/stats';
import { cx } from '../../lib/utils';
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

/** Barra de vida con el número legible encima (contorno del color del papel, sin mezclas de color). */
export function HpBar({ hp, max, tone = 'ok', className }: { hp: number; max: number; tone?: 'ok' | 'accent'; className?: string }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.max(0, hp)}
      aria-label="Vida"
      className={cx('relative h-4 w-full overflow-hidden border border-ink bg-paper-2', className)}
    >
      <div
        className={cx('h-full transition-[width] duration-500 ease-out', tone === 'ok' ? (ratio < 0.25 ? 'bg-accent' : 'bg-ok') : 'bg-accent')}
        style={{ width: `${ratio * 100}%` }}
      />
      <span
        className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold leading-none text-ink"
        style={{ textShadow: '0 0 2px var(--paper), 0 0 2px var(--paper), 0 0 3px var(--paper)' }}
      >
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

/** Estados con nombre (antes eran emojis): quemadura de LEVIATHAN, soldado de GEDEON, inhibición de JEZABEL. */
function StatusChips({ player, state }: { player: PlayerState; state: CoopState }) {
  const chips: Array<{ key: string; text: string; title: string }> = [];
  if (player.soldierHp > 0) chips.push({ key: 'soldier', text: `Soldado ${player.soldierHp}`, title: 'Soldado de GEDEON: recibe el daño primero' });
  if (player.burns.length > 0)
    chips.push({ key: 'burn', text: `Quemado ×${player.burns.length}`, title: 'Quemadura de LEVIATHAN: pierde vida al final de cada ronda' });
  if (player.inhibitedRound === state.roundNumber) chips.push({ key: 'inhibit', text: 'Inhibido', title: 'JEZABEL: esta ronda no resuelve' });
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap justify-center gap-1">
      {chips.map((chip) => (
        <span key={chip.key} title={chip.title} className="border border-accent px-1 text-[10px] font-semibold uppercase leading-4 tracking-wide text-accent">
          {chip.text}
        </span>
      ))}
    </span>
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
  const left = 50 + 41 * Math.cos(angle);
  const top = 50 + 36 * Math.sin(angle);
  const hpMax = maxHp(state, player);
  const down = player.status !== 'alive';
  return (
    <div className="absolute w-44 -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
      <Floaters items={floaters} />
      <button
        key={`h${hit}-${heal}`}
        type="button"
        onClick={() => onSelect(player.id)}
        className={cx(
          'flex w-full flex-col gap-1 border-2 bg-paper px-2 py-1.5 text-left hover:bg-paper-2',
          isMe ? 'border-accent' : 'border-ink',
          down && 'opacity-55',
          hit > 0 && 'coop-shake',
          heal > 0 && 'coop-heal-glow',
        )}
        aria-label={`${player.name}, ${CHARACTERS[player.character].name}: ${player.status === 'alive' ? `${player.hp} de vida` : 'fuera de combate'}`}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-display text-sm font-semibold uppercase leading-tight">{CHARACTERS[player.character].name}</span>
          {down && (
            <span className="shrink-0 text-[10px] font-semibold uppercase text-accent">{player.status === 'dead' ? 'Caído' : 'Salió'}</span>
          )}
        </span>
        <span className={cx('truncate text-xs leading-tight', isMe ? 'font-bold text-accent' : 'text-muted')}>{player.name}</span>
        <HpBar hp={player.hp} max={hpMax} />
        <StatusChips player={player} state={state} />
      </button>
    </div>
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
    <div className="relative h-full min-h-[17rem] w-full">
      {/* Elipse del boceto. */}
      <div aria-hidden className="absolute inset-x-[9%] inset-y-[14%] rounded-[50%] border-2 border-ink/40" />
      {boss && (
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-4">
          <div className="relative">
            <Floaters items={at('boss')} />
            <div
              key={`b${hits.boss ?? 0}-${heals.boss ?? 0}`}
              className={cx(
                'flex w-72 flex-col items-center gap-1 border-2 border-ink bg-paper px-4 py-3 text-center',
                (hits.boss ?? 0) > 0 && 'coop-shake',
                (heals.boss ?? 0) > 0 && 'coop-heal-glow',
                boss.hp <= 0 && 'opacity-40',
              )}
            >
              <p className="font-display text-2xl font-semibold uppercase leading-none">{BOSSES[boss.id].name}</p>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                {CATEGORY_LABELS[boss.category]}
                {BOSSES[boss.id].tag ? ` · ${BOSSES[boss.id].tag}` : ''}
              </p>
              <HpBar hp={boss.hp} max={boss.maxHp} tone="accent" className="mt-1 h-5" />
            </div>
          </div>
          {rex && (
            <div className="relative">
              <Floaters items={at('rex')} />
              <div
                key={`r${hits.rex ?? 0}`}
                className={cx('flex w-44 flex-col items-center gap-1 border-2 border-ink bg-paper px-3 py-2 text-center', (hits.rex ?? 0) > 0 && 'coop-shake')}
              >
                <p className="font-display text-sm font-semibold uppercase leading-tight">{SUMMONS.rexAssuerus.name}</p>
                <HpBar hp={rex.hp} max={rex.maxHp} tone="accent" />
              </div>
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
