// Panel principal: mis partidas, accesos para crear una y top 5. Sin duplicar lo que ya está en el navbar.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { useLiveQuery } from '../../hooks/useFirestore';
import { useFriends } from '../../hooks/useFriends';
import { getTopPlayers } from '../../lib/repo';
import type { Competition, UserProfile } from '../../../shared/types';
import { RankingTable } from '../../components/RankingTable';
import { Card, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { CompetitionCard } from '../competitions/CompetitionCard';

const PRESETS = [
  { preset: 'quick', title: 'Rápida', text: '10 minutos, 10 pistas.' },
  { preset: 'duel', title: 'Duelo', text: '1 contra 1 por rondas, diferencia de dos.' },
  { preset: 'boss', title: 'Jefe', text: 'Cooperativo contra un jefe.' },
] as const;

function TopPlayers({ meId }: { meId: string }) {
  const [rows, setRows] = useState<UserProfile[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getTopPlayers(5)
      .then((list) => !cancelled && setRows(list))
      .catch((err: unknown) => console.error('[inicio] top', err));
    return () => {
      cancelled = true;
    };
  }, []);
  return rows ? <RankingTable rows={rows} meId={meId} compact /> : <Spinner />;
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

  return (
    <>
      <PageHeader kicker="Inicio" title={`Hola, ${profile.displayName.split(' ')[0]}`} />

      {incoming.length > 0 && (
        <Link to="/amigos" className="mb-8 block border-l-4 border-accent bg-accent/10 px-4 py-3 text-sm">
          Tienes <strong>{incoming.length}</strong> {incoming.length > 1 ? 'solicitudes' : 'solicitud'} de amistad →
        </Link>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h2 className="mb-4 font-display text-2xl">Activas</h2>
          {mine.loading ? (
            <Spinner />
          ) : active.length === 0 ? (
            <EmptyState title="Sin partidas en curso">Crea una al costado o únete desde Competir.</EmptyState>
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

        <aside className="min-w-0 space-y-4">
          <Card>
            <h3 className="mb-3 font-display text-lg">Nueva partida</h3>
            <ul className="divide-y divide-line">
              {PRESETS.map((item) => (
                <li key={item.preset}>
                  <Link to={`/competencias/nueva?preset=${item.preset}`} className="group flex items-baseline justify-between gap-3 py-2">
                    <span>
                      <span className="font-semibold group-hover:text-accent">{item.title}</span>
                      <span className="block text-xs text-muted">{item.text}</span>
                    </span>
                    <span aria-hidden className="text-muted group-hover:text-accent">→</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/competencias/nueva" className="block py-2 text-sm font-semibold underline underline-offset-4">
                  Personalizada
                </Link>
              </li>
            </ul>
          </Card>
          <Card>
            <h3 className="mb-2 font-display text-lg">Top 5</h3>
            <TopPlayers meId={profile.uid} />
          </Card>
        </aside>
      </div>
    </>
  );
}
