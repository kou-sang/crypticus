// Selección de personajes al iniciar (estilo «champion select»): cada uno elige y confirma; no se repiten.
// Al vencer el tiempo, quien no eligió recibe un personaje libre al azar.
import { memo, useState } from 'react';
import { coopLevelLabel } from '../../../shared/coop/balance';
import { AT_CHARACTER_IDS, CHARACTERS, type CharacterId } from '../../../shared/coop/catalog/characters';
import type { CoopClientAction, CoopReply, CoopView } from '../../../shared/coop/protocol';
import { Button } from '../../components/ui';
import { playUi } from '../../lib/sound';
import { cx, errorMessage } from '../../lib/utils';
import { CharacterSilhouette } from './silhouettes';

export const DraftWindow = memo(function DraftWindow({
  view,
  meId,
  now,
  act,
}: {
  view: CoopView;
  meId: string;
  now: number;
  act: (action: CoopClientAction) => Promise<CoopReply>;
}) {
  const draft = view.draft!;
  const mine = draft.picks[meId];
  const locked = draft.locked.includes(meId);
  const [focus, setFocus] = useState<CharacterId>(mine ?? AT_CHARACTER_IDS[0]!);
  const [error, setError] = useState<string | null>(null);
  const left = Math.max(0, Math.ceil((draft.endsAt - now) / 1000));
  const ownerOf = new Map(Object.entries(draft.picks).map(([uid, character]) => [character, uid]));
  const nameOf = (uid: string) => view.players.find((p) => p.uid === uid)?.name ?? '';
  const shown = CHARACTERS[focus];

  const run = (action: CoopClientAction) => {
    setError(null);
    act(action).catch((err: unknown) => setError(errorMessage(err)));
  };

  const pick = (id: CharacterId) => {
    setFocus(id);
    if (locked) return;
    const owner = ownerOf.get(id);
    if (owner && owner !== meId) return;
    playUi('tab');
    run({ kind: 'pick', character: id });
  };

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 px-6 pb-4 pt-2">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted">COOP · Nivel {coopLevelLabel(view.level, view.stage)}</p>
          <h1 className="font-display text-4xl">Elige tu personaje</h1>
        </div>
        <p className={cx('font-mono text-4xl font-bold tabular-nums', left <= 10 && 'text-accent')}>{left}</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        <ul className="grid content-start gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
          {AT_CHARACTER_IDS.map((id) => {
            const owner = ownerOf.get(id);
            const takenByOther = owner !== undefined && owner !== meId;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={mine === id}
                  onClick={() => pick(id)}
                  onMouseEnter={() => setFocus(id)}
                  className={cx(
                    'flex w-full flex-col items-center gap-1 border-2 p-3 text-center transition-colors',
                    mine === id ? 'border-accent bg-accent/10' : takenByOther ? 'border-line opacity-45' : 'border-line hover:border-ink',
                  )}
                >
                  <span className="coop-halo">
                    <CharacterSilhouette id={id} className="size-16" />
                  </span>
                  <span className="font-display text-lg uppercase leading-tight">{CHARACTERS[id].name}</span>
                  <span className="h-4 text-[11px] text-muted">
                    {owner ? `${nameOf(owner)}${draft.locked.includes(owner) ? ' ✓' : ''}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <aside className="surface flex min-h-0 flex-col gap-3 overflow-y-auto border-2 border-ink p-4">
          <div className="flex items-center gap-3">
            <span className="coop-halo">
              <CharacterSilhouette id={focus} className="size-20" />
            </span>
            <h2 className="font-display text-3xl uppercase">{shown.name}</h2>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Pasiva</p>
            <p>{shown.passive}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Activa · {shown.maxCharges === null ? 'sin límite de cargas' : `${shown.startCharges}/${shown.maxCharges} cargas al empezar`}
            </p>
            <p>{shown.active}</p>
          </div>
          <div className="mt-auto space-y-2">
            {error && <p className="text-sm text-accent">{error}</p>}
            <Button
              className="w-full"
              disabled={locked || !mine}
              onClick={() => {
                playUi('submit');
                run({ kind: 'lock' });
              }}
            >
              {locked ? `Confirmado: ${CHARACTERS[mine!].name}` : mine ? `Confirmar ${CHARACTERS[mine].name}` : 'Elige un personaje'}
            </Button>
          </div>
        </aside>
      </div>

      {/* La party, como en la selección de campeones: quién eligió y quién ya confirmó. */}
      <ul className="grid shrink-0 grid-cols-4 gap-2 xl:grid-cols-8">
        {view.players.map((player) => {
          const character = draft.picks[player.uid];
          const done = draft.locked.includes(player.uid);
          return (
            <li key={player.uid} className={cx('flex items-center gap-2 border p-2 text-sm', done ? 'border-ink' : 'border-dashed border-line')}>
              <span className="coop-halo shrink-0">
                {character ? <CharacterSilhouette id={character} className="size-8" /> : <span className="block size-8" />}
              </span>
              <span className="min-w-0">
                <span className={cx('block truncate font-semibold', player.uid === meId && 'text-accent')}>{player.name}</span>
                <span className="block truncate text-xs text-muted">
                  {character ? CHARACTERS[character].name : 'Eligiendo…'}
                  {done ? ' ✓' : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
