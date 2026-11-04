// Vista de juego: criptico actual, celdas de respuesta, pistas y navegación entre cripticos.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Competition, CrypticPublic, Participant } from '../../../shared/types';
import { answerLengthFromEnumeration, normalizeAnswer } from '../../../shared/answer';
import { nextPendingClue } from '../../../shared/scoring';
import { api, ApiError } from '../../lib/api';
import { getCryptics } from '../../lib/repo';
import { cx, errorMessage } from '../../lib/utils';
import { Button, ErrorBanner, Spinner } from '../../components/ui';

type Feedback = { kind: 'correct'; points: number } | { kind: 'wrong' } | null;

/** Celdas que reflejan lo tecleado, agrupadas según la enumeración "(4,3-2)". */
function AnswerCells({ enumeration, value, solvedAnswer }: { enumeration: string; value: string; solvedAnswer?: string }) {
  const groups = (enumeration.match(/\d+/g) ?? []).map(Number);
  const letters = normalizeAnswer(solvedAnswer ?? value).split('');
  let cursor = 0;
  return (
    <div className="flex flex-wrap gap-3" aria-hidden>
      {groups.map((size, groupIndex) => (
        <div key={groupIndex} className="flex gap-px bg-ink p-px">
          {Array.from({ length: size }, (_, i) => {
            const letter = letters[cursor++] ?? '';
            return (
              <span
                key={i}
                className={cx(
                  'inline-flex size-9 items-center justify-center font-mono text-base font-semibold uppercase sm:size-10',
                  solvedAnswer ? 'bg-ink text-paper' : 'bg-paper',
                )}
              >
                {letter}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function PlayView({ competition, me }: { competition: Competition; me: Participant }) {
  const [cryptics, setCryptics] = useState<Map<string, CrypticPublic> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => nextPendingClue(competition.crypticIds, me.solvedIds));
  const [guess, setGuess] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'answer' | 'hint' | null>(null);
  const [hints, setHints] = useState<Record<string, string[]>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const solved = useMemo(() => new Set(me.solvedIds), [me.solvedIds]);

  useEffect(() => {
    let cancelled = false;
    getCryptics(competition.crypticIds)
      .then((map) => !cancelled && setCryptics(map))
      .catch((err: unknown) => !cancelled && setLoadError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [competition.crypticIds]);

  // Recupera pistas ya reveladas (p. ej. tras recargar) solo si se usaron.
  useEffect(() => {
    if (!selectedId || hints[selectedId] || !(me.hintsByClue[selectedId] ?? 0)) return;
    api
      .hint(competition.id, selectedId, false)
      .then((res) => setHints((prev) => ({ ...prev, [selectedId]: res.hints })))
      .catch((err: unknown) => console.error('[hint] recuperar', err));
  }, [selectedId, competition.id, me.hintsByClue, hints]);

  useEffect(() => {
    setGuess('');
    setFeedback(null);
    setError(null);
    inputRef.current?.focus();
  }, [selectedId]);

  if (loadError) return <ErrorBanner error={loadError} />;
  if (!cryptics) return <Spinner />;

  const current = selectedId ? cryptics.get(selectedId) : undefined;
  const currentIndex = selectedId ? competition.crypticIds.indexOf(selectedId) : -1;
  const hintsUsed = selectedId ? (me.hintsByClue[selectedId] ?? 0) : 0;
  const hintsAvailable = current ? Math.min(competition.maxHintsPerClue, current.hintCount) - hintsUsed : 0;
  const expectedLength = current ? answerLengthFromEnumeration(current.enumeration) : 0;

  const goToNext = (afterSolvedId: string) => {
    const remaining = competition.crypticIds.filter((id) => id !== afterSolvedId && !solved.has(id));
    const after = remaining.find((id) => competition.crypticIds.indexOf(id) > currentIndex) ?? remaining[0] ?? null;
    setSelectedId(after);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !normalizeAnswer(guess) || busy) return;
    setBusy('answer');
    setError(null);
    try {
      const result = await api.answer(competition.id, selectedId, guess);
      if (result.correct) {
        setFeedback({ kind: 'correct', points: result.points });
        if (result.answer) setAnswers((prev) => ({ ...prev, [selectedId]: result.answer! }));
        const solvedId = selectedId;
        window.setTimeout(() => goToNext(solvedId), 650);
      } else {
        setFeedback({ kind: 'wrong' });
        inputRef.current?.select();
      }
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'too_fast' ? 'Más despacio 🙂' : errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleHint = async () => {
    if (!selectedId) return;
    setBusy('hint');
    setError(null);
    try {
      const result = await api.hint(competition.id, selectedId, true);
      setHints((prev) => ({ ...prev, [selectedId]: result.hints }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[auto_1fr]">
      {/* Navegador de cripticos */}
      <nav aria-label="Cripticos" className="flex flex-wrap gap-1 md:w-40 md:content-start">
        {competition.crypticIds.map((id, index) => (
          <button
            key={id}
            onClick={() => setSelectedId(id)}
            aria-current={id === selectedId}
            className={cx(
              'size-9 border font-mono text-xs font-semibold transition-colors',
              solved.has(id) ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink',
              id === selectedId && 'outline-2 outline-offset-1 outline-accent',
            )}
          >
            {index + 1}
          </button>
        ))}
      </nav>

      <section className="min-w-0">
        {!current ? (
          <div className="border-2 border-ink p-8 text-center">
            <p className="font-display text-3xl">¡Todo resuelto!</p>
            <p className="mt-2 text-sm text-muted">Espera a que termine la competencia.</p>
          </div>
        ) : (
          <div key={current.id} className="fade-in">
            <p className="font-mono text-xs uppercase tracking-widest text-muted">
              Criptico {currentIndex + 1} de {competition.crypticIds.length} · dificultad {'●'.repeat(current.difficulty)}
              {'○'.repeat(5 - current.difficulty)}
            </p>
            <h2 className="mt-3 font-display text-3xl leading-snug md:text-4xl">
              {current.clue} <span className="whitespace-nowrap text-muted">{current.enumeration}</span>
            </h2>

            <div className={cx('mt-6', feedback?.kind === 'wrong' && 'animate-[shake_0.3s]')}>
              <AnswerCells enumeration={current.enumeration} value={guess} solvedAnswer={answers[current.id] ?? (solved.has(current.id) ? ' ' : undefined)} />
            </div>

            {solved.has(current.id) ? (
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
              {!solved.has(current.id) && (
                <span className={cx('font-mono', normalizeAnswer(guess).length === expectedLength ? 'text-ok' : 'text-muted')}>
                  {normalizeAnswer(guess).length}/{expectedLength}
                </span>
              )}
              {feedback?.kind === 'correct' && <span className="font-semibold text-ok">+{feedback.points} puntos</span>}
              {feedback?.kind === 'wrong' && <span className="font-semibold text-accent">No es correcto.</span>}
            </div>

            <ErrorBanner error={error} />

            {(hints[current.id]?.length ?? 0) > 0 && (
              <ol className="mt-6 space-y-2">
                {hints[current.id]!.map((hint, i) => (
                  <li key={i} className="border-l-2 border-accent pl-3 text-sm">
                    <span className="font-mono text-xs text-muted">Pista {i + 1}:</span> {hint}
                  </li>
                ))}
              </ol>
            )}

            {!solved.has(current.id) && (
              <div className="mt-6 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={handleHint} loading={busy === 'hint'} disabled={hintsAvailable <= 0}>
                  Pista ({Math.max(0, hintsAvailable)})
                </Button>
                <Button variant="ghost" onClick={() => goToNext(current.id)}>
                  Saltar →
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
