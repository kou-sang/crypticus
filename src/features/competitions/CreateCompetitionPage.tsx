// Crear partida: un modo, su parámetro principal y opciones compactas con botón de información.
// La configuración de cada modo se recuerda entre visitas. Con ?rival=uid&name=... crea un desafío privado.
// Con state.rematch (desde resultados) propone una revancha con otros parámetros a los mismos jugadores.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useSession } from '../../hooks/useAuth';
import { createCompetition, deleteCompetition, proposeCustomRematch } from '../../lib/repo';
import type { RematchDraft } from '../play/RematchPanel';
import { cx, errorMessage } from '../../lib/utils';
import { loadJson, saveJson } from '../../lib/storage';
import {
  buildConfig,
  DEFAULT_MODE_SETTINGS,
  DUEL_HP_OPTIONS,
  HINTS_PER_GAME_OPTIONS,
  formatTimeControl,
  COOLDOWN_OPTIONS,
  RACE_TARGET_OPTIONS,
  ROYALE_PRESETS,
  SUDDEN_DEATH_OPTIONS,
  SURRENDER_USES_OPTIONS,
  type ModeSettings,
} from '../../../shared/gameModes';
import { DUEL_COMBO_INFO, DUEL_DAMAGE_LABELS, GAME_LABELS, LIMITS, validateConfig } from '../../../shared/scoring';
import { GAME_MODES, type ComebackLevel, type CompetitionVisibility, type DuelDamage, type GameMode } from '../../../shared/types';
import { Button, ErrorBanner, PageHeader } from '../../components/ui';
import { BackLink } from '../../components/BackLink';

const STORAGE_KEY = 'crypticus.newGame.v2';

interface Stored {
  settings: ModeSettings;
  visibility: CompetitionVisibility;
}

const DEFAULT_STORED: Stored = { settings: DEFAULT_MODE_SETTINGS, visibility: 'public' };

function loadStored(draft?: RematchDraft | null): Stored {
  const stored: Stored = draft ? { settings: draft.settings, visibility: draft.visibility } : loadJson<Stored>(STORAGE_KEY, DEFAULT_STORED);
  // Mezcla profunda: versiones guardadas antes de agregar un campo no lo pierden.
  const settings = stored.settings ?? DEFAULT_MODE_SETTINGS;
  return {
    visibility: stored.visibility ?? 'public',
    settings: {
      game: settings.game === 'boss' ? 'race' : (settings.game ?? 'race'),
      race: { ...DEFAULT_MODE_SETTINGS.race, ...settings.race },
      royale: { ...DEFAULT_MODE_SETTINGS.royale, ...settings.royale },
      duel: { ...DEFAULT_MODE_SETTINGS.duel, ...settings.duel },
    },
  };
}

const VISIBILITY: Array<[CompetitionVisibility, string]> = [
  ['public', 'Pública'],
  ['friends', 'Amigos'],
  ['private', 'Privada'],
];

const COMEBACK: Array<[ComebackLevel, string]> = [
  ['off', 'No'],
  ['low', 'Suave'],
  ['high', 'Fuerte'],
];

// ---------- Piezas de UI ----------

function Chips<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([option, text]) => (
        <button
          key={String(option)}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cx(
            'min-w-11 border px-3 py-1.5 text-sm font-semibold transition-colors',
            value === option ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Fila compacta: título, botón ⓘ que despliega la explicación, y el control a la derecha (abajo en móvil). */
function Option({ title, info, children }: { title: string; info: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {title}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`Qué es ${title}`}
            className={cx(
              'inline-flex size-5 items-center justify-center rounded-full border text-[11px] font-bold leading-none',
              open ? 'border-ink bg-ink text-paper' : 'border-muted text-muted hover:border-ink hover:text-ink',
            )}
          >
            i
          </button>
        </span>
        <div>{children}</div>
      </div>
      {open && <p className="mt-2 text-xs text-muted fade-in">{info}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <Chips<'on' | 'off'>
      label={label}
      value={checked ? 'on' : 'off'}
      options={[
        ['off', 'No'],
        ['on', 'Sí'],
      ]}
      onChange={(v) => onChange(v === 'on')}
    />
  );
}

function NumberField({
  value,
  onChange,
  min,
  max,
  suffix,
  label,
  step = 1,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  suffix?: string;
  label: string;
  step?: number;
}) {
  // Se acota al rango y se lleva al múltiplo de `step` más cercano.
  const clamp = (raw: number) => Math.min(max, Math.max(min, Math.round((Number.isFinite(raw) ? raw : min) / step) * step));
  // Borrador local: se puede escribir libremente y el valor se ajusta al salir del campo.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="inline-flex items-center gap-1.5 text-sm">
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (n >= min && n <= max && n % step === 0) onChange(n);
        }}
        onBlur={() => {
          const next = clamp(Number(draft));
          setDraft(String(next));
          onChange(next);
        }}
        className="h-9 w-16 border border-line bg-paper px-2 text-center font-mono focus:border-ink focus:outline-none"
      />
      {suffix && <span className="text-muted">{suffix}</span>}
    </label>
  );
}

