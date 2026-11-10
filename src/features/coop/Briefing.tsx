// Pantalla de carga (estilo LoL): tarjetas de la party con su estado, y mientras tanto la explicación
// (salteable), los jefes y los personajes. Empieza cuando todos están listos o vence el tiempo.
import { memo, useEffect, useState } from 'react';
import { LEVELS, STAGE_FACTOR, coopLevelLabel } from '../../../shared/coop/balance';
import { BOSSES } from '../../../shared/coop/catalog/bosses';
import { CHARACTERS } from '../../../shared/coop/catalog/characters';
import type { CoopClientAction, CoopReply, CoopView } from '../../../shared/coop/protocol';
import { Button } from '../../components/ui';
import { cx } from '../../lib/utils';

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
  // Carga de recursos (fuentes del tema y sonido) antes de habilitar «Listo».
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const fonts = document.fonts?.ready ?? Promise.resolve();
    const minimum = new Promise((resolve) => window.setTimeout(resolve, 1_200));
    void Promise.all([fonts, minimum]).finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);
  const briefing = view.briefing!;
  const ready = briefing.ready.includes(meId);
  const left = Math.max(0, Math.ceil((briefing.endsAt - now) / 1000));
  const level = LEVELS[view.level];

  // La pantalla completa la pide CoopLive con el gesto del jugador.
  const markReady = () => void act({ kind: 'ready' });

  // Solo el contenido de la pestaña se desplaza: título, party y botones quedan siempre a la vista.
  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 px-6 pb-4 pt-2">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted">COOP · Nivel {coopLevelLabel(view.level, view.stage)}</p>
          <h1 className="truncate font-display text-3xl">{view.title}</h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm">Empieza en {left} s</p>
          <p className="text-xs text-muted">
            Listos {briefing.ready.length}/{view.players.length}
          </p>
        </div>
      </header>

      {/* Tarjetas de carga de la party. */}
      <ul className="grid shrink-0 grid-cols-4 gap-2 xl:grid-cols-8">
        {view.players.map((player) => {
          const isReady = briefing.ready.includes(player.uid);
          return (
            <li key={player.uid} className={cx('coop-enter flex min-w-0 flex-col items-center gap-0.5 border-2 px-2 py-1.5 text-center', isReady ? 'border-ink' : 'border-line')}>
              <span className="max-w-full truncate font-display text-base uppercase leading-tight">{player.character ? CHARACTERS[player.character].name : ''}</span>
              <span className={cx('max-w-full truncate text-xs', player.uid === meId ? 'font-bold text-accent' : 'text-muted')}>{player.name}</span>
              <span className={cx('text-[10px] font-semibold uppercase tracking-widest', isReady ? 'text-ok' : 'text-muted')}>
                {isReady ? 'Listo' : player.uid === meId && !loaded ? 'Cargando…' : 'Leyendo'}
              </span>
            </li>
          );
        })}
      </ul>

      <nav role="tablist" className="flex shrink-0 border border-ink">
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

      <div key={step} className="coop-enter min-h-0 flex-1 overflow-y-auto pr-1">
        {step === 'rules' && (
          <div className="space-y-3 text-base leading-relaxed">
            <p>
              Derroten a los {view.bosses.length} jefes en {level.totalMs / 60_000} minutos. Si se acaba el tiempo o caen todos, pierden.
              {view.stage !== 2 &&
                ` En ${coopLevelLabel(view.level, view.stage)} los jefes tienen ${view.stage === 1 ? '1/3 menos' : '1/3 más'} de vida y daño base (×${STAGE_FACTOR[view.stage].toFixed(2).replace('.', ',')}).`}
            </p>
            <ul className="list-disc space-y-1.5 pl-6">
              <li>
                <strong>Ronda normal:</strong> cada uno recibe 2 cripticos. Al resolverlos atacas al jefe en el momento, y al cerrar la ronda
                ganas oro; si no llegas, el jefe te golpea. Equivocarse solo cuesta 2 s de espera.
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
              <li key={id} className="border border-ink p-3">
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
            {view.players.flatMap((player) => (player.character ? [{ ...player, character: player.character }] : [])).map((player) => (
              <li key={player.uid} className="border border-ink p-3 text-sm">
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

      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-line pt-3">
        {step !== 'party' && (
          <Button variant="secondary" onClick={() => setStep(step === 'rules' ? 'bosses' : 'party')}>
            Siguiente
          </Button>
        )}
        <Button disabled={ready || !loaded} onClick={markReady}>
          {ready ? 'Listo · esperando al resto' : loaded ? 'Saltar y estar listo' : 'Cargando…'}
        </Button>
      </footer>
    </div>
  );
});
