// Sonidos sintetizados con Web Audio (sin archivos: carga cero y sin licencias), con un paquete por tema:
// Normal (madera, papel y campanitas), Cripta (piedra, campanas y metal en una cripta con eco) y
// Cyber (láseres, sables de luz y blips holográficos). Ruido filtrado + envolventes + reverb generada
// para que no suenen a pitidos de 8 bits. Todo se crea por evento y se libera solo al terminar.
import { getSettings, type Skin, type SoundGroup } from './settings';

export type Cue =
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

export type UiCue = 'click' | 'tab' | 'open' | 'close' | 'toggle' | 'type' | 'erase' | 'submit';

const CUE_GROUP: Record<Cue | UiCue, SoundGroup> = {
  success: 'answers',
  wrong: 'answers',
  combo: 'answers',
  rival: 'rivals',
  hit: 'rivals',
  heal: 'rivals',
  eliminated: 'rivals',
  tick: 'countdown',
  victory: 'results',
  defeat: 'results',
  lowTime: 'lowTime',
  lowHealth: 'lowTime',
  danger: 'lowTime',
  click: 'interface',
  tab: 'interface',
  open: 'interface',
  close: 'interface',
  toggle: 'interface',
  submit: 'interface',
  type: 'typing',
  erase: 'typing',
};

// ---------- Motor ----------

interface Bus {
  ctx: AudioContext;
  dry: AudioNode; // Directo al compresor.
  wet: AudioNode; // Envío a la reverb del tema.
  now: number;
}

let context: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let reverbSkin: Skin | null = null;
const noiseCache = new Map<'white' | 'pink' | 'brown', AudioBuffer>();

// Reverb por tema: sala chica (Normal), cripta de piedra (Cripta), cámara metálica corta (Cyber).
const REVERB: Record<Skin, { seconds: number; decay: number; level: number }> = {
  normal: { seconds: 0.9, decay: 3.2, level: 0.22 },
  crypt: { seconds: 3.2, decay: 2.2, level: 0.55 },
  cyber: { seconds: 1.4, decay: 3.8, level: 0.3 },
};

function audio(): AudioContext | null {
  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor({ latencyHint: 'interactive' });
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      master = context.createGain();
      master.connect(compressor).connect(context.destination);
    }
    // Los navegadores suspenden el audio hasta una interacción del usuario.
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

function noiseBuffer(ctx: AudioContext, color: 'white' | 'pink' | 'brown'): AudioBuffer {
  const cached = noiseCache.get(color);
  if (cached) return cached;
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === 'white') data[i] = white;
    else if (color === 'brown') {
      // Ruido marrón: integra el blanco (graves, roce de piedra).
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      // Ruido rosa (filtro de Paul Kellet, versión económica).
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    }
  }
  noiseCache.set(color, buffer);
  return buffer;
}

/** Respuesta al impulso sintética: ruido estéreo con caída exponencial. */
function buildReverb(ctx: AudioContext, skin: Skin): ConvolverNode {
  const { seconds, decay } = REVERB[skin];
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

function bus(): Bus | null {
  const settings = getSettings();
  if (!settings.sound || settings.volume <= 0) return null;
  const ctx = audio();
  if (!ctx || !master) return null;
  master.gain.value = settings.volume * 0.5;
  if (!reverb || reverbSkin !== settings.skin) {
    reverb?.disconnect();
    reverb = buildReverb(ctx, settings.skin);
    reverbSkin = settings.skin;
    const level = ctx.createGain();
    level.gain.value = REVERB[settings.skin].level;
    reverb.connect(level).connect(master);
  }
  return { ctx, dry: master, wet: reverb, now: ctx.currentTime + 0.005 };
}

/** Variación aleatoria ±pct: dos golpes iguales nunca suenan idénticos (menos "robótico"). */
const vary = (value: number, pct = 0.04) => value * (1 + (Math.random() * 2 - 1) * pct);

interface ToneOptions {
  f: number;
  at?: number; // s desde ahora
  dur: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  slide?: number; // Frecuencia final.
  detune?: number; // cents
  wet?: number; // 0..1 envío a reverb
  lowpass?: number;
  pan?: number;
}

function tone(b: Bus, o: ToneOptions): void {
  const start = b.now + (o.at ?? 0);
  const end = start + o.dur;
  const osc = b.ctx.createOscillator();
  const env = b.ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, start);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(o.slide, 20), end);
  if (o.detune) osc.detune.value = o.detune;
  const peak = o.gain ?? 0.4;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + (o.attack ?? 0.004));
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  let node: AudioNode = osc.connect(env);
  if (o.lowpass) {
    const filter = b.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = o.lowpass;
    node = node.connect(filter);
  }
  if (o.pan && typeof b.ctx.createStereoPanner === 'function') {
    const panner = b.ctx.createStereoPanner();
    panner.pan.value = o.pan;
    node = node.connect(panner);
  }
  route(b, node, o.wet ?? 0.25);
  osc.start(start);
  osc.stop(end + 0.05);
}

