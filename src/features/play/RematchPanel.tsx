// Revancha: se envía como solicitud a todos los jugadores. Si todos aceptan, la partida se repite con las mismas reglas.
// Quien no quiera esas reglas puede rechazar o proponer otros parámetros.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { doc } from 'firebase/firestore';
import type { Competition, UserProfile } from '../../../shared/types';
import { settingsFromConfig } from '../../../shared/gameModes';
import { useLiveDoc } from '../../hooks/useFirestore';
import { db } from '../../lib/firebase';
import { configOf, declineRematch, joinCompetition, proposeRematch, rematchInvitesFor, rematchTitle, type RematchTarget } from '../../lib/repo';
import { errorMessage } from '../../lib/utils';
import { Button, ErrorBanner } from '../../components/ui';

/** Estado que recibe el formulario de creación para proponer una revancha con otros parámetros. */
export interface RematchDraft {
  fromId: string;
  title: string;
  settings: ReturnType<typeof settingsFromConfig>;
  visibility: Competition['visibility'];
  invitedIds: string[];
  invitedNames: Record<string, string>;
  replaceId?: string; // Sala de revancha anterior que se reemplaza (la cancela quien la propuso).
}

export function rematchDraft(target: RematchTarget, hostUid: string): RematchDraft {
  const { invitedIds, invitedNames } = rematchInvitesFor(target, hostUid);
  return {
    fromId: target.competition.id,
    title: rematchTitle(target.competition.title),
    settings: settingsFromConfig(configOf(target.competition)),
    visibility: target.competition.visibility,
    invitedIds,
    invitedNames,
  };
}

export function RematchPanel({ target, profile }: { target: RematchTarget; profile: UserProfile }) {
  const navigate = useNavigate();
  const { competition } = target;
  const proposal = useLiveDoc<Competition>(competition.rematchId ? doc(db, 'competitions', competition.rematchId) : null, [
    competition.rematchId,
  ]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const propose = () =>
    run('propose', async () => {
      const id = await proposeRematch(profile, target);
      navigate(`/c/${id}`);
    });
  const customize = () => navigate('/jugar/nueva', { state: { rematch: rematchDraft(target, profile.uid) } });

  const room = proposal.data;
  // Una propuesta vigente es una sala de revancha que todavía está en espera.
  const open = room && room.status === 'lobby' && room.rematchOf === competition.id ? room : null;
  const mine = open?.hostId === profile.uid;
  const accepted = open?.participantIds.includes(profile.uid) ?? false;
  const declined = open?.declinedIds?.includes(profile.uid) ?? false;
  const invited = open?.invitedIds?.includes(profile.uid) ?? false;

  return (
    <section aria-label="Revancha" className="space-y-3 border-t-2 border-ink pt-5">
      <h2 className="font-display text-2xl">Revancha</h2>
      {open && (mine || accepted) ? (
        <>
          <p className="text-sm text-muted">{mine ? 'Propusiste la revancha.' : 'Aceptaste la revancha.'} Empieza cuando acepten todos.</p>
          <Button onClick={() => navigate(`/c/${open.id}`)}>Ir a la sala</Button>
        </>
      ) : open && invited && !declined ? (
        <>
          <p className="text-sm">
            <strong>{open.hostName}</strong> propone repetir la partida con las mismas reglas.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              loading={busy === 'accept'}
              onClick={() =>
                run('accept', async () => {
                  await joinCompetition(open.id, profile);
                  navigate(`/c/${open.id}`);
                })
              }
            >
              Aceptar
            </Button>
            <Button variant="secondary" loading={busy === 'decline'} onClick={() => run('decline', () => declineRematch(open.id, profile.uid))}>
              Rechazar
            </Button>
            <Button variant="ghost" onClick={customize}>
              Proponer otros parámetros
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            {declined
              ? 'Rechazaste la revancha. Puedes proponer otra con distintos parámetros.'
              : 'Envía una solicitud a todos los jugadores. Si aceptan, la partida se repite con las mismas reglas.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {!declined && (
              <Button loading={busy === 'propose'} onClick={() => void propose()}>
                Pedir revancha
              </Button>
            )}
            <Button variant={declined ? 'primary' : 'ghost'} onClick={customize}>
              Cambiar parámetros
            </Button>
          </div>
        </>
      )}
      <ErrorBanner error={error} />
    </section>
  );
}
