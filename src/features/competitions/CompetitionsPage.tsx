// Listado de salas abiertas (públicas y de amigos), creación rápida y entrada con código de 4 letras.
// ?crear=1 abre la creación; con &rival=uid&name=… crea un desafío privado.
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { isActiveRoom } from '../../lib/rooms';
import { useLiveQuery } from '../../hooks/useFirestore';
import { useFriends } from '../../hooks/useFriends';
import type { Competition } from '../../../shared/types';
import { Button, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { cx, errorMessage } from '../../lib/utils';
import { findOpenRoomByCode } from '../../lib/repo';
import { normalizeRoomCode, ROOM_CODE_LENGTH } from '../../../shared/roomCode';
import { CompetitionCard } from './CompetitionCard';
import { CreateRoomDialog } from './CreateRoomDialog';

/** Entrar a una sala (incluidas las privadas) escribiendo su código. */
function JoinByCode() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const code = normalizeRoomCode(value);
    if (!code) return setError(`El código tiene ${ROOM_CODE_LENGTH} letras.`);
    setBusy(true);
    setError(null);
    try {
      const room = await findOpenRoomByCode(code);
      if (!room) {
        setError(`No hay ninguna sala abierta con el código ${code}.`);
        return;
      }
      navigate(`/c/${room.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Za-z]/g, '').slice(0, ROOM_CODE_LENGTH))}
          placeholder="CÓDIGO"
          aria-label="Código de sala"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={ROOM_CODE_LENGTH}
          className="h-10 w-28 border border-r-0 border-ink bg-paper px-3 text-center font-mono text-base font-semibold uppercase tracking-[0.3em] outline-none placeholder:tracking-widest placeholder:text-muted focus:bg-paper-2"
        />
        <Button type="submit" variant="secondary" loading={busy} disabled={value.length !== ROOM_CODE_LENGTH}>
          Entrar
        </Button>
      </div>
      {error && <p role="alert" className="max-w-xs text-xs text-accent">{error}</p>}
    </form>
  );
}

type Tab = 'public' | 'friends';

export default function CompetitionsPage() {
  const { profile } = useSession();
  const [tab, setTab] = useState<Tab>('public');
  const [params, setParams] = useSearchParams();
  const creating = params.get('crear') === '1';
  const rivalId = params.get('rival');
  const rival = rivalId ? { uid: rivalId, name: params.get('name') ?? 'tu amigo' } : null;
  const setCreating = (open: boolean) => setParams(open ? { crear: '1' } : {}, { replace: true });
  const { friendIds } = useFriends(profile.uid);
  // Firestore limita `in` a 30 valores: se usan los primeros 30 amigos.
  const friendKey = friendIds.slice(0, 30).sort().join(',');

  const publicLive = useLiveQuery<Competition>(
    tab === 'public'
      ? query(
          collection(db, 'competitions'),
          where('visibility', '==', 'public'),
          where('status', 'in', ['lobby', 'live']),
          orderBy('createdAt', 'desc'),
          limit(30),
        )
      : null,
    [tab],
    { serverOnly: true },
  );

  const friendsLive = useLiveQuery<Competition>(
    tab === 'friends' && friendKey
      ? query(
          collection(db, 'competitions'),
          where('visibility', '==', 'friends'),
          where('hostId', 'in', friendKey.split(',')),
          // Las más recientes (índice visibility + hostId + createdAt). Antes, sin orden, el límite devolvía
          // 30 salas cualquiera (casi todas terminadas o abandonadas) y la lista cambiaba sola.
          orderBy('createdAt', 'desc'),
          limit(30),
        )
      : null,
    [tab, friendKey],
    { serverOnly: true },
  );

  // Mis salas abiertas (las que creé o en las que estoy): siguen visibles hasta cancelarlas o que venzan,
  // aunque sean privadas o de amigos (antes solo aparecían en las listas públicas/de amigos de otros).
  const mineLive = useLiveQuery<Competition>(
    query(collection(db, 'competitions'), where('participantIds', 'array-contains', profile.uid), orderBy('createdAt', 'desc'), limit(10)),
    [profile.uid],
    { serverOnly: true },
  );

  const source = tab === 'public' ? publicLive : friendsLive;
  // Sin salas terminadas ni abandonadas (en espera o «en vivo» de hace horas).
  const now = Date.now();
  const mine = mineLive.data.filter((c) => isActiveRoom(c, now));
  const mineIds = new Set(mine.map((c) => c.id));
  const items = source.data.filter((c) => isActiveRoom(c, now) && !mineIds.has(c.id));

  return (
    <>
      <PageHeader
        kicker="Competir"
        title="Salas abiertas"
        action={
          <div className="flex flex-wrap items-start gap-3">
            <JoinByCode />
            <Button onClick={() => setCreating(true)}>+ Crear</Button>
          </div>
        }
      />
      <CreateRoomDialog key={rival?.uid ?? 'new'} open={creating} rival={rival} onClose={() => setCreating(false)} />

      {mine.length > 0 && (
        <section aria-labelledby="my-rooms" className="mb-8">
          <h2 id="my-rooms" className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted">
            Tus salas pendientes
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((c) => (
              <CompetitionCard key={c.id} competition={c} />
            ))}
          </div>
        </section>
      )}

      <div className="mb-6 flex gap-1">
        {(['public', 'friends'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={cx(
              'seg-tab border px-4 py-2 text-sm font-semibold transition-colors',
              tab === value ? 'border-ink bg-ink text-paper' : 'border-line bg-paper-2/50 hover:border-ink',
            )}
          >
            {value === 'public' ? 'Públicas' : 'De amigos'}
          </button>
        ))}
      </div>

      <ErrorBanner error={source.error?.message ?? null} />

      {source.loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title={tab === 'public' ? 'No hay salas públicas ahora' : 'Tus amigos no tienen salas abiertas'}>
          Sé el primero con «+ Crear».
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => <CompetitionCard key={c.id} competition={c} />)}
        </div>
      )}
    </>
  );
}
