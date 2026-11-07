// Crear sala en un paso: visibilidad + modo. El resto de reglas sale de la última configuración usada para ese modo
// y se cambia después dentro de la sala («Parámetros»). Con `rival` crea un desafío privado con invitación.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { buildConfig } from '../../../shared/gameModes';
import { GAME_LABELS } from '../../../shared/scoring';
import type { CompetitionVisibility } from '../../../shared/types';
import { createCompetition } from '../../lib/repo';
import { errorMessage } from '../../lib/utils';
import { Modal } from '../../components/Modal';
import { Button, ErrorBanner } from '../../components/ui';
import { describeMode, describeModifiers } from './CompetitionCard';
import { Chips, loadStored, ModeTabs, saveStored, VISIBILITY, VISIBILITY_INFO, type Stored } from './roomForm';

export interface ChallengeTarget {
  uid: string;
  name: string;
}

export function CreateRoomDialog({ open, onClose, rival }: { open: boolean; onClose: () => void; rival?: ChallengeTarget | null }) {
  const navigate = useNavigate();
  const [stored, setStored] = useState<Stored>(() => loadStored());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibility: CompetitionVisibility = rival ? 'private' : stored.visibility;
  const built = useMemo(() => buildConfig(stored.settings), [stored.settings]);
  // Resumen de lo que se va a crear con la configuración recordada.
  const summary = useMemo(() => {
    const room = { ...built.config, maxPlayers: built.maxPlayers };
    return [describeMode(room), ...describeModifiers(room).slice(0, 3)].join(' · ');
  }, [built]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      saveStored(stored);
      const id = await createCompetition({
        ...built.config,
        visibility,
        maxPlayers: built.maxPlayers,
        clueCount: built.clueCount,
        ...(rival ? { invitedIds: [rival.uid], invitedNames: { [rival.uid]: rival.name } } : {}),
      });
      navigate(`/c/${id}`, { replace: Boolean(rival) });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rival ? `Desafiar a ${rival.name}` : 'Crear sala'}
      footer={
        <Button onClick={() => void create()} loading={busy} className="h-12 w-full text-base">
          {rival ? 'Crear desafío' : 'Crear sala'}
        </Button>
      }
    >
      <div className="space-y-5">
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Sala</p>
          {rival ? (
            <p className="text-sm">
              <strong>Privada</strong>: {rival.name} la verá en Amigos; también puede entrar con el código o el enlace.
            </p>
          ) : (
            <>
              <Chips<CompetitionVisibility>
                label="Visibilidad"
                value={visibility}
                options={VISIBILITY}
                onChange={(value) => setStored((prev) => ({ ...prev, visibility: value }))}
              />
              <p className="mt-2 text-xs text-muted">{VISIBILITY_INFO}</p>
            </>
          )}
        </section>
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Modo</p>
          <ModeTabs value={stored.settings.game} onChange={(game) => setStored((prev) => ({ ...prev, settings: { ...prev.settings, game } }))} />
          <p className="mt-2 text-sm text-muted">{GAME_LABELS[stored.settings.game].description}</p>
        </section>
        <p className="border-l-4 border-line pl-3 text-xs text-muted">
          Se crea con tu última configuración: <span className="font-mono">{summary}</span>. Dentro de la sala puedes cambiar todo con «Parámetros».
        </p>
        <ErrorBanner error={error} />
      </div>
    </Modal>
  );
}
