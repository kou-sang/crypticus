// Inicio: bienvenida, fecha y guía breve de cómo usar Crypticus.
import { Link } from 'react-router';
import { useSession } from '../../hooks/useAuth';
import { useFriends } from '../../hooks/useFriends';

const TODAY = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const STEPS = [
  {
    title: 'Jugar',
    to: '/jugar',
    text: 'Crea una sala (pública, solo amigos o privada por enlace) o únete a una abierta. Configura modo, tiempo y reglas antes de empezar.',
  },
  {
    title: 'Resolver',
    to: null,
    text: 'Cada criptico tiene una definición y un juego de palabras. Escribe en las casillas; el número entre paréntesis indica las letras.',
  },
  {
    title: 'Aprender',
    to: null,
    text: 'Al cerrar cada criptico verás la respuesta y su explicación. Nunca se repite un criptico que ya jugaste.',
  },
  {
    title: 'Amigos y ranking',
    to: '/amigos',
    text: 'Agrega amigos, desafíalos y sigue tu progreso en el ranking por modo.',
  },
] as const;

export default function DashboardPage() {
  const { profile } = useSession();
  const { incoming } = useFriends(profile.uid);
  const today = TODAY.format(new Date());

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-2 border-ink pb-5">
        <h1 className="font-display text-4xl leading-tight md:text-5xl">Hola, {profile.displayName.split(' ')[0]}</h1>
        <p className="mt-2 text-sm capitalize text-muted">{today}</p>
      </header>

      {incoming.length > 0 && (
        <Link to="/amigos" className="mb-8 block border-l-4 border-accent bg-accent/10 px-4 py-3 text-sm">
          Tienes <strong>{incoming.length}</strong> {incoming.length > 1 ? 'solicitudes' : 'solicitud'} de amistad →
        </Link>
      )}

      <p className="text-lg leading-relaxed">
        <strong>Crypticus</strong> es una arena de cripticos en tiempo real: compites contra otras personas resolviendo
        pistas crípticas en español. Gana quien combine rapidez y buen ojo para el doble sentido.
      </p>

      <ol className="mt-8 divide-y divide-line border-y border-line">
        {STEPS.map((step, index) => (
          <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-3 py-4">
            <span className="font-display text-2xl text-accent">{index + 1}</span>
            <div>
              <h2 className="font-semibold">
                {step.to ? (
                  <Link to={step.to} className="underline-offset-4 hover:underline">
                    {step.title} →
                  </Link>
                ) : (
                  step.title
                )}
              </h2>
              <p className="mt-1 text-sm text-muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
