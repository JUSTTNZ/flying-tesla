/** Small math, colour and canvas-path helpers. */

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Positive modulo, so wrapped positions never go negative.
export const mod = (v, m) => ((v % m) + m) % m;

// Angle wrapped into -π..π (0 = upright).
export const wrapAngle = (a) => mod(a + Math.PI, Math.PI * 2) - Math.PI;

// "#rrggbb" → [r, g, b]
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

// Move colour `a` (an [r, g, b] array, modified in place) toward `b` by k.
export function lerpRgb(a, b, k) {
  for (let i = 0; i < 3; i++) a[i] += (b[i] - a[i]) * k;
  return a;
}

export const rgbStr = (c, alpha = 1) =>
  `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${alpha})`;

// Deterministic 0..1 noise from an integer — keeps street props stable.
export const hash = (n) => mod(Math.sin(n * 127.1 + 311.7) * 43758.5453, 1);

// Small seeded RNG (mulberry32) so procedural art is repeatable.
export function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mix a #rrggbb colour toward white (amt > 0) or black (amt < 0).
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const target = amt > 0 ? 255 : 0;
  const a = Math.abs(amt);
  const ch = (v) => Math.round(v + (target - v) * a);
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

// "#rrggbb" → "rgba(r, g, b, ALPHA)" template for glow().
export function rgbaTemplate(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ALPHA)`;
}

// Trace a polygon given in 0..1 coordinates of a w×h box at (x, y).
export function polyPath(c, pts, x, y, w, h) {
  c.beginPath();
  c.moveTo(x + pts[0][0] * w, y + pts[0][1] * h);
  for (let i = 1; i < pts.length; i++) c.lineTo(x + pts[i][0] * w, y + pts[i][1] * h);
  c.closePath();
}

export function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// Soft round light. `color` is an rgba() string with the literal "ALPHA" in it.
export function glow(c, x, y, r, color, alpha) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace("ALPHA", alpha));
  g.addColorStop(1, color.replace("ALPHA", 0));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
