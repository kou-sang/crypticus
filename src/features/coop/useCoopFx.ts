// Efectos de la partida COOP a partir de los eventos del servidor: números flotantes de daño/curación,
// sacudidas, avisos grandes (muerte y resurrección), registro de la zona de cripticos, manchas y sonidos.
import { useEffect, useRef, useState } from 'react';
import type { CoopEvent } from '../../../shared/coop/events';
import type { CoopState } from '../../../shared/coop/state';
import { playCue, playUi, type Cue } from '../../lib/sound';
import { describeEvent, nameOf } from './describe';

export type FxTarget = 'boss' | 'rex' | string; // string: id de jugador.

export interface Floater {
  id: number;
  target: FxTarget;
  text: string;
  tone: 'damage' | 'heal' | 'gold' | 'miss';
  size: number; // px: 12, 14, 16 o 18 según la cantidad.
}

export interface Banner {
  id: number;
  text: string;
  tone: 'death' | 'revive' | 'boss' | 'result';
}

export interface LogLine {
  id: number;
  text: string;
}

export interface LiceStain {
  id: number;
  left: number;
  top: number;
  size: number;
}

const FLOATER_MS = 1_300;
const BANNER_MS = 3_200;
const LOG_LIMIT = 8;
const LICE_LIMIT = 14;

/** 12 → 18 px según la cantidad (proporcional, en 4 escalones). */
export function floaterSize(amount: number): number {
  const value = Math.abs(amount);
  if (value < 20) return 12;
  if (value < 60) return 14;
  if (value < 150) return 16;
  return 18;
}

/** PRNG pequeño para ubicar las manchas a partir de la semilla del evento. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function useCoopFx(subscribe: (listener: (events: CoopEvent[]) => void) => () => void, state: CoopState | null, meId: string) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [lice, setLice] = useState<LiceStain[]>([]);
  /** Contador por objetivo: cambia la `key` del elemento para reiniciar la animación. */
  const [hits, setHits] = useState<Record<string, number>>({});
  const [heals, setHeals] = useState<Record<string, number>>({});
  const seq = useRef(0);
  const latestState = useRef(state);
  latestState.current = state;

  useEffect(
    () =>
      subscribe((events) => {
        const current = latestState.current;
        const nextFloaters: Floater[] = [];
        const nextBanners: Banner[] = [];
        const lines: LogLine[] = [];
        const stains: LiceStain[] = [];
        const hitTargets = new Set<string>();
        const healTargets = new Set<string>();
        const cues = new Set<Cue>();
        const id = () => (seq.current += 1);

        for (const event of events) {
          const text = describeEvent(event, current);
          if (text) lines.push({ id: id(), text });
          switch (event.type) {
            case 'playerHit':
              nextFloaters.push({
                id: id(),
                target: event.target,
                text: `−${event.amount}${event.evaded ? ' (esquivó)' : ''}`,
                tone: event.evaded ? 'miss' : 'damage',
                size: floaterSize(event.amount),
              });
              hitTargets.add(event.target);
              cues.add('hit');
              break;
            case 'bossHit':
              if (event.evaded) nextFloaters.push({ id: id(), target: event.playerId, text: 'Esquivó', tone: 'miss', size: 12 });
              break;
            case 'damage':
              nextFloaters.push({ id: id(), target: event.playerId, text: `−${event.amount}`, tone: 'damage', size: floaterSize(event.amount) });
              hitTargets.add(event.playerId);
              if (event.playerId === meId) cues.add(event.amount >= 50 ? 'danger' : 'hit');
              break;
            case 'heal':
              nextFloaters.push({ id: id(), target: event.playerId, text: `+${event.amount}`, tone: 'heal', size: floaterSize(event.amount) });
              healTargets.add(event.playerId);
              cues.add('heal');
              break;
            case 'bossHeal':
              nextFloaters.push({ id: id(), target: 'boss', text: `+${event.amount}`, tone: 'heal', size: floaterSize(event.amount) });
              healTargets.add('boss');
              break;
            case 'gold':
              if (event.playerId === meId) {
                nextFloaters.push({ id: id(), target: meId, text: `${event.amount > 0 ? '+' : ''}${event.amount} oro`, tone: 'gold', size: 12 });
                cues.add('gold');
              }
              break;
            case 'death':
              nextBanners.push({ id: id(), text: `${nameOf(current, event.playerId)} cayó`, tone: 'death' });
              cues.add('eliminated');
              break;
            case 'revive':
              nextBanners.push({ id: id(), text: `${nameOf(current, event.playerId)} volvió a la vida`, tone: 'revive' });
              cues.add('revive');
              break;
            case 'bossDefeated':
              cues.add('success');
              break;
            case 'bossAbility':
            case 'secretRevealed':
              cues.add('danger');
              break;
            case 'activeUsed':
            case 'itemUsed':
              cues.add('power');
              break;
            case 'lice': {
              const random = seeded(event.seed);
              for (let i = 0; i < 3; i += 1) stains.push({ id: id(), left: random() * 90, top: random() * 80, size: 18 + random() * 36 });
              break;
            }
            case 'roundStart':
              setLice([]); // Las manchas duran hasta la ronda siguiente.
              break;
            case 'gameOver':
              nextBanners.push({ id: id(), text: event.won ? '¡Victoria!' : 'Derrota', tone: 'result' });
              cues.add(event.won ? 'victory' : 'defeat');
              break;
          }
        }

        if (nextFloaters.length > 0) {
          setFloaters((prev) => [...prev, ...nextFloaters]);
          const ids = new Set(nextFloaters.map((f) => f.id));
          window.setTimeout(() => setFloaters((prev) => prev.filter((f) => !ids.has(f.id))), FLOATER_MS);
        }
        if (nextBanners.length > 0) {
          setBanners((prev) => [...prev, ...nextBanners]);
          const ids = new Set(nextBanners.map((b) => b.id));
          window.setTimeout(() => setBanners((prev) => prev.filter((b) => !ids.has(b.id))), BANNER_MS);
        }
        if (lines.length > 0) setLog((prev) => [...prev, ...lines].slice(-LOG_LIMIT));
        if (stains.length > 0) setLice((prev) => [...prev, ...stains].slice(-LICE_LIMIT));
        if (hitTargets.size > 0) setHits((prev) => bump(prev, hitTargets));
        if (healTargets.size > 0) setHeals((prev) => bump(prev, healTargets));
        if (events.some((e) => e.type === 'shopOpen')) playUi('open');
        // Un sonido por tipo y por difusión: varios golpes juntos no se apilan.
        for (const cue of cues) playCue(cue);
      }),
    [subscribe, meId],
  );

  return { floaters, banners, log, lice, hits, heals };
}

function bump(prev: Record<string, number>, targets: Set<string>): Record<string, number> {
  const next = { ...prev };
  for (const target of targets) next[target] = (next[target] ?? 0) + 1;
  return next;
}
