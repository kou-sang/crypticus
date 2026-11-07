// Parámetros de la sala en espera (anfitrión): mismas opciones que al crear, en una ventana sobre el lobby.
// Los que ya entraron siguen dentro y ven las reglas nuevas al instante (Firestore).
import { useEffect, useMemo, useState } from 'react';
import { buildConfig } from '../../../shared/gameModes';
import { validateConfig } from '../../../shared/scoring';
import type { Competition } from '../../../shared/types';
import { updateCompetition } from '../../lib/repo';
import { errorMessage } from '../../lib/utils';
import { Modal } from '../../components/Modal';
import { Button, ErrorBanner } from '../../components/ui';
import { loadStored, RoomRulesForm, saveStored, type Stored } from '../competitions/roomForm';
import { editDraft } from './RematchPanel';

export function RoomSettingsDialog({ competition, open, onClose }: { competition: Competition; open: boolean; onClose: () => void }) {
  const [stored, setStored] = useState<Stored>(() => loadStored(editDraft(competition)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir, parte siempre de las reglas actuales de la sala.
  useEffect(() => {
    if (!open) return;
    setStored(loadStored(editDraft(competition)));
    setError(null);
    // Solo al abrir: mientras se edita, los cambios de Firestore no pisan el borrador.
  }, [open]);

  const built = useMemo(() => buildConfig(stored.settings), [stored.settings]);
  const validation = useMemo(() => validateConfig(built.config, built.maxPlayers), [built]);
  const joined = competition.participantIds.length;
  const overCapacity = joined > built.maxPlayers ? `Ya hay ${joined} jugadores: este modo admite ${built.maxPlayers}.` : null;
  const problem = validation.length > 0 ? validation.join(' ') : overCapacity;

  const save = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await updateCompetition(competition.id, {
        ...built.config,
        visibility: competition.rematchOf ? competition.visibility : stored.visibility,
        maxPlayers: built.maxPlayers,
        clueCount: built.clueCount,
      });
      // La última configuración guardada es el punto de partida de la próxima sala.
      saveStored(stored);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Parámetros de la sala"
      wide
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} loading={busy} disabled={problem !== null} className="h-11 flex-1">
            Guardar cambios
          </Button>
          <Button variant="ghost" onClick={onClose} className="h-11">
            Cancelar
          </Button>
        </div>
      }
    >
      <RoomRulesForm
        stored={stored}
        onChange={setStored}
        visibilityNote={competition.rematchOf ? <p className="py-3 text-sm text-muted">Revancha: la visibilidad no cambia.</p> : undefined}
      />
      <div className="mt-4">
        <ErrorBanner error={error ?? problem} />
      </div>
    </Modal>
  );
}
