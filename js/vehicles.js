/**
 * Vehicle shapes and drawing, shared by the Tesla and NPC traffic.
 *
 * Each silhouette is a polygon in a 0..1 box whose bottom edge is the road.
 * Wheels sit at `wheels` (x fractions) with radius `r` (fraction of height).
 * `head` / `tail` are light positions. All vehicles face right.
 */
import { GROUND_Y, PLAYER_DRAW_H } from "./config.js";
import { glow, polyPath, roundRect, shade } from "./utils.js";

export const VEHICLES = {
  tesla: {
    w: 118, h: PLAYER_DRAW_H, r: 0.21, wheels: [0.2, 0.8],
    body: [[0, 0.66], [0.01, 0.48], [0.06, 0.4], [0.2, 0.33], [0.36, 0.06], [0.56, 0.04],
      [0.72, 0.19], [0.86, 0.35], [0.98, 0.43], [1, 0.58], [0.99, 0.78], [0, 0.78]],
    windows: [[[0.39, 0.12], [0.55, 0.1], [0.68, 0.21], [0.75, 0.34], [0.29, 0.35]]],
    pillars: [0.53], head: [0.97, 0.47], tail: [0.02, 0.45],
  },
  sedan: {
    w: 104, h: 46, r: 0.22, wheels: [0.2, 0.8],
    body: [[0, 0.62], [0.02, 0.44], [0.22, 0.38], [0.33, 0.08], [0.62, 0.06], [0.78, 0.36],
      [0.97, 0.42], [1, 0.55], [1, 0.78], [0, 0.78]],
    windows: [[[0.36, 0.15], [0.6, 0.13], [0.72, 0.37], [0.27, 0.38]]],
    pillars: [0.5], head: [0.97, 0.47], tail: [0.02, 0.47],
  },
  hatch: {
    w: 88, h: 46, r: 0.22, wheels: [0.2, 0.8],
    body: [[0, 0.7], [0.01, 0.2], [0.06, 0.09], [0.55, 0.08], [0.75, 0.38], [0.96, 0.44],
      [1, 0.56], [1, 0.78], [0, 0.78]],
    windows: [[[0.09, 0.17], [0.53, 0.16], [0.68, 0.4], [0.07, 0.4]]],
    pillars: [0.38], head: [0.97, 0.5], tail: [0.02, 0.32],
  },
  suv: {
    w: 112, h: 56, r: 0.22, wheels: [0.18, 0.8],
    body: [[0, 0.75], [0, 0.15], [0.04, 0.05], [0.66, 0.04], [0.8, 0.34], [0.97, 0.38],
      [1, 0.5], [1, 0.78], [0, 0.78]],
    windows: [[[0.06, 0.12], [0.64, 0.11], [0.75, 0.36], [0.06, 0.36]]],
    pillars: [0.3, 0.52], head: [0.97, 0.44], tail: [0.01, 0.3],
  },
  van: {
    w: 126, h: 62, r: 0.2, wheels: [0.17, 0.82],
    body: [[0, 0.8], [0, 0.06], [0.03, 0], [0.78, 0], [0.88, 0.08], [0.98, 0.36],
      [1, 0.5], [1, 0.8], [0, 0.8]],
    windows: [
      [[0.81, 0.1], [0.87, 0.11], [0.95, 0.36], [0.81, 0.36]],
      [[0.5, 0.1], [0.76, 0.1], [0.76, 0.34], [0.5, 0.34]],
    ],
    pillars: [], head: [0.97, 0.46], tail: [0.01, 0.4],
  },
  pickup: {
    w: 124, h: 52, r: 0.22, wheels: [0.18, 0.8],
    body: [[0, 0.78], [0, 0.4], [0.42, 0.4], [0.44, 0.06], [0.7, 0.05], [0.8, 0.36],
      [0.97, 0.4], [1, 0.52], [1, 0.78], [0, 0.78]],
    windows: [[[0.47, 0.14], [0.68, 0.13], [0.76, 0.38], [0.47, 0.38]]],
    pillars: [], head: [0.97, 0.47], tail: [0.01, 0.48],
  },
};

// Sedans and SUVs are listed twice so they show up more often.
export const NPC_TYPES = ["sedan", "sedan", "hatch", "suv", "suv", "van", "pickup"];
export const CAR_COLORS = ["#e63946", "#3a86ff", "#ffbe0b", "#2ec4b6", "#8338ec", "#fb5607",
  "#adb5bd", "#2b4c7e", "#ff006e", "#90be6d", "#f4a261", "#1f2937"];

// [highlight, base, dark] paint shades for a body colour.
export const paintShades = (color) => [shade(color, 0.35), color, shade(color, -0.35)];