function CooldownOption({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <Option title="Cooldown" info="Espera mínima entre una respuesta y la siguiente. Evita probar palabras a ciegas.">
      <Chips<number> label="Cooldown" value={value} options={COOLDOWN_OPTIONS.map((n): [number, string] => [n, `${n} s`])} onChange={onChange} />
    </Option>
  );
}

// ---------- Paneles por modo ----------

function RacePanel({ settings, update }: { settings: ModeSettings['race']; update: (patch: Partial<ModeSettings['race']>) => void }) {
  const custom = !RACE_TARGET_OPTIONS.includes(settings.target as (typeof RACE_TARGET_OPTIONS)[number]);
  const hardcore = settings.intensity === 'hardcore';
  return (
    <>
      <section className="py-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">A cuánto se gana</p>
        <div className="flex flex-wrap items-center gap-3">
          <Chips<number>
            label="Meta"
            value={custom ? -1 : settings.target}
            options={RACE_TARGET_OPTIONS.map((n): [number, string] => [n, String(n)])}
            onChange={(target) => update({ target })}
          />
          <NumberField label="Meta personalizada" value={settings.target} min={1} max={30} onChange={(target) => update({ target })} />
        </div>
      </section>
      <Option
        title="Intensidad"
        info="Pacífico: cada uno avanza a su ritmo por la misma lista. Hardcore: todos ven el mismo criptico; el primero en acertar se lo lleva y el resto tiene la muerte súbita para acertar también."
      >
        <Chips
          label="Intensidad"
          value={settings.intensity}
          options={[
            ['peaceful', 'Pacífico'],
            ['hardcore', 'Hardcore'],
          ]}
          onChange={(intensity) => update({ intensity })}
        />
      </Option>
      {hardcore && (
        <>
          <Option title="Muerte súbita" info="Segundos que tiene el resto para acertar después del primero. 0 = el criptico se cierra al instante.">
            <Chips<number>
              label="Muerte súbita"
              value={settings.suddenDeathSec}
              options={SUDDEN_DEATH_OPTIONS.map((n): [number, string] => [n, n === 0 ? '0' : `${n} s`])}
              onChange={(suddenDeathSec) => update({ suddenDeathSec })}
            />
          </Option>
          <Option
            title="Votar dificultad"
            info="Durante cada criptico se vota la dificultad del siguiente. Si hay empate, decide quien va perdiendo. Desactivado: es aleatoria."
          >
            <Toggle label="Votar dificultad" checked={settings.difficultyVote} onChange={(difficultyVote) => update({ difficultyVote })} />
          </Option>
        </>
      )}
      <Option title="Diferencia de dos" info="Para ganar hay que llegar a la meta con 2 cripticos de ventaja. Si no, hay prórroga.">
        <Toggle label="Diferencia de dos" checked={settings.winByTwo} onChange={(winByTwo) => update({ winByTwo })} />
      </Option>
      <SurrenderOption
        value={settings.surrender}
        onChange={(surrender) => update({ surrender })}
        info="Cada jugador puede rendirse ante el criptico actual un número limitado de veces. En Hardcore, el resto tiene 5 segundos para acertarlo antes de pasar al siguiente. En Pacífico, solo tú pasas al siguiente."
      />
      <Option title="Pedir pista" info="Sí: cada jugador puede pedir 1 o 2 pistas en total durante toda la partida, en los cripticos que elija.">
        <div className="flex flex-wrap items-center gap-2">
          <Chips<'no' | 'yes'>
            label="Pedir pista"
            value={settings.hints ? 'yes' : 'no'}
            options={[
              ['no', 'No'],
              ['yes', 'Sí'],
            ]}
            onChange={(choice) => update({ hints: choice === 'yes' })}
          />
          {settings.hints && (
            <Chips<number>
              label="Pistas en toda la partida"
              value={settings.hintsPerGame}
              options={HINTS_PER_GAME_OPTIONS.map((n): [number, string] => [n, `${n} en total`])}
              onChange={(hintsPerGame) => update({ hintsPerGame })}
            />
          )}
        </div>
      </Option>
      <CooldownOption value={settings.cooldownSec} onChange={(cooldownSec) => update({ cooldownSec })} />
      <Option title="Duración" info="Una carrera dura como máximo 10 minutos. Si nadie llega a la meta, gana quien más cripticos resolvió.">
        <span className="text-sm text-muted">10 min máx.</span>
      </Option>
    </>
  );
}

