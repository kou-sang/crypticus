// Configuración: cuenta, sonido, animaciones y tema.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { updateDisplayName } from '../../lib/repo';
import { updateSettings, useSettings, type MotionPreference, type ThemePreference } from '../../lib/settings';
import { playCue } from '../../lib/sound';
import { cx, errorMessage } from '../../lib/utils';
import { Button, ErrorBanner, Input, PageHeader } from '../../components/ui';

function Row({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-4">
      <div>
        <p className="font-semibold">{title}</p>
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
          className={cx('px-3 py-1.5 text-sm font-semibold', value === key ? 'bg-ink text-paper' : 'hover:bg-paper-2')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { profile } = useSession();
  const settings = useSettings();
  const [name, setName] = useState(profile.displayName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <>
      <PageHeader kicker="Configuración" title="Ajustes" />
      <div className="grid max-w-2xl gap-10">
        <section>
          <h2 className="mb-2 font-display text-2xl">Cuenta</h2>
          <form onSubmit={handleSaveName} className="flex items-end gap-2">
            <div className="flex-1">
              <Input label="Nombre visible" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={32} />
            </div>
            <Button type="submit" loading={saving} disabled={name.trim() === profile.displayName} className="h-11">
              Guardar
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted">
            Usuario <span className="font-mono">@{profile.handle}</span> ·{' '}
            <Link to={`/u/${profile.uid}`} className="underline underline-offset-4">
              ver mi perfil
            </Link>
          </p>
          <div className="mt-3 space-y-2">
            <ErrorBanner error={error} />
            {message && <p className="text-sm text-ok">{message}</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-display text-2xl">Sonido</h2>
          <Row title="Efectos de sonido" description="Aciertos, rivales, golpes al jefe y cuenta atrás.">
            <Segmented
              value={settings.sound ? 'on' : 'off'}
              options={[
                ['on', 'Activado'],
                ['off', 'Silencio'],
              ]}
              onChange={(v) => updateSettings({ sound: v === 'on' })}
            />
          </Row>
          <Row title="Volumen">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
              aria-label="Volumen"
              className="accent-[var(--accent)]"
            />
            <Button variant="ghost" onClick={() => playCue('success')}>
              Probar
            </Button>
          </Row>
        </section>

        <section>
          <h2 className="mb-2 font-display text-2xl">Pantalla</h2>
          <Row title="Tema">
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
          <Row title="Animaciones" description="Reducir desactiva rebotes, sacudidas y el efecto de desmayo animado.">
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
        </section>

        <section>
          <Button variant="danger" onClick={handleSignOut}>
            Cerrar sesión
          </Button>
        </section>
      </div>
    </>
  );
}
