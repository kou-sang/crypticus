// Efectos de sonido sintetizados con Web Audio (sin archivos: carga cero y sin licencias).
import { getSettings, type SoundGroup } from './settings';

type Cue =
  | 'success'
  | 'wrong'
  | 'rival'
  | 'hit'
  | 'heal'
  | 'tick'
  | 'victory'
  | 'defeat'
  | 'lowTime'
  | 'eliminated'
  | 'lowHealth'
  | 'danger'
  | 'combo';

const CUE_GROUP: Record<Cue, SoundGroup> = {
  success: 'answers',
  wrong: 'answers',
  rival: 'rivals',
  hit: 'rivals',
  heal: 'rivals',
  tick: 'countdown',
  victory: 'results',
  defeat: 'results',
  lowTime: 'lowTime',
  eliminated: 'rivals',
  lowHealth: 'lowTime',
  danger: 'lowTime',
  combo: 'answers',
};

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
  // Doble pitido agudo: urgencia sin tapar el resto.
  lowTime: [
    { freq: 1760, start: 0, duration: 0.07, type: 'square', gain: 0.18 },
    { freq: 1760, start: 0.12, duration: 0.07, type: 'square', gain: 0.18 },
  ],
  eliminated: [{ freq: 330, start: 0, duration: 0.4, type: 'sawtooth', gain: 0.3, slideTo: 110 }],
  // Vida baja: dos notas descendentes.
  lowHealth: [
    { freq: 523.25, start: 0, duration: 0.15, type: 'triangle', gain: 0.5 },
    { freq: 392, start: 0.14, duration: 0.25, type: 'triangle', gain: 0.5 },
  ],
  // A un golpe de perder: latido grave doble.
  danger: [
    { freq: 70, start: 0, duration: 0.14, type: 'sine', gain: 1 },
    { freq: 60, start: 0.2, duration: 0.18, type: 'sine', gain: 0.9 },
  ],
  // Combo: arpegio corto y agudo.
  combo: [
    { freq: 1046.5, start: 0, duration: 0.08, type: 'square', gain: 0.2 },
    { freq: 1318.5, start: 0.06, duration: 0.08, type: 'square', gain: 0.2 },
    { freq: 1568, start: 0.12, duration: 0.14, type: 'square', gain: 0.2 },
  ],
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
  if (!getSettings().sounds[CUE_GROUP[cue]]) return;
  play(CUES[cue]);
}