interface NoiseOptions {
  at?: number;
  dur: number;
  gain?: number;
  color?: 'white' | 'pink' | 'brown';
  filter?: BiquadFilterType;
  f?: number;
  fTo?: number;
  q?: number;
  attack?: number;
  wet?: number;
  pan?: number;
}

function noise(b: Bus, o: NoiseOptions): void {
  const start = b.now + (o.at ?? 0);
  const end = start + o.dur;
  const source = b.ctx.createBufferSource();
  source.buffer = noiseBuffer(b.ctx, o.color ?? 'white');
  // Punto de inicio al azar dentro del buffer: cada ráfaga es distinta.
  const offset = Math.random() * 1.5;
  const filter = b.ctx.createBiquadFilter();
  filter.type = o.filter ?? 'bandpass';
  filter.frequency.setValueAtTime(o.f ?? 1200, start);
  if (o.fTo) filter.frequency.exponentialRampToValueAtTime(Math.max(o.fTo, 20), end);
  filter.Q.value = o.q ?? 1;
  const env = b.ctx.createGain();
  const peak = o.gain ?? 0.4;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + (o.attack ?? 0.003));
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  let node: AudioNode = source.connect(filter).connect(env);
  if (o.pan && typeof b.ctx.createStereoPanner === 'function') {
    const panner = b.ctx.createStereoPanner();
    panner.pan.value = o.pan;
    node = node.connect(panner);
  }
  route(b, node, o.wet ?? 0.25);
  source.start(start, offset, o.dur + 0.05);
}

function route(b: Bus, node: AudioNode, wet: number): void {
  node.connect(b.dry);
  if (wet > 0) {
    const send = b.ctx.createGain();
    send.gain.value = wet;
    node.connect(send).connect(b.wet);
  }
}

// ---------- Instrumentos ----------

/** Marimba / madera: fundamental + 4.° armónico que se apaga rápido. */
function marimba(b: Bus, f: number, at = 0, gain = 0.35, dur = 0.5): void {
  tone(b, { f, at, dur, type: 'sine', gain, wet: 0.2 });
  tone(b, { f: f * 4, at, dur: dur * 0.18, type: 'sine', gain: gain * 0.35, wet: 0.1 });
  noise(b, { at, dur: 0.02, gain: gain * 0.4, f: f * 6, q: 2, wet: 0 });
}

/** Campana: parciales inarmónicos (cripta, victoria en Cripta). */
function bell(b: Bus, f: number, at = 0, gain = 0.25, dur = 2.2): void {
  const partials: Array<[number, number]> = [
    [1, 1],
    [2.76, 0.5],
    [5.4, 0.28],
    [8.93, 0.14],
  ];
  for (const [ratio, level] of partials) {
    tone(b, { f: f * ratio, at, dur: dur / Math.sqrt(ratio), type: 'sine', gain: gain * level, wet: 0.6 });
  }
}

/** Roce de piedra que se desliza. */
function stoneSlide(b: Bus, dur = 0.18, at = 0, gain = 0.5, from = 520, to = 180): void {
  noise(b, { at, dur, color: 'brown', filter: 'lowpass', f: vary(from, 0.15), fTo: vary(to, 0.15), q: 0.8, gain, attack: dur * 0.25, wet: 0.35 });
  noise(b, { at, dur: dur * 0.9, color: 'pink', filter: 'bandpass', f: vary(900, 0.2), q: 3, gain: gain * 0.18, attack: dur * 0.3, wet: 0.3 });
}

