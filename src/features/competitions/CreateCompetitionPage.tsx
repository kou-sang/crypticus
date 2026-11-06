// Configuración de la partida antes de empezar: modo, flujo, puntaje y modificadores.
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useSession } from '../../hooks/useAuth';
import { createCompetition, type CreateCompetitionInput } from '../../lib/repo';
import { cx, errorMessage } from '../../lib/utils';
import {
  BOSS_LABELS,
  COMEBACK_LABELS,
  DEFAULT_CONFIG,
  FLOW_LABELS,
  LIMITS,
  MODE_LABELS,
  SCORING_LABELS,
  TIER_MIX_LABELS,
  validateConfig,
} from '../../../shared/scoring';
import type {
  BossLevel,
  ComebackLevel,
  CompetitionMode,
  CompetitionVisibility,
  GameFlow,
  ScoringRule,
  TierMix,
} from '../../../shared/types';
import { Button, ErrorBanner, Input, PageHeader, Select } from '../../components/ui';

const PRESETS: Record<string, Partial<CreateCompetitionInput>> = {
  quick: { title: 'Partida rápida', mode: 'timed', flow: 'free', durationSec: 600, clueCount: 10 },
  duel: {
    title: 'Duelo',
    mode: 'count',
    flow: 'rounds',
    targetCount: 5,
    winByTwo: true,
    difficultyVote: true,
    rivalCountdownSec: 15,
    comeback: 'high',
    maxPlayers: 2,
    durationSec: 1200,
    clueCount: 15,
    extraTime: { enabled: true, seconds: 60, maxUses: 2 },
    visibility: 'friends',
  },
  boss: {
    title: 'Cacería del jefe',
    mode: 'boss',
    flow: 'free',
    bossLevel: 'normal',
    durationSec: 900,
    clueCount: 15,
    maxPlayers: 4,
    extraTime: { enabled: true, seconds: 45, maxUses: 2 },
  },
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
  columns = 2,
}: {
  value: T;
  options: Array<{ value: T; title: string; description?: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <div className={cx('grid gap-2', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cx(
            'border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            value === option.value ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink',
          )}
        >
          <span className="block font-semibold">{option.title}</span>
          {option.description && (
            <span className={cx('block text-xs', value === option.value ? 'opacity-70' : 'text-muted')}>{option.description}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
  children,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className={cx('border border-line p-3', disabled && 'opacity-40')}>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-[var(--accent)]"
          checked={checked && !disabled}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          <span className="block font-semibold">{label}</span>
          <span className="block text-xs text-muted">{description}</span>
        </span>
      </label>
      {checked && !disabled && children && <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">{title}</legend>
      {children}
    </fieldset>
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
      // Coherencia automática entre opciones dependientes.
      if (key === 'mode' && value === 'boss') next.winByTwo = false;
      if (key === 'flow' && value === 'free') {
        next.difficultyVote = false;
        next.rivalCountdownSec = 0;
      }
      return next;
    });

  const validation = useMemo(() => validateConfig(form, form.maxPlayers), [form]);
  const isBoss = form.mode === 'boss';
  const isRounds = form.flow === 'rounds';

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

  return (
    <>
      <PageHeader kicker="Nueva" title="Configura la partida" />

      <div className="mb-8 flex flex-wrap gap-2">
        {Object.entries({ quick: 'Rápida', duel: 'Duelo', boss: 'Jefe' }).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setForm(initialForm(key))}
            className="border border-line px-3 py-1.5 text-sm font-semibold hover:border-ink"
          >
            Preset: {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="grid max-w-3xl gap-10">
        <Input label="Título" value={form.title} onChange={(e) => set('title', e.target.value)} minLength={3} maxLength={60} required />

        <Section title="Modo de juego">
          <Choice<CompetitionMode>
            value={form.mode}
            onChange={(v) => set('mode', v)}
            columns={3}
            options={(Object.keys(MODE_LABELS) as CompetitionMode[]).map((mode) => ({ value: mode, ...MODE_LABELS[mode] }))}
          />
          {isBoss && (
            <Select label="Nivel del jefe" value={form.bossLevel} onChange={(e) => set('bossLevel', e.target.value as BossLevel)}>
              {(Object.keys(BOSS_LABELS) as BossLevel[]).map((level) => (
                <option key={level} value={level}>
                  {BOSS_LABELS[level]}
                </option>
              ))}
            </Select>
          )}
        </Section>

        <Section title="Flujo">
          <Choice<GameFlow>
            value={form.flow}
            onChange={(v) => set('flow', v)}
            options={(Object.keys(FLOW_LABELS) as GameFlow[]).map((flow) => ({ value: flow, ...FLOW_LABELS[flow] }))}
          />
        </Section>

        {!isBoss && (
          <Section title="Puntaje">
            <Choice<ScoringRule>
              value={form.scoring}
              onChange={(v) => set('scoring', v)}
              columns={3}
              options={(Object.keys(SCORING_LABELS) as ScoringRule[]).map((rule) => ({ value: rule, ...SCORING_LABELS[rule] }))}
            />
            <Choice<ComebackLevel>
              value={form.comeback}
              onChange={(v) => set('comeback', v)}
              columns={3}
              options={(Object.keys(COMEBACK_LABELS) as ComebackLevel[]).map((level) => ({
                value: level,
                title: COMEBACK_LABELS[level],
                description:
                  level === 'off' ? 'Puntos fijos por dificultad.' : 'Quien va atrás gana más con medios y difíciles, en proporción a la distancia.',
              }))}
            />
          </Section>
        )}

        <Section title="Modificadores">
          <Toggle
            label="Diferencia de dos"
            description="Para ganar hay que sacar 2 cripticos de ventaja. Si no, hay prórroga."
            checked={form.winByTwo}
            disabled={isBoss}
            onChange={(v) => set('winByTwo', v)}
          />
          <Toggle
            label="Votar dificultad del próximo criptico"
            description="Cada ronda se vota fácil, medio o difícil. En empate gana el voto de quien va perdiendo."
            checked={form.difficultyVote}
            disabled={!isRounds}
            onChange={(v) => set('difficultyVote', v)}
          />
          <Toggle
            label="Cuenta atrás tras un acierto"
            description="Cuando alguien acierta, el resto tiene unos segundos para acertar también. La pantalla se oscurece."
            checked={form.rivalCountdownSec > 0}
            disabled={!isRounds}
            onChange={(v) => set('rivalCountdownSec', v ? 15 : 0)}
          >
            <Input
              label="Segundos"
              type="number"
              min={1}
              max={LIMITS.maxRivalCountdownSec}
              value={form.rivalCountdownSec}
              onChange={(e) => set('rivalCountdownSec', Number(e.target.value))}
            />
          </Toggle>
          <Toggle
            label="Permitir añadir tiempo"
            description="Si todos lo piden (p. ej. están trabados), se suma tiempo al reloj."
            checked={form.extraTime.enabled}
            onChange={(v) => set('extraTime', { ...form.extraTime, enabled: v })}
          >
            <Input
              label="Segundos por uso"
              type="number"
              min={LIMITS.minExtraSeconds}
              max={LIMITS.maxExtraSeconds}
              value={form.extraTime.seconds}
              onChange={(e) => set('extraTime', { ...form.extraTime, seconds: Number(e.target.value) })}
            />
            <Input
              label="Usos máximos"
              type="number"
              min={1}
              max={LIMITS.maxExtraUses}
              value={form.extraTime.maxUses}
              onChange={(e) => set('extraTime', { ...form.extraTime, maxUses: Number(e.target.value) })}
            />
          </Toggle>
          <Toggle
            label="Marcador oculto"
            description="Los puntajes se revelan al final. Solo se ve el progreso."
            checked={form.hideScoreboard}
            onChange={(v) => set('hideScoreboard', v)}
          />
        </Section>

        <Section title="Reglas">
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label={form.mode === 'timed' || isBoss ? 'Duración (min)' : 'Tiempo máximo (min)'}
              type="number"
              min={1}
              max={180}
              value={Math.round(form.durationSec / 60)}
              onChange={(e) => set('durationSec', Number(e.target.value) * 60)}
            />
            <Input
              label={isRounds ? 'Cripticos por dificultad' : 'Cripticos'}
              type="number"
              min={1}
              max={isRounds ? LIMITS.maxCluesPerTier : 50}
              value={form.clueCount}
              onChange={(e) => set('clueCount', Number(e.target.value))}
            />
            {form.mode === 'count' && (
              <Input
                label={isRounds ? 'Rondas para ganar' : 'Meta'}
                type="number"
                min={1}
                max={LIMITS.maxTargetCount}
                value={form.targetCount}
                onChange={(e) => set('targetCount', Number(e.target.value))}
              />
            )}
            <Input
              label="Jugadores máx."
              type="number"
              min={1}
              max={50}
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
            {!isBoss && (
              <Input
                label="Penalización por error"
                type="number"
                min={0}
                max={LIMITS.maxWrongPenalty}
                value={form.wrongPenalty}
                onChange={(e) => set('wrongPenalty', Number(e.target.value))}
              />
            )}
            {!isRounds && (
              <Select label="Dificultades" value={form.tierMix} onChange={(e) => set('tierMix', e.target.value as TierMix)}>
                {(Object.keys(TIER_MIX_LABELS) as TierMix[]).map((mix) => (
                  <option key={mix} value={mix}>
                    {TIER_MIX_LABELS[mix]}
                  </option>
                ))}
              </Select>
            )}
            <Select label="Visibilidad" value={form.visibility} onChange={(e) => set('visibility', e.target.value as CompetitionVisibility)}>
              <option value="public">Pública</option>
              <option value="friends">Solo amigos</option>
              <option value="private">Privada (enlace)</option>
            </Select>
          </div>
        </Section>

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
