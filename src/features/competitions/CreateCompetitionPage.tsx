// Revancha con otros parámetros (desde resultados): se definen las reglas antes de invitar; quienes aceptan
// entran a la sala y el anfitrión la inicia. Las salas nuevas se crean desde Jugar («+ Crear») y se editan dentro.
// Enlaces viejos (/jugar/nueva y /jugar/nueva?rival=…) redirigen a la creación rápida.
import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { createCompetition } from '../../lib/repo';
import type { RematchDraft } from '../play/RematchPanel';
import { errorMessage } from '../../lib/utils';
import { buildConfig } from '../../../shared/gameModes';
import { validateConfig } from '../../../shared/scoring';
import { Button, ErrorBanner, PageHeader } from '../../components/ui';
import { BackLink } from '../../components/BackLink';
import { loadStored, RoomRulesForm, type Stored } from './roomForm';

export default function CreateCompetitionPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const rematch = (location.state as { rematch?: RematchDraft } | null)?.rematch ?? null;
  if (!rematch) {
    const next = new URLSearchParams(params);
    next.set('crear', '1');
    return <Navigate to={`/jugar?${next.toString()}`} replace />;
  }
  return <RematchForm rematch={rematch} />;
}

function RematchForm({ rematch }: { rematch: RematchDraft }) {
  const navigate = useNavigate();
  const [stored, setStored] = useState<Stored>(() => loadStored(rematch));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const built = useMemo(() => buildConfig(stored.settings), [stored.settings]);
  const validation = useMemo(() => validateConfig(built.config, built.maxPlayers), [built]);

  const submit = async () => {
    if (validation.length > 0) return setError(validation.join(' '));
    setError(null);
    setBusy(true);
    try {
      const id = await createCompetition({
        ...built.config,
        visibility: stored.visibility,
        maxPlayers: built.maxPlayers,
        clueCount: built.clueCount,
        invitedIds: rematch.invitedIds,
        invitedNames: rematch.invitedNames,
        rematchOf: rematch.fromId,
      });
      navigate(`/c/${id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink fallback="/jugar" />
      <PageHeader kicker="Jugar" title="Revancha con otros parámetros" />
      <p className="-mt-4 mb-6 text-sm text-muted">
        Se enviará a {Object.values(rematch.invitedNames).join(', ') || 'los mismos jugadores'}. Quien acepte entra a la sala; tú inicias la partida.
      </p>
      <RoomRulesForm stored={stored} onChange={setStored} />
      <div className="mt-6 space-y-3">
        <ErrorBanner error={error ?? (validation.length > 0 ? validation.join(' ') : null)} />
        <Button onClick={() => void submit()} loading={busy} disabled={validation.length > 0} className="h-12 w-full text-base">
          Proponer revancha
        </Button>
      </div>
    </div>
  );
}
