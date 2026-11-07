// Inicio (también es la portada "/"): saludo, fecha y un resumen breve de qué es Crypticus y cómo se juega.
import { Link } from 'react-router';
import { DemoCryptic } from '../../components/DemoCryptic';
import { useSession } from '../../hooks/useAuth';
import { useFriends } from '../../hooks/useFriends';
import { GAME_LABELS } from '../../../shared/scoring';
import { GAME_MODES } from '../../../shared/types';

const TODAY = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function DashboardPage() {
  const { profile } = useSession();
  const { incoming } = useFriends(profile.uid);
  const today = TODAY.format(new Date());

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 border-b-2 border-ink pb-5">
        <h1 className="font-display text-4xl leading-tight md:text-5xl">Hola, {profile.displayName.split(' ')[0]}</h1>
        <p className="mt-2 text-sm capitalize text-muted">{today}</p>
      </header>

      {incoming.length > 0 && (
        <Link to="/amigos" className="mb-6 block border-l-4 border-accent bg-accent/10 px-4 py-3 text-sm">
          Tienes <strong>{incoming.length}</strong> {incoming.length > 1 ? 'solicitudes' : 'solicitud'} de amistad →
        </Link>
      )}

      <p className="text-lg leading-relaxed">
        Cripticos en español, en tiempo real y contra otras personas. Cada criptico tiene su explicación y no se repite.
      </p>

      <div className="mt-6">
        <DemoCryptic />
      </div>

      <section className="mt-8" aria-labelledby="modos">
        <div className="flex items-baseline justify-between">
          <h2 id="modos" className="font-display text-2xl">Modos</h2>
          <Link to="/jugar" className="text-sm font-semibold underline-offset-4 hover:underline">
            Jugar →
          </Link>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-px border border-ink bg-ink sm:grid-cols-4">
          {GAME_MODES.map((mode) => {
            const soon = mode === 'boss';
            return (
              <li key={mode} className={soon ? 'bg-paper-2 p-4' : 'bg-paper p-4'}>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${soon ? 'text-muted' : 'text-accent'}`}>
                  {soon ? 'Pronto' : GAME_LABELS[mode].tagline}
                </p>
                <p className={`mt-1 font-display text-xl uppercase ${soon ? 'text-muted' : ''}`}>{GAME_LABELS[mode].title}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-6 text-sm text-muted">
        Agrega amigos para desafiarlos en{' '}
        <Link to="/amigos" className="underline underline-offset-4">
          Amigos
        </Link>{' '}
        y sigue tu Elo por modo en{' '}
        <Link to="/rankings" className="underline underline-offset-4">
          Ranking
        </Link>
        .
      </p>
    </div>
  );
}