/** Golpe sordo (madera o piedra). */
function thud(b: Bus, f = 120, at = 0, gain = 0.6, dur = 0.18): void {
  tone(b, { f: vary(f), at, dur, type: 'sine', gain, slide: f * 0.55, wet: 0.3 });
  noise(b, { at, dur: 0.035, color: 'pink', filter: 'lowpass', f: 1800, gain: gain * 0.5, wet: 0.2 });
}

/** Resquebrajamiento: chasquidos secos y agudos en rápida sucesión. */
function crack(b: Bus, at = 0, gain = 0.4): void {
  for (let i = 0; i < 5; i++) {
    noise(b, { at: at + i * vary(0.022, 0.4), dur: vary(0.03, 0.4), f: vary(2600, 0.35), q: 6, gain: gain * (1 - i * 0.12), wet: 0.4, pan: Math.random() - 0.5 });
  }
}

/** Metal (espada contra escudo). */
function clang(b: Bus, at = 0, gain = 0.3): void {
  for (const ratio of [1, 2.41, 3.77, 5.12]) tone(b, { f: vary(620) * ratio, at, dur: 0.9 / ratio, type: 'sine', gain: gain / ratio, wet: 0.5 });
  noise(b, { at, dur: 0.05, f: 4200, q: 2, gain: gain * 0.8, wet: 0.3 });
}

/** Láser: barrido rápido de diente de sierra con filtro. */
function laser(b: Bus, from: number, to: number, dur: number, at = 0, gain = 0.22): void {
  tone(b, { f: vary(from), slide: to, at, dur, type: 'sawtooth', gain, lowpass: 5200, wet: 0.3 });
  tone(b, { f: vary(from) * 1.01, slide: to * 1.01, at, dur, type: 'square', gain: gain * 0.35, lowpass: 3000, wet: 0.2 });
}

/** Sable de luz: zumbido grave desafinado que sube (encender) o baja (apagar). */
function saber(b: Bus, dur: number, rising: boolean, at = 0, gain = 0.18): void {
  const [from, to] = rising ? [70, 115] : [115, 55];
  tone(b, { f: from, slide: to, at, dur, type: 'sawtooth', gain, lowpass: 900, wet: 0.25 });
  tone(b, { f: from * 1.5, slide: to * 1.5, at, dur, type: 'sawtooth', gain: gain * 0.6, detune: 9, lowpass: 1400, wet: 0.25 });
  noise(b, { at, dur, f: rising ? 600 : 2400, fTo: rising ? 2400 : 400, q: 4, gain: gain * 0.7, wet: 0.3 });
}

/** Blip holográfico. */
function blip(b: Bus, f: number, at = 0, gain = 0.16, dur = 0.05): void {
  tone(b, { f: vary(f, 0.03), at, dur, type: 'sine', gain, wet: 0.2 });
  tone(b, { f: vary(f, 0.03) * 2, at, dur: dur * 0.6, type: 'triangle', gain: gain * 0.3, wet: 0.1 });
}

function whoosh(b: Bus, dur: number, from: number, to: number, at = 0, gain = 0.25): void {
  noise(b, { at, dur, color: 'pink', f: from, fTo: to, q: 1.4, gain, attack: dur * 0.45, wet: 0.35 });
}

// ---------- Paquetes por tema ----------

type Pack = Record<Cue | UiCue, (b: Bus) => void>;

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

