// Efectos de la partida COOP a partir de los eventos del servidor: números flotantes de daño/curación,
// sacudidas, avisos grandes (muerte y resurrección), registro de la zona de cripticos, manchas y sonidos.
import { useEffect, useRef, useState } from 'react';
import { PHARAONIS_EFFECTS, type PharaonisEffect } from '../../../shared/coop/catalog/bosses';
import { PHARAONIS_EFFECT_INFO } from '../../../shared/coop/effects';
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
  /** Segunda línea opcional (qué hace lo que pasó). */
  detail?: string;
  tone: 'death' | 'revive' | 'boss' | 'result';
}

export interface LogLine {
  id: number;
  text: string;
  /** Hora local de llegada (ms): ordena la línea entre los mensajes del chat. */
  at: number;
}

/** Pulso visual de un objetivo: `n` cambia la `key` (reinicia la animación); `kind` decide cuál se reproduce. */
export interface Pulse {
  n: number;
  kind: 'hit' | 'heal';
}

/** Mancha de los piojos de PHARAONIS. Posición en %, tamaño en px, giro en grados, alfa de la tinta 0–1. */
export interface LiceStain {
  id: number;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  /** `border-radius` irregular (8 radios): da la forma de mancha. */
  radius: string;
  alpha: number;
}

const FLOATER_MS = 1_300;
const BANNER_MS = 3_200;
const DETAIL_BANNER_MS = 6_000;
const LOG_LIMIT = 12;
/** Líneas que se conservan para el chat lateral (más que en la zona de cripticos). */
const HISTORY_LIMIT = 80;

/** Causa corta junto al número flotante (el golpe del jefe no la lleva: se ve en el registro). */
const DAMAGE_CAUSE: Partial<Record<Extract<CoopEvent, { type: 'damage' }>['source'], string>> = {
  burn: 'quemadura',
  poison: 'veneno',
  pharaonis: 'PHARAONIS',
  apple: 'manzana',
  offer: 'oferta',
  gedeon: 'soldado',
  naaman: 'ofrenda',
};
/** Manchas por golpe y tope en pantalla (las más viejas se van primero). */
const LICE_PER_HIT = 10;
const LICE_LIMIT = 60;

/** 12 → 18 px según la cantidad (proporcional, en 4 escalones). */
export function floaterSize(amount: number): number {
  const value = Math.abs(amount);
  if (value < 20) return 12;
  if (value < 60) return 14;
  if (value < 150) return 16;
  return 18;
}

/** PRNG pequeño para ubicar las manchas a partir de la semilla del evento. */
/**
 * Mancha al azar: tamaño de 10 a 64 px, proporción 0,6–1,6, giro libre y contorno irregular. Translúcida
 * (14–24 % de la tinta del tema): donde se superponen dos o más, se oscurece por acumulación.
 */
function liceStain(random: () => number): Omit<LiceStain, 'id'> {
  const base = 10 + random() ** 1.6 * 54; // Más manchas chicas que grandes.
  const ratio = 0.6 + random();
  const r = () => `${Math.round(30 + random() * 40)}%`;
  return {
    left: random() * 94,
    top: random() * 88,
    width: Math.round(base * Math.sqrt(ratio)),
    height: Math.round(base / Math.sqrt(ratio)),
    rotate: Math.round(random() * 360),
    radius: `${r()} ${r()} ${r()} ${r()} / ${r()} ${r()} ${r()} ${r()}`,
    alpha: 0.14 + random() * 0.1,
  };
}

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
  const [history, setHistory] = useState<LogLine[]>([]);
  const [lice, setLice] = useState<LiceStain[]>([]);
  /** Último pulso por objetivo: antes, una curación remontaba la tarjeta con la sacudida de daño. */
  const [pulses, setPulses] = useState<Record<string, Pulse>>({});
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
          const text = describeEvent(event, current, meId);
          if (text) lines.push({ id: id(), text, at: Date.now() });
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
            case 'damage': {
              const cause = DAMAGE_CAUSE[event.source];
              nextFloaters.push({
                id: id(),
                target: event.playerId,
                text: cause ? `−${event.amount} ${cause}` : `−${event.amount}`,
                tone: 'damage',
                size: floaterSize(event.amount),
              });
              hitTargets.add(event.playerId);
              if (event.playerId === meId) cues.add(event.amount >= 50 ? 'danger' : 'hit');
              break;
            }
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
            case 'bossAbility': {
              // Plagas de PHARAONIS: aviso grande con qué se activó y cómo afecta (en el registro se perdía).
              const index = event.bossId === 'pharaonis' ? PHARAONIS_EFFECTS.indexOf(event.ability as PharaonisEffect) : -1;
              if (index >= 0) {
                const info = PHARAONIS_EFFECT_INFO[PHARAONIS_EFFECTS[index]!];
                nextBanners.push({ id: id(), text: `PHARAONIS · Plaga ${index + 1}: ${info.name}`, detail: `${info.detail}.`, tone: 'boss' });
              }
              cues.add('danger');
              break;
            }
            case 'secretRevealed':
              cues.add('danger');
              break;
            case 'activeUsed':
            case 'itemUsed':
              cues.add('power');
              break;
            case 'lice': {
              const random = seeded(event.seed);
              for (let i = 0; i < LICE_PER_HIT; i += 1) stains.push({ id: id(), ...liceStain(random) });
              break;
            }
            case 'roundStart':
              setLice([]); // Las manchas duran hasta la ronda siguiente.
              break;
            case 'surrenderVote':
              if (event.accept && event.yes === 1) cues.add('danger');
              break;
            case 'gameOver':
              nextBanners.push({ id: id(), text: event.won ? '¡Victoria!' : event.surrendered ? 'Se rindieron' : 'Derrota', tone: 'result' });
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
          // Los avisos con explicación quedan más tiempo en pantalla para poder leerlos.
          for (const banner of nextBanners) {
            window.setTimeout(() => setBanners((prev) => prev.filter((b) => b.id !== banner.id)), banner.detail ? DETAIL_BANNER_MS : BANNER_MS);
          }
        }
        if (lines.length > 0) {
          setLog((prev) => [...prev, ...lines].slice(-LOG_LIMIT));
          setHistory((prev) => [...prev, ...lines].slice(-HISTORY_LIMIT));
        }
        if (stains.length > 0) setLice((prev) => [...prev, ...stains].slice(-LICE_LIMIT));
        if (hitTargets.size > 0 || healTargets.size > 0) setPulses((prev) => pulse(prev, hitTargets, healTargets));
        if (events.some((e) => e.type === 'shopOpen')) playUi('open');
        // Un sonido por tipo y por difusión: varios golpes juntos no se apilan.
        for (const cue of cues) playCue(cue);
      }),
    [subscribe, meId],
  );

  return { floaters, banners, log, history, lice, pulses };
}

/** Si en la misma difusión un objetivo recibe daño y curación, se ve el daño. */
function pulse(prev: Record<string, Pulse>, hit: Set<string>, healed: Set<string>): Record<string, Pulse> {
  const next = { ...prev };
  for (const target of new Set([...hit, ...healed])) {
    next[target] = { n: (prev[target]?.n ?? 0) + 1, kind: hit.has(target) ? 'hit' : 'heal' };
  }
  return next;
}
