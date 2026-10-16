/**
 * Sound synthesized with the Web Audio API (no audio files).
 *
 *   master bus ── compressor ── speakers   (mute fades the master gain)
 *   beds:    looping city rumble, crowd murmur, Tesla motor, thruster hiss
 *   one-shots: honks, pass-by whooshes, chatter, takeoff/landing/crash, jingles
 *
 * One-shots take a `pan` (-1 left … 1 right) so sounds come from where
 * things are on screen.
 */
import { clamp, rand } from "./utils.js";

const MASTER = 0.9;

export const audio = {
  ctx: null,
  master: null,
  noiseBuf: null,
  beds: null,
  muted: false,

  // Browsers only allow audio after a user gesture, so call this from input handlers.
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.noiseBuf = makeNoise(this.ctx);
      this.beds = startBeds(this);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },

  // Freeze / resume all sound (pause screen).
  pause() {
    if (this.ctx && this.ctx.state === "running") this.ctx.suspend();
  },
  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : MASTER, this.ctx.currentTime, 0.05);
  },

  // Skip building nodes for sounds nobody will hear.
  get live() {
    return this.ctx && !this.muted;
  },

  // Output node for a sound at stereo position `pan`.
  out(pan) {
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      p.connect(this.master);
      return p;
    }
    return this.master;
  },

  /**
   * One oscillator voice. `hold` keeps it at full volume (horns) instead of
   * decaying; `slide` glides the pitch; `filter` = [type, freq, Q].
   */
  voice({ type = "sine", freq, slide, dur, gain = 0.05, delay = 0, pan = 0, hold = false, filter }) {
    if (!this.live) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = envelope(this.ctx, t, dur, gain, hold);
    chain(this.ctx, osc, filter, g, this.out(pan));
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  // Filtered white noise; the filter sweeps from f0 to f1.
  noise({ dur, gain = 0.05, type = "bandpass", f0, f1 = f0, q = 1, delay = 0, pan = 0, attack = 0.01 }) {
    if (!this.live) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true; // long sounds outlast the 2s buffer
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out(pan));
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  },

  // Continuous sounds follow the game every frame.
  update({ running, speed, thrust }) {
    if (!this.beds) return;
    const t = this.ctx.currentTime;
    const b = this.beds;
    b.engine.frequency.setTargetAtTime(48 + speed * 0.09, t, 0.15);
    b.engineGain.gain.setTargetAtTime(running ? 0.03 + thrust * 0.012 : 0, t, 0.2);
    b.thrustGain.gain.setTargetAtTime(running ? thrust * 0.08 : 0, t, 0.08);
    b.trafficGain.gain.setTargetAtTime(running ? 0.06 : 0.035, t, 0.5);
  },

  // --- one-shots ---------------------------------------------------------
  takeoff() {
    this.voice({ type: "sawtooth", freq: 180, slide: 620, dur: 0.35, gain: 0.06, filter: ["lowpass", 1400, 1] });
    this.voice({ type: "triangle", freq: 90, slide: 240, dur: 0.4, gain: 0.05 });
    this.noise({ dur: 0.6, gain: 0.08, type: "lowpass", f0: 400, f1: 2400, attack: 0.08 });
  },
  landing() {
    this.voice({ freq: 220, slide: 90, dur: 0.16, gain: 0.06 });
    this.noise({ dur: 0.18, gain: 0.12, type: "lowpass", f0: 600, f1: 120 });
  },
  bonus() {
    this.voice({ freq: 880, slide: 1320, dur: 0.12, gain: 0.045 });
  },
  trick() {
    [660, 880, 1320].forEach((f, i) => this.voice({ type: "triangle", freq: f, dur: 0.16, gain: 0.05, delay: i * 0.07 }));
  },
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => this.voice({ type: "triangle", freq: f, dur: 0.22, gain: 0.05, delay: i * 0.09 }));
  },
  lane() {
    this.noise({ dur: 0.14, gain: 0.05, type: "highpass", f0: 2600, f1: 1200 });
  },
  flip() {
    this.noise({ dur: 0.25, gain: 0.05, type: "bandpass", f0: 700, f1: 2200, q: 1.5, attack: 0.05 });
  },
  crash() {
    this.voice({ type: "square", freq: 140, slide: 40, dur: 0.45, gain: 0.07 });
    this.voice({ type: "sawtooth", freq: 70, slide: 30, dur: 0.5, gain: 0.05 });
    this.noise({ dur: 0.7, gain: 0.25, type: "lowpass", f0: 1800, f1: 150 });
  },

  // Car horn: two detuned buzzy tones, sometimes a double honk.
  honk(pan = 0, pitch = 1, delay = 0) {
    const base = 400 * pitch;
    const blast = (d, len) => {
      this.voice({ type: "square", freq: base, dur: len, gain: 0.035, delay: d, pan, hold: true, filter: ["lowpass", 1700, 1] });
      this.voice({ type: "sawtooth", freq: base * 1.26, dur: len, gain: 0.03, delay: d, pan, hold: true, filter: ["lowpass", 1700, 1] });
    };
    blast(delay, rand(0.18, 0.32));
    if (Math.random() < 0.35) blast(delay + 0.34, 0.16);
  },

  // A car rushing past.
  whoosh(pan = 0, gain = 0.07) {
    this.noise({ dur: 0.45, gain, type: "bandpass", f0: 1800, f1: 280, q: 0.8, pan, attack: 0.12 });
  },

  // Muffled "talking": a few formant-filtered syllables.
  chatter(pan = 0, high = Math.random() < 0.5, delay = 0) {
    const n = 3 + ((Math.random() * 3) | 0);
    let d = delay;
    for (let i = 0; i < n; i++) {
      const dur = rand(0.06, 0.12);
      this.voice({
        type: "sawtooth", freq: rand(140, 220) * (high ? 1.6 : 1), slide: rand(130, 240) * (high ? 1.6 : 1),
        dur, gain: 0.05, delay: d, pan, filter: ["bandpass", rand(700, 1500), 3],
      });
      d += dur + rand(0.02, 0.06);
    }
  },

  // Nitro: rising whine plus a rush of air.
  nitro() {
    this.voice({ type: "sawtooth", freq: 220, slide: 1200, dur: 0.6, gain: 0.05, filter: ["lowpass", 2500, 1] });
    this.noise({ dur: 1.2, gain: 0.12, type: "bandpass", f0: 600, f1: 3000, q: 0.6, attack: 0.05 });
  },

  // Gift collected: sparkly arpeggio (longer for a golden one).
  gift(golden = false) {
    const notes = golden ? [784, 988, 1175, 1568, 1976] : [1047, 1319, 1568];
    notes.forEach((f, i) => this.voice({ type: "triangle", freq: f, dur: 0.18, gain: 0.045, delay: i * 0.06 }));
    this.noise({ dur: 0.5, gain: 0.03, type: "highpass", f0: 5000, f1: 9000, attack: 0.02 });
  },

  // Boosting through a car: crunch and a thud.
  smash(pan = 0) {
    this.noise({ dur: 0.35, gain: 0.22, type: "lowpass", f0: 3000, f1: 300, pan });
    this.voice({ type: "square", freq: 110, slide: 50, dur: 0.25, gain: 0.06, pan });
  },

  // Grok Bot talking: quick square-wave bleeps.
  robot(pan = 0, delay = 0) {
    let d = delay;
    for (let i = 0; i < 4 + ((Math.random() * 3) | 0); i++) {
      const f = rand(600, 1500);
      this.voice({ type: "square", freq: f, slide: f * rand(0.8, 1.3), dur: 0.06, gain: 0.025, delay: d, pan, filter: ["lowpass", 3000, 1] });
      d += rand(0.06, 0.1);
    }
  },

  // Distant rocket launch: a long low rumble.
  rocket(pan = 0) {
    this.noise({ dur: 5, gain: 0.07, type: "lowpass", f0: 260, f1: 90, q: 0.7, pan, attack: 1.2 });
  },

  // People reacting to a flying car.
  cheer(pan = 0) {
    this.noise({ dur: 0.8, gain: 0.05, type: "bandpass", f0: 1100, f1: 1600, q: 0.7, pan, attack: 0.1 });
    this.voice({ type: "triangle", freq: 420, slide: 780, dur: 0.35, gain: 0.03, pan, filter: ["bandpass", 1000, 2] });
    this.chatter(pan);
  },
};