const NORMAL: Pack = {
  // Interfaz: madera y papel, cortos y suaves.
  click: (b) => {
    noise(b, { dur: 0.03, color: 'pink', f: vary(2200, 0.2), q: 1.6, gain: 0.22, wet: 0.05 });
    tone(b, { f: vary(420, 0.06), dur: 0.05, gain: 0.12, wet: 0.05 });
  },
  tab: (b) => {
    noise(b, { dur: 0.11, color: 'pink', f: 1400, fTo: 3600, q: 0.9, gain: 0.14, attack: 0.04, wet: 0.1 }); // Hoja que se pasa.
    tone(b, { f: vary(620, 0.04), at: 0.04, dur: 0.06, gain: 0.08, wet: 0.1 });
  },
  open: (b) => {
    noise(b, { dur: 0.16, color: 'pink', f: 900, fTo: 2600, q: 0.8, gain: 0.14, attack: 0.08, wet: 0.15 });
    marimba(b, G5, 0.05, 0.12, 0.25);
  },
  close: (b) => {
    noise(b, { dur: 0.12, color: 'pink', f: 2400, fTo: 800, q: 0.8, gain: 0.12, attack: 0.03, wet: 0.1 });
    marimba(b, C5, 0.02, 0.1, 0.2);
  },
  toggle: (b) => marimba(b, vary(E5, 0.02), 0, 0.14, 0.18),
  submit: (b) => marimba(b, G5, 0, 0.16, 0.25),
  type: (b) => noise(b, { dur: 0.018, color: 'white', f: vary(3800, 0.25), q: 2.5, gain: 0.08, wet: 0 }),
  erase: (b) => noise(b, { dur: 0.05, color: 'pink', f: 1500, fTo: 700, q: 1.2, gain: 0.08, wet: 0 }),
  // Juego.
  success: (b) => [C5, E5, G5, C6].forEach((f, i) => marimba(b, f, i * 0.07, 0.3, 0.55)),
  wrong: (b) => {
    thud(b, 150, 0, 0.45, 0.16);
    thud(b, 115, 0.11, 0.35, 0.2);
  },
  rival: (b) => {
    marimba(b, 880, 0, 0.18, 0.3);
    marimba(b, 660, 0.09, 0.15, 0.35);
  },
  hit: (b) => {
    thud(b, 95, 0, 0.7, 0.3);
    noise(b, { dur: 0.08, color: 'pink', f: 2600, q: 1, gain: 0.25, wet: 0.2 });
  },
  heal: (b) => [392, 494, 587].forEach((f, i) => marimba(b, f, i * 0.08, 0.16, 0.45)),
  tick: (b) => marimba(b, 1320, 0, 0.12, 0.12),
  lowTime: (b) => {
    marimba(b, 1568, 0, 0.18, 0.12);
    marimba(b, 1568, 0.13, 0.18, 0.12);
  },
  eliminated: (b) => [440, 370, 294].forEach((f, i) => marimba(b, f, i * 0.1, 0.22, 0.45)),
  lowHealth: (b) => {
    marimba(b, C5, 0, 0.22, 0.25);
    marimba(b, 392, 0.14, 0.22, 0.4);
  },
  danger: (b) => {
    thud(b, 70, 0, 0.8, 0.15);
    thud(b, 60, 0.2, 0.7, 0.18);
  },
  combo: (b) => [C6, 1318.5, 1568].forEach((f, i) => marimba(b, f, i * 0.05, 0.16, 0.22)),
  victory: (b) => {
    [C5, E5, G5].forEach((f, i) => marimba(b, f, i * 0.12, 0.28, 0.5));
    [C6, E5 * 2, G5 * 2].forEach((f) => marimba(b, f, 0.42, 0.18, 1.1));
  },
  defeat: (b) => [392, 311.13, 261.63].forEach((f, i) => marimba(b, f, i * 0.22, 0.26, 0.7)),
};

