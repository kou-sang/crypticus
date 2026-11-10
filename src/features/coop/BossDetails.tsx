// Detalle del jefe (clic en su tarjeta): habilidades, efectos en curso y, en PHARAONIS, el avance de las plagas.
import { memo } from 'react';
import { BOSSES } from '../../../shared/coop/catalog/bosses';
import { PHARAONIS_EFFECT_INFO, bossEffects, pharaonisPlagues, type PlagueStatus } from '../../../shared/coop/effects';
import type { CoopState } from '../../../shared/coop/state';
import { Modal } from '../../components/Modal';
import { cx } from '../../lib/utils';
import { HpBar, effectChipClass } from './Arena';

const PLAGUE_STATUS: Record<PlagueStatus, string> = {
  active: 'Activada',
  pending: 'Al cerrar la ronda',
  upcoming: 'Pendiente',
};

export const BossDetails = memo(function BossDetails({ state, open, onClose }: { state: CoopState; open: boolean; onClose: () => void }) {
  const boss = state.bosses[state.bossIndex];
  const definition = boss ? BOSSES[boss.id] : null;
  const effects = boss ? bossEffects(state, boss) : [];
  return (
    <Modal open={open && Boolean(boss)} onClose={onClose} title={definition?.name ?? ''}>
      {boss && definition && (
        <div className="space-y-4 text-sm">
          <HpBar hp={boss.hp} max={boss.maxHp} tone="accent" className="h-4" />
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Efectos en curso</p>
            {effects.length === 0 ? (
              <p className="text-muted">Ninguno por ahora.</p>
            ) : (
              <ul className="space-y-1">
                {effects.map((effect) => (
                  <li key={effect.key} className="flex items-baseline gap-2">
                    <span className={cx('shrink-0', effectChipClass(effect.tone))}>{effect.label}</span>
                    <span className="text-xs">{effect.detail}.</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {boss.id === 'pharaonis' && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Plagas (una cada 12 % de vida perdida)</p>
              <ol className="space-y-1">
                {pharaonisPlagues(state, boss).map((plague, index) => {
                  const info = PHARAONIS_EFFECT_INFO[plague.effect];
                  return (
                    <li key={plague.effect} className={cx('grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-2', plague.status === 'upcoming' && 'text-muted')}>
                      <span className="font-mono text-xs tabular-nums">{Math.round(plague.atShare * 100)} %</span>
                      <span>
                        <strong>
                          {index + 1}. {info.name}
                        </strong>{' '}
                        <span className="text-xs">— {info.detail}.</span>
                      </span>
                      <span
                        className={cx(
                          'text-[10px] font-semibold uppercase',
                          plague.status === 'active' && 'text-accent',
                          plague.status === 'pending' && 'text-accent',
                        )}
                      >
                        {PLAGUE_STATUS[plague.status]}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Habilidades</p>
            <ul className="list-disc space-y-1 pl-5">
              {definition.abilities.map((ability) => (
                <li key={ability}>{ability}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
});