// Shadow on the tarmac; `altitude` 0..1 shrinks and fades it as the car rises.
export function drawShadow(c, x, w, altitude) {
  const k = 1 - altitude * 0.45;
  c.fillStyle = `rgba(4, 6, 10, ${0.45 * k})`;
  c.beginPath();
  c.ellipse(x + w * 0.5, GROUND_Y + 2, w * 0.54 * k, 6 * k, 0, 0, Math.PI * 2);
  c.fill();
}

// Cone of light ahead of a vehicle. Draw with "lighter" compositing.
export function drawBeam(c, x, y, w, h, spec) {
  const hx = x + spec.head[0] * w;
  const hy = y + spec.head[1] * h;
  const len = 170;
  const g = c.createLinearGradient(hx, 0, hx + len, 0);
  g.addColorStop(0, "rgba(255, 240, 200, 0.22)");
  g.addColorStop(1, "rgba(255, 240, 200, 0)");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(hx, hy - 2);
  c.lineTo(hx + len, hy - 10);
  c.lineTo(hx + len, GROUND_Y + 4);
  c.lineTo(hx, hy + 4);
  c.closePath();
  c.fill();
}

// Draw any vehicle from its spec in the w×h box at (x, y).
export function drawVehicle(c, x, y, w, h, spec, shades, wheelAngle) {
  // Body with a vertical paint gradient.
  const paint = c.createLinearGradient(0, y, 0, y + h * 0.8);
  paint.addColorStop(0, shades[0]);
  paint.addColorStop(0.45, shades[1]);
  paint.addColorStop(1, shades[2]);
  polyPath(c, spec.body, x, y, w, h);
  c.fillStyle = paint;
  c.fill();

  // Details clipped to the body: rocker panel, shoulder highlight, door seam.
  c.save();
  c.clip();
  c.fillStyle = "rgba(0, 0, 0, 0.25)";
  c.fillRect(x, y + h * 0.68, w, h * 0.12);
  c.fillStyle = "rgba(255, 255, 255, 0.35)";
  c.fillRect(x, y + h * 0.42, w, 1.5);
  c.fillStyle = "rgba(0, 0, 0, 0.22)";
  c.fillRect(x + w * 0.5, y + h * 0.4, 1, h * 0.3);
  c.restore();
  polyPath(c, spec.body, x, y, w, h);
  c.strokeStyle = "rgba(0, 0, 0, 0.4)";
  c.lineWidth = 1;
  c.stroke();

  // Glass with a diagonal reflection, split by pillars.
  for (const win of spec.windows) {
    const glass = c.createLinearGradient(x, y, x + w * 0.4, y + h * 0.4);
    glass.addColorStop(0, "#7e9bbd");
    glass.addColorStop(0.5, "#24344a");
    glass.addColorStop(1, "#141d2b");
    polyPath(c, win, x, y, w, h);
    c.fillStyle = glass;
    c.fill();
  }
  c.fillStyle = shades[1];
  for (const px of spec.pillars) c.fillRect(x + px * w - 1.5, y + h * 0.08, 3, h * 0.3);

  // Head and tail lights.
  const hx = x + spec.head[0] * w;
  const hy = y + spec.head[1] * h;
  glow(c, hx, hy, 14, "rgba(255, 245, 210, ALPHA)", 0.75);
  c.fillStyle = "#fff8de";
  roundRect(c, hx - 5, hy - 2.5, 7, 5, 2);
  c.fill();
  const tx = x + spec.tail[0] * w;
  const ty = y + spec.tail[1] * h;
  glow(c, tx, ty, 12, "rgba(255, 40, 60, ALPHA)", 0.6);
  c.fillStyle = "#ff3045";
  c.fillRect(tx - 1, ty - 3, 4, 6);

  // Wheel arches, tyres and spinning rims.
  const r = spec.r * h;
  const cy = y + h - r;
  for (const fx of spec.wheels) drawWheel(c, x + fx * w, cy, r, wheelAngle);
}

function drawWheel(c, cx, cy, r, angle) {
  c.fillStyle = "#06080c";
  c.beginPath();
  c.arc(cx, cy, r * 1.14, Math.PI, 0);
  c.fill();
  c.fillStyle = "#121418";
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();

  const rim = c.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r * 0.62);
  rim.addColorStop(0, "#e6ebf2");
  rim.addColorStop(1, "#7d8796");
  c.fillStyle = rim;
  c.beginPath();
  c.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
  c.fill();

  c.strokeStyle = "#3a414d";
  c.lineWidth = 1.6;
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = angle + (i * Math.PI * 2) / 5;
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55);
  }
  c.stroke();
  c.fillStyle = "#2a2f38";
  c.beginPath();
  c.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
  c.fill();
}
