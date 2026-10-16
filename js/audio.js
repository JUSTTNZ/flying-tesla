/** Sound effects synthesized with the Web Audio API (no audio files). */

export const audio = {
  ctx: null,
  muted: false,

  // Browsers only allow audio after a user gesture, so call this from input handlers.
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },

  // One oscillator with an exponential fade, optionally sliding in pitch.
  beep(freq, dur, type, gain, slide) {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  },

  takeoff() {
    this.beep(180, 0.35, "sawtooth", 0.07, 620);
    this.beep(90, 0.4, "triangle", 0.05, 240);
  },
  landing() {
    this.beep(220, 0.16, "sine", 0.06, 90);
  },
  bonus() {
    this.beep(880, 0.12, "sine", 0.045, 1320);
  },
  crash() {
    this.beep(140, 0.45, "square", 0.08, 40);
    this.beep(70, 0.5, "sawtooth", 0.06, 30);
  },
};
