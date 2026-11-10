// Arena COOP (boceto): el jefe al centro de una elipse y los jugadores alrededor, en el mismo orden para todos.
// Sin figuras durante la partida (solo en la selección): tarjetas de texto con vida y estados.
import { memo } from 'react';
import { BOSSES, SUMMONS } from '../../../shared/coop/catalog/bosses';
import { CHARACTERS } from '../../../shared/coop/catalog/characters';
import type { BossState, CoopState, PlayerState } from '../../../shared/coop/state';
import { bossEffects, statusEffects, type StatusEffect } from '../../../shared/coop/effects';
import { maxHp } from '../../../shared/coop/stats';
import { cx } from '../../lib/utils';
import type { Floater, FxTarget, Pulse } from './useCoopFx';

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

/** Clase del chip según el tono: perjudicial en rojo, beneficio en verde, aviso neutro en gris. */
export function effectChipClass(tone: StatusEffect['tone']): string {
  return cx(
    'border px-1 text-[10px] font-semibold uppercase leading-4 tracking-wide',
    tone === 'bad' ? 'border-accent text-accent' : tone === 'good' ? 'border-ok text-ok' : 'border-line text-muted',
  );
}

/** Chips de efectos de estado de un jugador. El detalle va en el `title`. */
export function StatusChips({
  player,
  state,
  gt,
  className,
}: {
  player: PlayerState;
  state: CoopState;
  gt: number;
  className?: string;
}) {
  return <EffectChips effects={statusEffects(state, player, gt)} className={className} />;
}

export function EffectChips({ effects, className }: { effects: StatusEffect[]; className?: string }) {
  if (effects.length === 0) return null;
  return (
    <span className={cx('flex flex-wrap gap-1', className)}>
      {effects.map((effect) => (
        <span key={effect.key} title={effect.detail} className={effectChipClass(effect.tone)}>
          {effect.label}
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
  pulse,
  gt,
  onSelect,
}: {
  player: PlayerState;
  state: CoopState;
  gt: number;
  isMe: boolean;
  floaters: Floater[];
  pulse: Pulse | undefined;
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
        key={`p${pulse?.n ?? 0}`}
        type="button"
        onClick={() => onSelect(player.id)}
        className={cx(
          'flex w-full flex-col gap-1 border-2 bg-paper px-2 py-1.5 text-left hover:bg-paper-2',
          isMe ? 'border-accent' : 'border-ink',
          down && 'opacity-55',
          pulse?.kind === 'hit' && 'coop-shake',
          pulse?.kind === 'heal' && 'coop-heal-glow',
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
        <StatusChips player={player} state={state} gt={gt} className="justify-center" />
      </button>
    </div>
  );
});

export const Arena = memo(function Arena({
  state,
  meId,
  floaters,
  pulses,
  gt,
  onSelect,
  onSelectBoss,
}: {
  state: CoopState;
  meId: string;
  /** Abre el detalle del jefe (habilidades y efectos en curso). */
  onSelectBoss: () => void;
  /** Tiempo de partida redondeado al segundo (así la arena no se repinta en cada refresco del reloj). */
  gt: number;
  floaters: Floater[];
  pulses: Record<string, Pulse>;
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
            <button
              type="button"
              key={`b${pulses.boss?.n ?? 0}`}
              onClick={onSelectBoss}
              title="Ver habilidades y efectos del jefe"
              aria-label={`${BOSSES[boss.id].name}: ver habilidades y efectos`}
              className={cx(
                'flex w-72 flex-col items-center gap-1 border-2 border-ink bg-paper px-4 py-3 text-center hover:bg-paper-2',
                pulses.boss?.kind === 'hit' && 'coop-shake',
                pulses.boss?.kind === 'heal' && 'coop-heal-glow',
                boss.hp <= 0 && 'opacity-40',
              )}
            >
              <span className="block font-display text-2xl font-semibold uppercase leading-none">{BOSSES[boss.id].name}</span>
              <span className="block text-[11px] font-semibold uppercase tracking-widest text-muted">
                {CATEGORY_LABELS[boss.category]}
                {BOSSES[boss.id].tag ? ` · ${BOSSES[boss.id].tag}` : ''}
              </span>
              <HpBar hp={boss.hp} max={boss.maxHp} tone="accent" className="mt-1 h-5" />
              <EffectChips effects={bossEffects(state, boss)} className="justify-center" />
            </button>
          </div>
          {rex && (
            <div className="relative">
              <Floaters items={at('rex')} />
              <div
                key={`r${pulses.rex?.n ?? 0}`}
                className={cx(
                  'flex w-44 flex-col items-center gap-1 border-2 border-ink bg-paper px-3 py-2 text-center',
                  pulses.rex?.kind === 'hit' && 'coop-shake',
                )}
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
          pulse={pulses[player.id]}
          gt={gt}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
});
