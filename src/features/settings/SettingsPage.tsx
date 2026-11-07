// Configuración: cuenta, tema (Normal / Medieval / Cyber), animaciones y sonido. Se usa como ventana superpuesta (engranaje) y como página (/ajustes).
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { updateDisplayName } from '../../lib/repo';
import {
  updateSettings,
  useSettings,
  type MotionPreference,
  type ThemePreference,
  type Skin,
  SKINS,
  SOUND_GROUPS,
  type SoundGroup,
} from '../../lib/settings';
import { playCue } from '../../lib/sound';
import { cx, detectDevice, errorMessage } from '../../lib/utils';
import { Modal } from '../../components/Modal';
import { Button, ErrorBanner, Input, PageHeader } from '../../components/ui';
import { BackLink } from '../../components/BackLink';

function Row({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex border border-ink">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={cx('px-2.5 py-1 text-xs font-semibold', value === key ? 'bg-ink text-paper' : 'hover:bg-paper-2')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-1 font-display text-xl">{children}</h2>;
}

/** Muestra de cada tema: tres franjas con sus colores reales. */
const SKIN_SWATCH: Record<Skin, [string, string, string]> = {
  normal: ['#f4efe4', '#1b1a17', '#c8361d'],
  crypt: ['#2a2520', '#c9b48a', '#f2a03a'],
  cyber: ['#060814', '#00e1ff', '#f5e400'],
};

function SkinPicker({ value, onPick }: { value: Skin; onPick: (skin: Skin) => void }) {
  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
      {(Object.keys(SKINS) as Skin[]).map((skin) => {
        const active = value === skin;
        return (
          <button
            key={skin}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(skin)}
            className={cx('flex flex-col items-stretch border p-1.5 text-left transition-colors', active ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink')}
          >
            <span aria-hidden className="flex h-8">
              {SKIN_SWATCH[skin].map((color, i) => (
                <span key={i} className={i === 0 ? 'flex-[3]' : 'flex-1'} style={{ background: color }} />
              ))}
            </span>
            <span className="mt-1.5 text-sm font-semibold">{SKINS[skin].title}</span>
            <span className="text-[11px] leading-tight text-muted">{SKINS[skin].description}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Advertencia antes de activar Cyber en el celular: destellos, movimiento y consumo. */
function CyberWarning({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [understood, setUnderstood] = useState(false);
  useEffect(() => {
    if (open) setUnderstood(false);
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Antes de activar Cyber"
      footer={
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" disabled={!understood} onClick={onConfirm} className="flex-1">
            Activar Cyber
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Seguir con el tema actual
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="border-l-4 border-accent pl-3 font-semibold">
          Este tema usa destellos, líneas de barrido y efectos de interferencia que pueden provocar convulsiones en personas con epilepsia
          fotosensible.
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-muted">
          <li>La pantalla gira y se desplaza al cambiar de sección, como un visor de realidad virtual: puede causar mareo o náuseas.</li>
          <li>Los efectos de cristal y brillo exigen más al celular: consume más batería y puede calentarse o ir más lento durante la partida.</li>
          <li>Si sientes mareo, molestia visual o dolor de cabeza, vuelve al tema Normal o activa «Animaciones: Reducidas».</li>
        </ul>
        <label className="flex items-start gap-2 pt-1">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>Leí la advertencia y quiero activar el tema Cyber en este dispositivo.</span>
        </label>
      </div>
    </Modal>
  );
}

/** Contenido de la configuración, sin encabezado de página. Dos columnas en PC para no hacer scroll. */
export function SettingsPanel() {
  const { profile } = useSession();
  const settings = useSettings();
  const [name, setName] = useState(profile.displayName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnCyber, setWarnCyber] = useState(false);

  const handleSaveName = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateDisplayName(profile.uid, name);
      setMessage('Nombre actualizado.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const pickSkin = (skin: Skin) => {
    if (skin === settings.skin) return;
    // En el celular, Cyber pide confirmación explícita antes de activarse.
    if (skin === 'cyber' && detectDevice() === 'mobile') return setWarnCyber(true);
    updateSettings({ skin });
  };

  return (
    <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
      <div className="space-y-6">
        <section>
          <SectionTitle>Cuenta</SectionTitle>
          <form onSubmit={handleSaveName} className="flex items-end gap-2">
            <div className="flex-1">
              <Input label="Nombre visible" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={32} />
            </div>
            <Button type="submit" loading={saving} disabled={name.trim() === profile.displayName} className="h-11">
              Guardar
            </Button>
          </form>
          <p className="mt-1.5 text-xs text-muted">
            Usuario <span className="font-mono">@{profile.handle}</span>
          </p>
          <div className="mt-2 space-y-2">
            <ErrorBanner error={error} />
            {message && <p className="text-sm text-ok">{message}</p>}
          </div>
        </section>

        <section>
          <SectionTitle>Tema</SectionTitle>
          <p className="mb-2 text-xs text-muted">Cambia colores, tipografía, fondo, animaciones y sonidos.</p>
          <SkinPicker value={settings.skin} onPick={pickSkin} />
          <CyberWarning
            open={warnCyber}
            onCancel={() => setWarnCyber(false)}
            onConfirm={() => {
              setWarnCyber(false);
              updateSettings({ skin: 'cyber' });
            }}
          />
          <div className="mt-2">
            {settings.skin === 'normal' && (
              <Row title="Modo de color">
                <Segmented<ThemePreference>
                  value={settings.theme}
                  options={[
                    ['system', 'Sistema'],
                    ['light', 'Claro'],
                    ['dark', 'Oscuro'],
                  ]}
                  onChange={(theme) => updateSettings({ theme })}
                />
              </Row>
            )}
            <Row title="Animaciones" description="Reducidas: sin rebotes, giros, destellos ni llamas animadas.">
              <Segmented<MotionPreference>
                value={settings.motion}
                options={[
                  ['system', 'Sistema'],
                  ['full', 'Completas'],
                  ['reduced', 'Reducidas'],
                ]}
                onChange={(motion) => updateSettings({ motion })}
              />
            </Row>
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <section>
          <SectionTitle>Sonido</SectionTitle>
          <Row title="Efectos de sonido">
            <Segmented
              value={settings.sound ? 'on' : 'off'}
              options={[
                ['on', 'Activado'],
                ['off', 'Silencio'],
              ]}
              onChange={(v) => updateSettings({ sound: v === 'on' })}
            />
          </Row>
          {settings.sound && (
            <>
              <Row title="Volumen">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.volume}
                  onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
                  aria-label="Volumen"
                  className="w-28 accent-[var(--accent)]"
                />
                <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => playCue('success')}>
                  Probar
                </Button>
              </Row>
              <fieldset className="pt-2.5">
                <legend className="mb-1.5 text-xs text-muted">Qué suena</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(SOUND_GROUPS) as SoundGroup[]).map((group) => {
                    const on = settings.sounds[group];
                    return (
                      <button
                        key={group}
                        type="button"
                        role="switch"
                        aria-checked={on}
                        title={SOUND_GROUPS[group].description}
                        onClick={() => updateSettings({ sounds: { ...settings.sounds, [group]: !on } })}
                        className={cx(
                          'flex items-center gap-2 border px-2.5 py-1.5 text-left text-xs transition-colors',
                          on ? 'border-ink' : 'border-line text-muted hover:border-ink',
                        )}
                      >
                        <span aria-hidden className={cx('size-2.5 shrink-0 border border-current', on && 'bg-ok')} />
                        <span className="min-w-0">
                          <span className="block font-semibold">{SOUND_GROUPS[group].title}</span>
                          <span className="block truncate text-[11px] text-muted">{SOUND_GROUPS[group].description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Button variant="danger" onClick={handleSignOut}>
            Cerrar sesión
          </Button>
          <p className="font-mono text-xs text-muted">Crypticus v{__APP_VERSION__}</p>
        </section>
      </div>
    </div>
  );
}

/** Página /ajustes (enlace directo). Desde la app se abre como ventana con el engranaje. */
export default function SettingsPage() {
  return (
    <>
      <BackLink />
      <PageHeader kicker="Configuración" title="Ajustes" />
      <SettingsPanel />
    </>
  );
}
