// Efectos de sonido sintetizados con Web Audio (sin archivos: carga cero y sin licencias).
import { getSettings } from './settings';

type Cue = 'success' | 'wrong' | 'rival' | 'hit' | 'heal' | 'tick' | 'victory' | 'defeat';

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    // Los navegadores suspenden el audio hasta una interacción del usuario.
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

interface Note {
  freq: number;
  start: number; // s desde ahora
  duration: number; // s
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
}

function play(notes: Note[]): void {
  const settings = getSettings();
  if (!settings.sound || settings.volume <= 0) return;
  const ctx = audio();
  if (!ctx) return;
  try {
    const master = ctx.createGain();
    master.gain.value = settings.volume * 0.35;
    master.connect(ctx.destination);
    const now = ctx.currentTime;
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = note.type ?? 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);
      if (note.slideTo) osc.frequency.exponentialRampToValueAtTime(note.slideTo, now + note.start + note.duration);
      // Envolvente corta para evitar clics.
      env.gain.setValueAtTime(0.0001, now + note.start);
      env.gain.exponentialRampToValueAtTime(note.gain ?? 1, now + note.start + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
      osc.connect(env).connect(master);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.05);
    }
  } catch (error) {
    console.warn('[sound] no se pudo reproducir', error);
  }
}

const CUES: Record<Cue, Note[]> = {
  // Arpegio mayor ascendente (Do-Mi-Sol-Do)
  success: [
    { freq: 523.25, start: 0, duration: 0.18, type: 'triangle' },
    { freq: 659.25, start: 0.07, duration: 0.18, type: 'triangle' },
    { freq: 783.99, start: 0.14, duration: 0.22, type: 'triangle' },
    { freq: 1046.5, start: 0.21, duration: 0.35, type: 'sine', gain: 0.8 },
  ],
  wrong: [{ freq: 220, start: 0, duration: 0.22, type: 'square', gain: 0.25, slideTo: 150 }],
  rival: [
    { freq: 880, start: 0, duration: 0.12, type: 'sine', gain: 0.5 },
    { freq: 660, start: 0.1, duration: 0.18, type: 'sine', gain: 0.4 },
  ],
  hit: [
    { freq: 140, start: 0, duration: 0.25, type: 'sawtooth', gain: 0.5, slideTo: 60 },
    { freq: 1200, start: 0, duration: 0.06, type: 'square', gain: 0.15 },
  ],
  heal: [
    { freq: 392, start: 0, duration: 0.25, type: 'sine', gain: 0.4, slideTo: 587 },
    { freq: 587, start: 0.12, duration: 0.3, type: 'sine', gain: 0.3 },
  ],
  tick: [{ freq: 1500, start: 0, duration: 0.04, type: 'square', gain: 0.12 }],
  victory: [
    { freq: 523.25, start: 0, duration: 0.2, type: 'triangle' },
    { freq: 659.25, start: 0.15, duration: 0.2, type: 'triangle' },
    { freq: 783.99, start: 0.3, duration: 0.2, type: 'triangle' },
    { freq: 1046.5, start: 0.45, duration: 0.6, type: 'triangle' },
  ],
  defeat: [
    { freq: 392, start: 0, duration: 0.3, type: 'triangle', gain: 0.6 },
    { freq: 311.13, start: 0.25, duration: 0.3, type: 'triangle', gain: 0.6 },
    { freq: 261.63, start: 0.5, duration: 0.6, type: 'triangle', gain: 0.6 },
  ],
};

export function playCue(cue: Cue): void {
  play(CUES[cue]);
}
