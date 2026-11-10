// Panel de un criptico: enunciado, celdas editables, pistas, feedback y explicación al acertar.
import { useEffect, useState, type ReactNode } from 'react';
import { useNow } from '../../hooks/useNow';
import type { CrypticPublic, Participant } from '../../../shared/types';
import { answerLengthFromEnumeration, splitClue } from '../../../shared/answer';
import { DIFFICULTY_LABELS } from '../../../shared/scoring';
import type { GameActions } from '../../hooks/useGameChannel';
import { ApiError } from '../../lib/api';
import { errorMessage } from '../../lib/utils';
import { playCue } from '../../lib/sound';
import { Badge, Button, ErrorBanner } from '../../components/ui';
import { AnswerGrid } from './AnswerGrid';

type Feedback =
  | { kind: 'correct'; points: number; explanation: string | null }
  | { kind: 'wrong' }
  | { kind: 'incomplete' }
  | { kind: 'stale' }
  | null;

const TIER_TONE = { easy: 'ok', medium: 'neutral', hard: 'accent' } as const;

/** Enunciado sin la enumeración repetida: si el texto ya la trae, se muestra una sola vez. */
export function ClueText({ cryptic, className }: { cryptic: Pick<CrypticPublic, 'clue' | 'enumeration'>; className?: string }) {
  const { text, enumeration } = splitClue(cryptic.clue);
  return (
    // clue-text: el enunciado siempre en una fuente legible (en Cyber no usa la de rotulación ni pierde tildes).
    <span className={className ? `clue-text ${className}` : 'clue-text'}>
      {text} <span className="whitespace-nowrap text-muted">{cryptic.enumeration || enumeration}</span>
    </span>
  );
}

/** Segundos restantes de cooldown (se repinta solo, sin re-renderizar el panel). */
function CooldownHint({ until }: { until: number }) {
  const now = useNow(200);
  const seconds = Math.ceil((until - now) / 1000);
  if (seconds <= 0) return null;
  return <span className="font-mono text-xs text-muted">Espera {seconds}s</span>;
}

/** Explosión de puntos de color al acertar (decorativa). */
function Burst() {
  const dots = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const distance = 70 + (i % 3) * 25;
    return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance, color: i % 3 === 0 ? 'var(--accent)' : i % 3 === 1 ? 'var(--ok)' : 'var(--ink)' };
  });
  return (
    <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
      {dots.map((dot, i) => (
        <span
          key={i}
          className="burst-dot absolute size-2 rounded-full"
          style={{ background: dot.color, ['--dx' as string]: `${dot.dx}px`, ['--dy' as string]: `${dot.dy}px` }}
        />
      ))}
    </span>
  );
}

