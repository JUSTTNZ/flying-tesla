/**
 * City skyline: three parallax layers, each pre-rendered once into an
 * offscreen canvas (re-rendered on resize) and tiled as it scrolls.
 */
import { SIDEWALK_TOP, SKYLINE_PERIOD, VIEW_PAD, W } from "./config.js";
import { glow, mod, rgbaTemplate, roundRect, seeded, shade } from "./utils.js";

const LAYER_DEFS = [
  { factor: 0.08, minH: 170, maxH: 330, minW: 46, maxW: 100, seed: 11 }, // far
  { factor: 0.22, minH: 120, maxH: 270, minW: 60, maxW: 130, seed: 23 }, // mid
  { factor: 0.5, minH: 95, maxH: 215, minW: 96, maxW: 170, seed: 37 }, // near
];
const FACADES = ["#2b3a55", "#33405e", "#3a3350", "#24414a", "#41394f", "#2d4a5a", "#3b3f4c"];
const NEON = ["#ff3fa4", "#3ef0ff", "#ffd23f", "#7cff6b", "#b56bff"];
const AWNINGS = ["#d94f4f", "#2a9d8f", "#e9c46a", "#457b9d", "#c06c84"];

let layers = [];

// Build the offscreen layers at the given pixel scale. Seeded, so the
// skyline looks identical every time.
export function renderSkyline(scale) {
  const offsets = layers.map((l) => l.offset);
  layers = LAYER_DEFS.map((def, depth) => {
    const off = document.createElement("canvas");
    off.width = Math.ceil(SKYLINE_PERIOD * scale);
    off.height = Math.ceil(SIDEWALK_TOP * scale);
    const g = off.getContext("2d");
    g.setTransform(scale, 0, 0, scale, 0, 0);
    const rnd = seeded(def.seed);
    const r = (a, b) => a + rnd() * (b - a);

    // Buildings stop short of the period edge so the wrap is seamless.
    let x = r(0, 20);
    while (true) {
      const w = r(def.minW, def.maxW);
      if (x + w > SKYLINE_PERIOD - 8) break;
      const h = r(def.minH, def.maxH);
      drawBuilding(g, depth, x, SIDEWALK_TOP - h, w, h, rnd);
      x += w + r(depth === 2 ? 4 : 2, depth === 2 ? 26 : 14);
    }
    return { canvas: off, factor: def.factor, offset: offsets[depth] || 0 };
  });
}

export function resetSkyline() {
  for (const layer of layers) layer.offset = 0;
}

// Scroll each layer by a fraction of the road movement (parallax).
export function advanceSkyline(scroll) {
  for (const layer of layers) {
    layer.offset = mod(layer.offset + layer.factor * scroll, SKYLINE_PERIOD);
  }
}

// `haze` is an rgba() template with "ALPHA", tinted to match the sky.
export function drawSkyline(c, haze) {
  layers.forEach((layer, i) => {
    // Tile the strip across the screen plus the camera margins as it wraps.
    for (const base of [-SKYLINE_PERIOD, 0, SKYLINE_PERIOD]) {
      const x = base - layer.offset - 200;
      if (x > W + VIEW_PAD || x + SKYLINE_PERIOD < -VIEW_PAD) continue;
      c.drawImage(layer.canvas, x, 0, SKYLINE_PERIOD, SIDEWALK_TOP);
    }
    // Haze between layers pushes the farther ones back.
    if (i < layers.length - 1) {
      const g = c.createLinearGradient(0, 150, 0, SIDEWALK_TOP);
      g.addColorStop(0, haze.replace("ALPHA", 0));
      g.addColorStop(1, haze.replace("ALPHA", i === 0 ? 0.35 : 0.18));
      c.fillStyle = g;
      c.fillRect(-VIEW_PAD, 150, W + VIEW_PAD * 2, SIDEWALK_TOP - 150);
    }
  });
}

// Far and mid layers squeezed into a band sitting on `horizonY` (forward
// view). `shift` slides them sideways (lane changes) for a little parallax.
export function drawHorizon(c, horizonY, shift, haze) {
  const sc = 0.5;
  const w = SKYLINE_PERIOD * sc;
  const h = SIDEWALK_TOP * sc;
  layers.slice(0, 2).forEach((layer, i) => {
    const off = mod(layer.offset * 0.4 + shift * (i + 1) * 0.3, w);
    for (let x = -off - w; x < W + VIEW_PAD; x += w) {
      c.drawImage(layer.canvas, x, horizonY - h + 6, w, h);
    }
    const g = c.createLinearGradient(0, horizonY - h, 0, horizonY);
    g.addColorStop(0, haze.replace("ALPHA", 0));
    g.addColorStop(1, haze.replace("ALPHA", i === 0 ? 0.5 : 0.3));
    c.fillStyle = g;
    c.fillRect(-VIEW_PAD, horizonY - h, W + VIEW_PAD * 2, h + 6);
  });
}

function drawBuilding(g, depth, x, y, w, h, rnd) {
  if (depth === 0) drawFarBuilding(g, x, y, w, h, rnd);
  else if (depth === 1) drawMidBuilding(g, x, y, w, h, rnd);
  else drawNearBuilding(g, x, y, w, h, rnd);
}

// Far: hazy blue silhouettes with faint window specks.
function drawFarBuilding(g, x, y, w, h, rnd) {
  g.fillStyle = "#17233a";
  g.fillRect(x, y, w, h);
  if (rnd() > 0.6) g.fillRect(x + w * 0.45, y - 22, 2, 22); // antenna
  g.fillStyle = "rgba(150, 190, 255, 0.28)";
  for (let wy = y + 8; wy < SIDEWALK_TOP - 8; wy += 9) {
    for (let wx = x + 4; wx < x + w - 4; wx += 7) {
      if (rnd() < 0.22) g.fillRect(wx, wy, 2, 3);
    }
  }
}

