// Jefe: figura animada, barra de vida y números flotantes de daño/curación.
import { useEffect, useRef, useState } from 'react';
import { BOSS_LABELS } from '../../../shared/scoring';
import type { BossLevel } from '../../../shared/types';
import { playCue } from '../../lib/sound';
import { cx } from '../../lib/utils';
import { BOSS_NAMES, BossFigure } from './BossFigure';

interface Floater {
  id: number;
  value: number; // negativo = daño, positivo = curación
}

export function BossBar({ hp, maxHp, level }: { hp: number; maxHp: number; level: BossLevel }) {
  const ratio = maxHp > 0 ? hp / maxHp : 0;
  const previous = useRef(hp);
  const [effect, setEffect] = useState<'hit' | 'heal' | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);

  useEffect(() => {
    const delta = hp - previous.current;
    previous.current = hp;
    if (delta === 0) return;
    const kind = delta < 0 ? 'hit' : 'heal';
    setEffect(kind);
    playCue(kind);
    const id = Date.now() + Math.random();
    setFloaters((prev) => [...prev, { id, value: delta }].slice(-5));
    const clearEffect = window.setTimeout(() => setEffect(null), 700);
    const clearFloater = window.setTimeout(() => setFloaters((prev) => prev.filter((f) => f.id !== id)), 1200);
    return () => {
      window.clearTimeout(clearEffect);
      window.clearTimeout(clearFloater);
    };
  }, [hp]);

  return (
    <section aria-label="Jefe" className="flex items-center gap-4 border-2 border-ink p-3">
      <div className="relative size-24 shrink-0 sm:size-28">
        <div className={cx('size-full', effect === 'hit' ? 'boss-hit' : effect === 'heal' ? 'boss-heal' : 'boss-idle')}>
          <BossFigure level={level} hurt={effect === 'hit' || ratio < 0.25} />
        </div>
        {floaters.map((f) => (
          <span
            key={f.id}
            className={cx('float-up absolute left-1/2 top-2 font-mono text-lg font-bold', f.value < 0 ? 'text-accent' : 'text-ok')}
          >
            {f.value > 0 ? `+${f.value}` : f.value}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="truncate font-display text-xl">
            {BOSS_NAMES[level]} <span className="text-sm text-muted">· {BOSS_LABELS[level]}</span>
          </p>
          <p className="font-mono text-sm tabular-nums">
            {hp} / {maxHp}
          </p>
        </div>
        <div className="h-4 border border-ink bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={maxHp} aria-valuenow={hp}>
          <div
            className={cx('h-full transition-[width] duration-500', ratio > 0.5 ? 'bg-accent' : ratio > 0.2 ? 'bg-ink' : 'bg-ok')}
            style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted">Más daño cuanto antes resuelvan. Cada fallo lo cura.</p>
      </div>
    </section>
  );
}
