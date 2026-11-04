// Panel principal: estadísticas, mis competencias y accesos rápidos.
import { Link } from 'react-router';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { useLiveQuery } from '../../hooks/useFirestore';
import { useFriends } from '../../hooks/useFriends';
import type { Competition } from '../../../shared/types';
import { Card, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { CompetitionCard } from '../competitions/CompetitionCard';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-l-2 border-ink pl-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className="font-mono text-3xl font-semibold">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { profile } = useSession();
  const { incoming } = useFriends(profile.uid);
  const mine = useLiveQuery<Competition>(
    query(
      collection(db, 'competitions'),
      where('participantIds', 'array-contains', profile.uid),
      orderBy('createdAt', 'desc'),
      limit(8),
    ),
    [profile.uid],
  );

  const active = mine.data.filter((c) => c.status !== 'finished');
  const recent = mine.data.filter((c) => c.status === 'finished');
  const winRate = profile.stats.played > 0 ? Math.round((profile.stats.wins / profile.stats.played) * 100) : 0;

  return (
    <>
      <PageHeader
        kicker="Tu panel"
        title={`Hola, ${profile.displayName.split(' ')[0]}`}
        action={
          <Link to="/competencias/nueva" className="inline-flex h-10 items-center bg-ink px-4 text-sm font-semibold text-paper hover:bg-accent">
            + Nueva competencia
          </Link>
        }
      />

      <section className="mb-10 grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label="Rating" value={profile.rating} />
        <Stat label="Partidas" value={profile.stats.played} />
        <Stat label="Victorias" value={`${winRate}%`} />
        <Stat label="Resueltos" value={profile.stats.solved} />
      </section>

      {incoming.length > 0 && (
        <Link to="/amigos" className="mb-8 block border-l-4 border-accent bg-accent/10 px-4 py-3 text-sm">
          Tienes <strong>{incoming.length}</strong> solicitud{incoming.length > 1 ? 'es' : ''} de amistad pendiente
          {incoming.length > 1 ? 's' : ''} →
        </Link>
      )}

      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <section>
          <h2 className="mb-4 font-display text-2xl">Activas</h2>
          {mine.loading ? (
            <Spinner />
          ) : active.length === 0 ? (
            <EmptyState title="Sin partidas en curso">
              <Link to="/competencias" className="underline">Únete a una</Link> o crea la tuya.
            </EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {active.map((c) => <CompetitionCard key={c.id} competition={c} />)}
            </div>
          )}

          {recent.length > 0 && (
            <>
              <h2 className="mb-4 mt-10 font-display text-2xl">Recientes</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {recent.map((c) => <CompetitionCard key={c.id} competition={c} />)}
              </div>
            </>
          )}
        </section>

        <aside className="space-y-4">
          <Card>
            <h3 className="font-display text-lg">Partida rápida</h3>
            <p className="mt-1 text-sm text-muted">10 minutos, 10 pistas, puntaje clásico. Comparte el enlace.</p>
            <Link to="/competencias/nueva?preset=quick" className="mt-3 inline-block text-sm font-semibold underline decoration-accent underline-offset-4">
              Crear ahora →
            </Link>
          </Card>
          <Card>
            <h3 className="font-display text-lg">Duelo</h3>
            <p className="mt-1 text-sm text-muted">1 contra 1. Gana quien saque dos de ventaja.</p>
            <Link to="/competencias/nueva?preset=duel" className="mt-3 inline-block text-sm font-semibold underline decoration-accent underline-offset-4">
              Retar a alguien →
            </Link>
          </Card>
        </aside>
      </div>
    </>
  );
}
