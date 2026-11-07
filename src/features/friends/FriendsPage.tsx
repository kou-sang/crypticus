// Amigos: desafíos recibidos, lista al estilo Lichess (ratings por modo + Desafiar), búsqueda y solicitudes.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { collection, limit, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useLiveQuery } from '../../hooks/useFirestore';
import { useSession } from '../../hooks/useAuth';
import { useFriends, type FriendRequest } from '../../hooks/useFriends';
import { useUsers } from '../../hooks/useUsers';
import {
  acceptFriendRequest,
  declineRematch,
  findUserByHandle,
  joinCompetition,
  removeFriendRequest,
  sendFriendRequest,
} from '../../lib/repo';
import { errorMessage, pairId } from '../../lib/utils';
import { Avatar, Button, EmptyState, ErrorBanner, Input, PageHeader, Spinner } from '../../components/ui';
import type { Competition, UserProfile } from '../../../shared/types';
import { ModeRatings } from '../../components/ModeRatings';
import { describeMode } from '../competitions/CompetitionCard';

const challengeLink = (user: UserProfile) =>
  `/jugar/nueva?rival=${encodeURIComponent(user.uid)}&name=${encodeURIComponent(user.displayName)}`;

function PersonRow({ profile, children }: { profile: UserProfile | undefined; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-0">
      <Avatar name={profile?.displayName ?? '?'} />
      <div className="min-w-0 flex-1">
        {profile ? (
          <Link to={`/u/${profile.uid}`} className="block truncate font-semibold hover:underline">
            {profile.displayName}
          </Link>
        ) : (
          <span className="text-muted">…</span>
        )}
        {profile && (
          <>
            <span className="block font-mono text-xs text-muted">@{profile.handle}</span>
            <ModeRatings user={profile} compact />
          </>
        )}
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </li>
  );
}

export default function FriendsPage() {
  const { profile } = useSession();
  const { friends, incoming, outgoing, all, loading } = useFriends(profile.uid);
  const otherIds = all.map((r) => (r.from === profile.uid ? r.to : r.from));
  const users = useUsers(otherIds);

  const [handle, setHandle] = useState('');
  const [found, setFound] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const other = (r: FriendRequest) => users.get(r.from === profile.uid ? r.to : r.from);

  // Desafíos: salas privadas donde un amigo me invitó (el estado se filtra aquí para no requerir índice compuesto).
  const invites = useLiveQuery<Competition>(
    query(collection(db, 'competitions'), where('invitedIds', 'array-contains', profile.uid), limit(10)),
    [profile.uid],
  );
  // Pendientes: en espera, sin haber entrado ni rechazado.
  const challenges = invites.data.filter(
    (c) => c.status === 'lobby' && !c.participantIds.includes(profile.uid) && !(c.declinedIds ?? []).includes(profile.uid),
  );
  const navigate = useNavigate();

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    void run('search', async () => {
      const result = await findUserByHandle(handle.trim());
      if (!result) throw new Error(`No existe @${handle.replace(/^@/, '')}.`);
      setFound(result);
    });
  };

  const existing = found ? all.find((r) => r.id === pairId(profile.uid, found.uid)) : undefined;

  return (
    <>
      <PageHeader kicker="Amigos" title="Tu círculo" />

      {challenges.length > 0 && (
        <section className="mb-8 border-2 border-accent p-4">
          <h2 className="mb-2 font-display text-xl">Desafíos para ti</h2>
          <ul className="divide-y divide-line">
            {challenges.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-0 flex-1 text-sm">
                  <strong>{c.hostName}</strong> {c.rematchOf ? 'te pide revancha' : 'te desafía'} · {describeMode(c)}
                </span>
                {/* Aceptar = entrar a la sala directamente. */}
                <Button
                  loading={busy === `join${c.id}`}
                  disabled={c.participantIds.length >= c.maxPlayers}
                  onClick={() =>
                    run(`join${c.id}`, async () => {
                      await joinCompetition(c.id, profile);
                      navigate(`/c/${c.id}`);
                    })
                  }
                >
                  {c.participantIds.length >= c.maxPlayers ? 'Sala llena' : 'Aceptar'}
                </Button>
                <Button variant="ghost" loading={busy === `no${c.id}`} onClick={() => run(`no${c.id}`, () => declineRematch(c.id, profile.uid))}>
                  Rechazar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <section className="lg:order-2">
          <h2 className="mb-3 font-display text-xl">Agregar</h2>
          <form onSubmit={handleSearch} className="flex items-end gap-2">
            <div className="flex-1">
              <Input placeholder="@usuario" value={handle} onChange={(e) => setHandle(e.target.value)} aria-label="Usuario" />
            </div>
            <Button type="submit" loading={busy === 'search'} disabled={!handle.trim()} className="h-11">
              Buscar
            </Button>
          </form>
          <div className="mt-3">
            <ErrorBanner error={error} />
          </div>
          {found && (
            <ul className="mt-3">
              <PersonRow profile={found}>
                {found.uid === profile.uid ? (
                  <span className="text-xs text-muted">Eres tú</span>
                ) : existing ? (
                  <span className="text-xs text-muted">{existing.status === 'accepted' ? 'Ya son amigos' : 'Pendiente'}</span>
                ) : (
                  <Button
                    variant="secondary"
                    loading={busy === 'send'}
                    onClick={() => run('send', () => sendFriendRequest(profile.uid, found.uid))}
                  >
                    Agregar
                  </Button>
                )}
              </PersonRow>
            </ul>
          )}

          {incoming.length > 0 && (
            <>
              <h2 className="mb-2 mt-10 font-display text-xl">Solicitudes recibidas</h2>
              <ul>
                {incoming.map((r) => (
                  <PersonRow key={r.id} profile={other(r)}>
                    <Button loading={busy === r.id} onClick={() => run(r.id, () => acceptFriendRequest(r.id))}>
                      Aceptar
                    </Button>
                    <Button variant="ghost" onClick={() => run(`x${r.id}`, () => removeFriendRequest(r.id))}>
                      ✕
                    </Button>
                  </PersonRow>
                ))}
              </ul>
            </>
          )}

          {outgoing.length > 0 && (
            <>
              <h2 className="mb-2 mt-10 font-display text-xl">Enviadas</h2>
              <ul>
                {outgoing.map((r) => (
                  <PersonRow key={r.id} profile={other(r)}>
                    <Button variant="ghost" onClick={() => run(r.id, () => removeFriendRequest(r.id))}>
                      Cancelar
                    </Button>
                  </PersonRow>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="lg:order-1">
          <h2 className="mb-3 font-display text-xl">Amigos ({friends.length})</h2>
          {loading ? (
            <Spinner />
          ) : friends.length === 0 ? (
            <EmptyState title="Aún no tienes amigos aquí">Búscalos por su @usuario.</EmptyState>
          ) : (
            <ul>
              {friends.map((r) => (
                <PersonRow key={r.id} profile={other(r)}>
                  {other(r) && (
                    <Link
                      to={challengeLink(other(r)!)}
                      className="inline-flex h-10 items-center bg-ink px-3 text-sm font-semibold text-paper hover:bg-accent"
                    >
                      Desafiar
                    </Link>
                  )}
                  <Button variant="ghost" onClick={() => run(r.id, () => removeFriendRequest(r.id))} aria-label="Eliminar amigo">
                    ✕
                  </Button>
                </PersonRow>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