export function CluePanel({
  cryptic,
  me,
  heading,
  maxHintsPerClue,
  actions,
  onNext,
  successLabel,
  cooldownMs = 0,
  footer,
  gameHintsLeft = Number.POSITIVE_INFINITY,
}: {
  cryptic: CrypticPublic;
  me: Participant;
  heading: string;
  maxHintsPerClue: number;
  actions: GameActions;
  onNext?: () => void; // Flujo libre: pasar al siguiente tras leer la explicación.
  successLabel?: (points: number) => string; // Texto al acertar (por defecto, puntos).
  cooldownMs?: number; // Espera tras un intento antes de poder enviar otro.
  footer?: ReactNode; // Acciones extra del modo (p. ej. rendirse).
  gameHintsLeft?: number; // Pistas que quedan en toda la partida (Race).
}) {
  const length = answerLengthFromEnumeration(cryptic.enumeration);
  const [letters, setLetters] = useState<string[]>(() => Array.from({ length }, () => ''));
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'answer' | 'hint' | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [blockedUntil, setBlockedUntil] = useState(0);

  const solvedNow = feedback?.kind === 'correct';
  const solved = solvedNow || me.solvedIds.includes(cryptic.id);
  const hintsUsed = me.hintsByClue[cryptic.id] ?? 0;
  const hintsAvailable = Math.max(0, Math.min(Math.min(maxHintsPerClue, cryptic.hintCount) - hintsUsed, gameHintsLeft));
  const complete = letters.every(Boolean);

  // Recupera pistas ya reveladas (p. ej. tras recargar).
  useEffect(() => {
    if (hintsUsed === 0 || hints.length >= hintsUsed) return;
    actions
      .hint(cryptic.id, false)
      .then((res) => setHints(res.hints))
      .catch((err: unknown) => console.error('[hint] recuperar', err));
  }, [cryptic.id, hintsUsed, hints.length, actions]);

  const handleLetters = (next: string[]) => {
    setLetters(next);
    if (feedback?.kind === 'wrong' || feedback?.kind === 'incomplete') setFeedback(null);
  };

  const handleSubmit = async () => {
    if (solved) return onNext?.(); // Enter tras acertar = siguiente.
    if (busy) return;
    if (!complete) {
      setFeedback({ kind: 'incomplete' });
      return;
    }
    if (Date.now() < blockedUntil) return;
    setBusy('answer');
    setError(null);
    if (cooldownMs > 0) setBlockedUntil(Date.now() + cooldownMs);
    try {
      const result = await actions.answer(cryptic.id, letters.join(''));
      if (result.correct) {
        playCue('success');
        setFeedback({ kind: 'correct', points: result.points, explanation: result.explanation ?? null });
      } else if (result.stale) {
        setFeedback({ kind: 'stale' });
      } else {
        playCue('wrong');
        setFeedback({ kind: 'wrong' });
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_playable') setFeedback({ kind: 'stale' });
      else setError(err instanceof ApiError && err.code === 'too_fast' ? 'Más despacio 🙂' : errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleHint = async () => {
    setBusy('hint');
    setError(null);
    try {
      const result = await actions.hint(cryptic.id, true);
      setHints(result.hints);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    // data-clue-panel: se centra en pantalla con el teclado abierto. data-keep-keyboard: tocar aquí no cierra el teclado.
    <div className="fade-in scroll-mt-28" data-clue-panel data-keep-keyboard>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">{heading}</p>
        <Badge tone={TIER_TONE[cryptic.tier]}>{DIFFICULTY_LABELS[cryptic.tier]}</Badge>
      </div>
      <h2 className="mt-3 font-display text-3xl leading-snug md:text-4xl">
        <ClueText cryptic={cryptic} />
      </h2>

      <div className="relative mt-6">
        <AnswerGrid
          enumeration={cryptic.enumeration}
          letters={letters}
          onLetters={handleLetters}
          onSubmit={handleSubmit}
          locked={solved}
          celebrate={solvedNow}
          wrong={feedback?.kind === 'wrong'}
        />
        {solvedNow && <Burst />}
      </div>

      <div className="mt-3 min-h-5 text-sm" aria-live="polite">
        {feedback?.kind === 'correct' && (
          <span className="font-semibold text-ok">
            ✓ {successLabel ? successLabel(feedback.points) : `+${feedback.points} puntos`}
          </span>
        )}
        {solved && !solvedNow && <span className="font-semibold text-ok">✓ Resuelto</span>}
        {feedback?.kind === 'wrong' && (
          <span className="font-semibold text-accent">No es correcto.</span>
        )}
        {feedback?.kind === 'incomplete' && <span className="text-muted">Completa todas las casillas.</span>}
        {feedback?.kind === 'stale' && <span className="font-semibold text-muted">Otro jugador se adelantó.</span>}
      </div>

      {feedback?.kind === 'correct' && feedback.explanation && (
        <p className="mt-4 border-l-4 border-ok bg-ok/10 px-4 py-3 text-sm">
          <span className="mr-1 font-semibold">Explicación:</span>
          {feedback.explanation}
        </p>
      )}

      <ErrorBanner error={error} />

      {hints.length > 0 && (
        <ol className="mt-6 space-y-2">
          {hints.map((hint, i) => (
            <li key={i} className="border-l-2 border-accent pl-3 text-sm">
              <span className="font-mono text-xs text-muted">Pista {i + 1}:</span> {hint}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!solved && (
          <>
            <Button onClick={handleSubmit} loading={busy === 'answer'} disabled={!complete} className="h-11 px-6">
              Enviar
            </Button>
            <CooldownHint until={blockedUntil} />
            <Button variant="secondary" onClick={handleHint} loading={busy === 'hint'} disabled={hintsAvailable <= 0}>
              {hintsAvailable > 0 ? 'Pista' : 'Sin pistas'}
              {hintsAvailable > 0 && <span className="font-mono text-xs opacity-70">· {hintsAvailable}</span>}
            </Button>
          </>
        )}
        {!solved && footer}
        {solved && onNext && (
          <Button autoFocus onClick={onNext} className="h-11 px-6">
            Siguiente →
          </Button>
        )}
      </div>
    </div>
  );
}
