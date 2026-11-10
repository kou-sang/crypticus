// Antes de la partida: explicación breve (salteable), presentación de los jefes y de los personajes.
import { memo, useState } from 'react';
import { LEVELS } from '../../../shared/coop/balance';
import { BOSSES } from '../../../shared/coop/catalog/bosses';
import { CHARACTERS } from '../../../shared/coop/catalog/characters';
import type { CoopClientAction, CoopReply, CoopView } from '../../../shared/coop/protocol';
import { Button } from '../../components/ui';
import { cx } from '../../lib/utils';
import { BossSilhouette, CharacterSilhouette } from './silhouettes';

const CATEGORY = ['Easy', 'Medium', 'Difficult', 'Expert', 'Nightmare'] as const;
const LEVEL_CATEGORY_INDEX = { easy: 0, medium: 1, difficult: 2, expert: 3, nightmare: 4 } as const;

type Step = 'rules' | 'bosses' | 'party';
const STEPS: Array<[Step, string]> = [
  ['rules', 'Cómo se juega'],
  ['bosses', 'Jefes'],
  ['party', 'Personajes'],
];

export const Briefing = memo(function Briefing({
  view,
  meId,
  now,
  act,
}: {
  view: CoopView;
  meId: string;
  now: number;
  act: (action: CoopClientAction) => Promise<CoopReply>;
}) {
  const [step, setStep] = useState<Step>('rules');
  const briefing = view.briefing!;
  const ready = briefing.ready.includes(meId);
  const left = Math.max(0, Math.ceil((briefing.endsAt - now) / 1000));
  const level = LEVELS[view.level];

  const markReady = () => {
    // Pantalla completa: se pide con el gesto del jugador (los navegadores lo exigen).
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    void act({ kind: 'ready' });
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted">COOP · Nivel {view.level}</p>
          <h1 className="font-display text-4xl">{view.title}</h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm">Empieza en {left} s</p>
          <p className="text-xs text-muted">
            Listos {briefing.ready.length}/{view.players.length}
          </p>
        </div>
      </header>

      <nav role="tablist" className="flex border border-ink">
        {STEPS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={step === id}
            onClick={() => setStep(id)}
            className={cx('seg-tab flex-1 py-2 text-sm font-semibold', step === id ? 'bg-ink text-paper' : 'hover:bg-paper-2')}
          >
            {label}
          </button>
        ))}
      </nav>

      <div key={step} className="coop-enter min-h-0 flex-1">
        {step === 'rules' && (
          <div className="space-y-3 text-base leading-relaxed">
            <p>
              Derroten a los {view.bosses.length} jefes en {level.totalMs / 60_000} minutos. Si se acaba el tiempo o caen todos, pierden.
            </p>
            <ul className="list-disc space-y-1.5 pl-6">
              <li>
                <strong>Ronda normal:</strong> cada uno recibe 2 cripticos. Si los resuelves a tiempo, atacas al jefe y ganas oro; si no, el jefe
                te golpea. Equivocarse solo cuesta 2 s de espera.
              </li>
              <li>
                <strong>Ronda difícil (grupal):</strong> todos reciben un criptico difícil. Si todos lo resuelven, todos atacan y se abre la
                tienda; si alguno falla, el jefe golpea a todos.
              </li>
              <li>
                <strong>Tienda:</strong> oro e inventario individuales, 4 casillas, 45 s.
              </li>
              <li>
                <strong>Personajes:</strong> cada uno tiene una pasiva y una activa. Las activas no se usan mientras se resuelven los ataques.
              </li>
              <li>
                <strong>Caídos:</strong> siguen jugando con un criptico por ronda que cura 20 al aliado con menos vida.
              </li>
            </ul>
            <p className="text-sm text-muted">Haz clic en cualquier jugador del círculo para ver su vida, oro, objetos y habilidades.</p>
          </div>
        )}
        {step === 'bosses' && (
          <ol className="grid gap-3 md:grid-cols-2">
            {view.bosses.map((id, index) => (
              <li key={id} className="flex gap-3 border border-ink p-3">
                <span className="coop-halo shrink-0 self-start">
                  <BossSilhouette id={id} className="size-20" />
                </span>
                <div className="space-y-1 text-sm">
                  <p className="font-display text-xl">
                    {index + 1}. {BOSSES[id].name}{' '}
                    <span className="text-xs uppercase tracking-widest text-muted">
                      {CATEGORY[LEVEL_CATEGORY_INDEX[level.categories[index]!]]}
                    </span>
                  </p>
                  <p className="text-muted">{BOSSES[id].story}</p>
                  <ul className="list-disc pl-5">
                    {BOSSES[id].abilities.map((ability) => (
                      <li key={ability}>{ability}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        )}
        {step === 'party' && (
          <ul className="grid gap-3 md:grid-cols-2">
            {view.players.map((player) => (
              <li key={player.uid} className="flex gap-3 border border-ink p-3 text-sm">
                <span className="coop-halo shrink-0 self-start">
                  <CharacterSilhouette id={player.character} className="size-14" />
                </span>
                <div className="space-y-1">
                  <p>
                    <span className="font-display text-lg">{CHARACTERS[player.character].name}</span>{' '}
                    <span className={player.uid === meId ? 'font-bold text-accent' : 'text-muted'}>{player.name}</span>
                  </p>
                  <p>
                    <strong>Pasiva:</strong> {CHARACTERS[player.character].passive}
                  </p>
                  <p>
                    <strong>Activa:</strong> {CHARACTERS[player.character].active}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-3">
        {step !== 'party' && (
          <Button variant="secondary" onClick={() => setStep(step === 'rules' ? 'bosses' : 'party')}>
            Siguiente
          </Button>
        )}
        <Button disabled={ready} onClick={markReady}>
          {ready ? 'Listo · esperando al resto' : 'Saltar y estar listo'}
        </Button>
      </footer>
    </div>
  );
});
