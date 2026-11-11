// Formulario de reglas de sala (modo + opciones por modo + visibilidad). Lo usan la ventana de parámetros
// de la sala, la creación rápida y la revancha con otros parámetros. La configuración de cada modo se
// recuerda entre visitas (localStorage) y es el punto de partida de cada sala nueva.
import { useEffect, useState, type ReactNode } from 'react';
import type { RoomDraft } from '../play/RematchPanel';
import { canPlayCoop, cx } from '../../lib/utils';
import { loadJson, saveJson } from '../../lib/storage';
import {
  DEFAULT_MODE_SETTINGS,
  DUEL_HP_OPTIONS,
  HINTS_PER_GAME_OPTIONS,
  formatTimeControl,
  COOLDOWN_OPTIONS,
  RACE_TARGET_OPTIONS,
  ROYALE_PRESETS,
  ROYALE_SKIP_OPTIONS,
  SUDDEN_DEATH_OPTIONS,
  SURRENDER_USES_OPTIONS,
  type DuelFormat,
  type ModeSettings,
} from '../../../shared/gameModes';
import { COOP_ENABLED, DUEL_COMBO_INFO, DUEL_DAMAGE_LABELS, GAME_LABELS, LIMITS } from '../../../shared/scoring';
import { GAME_MODES, type ComebackLevel, type CompetitionVisibility, type DuelDamage, type GameMode } from '../../../shared/types';

export const STORAGE_KEY = 'crypticus.newGame.v2';


export interface Stored {
  settings: ModeSettings;
  visibility: CompetitionVisibility;
}

const DEFAULT_STORED: Stored = { settings: DEFAULT_MODE_SETTINGS, visibility: 'public' };

export function loadStored(draft?: RoomDraft | null): Stored {
  const stored: Stored = draft ? { settings: draft.settings, visibility: draft.visibility } : loadJson<Stored>(STORAGE_KEY, DEFAULT_STORED);
  // Mezcla profunda: versiones guardadas antes de agregar un campo no lo pierden.
  const settings = stored.settings ?? DEFAULT_MODE_SETTINGS;
  return {
    visibility: stored.visibility ?? 'public',
    settings: {
      // 'boss' (anterior a COOP) o COOP no disponible en este dispositivo: se vuelve a Race.
      game: (settings.game as string) === 'boss' || (settings.game === 'coop' && !coopAvailable()) ? 'race' : (settings.game ?? 'race'),
      race: { ...DEFAULT_MODE_SETTINGS.race, ...settings.race },
      royale: { ...DEFAULT_MODE_SETTINGS.royale, ...settings.royale },
      duel: { ...DEFAULT_MODE_SETTINGS.duel, ...settings.duel },
      coop: { ...DEFAULT_MODE_SETTINGS.coop, ...settings.coop },
    },
  };
}

/** COOP habilitado y jugable en este dispositivo (solo PC). */
export function coopAvailable(): boolean {
  return COOP_ENABLED && canPlayCoop();
}

