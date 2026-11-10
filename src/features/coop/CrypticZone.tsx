// Zona de cripticos (boceto): aquí pasa todo lo que hay que leer. Cripticos de la ronda, votaciones,
// presentación del jefe, avisos de la tienda y el registro de eventos.
import { useEffect, useMemo, useState } from 'react';
import { BOSSES } from '../../../shared/coop/catalog/bosses';
import { gameTime } from '../../../shared/coop/engine';
import { shiftLetter } from '../../../shared/coop/letters';
import type { CoopClientAction, CoopCrypticView, CoopReply } from '../../../shared/coop/protocol';
import type { CoopState, PlayerState } from '../../../shared/coop/state';
import { answerLengthFromEnumeration } from '../../../shared/answer';
import { Button } from '../../components/ui';
import { playCue } from '../../lib/sound';
import { cx, errorMessage } from '../../lib/utils';
import { AnswerGrid } from '../play/AnswerGrid';
import { useCryptics } from '../play/useCryptics';
import { BossSilhouette } from './silhouettes';
import type { LiceStain, LogLine } from './useCoopFx';

const TIER_LABELS: Record<CoopCrypticView['tier'], string> = {
  easy: 'Fácil',
  medium: 'Medio',
  hard: 'Difícil',
  veryHard2: 'Muy difícil · 2 palabras',
  veryHard3: 'Muy difícil · 3 palabras',
};

const secondsLeft = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