const CRYPT: Pack = {
  // Interfaz: piedra que se desliza, cincel y portones.
  click: (b) => {
    stoneSlide(b, vary(0.09, 0.2), 0, 0.42, 700, 260);
    thud(b, vary(180, 0.1), 0.06, 0.18, 0.08);
  },
  tab: (b) => stoneSlide(b, vary(0.28, 0.1), 0, 0.55, 420, 140),
  open: (b) => {
    stoneSlide(b, 0.45, 0, 0.6, 320, 110);
    thud(b, 70, 0.4, 0.55, 0.3);
  },
  close: (b) => {
    stoneSlide(b, 0.3, 0, 0.5, 260, 120);
    thud(b, 80, 0.26, 0.5, 0.25);
  },
  toggle: (b) => {
    noise(b, { dur: 0.04, f: 3200, q: 5, gain: 0.25, wet: 0.4 }); // Cincel.
    thud(b, 220, 0.01, 0.15, 0.06);
  },
  submit: (b) => clang(b, 0, 0.12),
  type: (b) => {
    noise(b, { dur: 0.025, f: vary(2800, 0.3), q: 6, gain: 0.12, wet: 0.25 }); // Cincel sobre piedra.
    tone(b, { f: vary(240, 0.15), dur: 0.03, gain: 0.05, wet: 0.2 });
  },
  erase: (b) => stoneSlide(b, 0.07, 0, 0.18, 900, 400),
  // Juego.
  success: (b) => {
    bell(b, 523.25, 0, 0.16, 1.8);
    bell(b, 783.99, 0.14, 0.13, 2.2);
    stoneSlide(b, 0.25, 0, 0.18, 500, 200);
  },
  wrong: (b) => {
    thud(b, 90, 0, 0.6, 0.25);
    crack(b, 0.03, 0.32);
  },
  rival: (b) => bell(b, 330, 0, 0.14, 2.6), // Campana lejana.
  hit: (b) => {
    clang(b, 0, 0.32);
    thud(b, 80, 0.01, 0.5, 0.3);
  },
  heal: (b) => [392, 494, 587, 784].forEach((f, i) => tone(b, { f, at: i * 0.07, dur: 0.9, type: 'triangle', gain: 0.1, wet: 0.7 })), // Arpa.
  tick: (b) => {
    // Gota de agua en la cripta.
    tone(b, { f: vary(1200, 0.1), slide: 2400, dur: 0.06, gain: 0.18, wet: 0.7 });
  },
  lowTime: (b) => {
    bell(b, 196, 0, 0.18, 1.6);
    bell(b, 196, 0.55, 0.14, 1.6);
  },
  eliminated: (b) => {
    for (let i = 0; i < 6; i++) thud(b, vary(110, 0.3), i * vary(0.08, 0.3), 0.4 - i * 0.05, 0.2); // Derrumbe.
    crack(b, 0, 0.35);
  },
  lowHealth: (b) => {
    bell(b, 262, 0, 0.14, 1.4);
    bell(b, 196, 0.25, 0.14, 1.8);
  },
  danger: (b) => {
    // Tambor de guerra.
    thud(b, 62, 0, 0.9, 0.3);
    thud(b, 58, 0.22, 0.8, 0.3);
  },
  combo: (b) => [659, 784, 988].forEach((f, i) => bell(b, f, i * 0.07, 0.09, 1.1)),
  victory: (b) => {
    // Fanfarria de metales + campanas.
    const brass = (f: number, at: number, dur: number) => {
      tone(b, { f, at, dur, type: 'sawtooth', gain: 0.12, lowpass: 1800, attack: 0.04, wet: 0.5 });
      tone(b, { f: f * 1.003, at, dur, type: 'sawtooth', gain: 0.08, lowpass: 1400, attack: 0.05, wet: 0.5 });
    };
    brass(392, 0, 0.18);
    brass(392, 0.2, 0.12);
    brass(523.25, 0.34, 0.7);
    bell(b, 1046.5, 0.34, 0.12, 2.5);
  },
  defeat: (b) => {
    bell(b, 130.81, 0, 0.25, 3.5); // Gong grave.
    stoneSlide(b, 0.8, 0.1, 0.4, 260, 60);
  },
};

