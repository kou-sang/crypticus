// Formulario de creación con presets y validación compartida con el servidor.
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useSession } from '../../hooks/useAuth';
import { createCompetition, type CreateCompetitionInput } from '../../lib/repo';
import { errorMessage, cx } from '../../lib/utils';
import { DEFAULT_CONFIG, SCORING_LABELS, validateConfig } from '../../../shared/scoring';
import type { CompetitionMode, CompetitionVisibility, ScoringRule } from '../../../shared/types';
import { Button, ErrorBanner, Input, PageHeader, Select } from '../../components/ui';

const PRESETS: Record<string, Partial<CreateCompetitionInput>> = {
  quick: { title: 'Partida rápida', mode: 'timed', scoring: 'standard', durationSec: 600, clueCount: 10 },
  duel: { title: 'Duelo', mode: 'timed', scoring: 'winByTwo', durationSec: 1200, clueCount: 25, maxPlayers: 2, visibility: 'friends' },
};

function initialForm(preset: string | null): CreateCompetitionInput {
  return {
    ...DEFAULT_CONFIG,
    title: 'Mi competencia',
    visibility: 'public',
    maxPlayers: 8,
    clueCount: 10,
    ...(preset ? PRESETS[preset] : {}),
  };
}

function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; title: string; description: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cx(
            'border p-3 text-left transition-colors',
            value === option.value ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink',
          )}
        >
          <span className="block font-semibold">{option.title}</span>
          <span className={cx('block text-xs', value === option.value ? 'opacity-70' : 'text-muted')}>{option.description}</span>
        </button>
      ))}
    </div>
  );
}

export default function CreateCompetitionPage() {
  const { profile } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState<CreateCompetitionInput>(() => initialForm(params.get('preset')));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof CreateCompetitionInput>(key: K, value: CreateCompetitionInput[K]) =>
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // El duelo fija 2 jugadores automáticamente.
      if (key === 'scoring' && value === 'winByTwo') next.maxPlayers = 2;
      return next;
    });

  const validation = useMemo(() => validateConfig(form, form.maxPlayers), [form]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (validation.length > 0) return setError(validation.join(' '));
    setError(null);
    setBusy(true);
    try {
      const id = await createCompetition(profile, form);
      navigate(`/c/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const isDuel = form.scoring === 'winByTwo';

  return (
    <>
      <PageHeader kicker="Nueva" title="Arma tu competencia" />
      <form onSubmit={handleSubmit} className="grid max-w-3xl gap-8">
        <Input label="Título" value={form.title} onChange={(e) => set('title', e.target.value)} minLength={3} maxLength={60} required />

        <fieldset disabled={isDuel} className={cx(isDuel && 'opacity-50')}>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Tipo</legend>
          <Choice<CompetitionMode>
            value={form.mode}
            onChange={(v) => set('mode', v)}
            options={[
              { value: 'timed', title: 'Por tiempo', description: 'Más puntos al terminar el reloj.' },
              { value: 'count', title: 'Por cantidad', description: 'El primero en resolver N gana.' },
            ]}
          />
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Puntaje</legend>
          <Choice<ScoringRule>
            value={form.scoring}
            onChange={(v) => set('scoring', v)}
            options={(Object.keys(SCORING_LABELS) as ScoringRule[]).map((rule) => ({ value: rule, ...SCORING_LABELS[rule] }))}
          />
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label={form.mode === 'timed' && !isDuel ? 'Duración (min)' : 'Tiempo máximo (min)'}
            type="number"
            min={1}
            max={180}
            value={Math.round(form.durationSec / 60)}
            onChange={(e) => set('durationSec', Number(e.target.value) * 60)}
          />
          <Input label="Cripticos" type="number" min={1} max={50} value={form.clueCount} onChange={(e) => set('clueCount', Number(e.target.value))} />
          {form.mode === 'count' && !isDuel && (
            <Input
              label="Meta"
              type="number"
              min={1}
              max={form.clueCount}
              value={form.targetCount}
              onChange={(e) => set('targetCount', Number(e.target.value))}
            />
          )}
          {isDuel && (
            <Input
              label="Puntos mínimos"
              type="number"
              min={2}
              max={20}
              value={form.winByTwoMinScore}
              onChange={(e) => set('winByTwoMinScore', Number(e.target.value))}
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Jugadores máx."
            type="number"
            min={2}
            max={50}
            disabled={isDuel}
            value={form.maxPlayers}
            onChange={(e) => set('maxPlayers', Number(e.target.value))}
          />
          <Input
            label="Pistas por criptico"
            type="number"
            min={0}
            max={10}
            value={form.maxHintsPerClue}
            onChange={(e) => set('maxHintsPerClue', Number(e.target.value))}
          />
          <Select label="Visibilidad" value={form.visibility} onChange={(e) => set('visibility', e.target.value as CompetitionVisibility)}>
            <option value="public">Pública</option>
            <option value="friends">Solo amigos</option>
            <option value="private">Privada (enlace)</option>
          </Select>
        </div>

        <ErrorBanner error={error ?? (validation.length > 0 ? validation.join(' ') : null)} />
        <div>
          <Button type="submit" loading={busy} disabled={validation.length > 0}>
            Crear sala
          </Button>
        </div>
      </form>
    </>
  );
}