function CrypticInput({
  cryptic,
  shift,
  locked,
  act,
  onSolved,
}: {
  cryptic: CoopCrypticView & { clue: string; enumeration: string | null };
  shift: number;
  locked: boolean;
  act: (action: CoopClientAction) => Promise<CoopReply>;
  onSolved: (explanation: string | null) => void;
}) {
  const size = cryptic.enumeration ? answerLengthFromEnumeration(cryptic.enumeration) : 0;
  const [letters, setLetters] = useState<string[]>(() => Array<string>(size).fill(''));
  const [free, setFree] = useState('');
  const [wrong, setWrong] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (guess: string) => {
    if (busy || locked || !guess.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const reply = await act({ kind: 'answer', slot: cryptic.slot, guess });
      if (reply.correct) {
        playCue('success');
        onSolved(reply.explanation ?? null);
      } else {
        playCue('wrong');
        setWrong(true);
        window.setTimeout(() => setWrong(false), 500);
        setError('No es correcto. Espera 2 s para volver a intentar.');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {cryptic.enumeration ? (
        <AnswerGrid
          enumeration={cryptic.enumeration}
          letters={letters}
          onLetters={setLetters}
          onSubmit={() => void submit(letters.join(''))}
          locked={locked}
          celebrate={false}
          wrong={wrong}
          transform={shift ? (letter) => shiftLetter(letter, shift) : undefined}
        />
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(free);
          }}
        >
          <input
            value={free}
            onChange={(event) => {
              const next = event.target.value.toUpperCase();
              // Con desfase solo se transforma lo recién tipeado (lo anterior ya está desfasado).
              setFree((prev) =>
                shift && next.startsWith(prev) ? prev + [...next.slice(prev.length)].map((c) => shiftLetter(c, shift)).join('') : next,
              );
            }}
            disabled={locked}
            autoFocus
            aria-label="Respuesta"
            placeholder="Respuesta (sin casillas)"
            className={cx('flex-1 border border-ink bg-paper px-3 py-2 font-mono uppercase tracking-widest', wrong && 'coop-shake')}
          />
          <Button type="submit" loading={busy} disabled={locked}>
            Enviar
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-accent">{error}</p>}
    </div>
  );
}

function RoundCryptics({
  state,
  me,
  cryptics,
  act,
}: {
  state: CoopState;
  me: PlayerState;
  cryptics: CoopCrypticView[];
  act: (action: CoopClientAction) => Promise<CoopReply>;
}) {
  // Secretos anteriores a COOP no traen el enunciado: se lee de Firestore.
  const missing = useMemo(() => cryptics.filter((c) => !c.clue).map((c) => c.crypticId), [cryptics]);
  const { cryptics: fetched } = useCryptics(missing);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const current = cryptics.find((c) => !c.solved);
  const done = cryptics.filter((c) => c.solved).length;

  useEffect(() => setExplanation(null), [state.roundNumber]);

  if (me.inhibitedRound === state.roundNumber) {
    return <p className="text-sm">JEZABEL te inhibió: esta ronda no resuelves, ni ganas ni pierdes (salvo que la ronda grupal falle).</p>;
  }
  if (cryptics.length === 0) return <p className="text-sm text-muted">Esperando la próxima ronda…</p>;

  const fallback = current && !current.clue ? fetched.get(current.crypticId) : undefined;
  const clue = current ? (current.clue ?? fallback?.clue ?? null) : null;
  const enumeration = current ? (current.enumeration ?? (state.modifiers.hideCells ? null : (fallback?.enumeration ?? null))) : null;

  return (
    <div className="space-y-3">
      {me.status === 'dead' && (
        <p className="text-sm text-muted">Estás fuera de combate: resolver tu criptico cura 20 de vida al aliado con menos vida.</p>
      )}
      <p className="flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
        <span>
          Criptico {Math.min(done + 1, cryptics.length)}/{cryptics.length}
          {current && ` · ${TIER_LABELS[current.tier]}`}
        </span>
        {state.modifiers.shift !== 0 && (
          <span className="text-accent">
            Letras desfasadas {state.modifiers.shift > 0 ? '+' : ''}
            {state.modifiers.shift}
          </span>
        )}
      </p>
      {current && clue ? (
        <div key={current.crypticId} className="coop-enter space-y-3">
          <p className="font-display text-xl leading-snug">
            {clue} {enumeration && <span className="font-mono text-base text-muted">{enumeration}</span>}
          </p>
          {current.hints.map((hint, index) => (
            <p key={hint} className="border-l-2 border-accent pl-2 text-sm">
              Pista {index + 1}: {hint}
            </p>
          ))}
          <CrypticInput
            cryptic={{ ...current, clue, enumeration }}
            shift={state.modifiers.shift}
            locked={state.phase !== 'round'}
            act={act}
            onSolved={setExplanation}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              disabled={me.hints <= 0 || current.hints.length >= 2}
              onClick={() => {
                setHintError(null);
                act({ kind: 'hint' }).catch((err: unknown) => setHintError(errorMessage(err)));
              }}
            >
              Usar pista ({me.hints})
            </Button>
            {hintError && <span className="text-xs text-accent">{hintError}</span>}
          </div>
        </div>
      ) : current ? (
        <p className="text-sm text-muted">Cargando criptico…</p>
      ) : (
        <p className="font-semibold text-ok">✓ Resolviste todo. Esperando al resto…</p>
      )}
      {explanation && <p className="text-xs text-muted">Anterior: {explanation}</p>}
    </div>
  );
}

function Decision({ state, me, act, now }: { state: CoopState; me: PlayerState; act: (a: CoopClientAction) => Promise<CoopReply>; now: number }) {
  const decision = state.decisions[0];
  if (!decision) return null;
  const voted = me.id in decision.votes;
  const left = secondsLeft(decision.endsGt - gameTime(state, now));
  return (
    <div className="coop-enter space-y-3">
      <p className="font-display text-xl">
        {decision.kind === 'groupOffer'
          ? 'PHARAONIS ofrece 300 de oro a cada uno. Si la mayoría acepta, él gana +5 % de daño.'
          : 'PHARAONIS ofrece 300 de oro a quien acepte. Gana +1 % de daño por cada uno que acepta.'}
      </p>
      <p className="text-sm text-muted">
        {decision.kind === 'groupOffer' ? 'Decisión grupal' : 'Decisión individual'} · {left} s · sin respuesta cuenta como rechazo
      </p>
      {me.status === 'alive' ? (
        voted ? (
          <p className="text-sm">Votaste: {decision.votes[me.id] ? 'aceptar' : 'rechazar'}. Esperando al resto…</p>
        ) : (
          <div className="flex gap-2">
            <Button onClick={() => void act({ kind: 'vote', decisionId: decision.id, accept: true })}>Aceptar</Button>
            <Button variant="secondary" onClick={() => void act({ kind: 'vote', decisionId: decision.id, accept: false })}>
              Rechazar
            </Button>
          </div>
        )
      ) : (
        <p className="text-sm text-muted">Solo votan los vivos.</p>
      )}
    </div>
  );
}

export function CrypticZone({
  state,
  me,
  cryptics,
  act,
  now,
  log,
  lice,
  onOpenShop,
}: {
  state: CoopState;
  me: PlayerState | null;
  cryptics: CoopCrypticView[];
  act: (action: CoopClientAction) => Promise<CoopReply>;
  now: number;
  log: LogLine[];
  lice: LiceStain[];
  onOpenShop: () => void;
}) {
  const boss = state.bosses[state.bossIndex];
  const gt = gameTime(state, now);
  return (
    <section aria-label="Zona de cripticos" className="surface relative flex h-full min-h-0 flex-col overflow-hidden border-2 border-ink">
      <header className="flex items-baseline justify-between gap-2 border-b border-ink px-4 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest">Zona criptico</h2>
        {state.phase === 'round' && state.roundEndsGt !== null && (
          <span className={cx('font-mono text-lg font-bold tabular-nums', state.roundEndsGt - gt < 10_000 && 'text-accent')}>
            {secondsLeft(state.roundEndsGt - gt)} s
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {state.phase === 'bossIntro' && boss && (
          <div className="coop-enter flex gap-4">
            <span className="coop-halo shrink-0">
              <BossSilhouette id={boss.id} className="size-20" />
            </span>
            <div>
              <p className="font-display text-2xl">Se acerca {BOSSES[boss.id].name}</p>
              <p className="mt-1 text-sm">{BOSSES[boss.id].story}</p>
            </div>
          </div>
        )}
        {state.phase === 'round' && me && <RoundCryptics state={state} me={me} cryptics={cryptics} act={act} />}
        {state.phase === 'decision' && me && <Decision state={state} me={me} act={act} now={now} />}
        {state.phase === 'shop' && (
          <div className="coop-enter space-y-2">
            <p className="font-display text-xl">Tienda abierta</p>
            <p className="text-sm text-muted">Cierra en {secondsLeft((state.shop?.endsGt ?? gt) - gt)} s.</p>
            {me?.status === 'alive' ? (
              <Button onClick={onOpenShop}>Abrir tienda</Button>
            ) : (
              <p className="text-sm text-muted">Los jugadores caídos no acceden a la tienda.</p>
            )}
          </div>
        )}
        {state.result && <p className="font-display text-3xl">{state.result.won ? '¡Victoria!' : 'Derrota'}</p>}
      </div>
      <ol aria-label="Registro" className="max-h-28 shrink-0 space-y-0.5 overflow-y-auto border-t border-line px-4 py-2 text-xs text-muted">
        {log.map((line) => (
          <li key={line.id} className="coop-enter">
            {line.text}
          </li>
        ))}
      </ol>
      {lice.map((stain) => (
        <span key={stain.id} className="coop-lice" style={{ left: `${stain.left}%`, top: `${stain.top}%`, width: stain.size, height: stain.size }} />
      ))}
    </section>
  );
}