// --- helpers ---------------------------------------------------------------

function makeNoise(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function envelope(ctx, t, dur, gain, hold) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  if (hold) {
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.setValueAtTime(gain, t + Math.max(0.02, dur - 0.04));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
  } else {
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  return g;
}

function chain(ctx, src, filter, gain, out) {
  if (filter) {
    const f = ctx.createBiquadFilter();
    [f.type, f.frequency.value, f.Q.value] = filter;
    src.connect(f);
    f.connect(gain);
  } else {
    src.connect(gain);
  }
  gain.connect(out);
}

// Looping noise through a filter into a gain node (for ambience beds).
function noiseBed(a, type, freq, q, gain) {
  const src = a.ctx.createBufferSource();
  src.buffer = a.noiseBuf;
  src.loop = true;
  const f = a.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.ctx.createGain();
  g.gain.value = gain;
  src.connect(f);
  f.connect(g);
  g.connect(a.master);
  src.start(0, Math.random() * 1.5);
  return g;
}

function startBeds(a) {
  const ctx = a.ctx;
  // Distant traffic rumble and a crowd murmur that swells and fades.
  const trafficGain = noiseBed(a, "lowpass", 220, 0.7, 0.035);
  const crowdGain = noiseBed(a, "bandpass", 750, 0.9, 0.012);
  const lfo = ctx.createOscillator();
  const lfoAmt = ctx.createGain();
  lfo.frequency.value = 0.23;
  lfoAmt.gain.value = 0.008;
  lfo.connect(lfoAmt);
  lfoAmt.connect(crowdGain.gain);
  lfo.start();

  // Electric motor whine, pitched by speed.
  const engine = ctx.createOscillator();
  engine.type = "sawtooth";
  engine.frequency.value = 70;
  const engineFilter = ctx.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 520;
  const engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  engine.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(a.master);
  engine.start();

  // Thruster hiss while flying.
  const thrustGain = noiseBed(a, "lowpass", 900, 0.7, 0);

  return { trafficGain, crowdGain, engine, engineGain, thrustGain };
}
