// COOP en la sala: cada jugador elige un personaje (no se repiten). Los tomados por otros quedan bloqueados.
import { memo, useState } from 'react';
import { AT_CHARACTER_IDS, CHARACTERS, type CharacterId } from '../../../shared/coop/catalog/characters';
import type { Competition, Participant } from '../../../shared/types';
import { chooseCharacter } from '../../lib/repo';
import { cx, errorMessage } from '../../lib/utils';

export const CharacterPicker = memo(function CharacterPicker({
  competition,
  participants,
  meId,
}: {
  competition: Competition;
  participants: Participant[];
  meId: string;
}) {
  const [busy, setBusy] = useState<CharacterId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const joined = competition.participantIds.includes(meId);
  const chosen = competition.coopCharacters ?? {};
  const mine = chosen[meId] as CharacterId | undefined;
  // Solo cuentan las elecciones de quienes siguen en la sala.
  const takenBy = new Map<string, string>();
  for (const p of participants) {
    const pick = chosen[p.uid];
    if (pick && p.uid !== meId) takenBy.set(pick, p.displayName);
  }

  const pick = async (id: CharacterId) => {
    setBusy(id);
    setError(null);
    try {
      await chooseCharacter(competition.id, meId, id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="coop-characters">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="coop-characters" className="font-display text-xl">
          Personajes
        </h2>
        <p className="text-sm text-muted">{joined ? (mine ? `Elegiste a ${CHARACTERS[mine].name}.` : 'Elige uno: no se repiten ni se cambian al empezar.') : 'Únete a la sala para elegir.'}</p>
      </div>
      {error && <p className="mb-2 text-sm text-accent">{error}</p>}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {AT_CHARACTER_IDS.map((id) => {
          const character = CHARACTERS[id];
          const owner = takenBy.get(id);
          const selected = mine === id;
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={!joined || Boolean(owner) || busy !== null}
                onClick={() => void pick(id)}
                className={cx(
                  'flex h-full w-full flex-col gap-1 border p-3 text-left text-sm transition-colors disabled:cursor-not-allowed',
                  selected ? 'border-ink bg-ink text-paper' : owner ? 'border-line opacity-50' : 'border-line hover:border-ink',
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg">{character.name}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-widest opacity-70">
                    {owner ?? (selected ? 'Tú' : busy === id ? '…' : '')}
                  </span>
                </span>
                <span>
                  <strong className="text-[11px] uppercase tracking-widest">Pasiva · </strong>
                  {character.passive}
                </span>
                <span>
                  <strong className="text-[11px] uppercase tracking-widest">Activa · </strong>
                  {character.active}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