export const VISIBILITY: Array<[CompetitionVisibility, string]> = [
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

export function Chips<T extends string | number>({
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
export function Option({ title, info, children }: { title: string; info: string; children: ReactNode }) {
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
            info="Entre cripticos se vota la dificultad del siguiente, entre las que ya se habilitaron según la meta. Desactivado: sigue la progresión (fácil → medio → difícil → muy difícil)."
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
      <Option title="Pedir pista" info="Sí: cada jugador puede pedir 1 o 2 pistas en total durante toda la partida, en los cripticos que elija. Cada pista se elige: definición, indicador, relleno o una letra al azar.">
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
        title="Saltear"
        info={`Cada jugador puede saltear el criptico actual 1 o 2 veces en toda la partida. Cada salto resta del reloj lo mismo que suma un acierto (${settings.incrementSec} s).`}
      >
        <Chips<number>
          label="Saltear"
          value={settings.skips}
          options={ROYALE_SKIP_OPTIONS.map((n): [number, string] => [n, n === 0 ? 'No' : `${n}×`])}
          onChange={(skips) => update({ skips })}
        />
      </Option>
      <Option
        title="Cómo se juega"
        info="Primer número: minutos de tu reloj. Segundo: segundos que suma cada acierto. Los cripticos son siempre los mismos para todos y cada vez más difíciles (12 fáciles, 13 medios, 10 difíciles y después muy difíciles). Sin pausas: al acertar pasas al siguiente. Quien llega a 0 queda eliminado; gana el último en pie."
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
      <Option
        title="Formato"
        info="1 vs 1: cada uno con su vida. 2 vs 2: cada equipo comparte una sola barra de vida y cualquiera de los dos puede responder; el acierto de uno golpea por el equipo."
      >
        <Chips<DuelFormat>
          label="Formato"
          value={settings.format}
          options={[
            ['1v1', '1 vs 1'],
            ['2v2', '2 vs 2'],
          ]}
          onChange={(format) => update({ format })}
        />
      </Option>
      <section className="py-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">{settings.format === '2v2' ? 'Vida por equipo' : 'Vida'}</p>
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
        info="Quien va perdiendo golpea más fuerte según la brecha con el líder: brecha = (vida del líder − tu vida) / vida del líder. Suave: ×(1 + brecha). Fuerte: ×(1 + 2 × brecha)."
      >
        <Chips<ComebackLevel> label="Remontada" value={settings.comeback} options={COMEBACK} onChange={(comeback) => update({ comeback })} />
      </Option>
      <CooldownOption value={settings.cooldownSec} onChange={(cooldownSec) => update({ cooldownSec })} />
      <Option
        title="Cómo se juega"
        info="Sin pistas. Todos ven el mismo criptico, cada vez más difícil según la vida elegida. El primero en acertar lo cierra al instante y se muestran respuesta y explicación durante 3 segundos. La partida empieza solo con la sala completa: 2 jugadores en 1 vs 1, 4 en 2 vs 2."
      >
        <span className="text-sm text-muted">{settings.format === '2v2' ? '2 contra 2' : '1 contra 1'}</span>
      </Option>
    </>
  );
}

/** Guarda la configuración como punto de partida de la próxima sala nueva. */
export function saveStored(stored: Stored): void {
  saveJson(STORAGE_KEY, stored);
}

export const VISIBILITY_INFO =
  'Pública: aparece en Jugar para todos. Amigos: la ven tus amigos y solo ellos pueden unirse. Privada: solo se entra con el código de 4 letras o el enlace.';

/** Pestañas de modo (Race / Royale / Duel / COOP). */
export function ModeTabs({ value, onChange }: { value: GameMode; onChange: (game: GameMode) => void }) {
  return (
    <div role="tablist" aria-label="Modo de juego" className="grid grid-cols-4 border border-ink">
      {GAME_MODES.map((game) => {
        const soon = game === 'coop' && !coopAvailable();
        const active = value === game;
        return (
          <button
            key={game}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={soon}
            onClick={() => onChange(game)}
            className={cx(
              'flex flex-col items-center py-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              active ? 'bg-ink text-paper' : 'hover:bg-paper-2',
            )}
          >
            <span className="font-display text-lg font-semibold uppercase tracking-wide">{GAME_LABELS[game].title}</span>
            <span className={cx('text-[10px] uppercase tracking-widest', active ? 'opacity-70' : 'text-muted')}>
              {soon ? (COOP_ENABLED ? 'Solo PC' : 'Pronto') : GAME_LABELS[game].tagline}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const STAGE_INFO: Record<1 | 2 | 3, string> = {
  1: 'Jefes con −1/3 de vida y daño base',
  2: 'Dificultad original',
  3: 'Jefes con +1/3 de vida y daño base',
};

/** COOP: nivel (AT; NT bloqueado hasta tener jefes y personajes) y subnivel 1–3 de dificultad. */
function CoopPanel({ settings, update }: { settings: ModeSettings['coop']; update: (value: Partial<ModeSettings['coop']>) => void }) {
  const radio = (active: boolean) =>
    cx(
      'border px-3 py-1 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40',
      active ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink',
    );
  return (
    <>
      <Option title="Nivel" info="AT: 4 jefes en 22 minutos. NT: 7 jefes en 33 minutos (se desbloquea al ganar AT; todavía no disponible). Se juega de 4 a 8 jugadores.">
        <div role="radiogroup" aria-label="Nivel" className="flex flex-wrap gap-1.5">
          {(['AT', 'NT'] as const).map((level) => {
            const locked = level === 'NT';
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={settings.level === level}
                disabled={locked}
                onClick={() => update({ level })}
                className={radio(settings.level === level)}
              >
                {level}
                {locked && <span className="ml-1.5 text-[10px] font-normal uppercase tracking-widest">Pronto</span>}
              </button>
            );
          })}
        </div>
      </Option>
      <Option
        title="Dificultad"
        info="1: los jefes tienen 1/3 menos de vida y daño base. 2: la dificultad original. 3: 1/3 más. Ganar en una dificultad más alta da más Elo."
      >
        <div className="flex flex-col items-end gap-1">
        <div role="radiogroup" aria-label="Dificultad" className="flex flex-wrap gap-1.5">
          {([1, 2, 3] as const).map((stage) => (
            <button
              key={stage}
              type="button"
              role="radio"
              aria-checked={settings.stage === stage}
              title={STAGE_INFO[stage]}
              onClick={() => update({ stage })}
              className={radio(settings.stage === stage)}
            >
              {settings.level}
              {stage}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{STAGE_INFO[settings.stage]}</p>
        </div>
      </Option>
    </>
  );
}

/** Reglas completas de una sala: modo, opciones del modo y visibilidad. */
export function RoomRulesForm({
  stored,
  onChange,
  visibilityNote,
}: {
  stored: Stored;
  onChange: (next: (prev: Stored) => Stored) => void;
  visibilityNote?: ReactNode; // Reemplaza el selector de visibilidad (p. ej. desafío privado fijo).
}) {
  const { settings } = stored;
  const updateSettings = (next: (current: ModeSettings) => ModeSettings) => onChange((prev) => ({ ...prev, settings: next(prev.settings) }));
  const patchRace = (value: Partial<ModeSettings['race']>) => updateSettings((c) => ({ ...c, race: { ...c.race, ...value } }));
  const patchRoyale = (value: Partial<ModeSettings['royale']>) => updateSettings((c) => ({ ...c, royale: { ...c.royale, ...value } }));
  const patchDuel = (value: Partial<ModeSettings['duel']>) => updateSettings((c) => ({ ...c, duel: { ...c.duel, ...value } }));
  const patchCoop = (value: Partial<ModeSettings['coop']>) => updateSettings((c) => ({ ...c, coop: { ...c.coop, ...value } }));

  return (
    <div className="space-y-4">
      <ModeTabs value={settings.game} onChange={(game) => updateSettings((c) => ({ ...c, game }))} />
      <p className="text-sm text-muted">{GAME_LABELS[settings.game].description}</p>
      <div>
        {settings.game === 'race' && <RacePanel settings={settings.race} update={patchRace} />}
        {settings.game === 'royale' && <RoyalePanel settings={settings.royale} update={patchRoyale} />}
        {settings.game === 'duel' && <DuelPanel settings={settings.duel} update={patchDuel} />}
        {settings.game === 'coop' && <CoopPanel settings={settings.coop} update={patchCoop} />}
        {visibilityNote ?? (
          <Option title="Sala" info={VISIBILITY_INFO}>
            <Chips<CompetitionVisibility>
              label="Sala"
              value={stored.visibility}
              options={VISIBILITY}
              onChange={(value) => onChange((prev) => ({ ...prev, visibility: value }))}
            />
          </Option>
        )}
      </div>
    </div>
  );
}