/** Rendirse ante el criptico actual, con usos limitados (Race y Duel). */
function SurrenderOption({
  value,
  onChange,
  info,
}: {
  value: { enabled: boolean; maxUses: number };
  onChange: (value: { enabled: boolean; maxUses: number }) => void;
  info: string;
}) {
  return (
    <Option title="Rendirse" info={info}>
      <div className="flex flex-wrap items-center gap-2">
        <Toggle label="Rendirse" checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} />
        {value.enabled && (
          <Chips<number>
            label="Usos por jugador"
            value={value.maxUses}
            options={SURRENDER_USES_OPTIONS.map((n): [number, string] => [n, `${n}×`])}
            onChange={(maxUses) => onChange({ ...value, maxUses })}
          />
        )}
      </div>
    </Option>
  );
}

function RoyalePanel({ settings, update }: { settings: ModeSettings['royale']; update: (patch: Partial<ModeSettings['royale']>) => void }) {
  const presetIndex = ROYALE_PRESETS.findIndex((p) => p.baseSec === settings.baseSec && p.incrementSec === settings.incrementSec);
  const [custom, setCustom] = useState(presetIndex === -1);
  return (
    <>
      <section className="py-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Control de tiempo</p>
        <div className="grid grid-cols-3 gap-2">
          {ROYALE_PRESETS.map((preset, index) => {
            const active = !custom && index === presetIndex;
            return (
              <button
                key={index}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setCustom(false);
                  update({ baseSec: preset.baseSec, incrementSec: preset.incrementSec });
                }}
                className={cx(
                  'flex flex-col items-center border py-3 transition-colors',
                  active ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink',
                )}
              >
                <span className="font-mono text-2xl font-semibold">{formatTimeControl(preset.baseSec, preset.incrementSec)}</span>
                <span className={cx('text-[11px]', active ? 'opacity-70' : 'text-muted')}>{preset.name}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => setCustom(true)}
          className={cx('mt-2 w-full border py-2 text-sm font-semibold', custom ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink')}
        >
          Personalizado{custom ? `: ${formatTimeControl(settings.baseSec, settings.incrementSec)}` : ''}
        </button>
        {custom && (
          <div className="mt-3 flex flex-wrap gap-4">
            <NumberField
              label="Minutos"
              value={Math.round(settings.baseSec / 60)}
              min={1}
              max={30}
              suffix="min"
              onChange={(minutes) => update({ baseSec: minutes * 60 })}
            />
            <NumberField
              label="Segundos por acierto"
              value={settings.incrementSec}
              min={0}
              max={60}
              suffix="s por acierto"
              onChange={(incrementSec) => update({ incrementSec })}
            />
          </div>
        )}
      </section>
      <CooldownOption value={settings.cooldownSec} onChange={(cooldownSec) => update({ cooldownSec })} />
      <Option
        title="Cómo se juega"
        info="Primer número: minutos de tu reloj. Segundo: segundos que suma cada acierto. Los cripticos son siempre los mismos para todos y cada vez más difíciles (10 fáciles, 10 medios, después difíciles). Sin pausas: al acertar pasas al siguiente. Quien llega a 0 queda eliminado; gana el último en pie."
      >
        <span className="text-sm text-muted">Hasta 8 jugadores</span>
      </Option>
    </>
  );
}

function DuelPanel({ settings, update }: { settings: ModeSettings['duel']; update: (patch: Partial<ModeSettings['duel']>) => void }) {
  const preset = (DUEL_HP_OPTIONS as readonly number[]).includes(settings.hp);
  const [custom, setCustom] = useState(!preset);
  return (
    <>
      <section className="py-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Vida</p>
        <div className="flex flex-wrap items-center gap-2">
          <Chips<number>
            label="Vida"
            value={custom ? -1 : settings.hp}
            options={DUEL_HP_OPTIONS.map((hp): [number, string] => [hp, `${hp}`])}
            onChange={(hp) => {
              setCustom(false);
              update({ hp });
            }}
          />
          <button
            type="button"
            aria-pressed={custom}
            onClick={() => setCustom(true)}
            className={cx('h-9 border px-3 text-sm font-semibold', custom ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink')}
          >
            Otra
          </button>
          {custom && (
            <NumberField
              label="Vida personalizada"
              value={settings.hp}
              min={LIMITS.duelMinHp}
              max={LIMITS.duelMaxHp}
              step={LIMITS.duelHpStep}
              suffix={`de a ${LIMITS.duelHpStep}`}
              onChange={(hp) => update({ hp })}
            />
          )}
        </div>
      </section>
      <Option
        title="Puntaje"
        info={`Cuánta vida pierde el rival cuando aciertas primero. ${DUEL_DAMAGE_LABELS.difficulty.title}: ${DUEL_DAMAGE_LABELS.difficulty.description} ${DUEL_DAMAGE_LABELS.speed.title}: ${DUEL_DAMAGE_LABELS.speed.description}`}
      >
        <Chips<DuelDamage>
          label="Puntaje"
          value={settings.damage}
          options={[
            ['difficulty', DUEL_DAMAGE_LABELS.difficulty.title],
            ['speed', DUEL_DAMAGE_LABELS.speed.title],
          ]}
          onChange={(damage) => update({ damage })}
        />
      </Option>
      <Option title="Combo" info={DUEL_COMBO_INFO}>
        <Toggle label="Combo" checked={settings.combo} onChange={(combo) => update({ combo })} />
      </Option>
      <SurrenderOption
        value={settings.surrender}
        onChange={(surrender) => update({ surrender })}
        info="En vez de saltear: cada jugador puede rendirse ante el criptico actual un número limitado de veces. El rival tiene 5 segundos para acertarlo; si no, se pasa al siguiente."
      />
      <Option
        title="Remontada"
        info="Quien tiene menos vida golpea más fuerte con cripticos medios y difíciles, en proporción a la diferencia de vida."
      >
        <Chips<ComebackLevel> label="Remontada" value={settings.comeback} options={COMEBACK} onChange={(comeback) => update({ comeback })} />
      </Option>
      <CooldownOption value={settings.cooldownSec} onChange={(cooldownSec) => update({ cooldownSec })} />
      <Option
        title="Cómo se juega"
        info="Solo 2 jugadores, sin pistas. Ambos ven el mismo criptico (dificultad al azar). El primero en acertar lo cierra al instante y se muestran respuesta y explicación durante 3 segundos."
      >
        <span className="text-sm text-muted">1 contra 1</span>
      </Option>
    </>
  );
}

// ---------- Página ----------

export default function CreateCompetitionPage() {
  const { profile } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rivalId = params.get('rival');
  const rivalName = params.get('name') ?? 'tu amigo';

  const location = useLocation();
  const rematch = (location.state as { rematch?: RematchDraft } | null)?.rematch ?? null;
  const [stored, setStored] = useState<Stored>(() => loadStored(rematch));
  const [title, setTitle] = useState(rematch?.title ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => saveJson(STORAGE_KEY, stored), [stored]);

  const { settings } = stored;
  const visibility: CompetitionVisibility = rivalId ? 'private' : stored.visibility;
  const built = useMemo(() => buildConfig(settings), [settings]);
  const validation = useMemo(() => validateConfig(built.config, built.maxPlayers), [built]);

  const setGame = (game: GameMode) => setStored((prev) => ({ ...prev, settings: { ...prev.settings, game } }));
  const updateSettings = (next: (current: ModeSettings) => ModeSettings) =>
    setStored((prev) => ({ ...prev, settings: next(prev.settings) }));
  const patchRace = (value: Partial<ModeSettings['race']>) => updateSettings((c) => ({ ...c, race: { ...c.race, ...value } }));
  const patchRoyale = (value: Partial<ModeSettings['royale']>) => updateSettings((c) => ({ ...c, royale: { ...c.royale, ...value } }));
  const patchDuel = (value: Partial<ModeSettings['duel']>) => updateSettings((c) => ({ ...c, duel: { ...c.duel, ...value } }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (validation.length > 0) return setError(validation.join(' '));
    setError(null);
    setBusy(true);
    try {
      const input = {
        ...built.config,
        title: (title.trim() || (rivalId ? `Desafío · ${built.title}` : built.title)).slice(0, 60),
        visibility,
        maxPlayers: built.maxPlayers,
        clueCount: built.clueCount,
        ...(rivalId ? { invitedIds: [rivalId] } : {}),
      };
      let id: string;
      if (rematch) {
        id = await proposeCustomRematch(profile, rematch.fromId, {
          ...input,
          invitedIds: rematch.invitedIds,
          invitedNames: rematch.invitedNames,
          rematchOf: rematch.fromId,
        });
        // La propuesta anterior (rechazada) se reemplaza por esta.
        if (rematch.replaceId) await deleteCompetition(rematch.replaceId, profile.uid).catch(() => undefined);
      } else {
        id = await createCompetition(profile, input);
      }
      navigate(`/c/${id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink fallback="/jugar" />
      <PageHeader kicker="Jugar" title={rematch ? 'Revancha con otros parámetros' : rivalId ? `Desafiar a ${rivalName}` : 'Nueva partida'} />
      {rematch && (
        <p className="-mt-4 mb-6 text-sm text-muted">
          Se enviará a {Object.values(rematch.invitedNames).join(', ') || 'los mismos jugadores'}. Empieza cuando acepten todos.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div role="tablist" aria-label="Modo de juego" className="grid grid-cols-4 border border-ink">
          {GAME_MODES.map((game) => {
            const soon = game === 'boss';
            const active = settings.game === game;
            return (
              <button
                key={game}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={soon}
                onClick={() => setGame(game)}
                className={cx(
                  'flex flex-col items-center py-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  active ? 'bg-ink text-paper' : 'hover:bg-paper-2',
                )}
              >
                <span className="font-display text-lg font-semibold uppercase tracking-wide">{GAME_LABELS[game].title}</span>
                <span className={cx('text-[10px] uppercase tracking-widest', active ? 'opacity-70' : 'text-muted')}>
                  {soon ? 'Pronto' : GAME_LABELS[game].tagline}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted">{GAME_LABELS[settings.game].description}</p>

        <div>
          {settings.game === 'race' && <RacePanel settings={settings.race} update={patchRace} />}
          {settings.game === 'royale' && <RoyalePanel settings={settings.royale} update={patchRoyale} />}
          {settings.game === 'duel' && <DuelPanel settings={settings.duel} update={patchDuel} />}

          {rivalId ? (
            <p className="border-b border-line py-3 text-sm">
              Sala <strong>privada</strong>: {rivalName} la verá en su pestaña Amigos y podrás compartirle el enlace.
            </p>
          ) : (
            <Option title="Sala" info="Pública: aparece en Jugar para todos. Amigos: solo la ven tus amigos. Privada: solo se entra con el enlace.">
              <Chips<CompetitionVisibility>
                label="Sala"
                value={visibility}
                options={VISIBILITY}
                onChange={(value) => setStored((prev) => ({ ...prev, visibility: value }))}
              />
            </Option>
          )}

          <label className="block border-b border-line py-3">
            <span className="text-sm font-semibold">Nombre de la sala</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={built.title}
              maxLength={60}
              className="mt-1 h-10 w-full border border-line bg-paper px-3 text-sm focus:border-ink focus:outline-none"
            />
          </label>
        </div>

        <ErrorBanner error={error ?? (validation.length > 0 ? validation.join(' ') : null)} />
        <Button type="submit" loading={busy} disabled={validation.length > 0} className="h-12 w-full text-base">
          {rivalId ? 'Crear desafío' : 'Crear sala'}
        </Button>
      </form>
    </div>
  );
}
