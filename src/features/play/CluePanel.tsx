// Panel de un criptico: enunciado, celdas, respuesta, pistas y feedback. Común a flujo libre y rondas.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CrypticPublic, Participant } from '../../../shared/types';
import { answerLengthFromEnumeration, normalizeAnswer } from '../../../shared/answer';
import { DIFFICULTY_LABELS } from '../../../shared/scoring';
import type { GameActions } from '../../hooks/useGameChannel';
import { ApiError } from '../../lib/api';
import { cx, errorMessage } from '../../lib/utils';
import { playCue } from '../../lib/sound';
import { Badge, Button, ErrorBanner } from '../../components/ui';

type Feedback = { kind: 'correct'; points: number } | { kind: 'wrong' } | { kind: 'stale' } | null;

const TIER_TONE = { easy: 'ok', medium: 'neutral', hard: 'accent' } as const;

/** Celdas que reflejan lo tecleado, agrupadas según la enumeración "(4,3-2)". */
function AnswerCells({ enumeration, value, solved, celebrate }: { enumeration: string; value: string; solved: boolean; celebrate: boolean }) {
  const groups = (enumeration.match(/\d+/g) ?? []).map(Number);
  const letters = normalizeAnswer(value).split('');
  let cursor = 0;
  return (
    <div className="flex flex-wrap gap-3" aria-hidden>
      {groups.map((size, groupIndex) => (
        <div key={groupIndex} className="flex gap-px bg-ink p-px">
          {Array.from({ length: size }, (_, i) => {
            const position = cursor++;
            return (
              <span
                key={i}
                style={celebrate ? { animationDelay: `${position * 45}ms` } : undefined}
                className={cx(
                  'inline-flex size-9 items-center justify-center font-mono text-base font-semibold uppercase transition-colors duration-300 sm:size-10',
                  solved ? 'bg-ink text-paper' : 'bg-paper',
                  celebrate && 'cell-pop',
                )}
              >
                {letters[position] ?? ''}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Explosión de puntos de color al acertar (puramente decorativa). */
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
  isBoss,
  actions,
  onSolved,
}: {
  cryptic: CrypticPublic;
  me: Participant;
  heading: string;
  maxHintsPerClue: number;
  isBoss: boolean;
  actions: GameActions;
  onSolved?: (crypticId: string) => void;
}) {
  const [guess, setGuess] = useState('');
  const [solvedText, setSolvedText] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'answer' | 'hint' | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const solved = me.solvedIds.includes(cryptic.id);
  const hintsUsed = me.hintsByClue[cryptic.id] ?? 0;
  const hintsAvailable = Math.max(0, Math.min(maxHintsPerClue, cryptic.hintCount) - hintsUsed);
  const expectedLength = answerLengthFromEnumeration(cryptic.enumeration);
  const typedLength = normalizeAnswer(guess).length;

  // Reinicio al cambiar de criptico.
  useEffect(() => {
    setGuess('');
    setSolvedText(null);
    setFeedback(null);
    setError(null);
    setHints([]);
    inputRef.current?.focus();
  }, [cryptic.id]);

  // Recupera pistas ya reveladas (p. ej. tras recargar).
  useEffect(() => {
    if (hintsUsed === 0 || hints.length >= hintsUsed) return;
    actions
      .hint(cryptic.id, false)
      .then((res) => setHints(res.hints))
      .catch((err: unknown) => console.error('[hint] recuperar', err));
  }, [cryptic.id, hintsUsed, hints.length, actions]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!normalizeAnswer(guess) || busy) return;
    setBusy('answer');
    setError(null);
    const attempt = guess;
    try {
      const result = await actions.answer(cryptic.id, attempt);
      if (result.correct) {
        playCue('success');
        setFeedback({ kind: 'correct', points: result.points });
        setSolvedText(attempt); // Correcta => lo tecleado es la respuesta.
        window.setTimeout(() => onSolved?.(cryptic.id), 650);
      } else if (result.stale) {
        setFeedback({ kind: 'stale' });
      } else {
        playCue('wrong');
        setFeedback({ kind: 'wrong' });
        inputRef.current?.select();
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
      inputRef.current?.focus();
    }
  };

  return (
    <div key={cryptic.id} className="fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">{heading}</p>
        <Badge tone={TIER_TONE[cryptic.tier]}>{DIFFICULTY_LABELS[cryptic.tier]}</Badge>
      </div>
      <h2 className="mt-3 font-display text-3xl leading-snug md:text-4xl">
        {cryptic.clue} <span className="whitespace-nowrap text-muted">{cryptic.enumeration}</span>
      </h2>

      <div className={cx('relative mt-6', feedback?.kind === 'wrong' && 'animate-[shake_0.3s]')}>
        <AnswerCells
          enumeration={cryptic.enumeration}
          value={solvedText ?? guess}
          solved={solved || solvedText !== null}
          celebrate={feedback?.kind === 'correct'}
        />
        {feedback?.kind === 'correct' && <Burst />}
      </div>

      {solved || solvedText !== null ? (
        <p className="mt-6 text-sm font-semibold text-ok">✓ Resuelto</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex gap-2">
          <input
            ref={inputRef}
            value={guess}
            onChange={(e) => {
              setGuess(e.target.value);
              if (feedback?.kind === 'wrong') setFeedback(null);
            }}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label="Tu respuesta"
            placeholder="Respuesta"
            className={cx(
              'h-12 min-w-0 flex-1 border-2 bg-paper px-3 font-mono text-lg uppercase tracking-widest outline-none',
              feedback?.kind === 'wrong' ? 'border-accent' : 'border-ink',
            )}
          />
          <Button type="submit" loading={busy === 'answer'} className="h-12 px-6">
            Enviar
          </Button>
        </form>
      )}

      <div className="mt-2 flex h-5 items-center gap-3 text-xs">
        {!solved && solvedText === null && (
          <span className={cx('font-mono', typedLength === expectedLength ? 'text-ok' : 'text-muted')}>
            {typedLength}/{expectedLength}
          </span>
        )}
        {feedback?.kind === 'correct' && (
          <span className="font-semibold text-ok">
            {isBoss ? `−${feedback.points} de vida al jefe` : `+${feedback.points} puntos`}
          </span>
        )}
        {feedback?.kind === 'wrong' && <span className="font-semibold text-accent">No es correcto.</span>}
        {feedback?.kind === 'stale' && <span className="font-semibold text-muted">Otro jugador se adelantó.</span>}
      </div>

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

      {!solved && solvedText === null && (
        <div className="mt-6">
          <Button variant="secondary" onClick={handleHint} loading={busy === 'hint'} disabled={hintsAvailable <= 0}>
            Pista ({hintsAvailable})
          </Button>
        </div>
      )}
    </div>
  );
}