// Mid: darker towers with lit window grids and rooftop details.
function drawMidBuilding(g, x, y, w, h, rnd) {
  const body = g.createLinearGradient(x, 0, x + w, 0);
  body.addColorStop(0, "#1f2e48");
  body.addColorStop(1, "#18243a");
  g.fillStyle = body;
  g.fillRect(x, y, w, h);
  g.fillStyle = "#26375a";
  g.fillRect(x, y, w, 3);

  const roof = rnd();
  g.fillStyle = "#18243a";
  if (roof < 0.3) {
    g.fillRect(x + w * 0.2, y - 14, w * 0.6, 14); // stepped top
  } else if (roof < 0.55) {
    g.fillRect(x + w * 0.6, y - 18, 14, 18); // water tank
    g.fillRect(x + w * 0.6 - 2, y - 20, 18, 4);
  } else if (roof < 0.8) {
    g.fillRect(x + w * 0.5, y - 34, 2, 34); // antenna with red light
    glow(g, x + w * 0.5 + 1, y - 34, 6, "rgba(255, 60, 60, ALPHA)", 0.9);
  }

  const cool = rnd() < 0.4;
  for (let wy = y + 10; wy < SIDEWALK_TOP - 10; wy += 13) {
    for (let wx = x + 6; wx < x + w - 8; wx += 10) {
      const lit = rnd() < 0.36;
      g.fillStyle = lit
        ? cool ? "rgba(150, 210, 255, 0.75)" : "rgba(255, 214, 130, 0.8)"
        : "rgba(10, 16, 28, 0.55)";
      g.fillRect(wx, wy, 5, 7);
    }
  }
}

// Near: coloured facades, framed windows, shopfronts, awnings and neon.
function drawNearBuilding(g, x, y, w, h, rnd) {
  const base = FACADES[(rnd() * FACADES.length) | 0];
  const body = g.createLinearGradient(x, 0, x + w, 0);
  body.addColorStop(0, shade(base, 0.08));
  body.addColorStop(1, shade(base, -0.25));
  g.fillStyle = body;
  g.fillRect(x, y, w, h);
  g.fillStyle = shade(base, 0.22);
  g.fillRect(x - 2, y, w + 4, 5); // roof ledge

  // Framed window grid; some rooms lit warm, a few cool.
  const shopH = 34;
  const cols = Math.max(2, Math.floor((w - 14) / 22));
  const colW = (w - 14) / cols;
  for (let wy = y + 14; wy < SIDEWALK_TOP - shopH - 18; wy += 24) {
    for (let col = 0; col < cols; col++) {
      const wx = x + 7 + col * colW + 3;
      const ww = colW - 6;
      g.fillStyle = shade(base, -0.45);
      g.fillRect(wx - 1, wy - 1, ww + 2, 16);
      if (rnd() < 0.42) {
        const warm = rnd() < 0.75;
        const glass = g.createLinearGradient(0, wy, 0, wy + 14);
        glass.addColorStop(0, warm ? "#ffe1a1" : "#bfe6ff");
        glass.addColorStop(1, warm ? "#e8a24f" : "#6fb6e8");
        g.fillStyle = glass;
      } else {
        g.fillStyle = "#121a29";
      }
      g.fillRect(wx, wy, ww, 14);
      g.fillStyle = "rgba(255, 255, 255, 0.08)";
      g.fillRect(wx, wy, ww, 3);
    }
  }

  // Shopfront: warm glass, door, striped awning.
  const sy = SIDEWALK_TOP - shopH;
  g.fillStyle = shade(base, -0.5);
  g.fillRect(x, sy, w, shopH);
  const shop = g.createLinearGradient(0, sy + 8, 0, SIDEWALK_TOP);
  shop.addColorStop(0, "rgba(255, 210, 140, 0.85)");
  shop.addColorStop(1, "rgba(255, 170, 90, 0.55)");
  g.fillStyle = shop;
  g.fillRect(x + 6, sy + 10, w - 34, shopH - 10);
  g.fillStyle = "#1a1410";
  g.fillRect(x + w - 24, sy + 8, 16, shopH - 8); // door
  const awn = AWNINGS[(rnd() * AWNINGS.length) | 0];
  for (let ax = x + 2, i = 0; ax < x + w - 2; ax += 10, i++) {
    g.fillStyle = i % 2 ? awn : "#f1ece2";
    g.beginPath();
    g.moveTo(ax, sy - 2);
    g.lineTo(ax + 10, sy - 2);
    g.lineTo(ax + 12, sy + 8);
    g.lineTo(ax + 2, sy + 8);
    g.closePath();
    g.fill();
  }

  // Occasional vertical neon sign.
  if (rnd() < 0.45 && h > 120) {
    const col = NEON[(rnd() * NEON.length) | 0];
    const nx = rnd() < 0.5 ? x + 4 : x + w - 14;
    const ny = y + 16 + rnd() * (h * 0.35 - 16);
    glow(g, nx + 5, ny + 22, 34, rgbaTemplate(col), 0.45);
    g.fillStyle = "#0d0f18";
    roundRect(g, nx, ny, 10, 44, 3);
    g.fill();
    g.fillStyle = col;
    for (let i = 0; i < 4; i++) g.fillRect(nx + 3, ny + 5 + i * 10, 4, 6);
  }
}
