// Amigos: buscar por @usuario, solicitudes entrantes/salientes y lista.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useSession } from '../../hooks/useAuth';
import { useFriends, type FriendRequest } from '../../hooks/useFriends';
import { useUsers } from '../../hooks/useUsers';
import { acceptFriendRequest, findUserByHandle, removeFriendRequest, sendFriendRequest } from '../../lib/repo';
import { errorMessage, pairId } from '../../lib/utils';
import { Avatar, Button, EmptyState, ErrorBanner, Input, PageHeader, Spinner } from '../../components/ui';
import type { UserProfile } from '../../../shared/types';

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
        <span className="font-mono text-xs text-muted">
          @{profile?.handle} · {profile?.rating}
        </span>
      </div>
      <div className="flex gap-2">{children}</div>
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
      <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
        <section>
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

        <section>
          <h2 className="mb-3 font-display text-xl">Amigos ({friends.length})</h2>
          {loading ? (
            <Spinner />
          ) : friends.length === 0 ? (
            <EmptyState title="Aún no tienes amigos aquí">Búscalos por su @usuario.</EmptyState>
          ) : (
            <ul>
              {friends.map((r) => (
                <PersonRow key={r.id} profile={other(r)}>
                  <Link to={`/chat/${r.id}`} className="inline-flex h-10 items-center border border-ink px-3 text-sm font-semibold hover:bg-ink hover:text-paper">
                    Chat
                  </Link>
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