const CYBER: Pack = {
  // Interfaz: blips, disparos cortos y sables.
  click: (b) => laser(b, 2400, 700, 0.05, 0, 0.11),
  tab: (b) => {
    whoosh(b, 0.22, 400, 4200, 0, 0.18);
    blip(b, 1760, 0.12, 0.08);
  },
  open: (b) => saber(b, 0.32, true, 0, 0.16),
  close: (b) => saber(b, 0.24, false, 0, 0.14),
  toggle: (b) => {
    blip(b, 1320, 0, 0.12);
    blip(b, 1980, 0.045, 0.1);
  },
  submit: (b) => laser(b, 1600, 3200, 0.08, 0, 0.12),
  type: (b) => blip(b, vary(2600, 0.15), 0, 0.06, 0.025),
  erase: (b) => tone(b, { f: 1800, slide: 600, dur: 0.05, type: 'square', gain: 0.05, lowpass: 2500, wet: 0.1 }),
  // Juego.
  success: (b) => {
    laser(b, 700, 2800, 0.12, 0, 0.14);
    [C6, 1318.5, 1568, 2093].forEach((f, i) => blip(b, f, 0.08 + i * 0.05, 0.12, 0.09));
  },
  wrong: (b) => {
    // Glitch: ráfagas cuadradas a frecuencias al azar.
    for (let i = 0; i < 5; i++) tone(b, { f: 120 + Math.random() * 500, at: i * 0.028, dur: 0.028, type: 'square', gain: 0.1, lowpass: 2400, wet: 0.05 });
    noise(b, { dur: 0.14, f: 800, q: 0.7, gain: 0.12, wet: 0.05 });
  },
  rival: (b) => laser(b, 3000, 900, 0.14, 0, 0.12),
  hit: (b) => {
    // Disparo de bláster que impacta.
    laser(b, 1800, 140, 0.22, 0, 0.18);
    noise(b, { at: 0.05, dur: 0.3, color: 'brown', filter: 'lowpass', f: 2200, fTo: 200, gain: 0.5, wet: 0.3 });
  },
  heal: (b) => {
    tone(b, { f: 300, slide: 1200, dur: 0.45, type: 'triangle', gain: 0.12, wet: 0.4 });
    tone(b, { f: 450, slide: 1800, dur: 0.45, type: 'sine', gain: 0.08, wet: 0.4 });
  },
  tick: (b) => blip(b, 1400, 0, 0.14, 0.07), // Sonar.
  lowTime: (b) => {
    tone(b, { f: 880, slide: 1320, dur: 0.18, type: 'square', gain: 0.07, lowpass: 3000, wet: 0.2 });
    tone(b, { f: 880, slide: 1320, at: 0.22, dur: 0.18, type: 'square', gain: 0.07, lowpass: 3000, wet: 0.2 });
  },
  eliminated: (b) => {
    tone(b, { f: 800, slide: 40, dur: 0.6, type: 'sawtooth', gain: 0.14, lowpass: 2000, wet: 0.3 });
    noise(b, { at: 0.05, dur: 0.7, color: 'brown', filter: 'lowpass', f: 1800, fTo: 120, gain: 0.6, wet: 0.4 });
  },
  lowHealth: (b) => {
    blip(b, 1046, 0, 0.14, 0.1);
    blip(b, 784, 0.14, 0.14, 0.16);
  },
  danger: (b) => {
    tone(b, { f: 55, dur: 0.18, type: 'sine', gain: 0.8, wet: 0.1 });
    tone(b, { f: 55, at: 0.22, dur: 0.18, type: 'sine', gain: 0.7, wet: 0.1 });
  },
  combo: (b) => [0, 0.06, 0.12].forEach((at, i) => laser(b, 900 + i * 500, 2600 + i * 600, 0.07, at, 0.1)),
  victory: (b) => {
    [C5, E5, G5, C6, G5, C6 * 1.5].forEach((f, i) => tone(b, { f, at: i * 0.09, dur: 0.22, type: 'sawtooth', gain: 0.09, lowpass: 3200, wet: 0.35 }));
    saber(b, 0.6, true, 0.5, 0.12);
  },
  defeat: (b) => {
    // Apagado del sistema.
    tone(b, { f: 440, slide: 30, dur: 1.1, type: 'sawtooth', gain: 0.12, lowpass: 1600, wet: 0.35 });
    saber(b, 0.5, false, 0.2, 0.12);
  },
};

const PACKS: Record<Skin, Pack> = { normal: NORMAL, crypt: CRYPT, cyber: CYBER };

// El tipeo y los clics rápidos no se apilan: como mucho uno cada `THROTTLE_MS` por sonido.
const THROTTLE_MS: Partial<Record<Cue | UiCue, number>> = { type: 28, erase: 40, click: 45, tab: 80 };
const lastPlayed = new Map<Cue | UiCue, number>();

function play(cue: Cue | UiCue): void {
  try {
    const settings = getSettings();
    if (!settings.sounds[CUE_GROUP[cue]]) return;
    const gap = THROTTLE_MS[cue];
    if (gap) {
      const now = performance.now();
      if (now - (lastPlayed.get(cue) ?? -Infinity) < gap) return;
      lastPlayed.set(cue, now);
    }
    const b = bus();
    if (!b) return;
    PACKS[settings.skin][cue](b);
  } catch (error) {
    console.warn('[sound] no se pudo reproducir', error);
  }
}

/** Sonidos de juego (aciertos, rivales, reloj…). */
export function playCue(cue: Cue): void {
  play(cue);
}

/** Sonidos de interfaz (botones, pestañas, ventanas, tipeo). */
export function playUi(cue: UiCue): void {
  play(cue);
}
