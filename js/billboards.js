/**
 * Roadside billboards: drawn in-world ads (SpaceX, xAI, Grok, Starship,
 * Grok Bots) taking turns with picture billboards loaded from assets/.
 *
 * Billboards stand on the far pavement every BILLBOARD_SPACING world px,
 * between the trees and lamps, raised above both.
 */
import { SIDEWALK_TOP, VIEW_PAD, W } from "./config.js";
import { glow, mod, roundRect } from "./utils.js";

const BILLBOARD_SPACING = 960;
const BILLBOARD_PHASE = 240; // halfway between a lamp (0 mod 320) and a tree (160 mod 320)
const BW = 230; // sign size
const BH = 112;
const TOP = 236; // sign top edge

const FONT = "'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif";

// Text with extra letter spacing, left-aligned at x.
function spaced(c, text, x, y, spacing) {
  for (const ch of text) {
    c.fillText(ch, x, y);
    x += c.measureText(ch).width + spacing;
  }
}

function spacedWidth(c, text, spacing) {
  let w = 0;
  for (const ch of text) w += c.measureText(ch).width + spacing;
  return w - spacing;
}

function centered(c, text, cx, y, spacing) {
  spaced(c, text, cx - spacedWidth(c, text, spacing) / 2, y, spacing);
}

// Each ad: panel gradient, colour of the light it throws, and its artwork.
const ADS = [
  {
    // SpaceX: wide wordmark over a starfield with Mars and an orbit line.
    bg: ["#03050b", "#0b1530"],
    light: "rgba(150, 180, 255, ALPHA)",
    paint(c, l, t, w, h) {
      c.fillStyle = "rgba(255, 255, 255, 0.7)";
      for (let i = 0; i < 26; i++) c.fillRect(l + ((i * 53) % w), t + ((i * 31) % h), 1.2, 1.2);
      const mars = c.createRadialGradient(l + w - 46, t + h - 30, 4, l + w - 40, t + h - 22, 34);
      mars.addColorStop(0, "#f08a4b");
      mars.addColorStop(1, "#8a2f12");
      c.fillStyle = mars;
      c.beginPath();
      c.arc(l + w - 40, t + h - 22, 34, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "rgba(255, 255, 255, 0.55)";
      c.lineWidth = 1.2;
      c.beginPath();
      c.ellipse(l + w - 40, t + h - 22, 52, 12, -0.25, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#ffffff";
      c.font = `800 30px ${FONT}`;
      spaced(c, "SPACEX", l + 16, t + 48, 7);
      c.font = `600 10px ${FONT}`;
      c.fillStyle = "rgba(220, 230, 255, 0.85)";
      spaced(c, "NEXT STOP: MARS", l + 18, t + 72, 3);
    },
  },
  {
    // xAI: minimal black-and-white.
    bg: ["#000000", "#16181d"],
    light: "rgba(230, 235, 255, ALPHA)",
    paint(c, l, t, w, h) {
      c.strokeStyle = "rgba(255, 255, 255, 0.35)";
      c.lineWidth = 1;
      c.strokeRect(l + 8, t + 8, w - 16, h - 16);
      c.fillStyle = "#ffffff";
      c.font = `300 52px ${FONT}`;
      centered(c, "xAI", l + w / 2, t + 64, 2);
      c.font = `600 9px ${FONT}`;
      c.fillStyle = "rgba(255, 255, 255, 0.75)";
      centered(c, "UNDERSTAND THE UNIVERSE", l + w / 2, t + 88, 3);
    },
  },
  {
    // Grok: chat-style prompt with a blinking cursor.
    bg: ["#0b0b0c", "#1d1e22"],
    light: "rgba(200, 210, 230, ALPHA)",
    paint(c, l, t, w, h, clock) {
      c.fillStyle = "#ffffff";
      c.font = `800 44px ${FONT}`;
      spaced(c, "Grok", l + 18, t + 54, 1);
      c.fillStyle = "rgba(255, 255, 255, 0.1)";
      roundRect(c, l + 16, t + 70, w - 32, 26, 13);
      c.fill();
      c.fillStyle = "rgba(255, 255, 255, 0.8)";
      c.font = `600 11px ${FONT}`;
      c.fillText("Ask anything", l + 30, t + 87);
      if (Math.floor(clock * 2) % 2 === 0) c.fillRect(l + 106, t + 76, 2, 14);
    },
  },
  {
    // Starship: steel rocket with flame on a deep blue sky.
    bg: ["#0a1a3a", "#1e3f7a"],
    light: "rgba(255, 190, 120, ALPHA)",
    paint(c, l, t, w, h, clock) {
      const rx = l + w - 30;
      const steel = c.createLinearGradient(rx - 9, 0, rx + 9, 0);
      steel.addColorStop(0, "#8d96a3");
      steel.addColorStop(0.5, "#f1f4f8");
      steel.addColorStop(1, "#7b8491");
      c.fillStyle = steel;
      c.beginPath();
      c.moveTo(rx - 9, t + h - 22);
      c.lineTo(rx - 9, t + 26);
      c.quadraticCurveTo(rx, t + 6, rx + 9, t + 26);
      c.lineTo(rx + 9, t + h - 22);
      c.closePath();
      c.fill();
      const flicker = 1 + Math.sin(clock * 30) * 0.15;
      glow(c, rx, t + h - 12, 22 * flicker, "rgba(255, 170, 60, ALPHA)", 0.9);
      c.fillStyle = "#ffd27a";
      c.beginPath();
      c.moveTo(rx - 7, t + h - 22);
      c.lineTo(rx + 7, t + h - 22);
      c.lineTo(rx, t + h - 4 + 4 * flicker);
      c.closePath();
      c.fill();
      c.fillStyle = "#ffffff";
      c.font = `800 23px ${FONT}`;
      spaced(c, "STARSHIP", l + 16, t + 50, 3);
      c.font = `600 10px ${FONT}`;
      c.fillStyle = "#ffcf8a";
      spaced(c, "LAUNCHING TONIGHT", l + 18, t + 72, 2.5);
    },
  },
  {
    // Grok Bots: robot head with a glowing visor.
    bg: ["#06222a", "#0e3b47"],
    light: "rgba(80, 230, 255, ALPHA)",
    paint(c, l, t, w, h, clock) {
      const hx = l + 22;
      const hy = t + 22;
      c.fillStyle = "#e9eef5";
      roundRect(c, hx, hy, 54, 62, 18);
      c.fill();
      c.fillStyle = "#0b0f16";
      roundRect(c, hx + 6, hy + 16, 42, 20, 10);
      c.fill();
      const blink = Math.sin(clock * 3) > 0.95 ? 0.2 : 1;
      c.fillStyle = `rgba(80, 230, 255, ${blink})`;
      c.fillRect(hx + 13, hy + 24, 28, 4);
      c.fillStyle = "#ffffff";
      c.font = `800 18px ${FONT}`;
      spaced(c, "GROK BOTS", l + 90, t + 52, 1.5);
      c.font = `600 10px ${FONT}`;
      c.fillStyle = "#7fe9ff";
      spaced(c, "NOW HIRING HUMANS", l + 90, t + 72, 0.8);
    },
  },
];

// ---------------------------------------------------------------------------
// Image billboards: pictures from assets/, shown bigger than the drawn ads.
// `focusY` (0 top … 1 bottom) picks which part stays in view when the picture
// is cropped to the sign's shape. Pictures that fail to load (e.g. not
// deployed) fall back to the drawn ad named in `fallback`.
// ---------------------------------------------------------------------------
const IMAGE_W = 256;
const IMAGE_H = 136;

function loadImage(src) {
  const img = new Image();
  img.src = encodeURI(src);
  return img;
}

const ready = (img) => img.complete && img.naturalWidth > 0;

const [SPACEX, XAI, GROK, STARSHIP, GROK_BOTS] = ADS;

const IMAGE_ADS = [
  { src: "assets/images.png", focusY: 0.5, light: "rgba(220, 230, 255, ALPHA)", fallback: SPACEX },
  { src: "assets/images (1).jpeg", focusY: 0.5, light: "rgba(255, 170, 110, ALPHA)", fallback: GROK_BOTS },
  { src: "assets/images.jpeg", focusY: 0.4, light: "rgba(230, 235, 255, ALPHA)", fallback: STARSHIP },
  { src: "assets/images (2).jpeg", focusY: 0.45, light: "rgba(230, 225, 215, ALPHA)", fallback: XAI },
  { src: "assets/hero.png", focusY: 0.28, light: "rgba(120, 200, 255, ALPHA)", fallback: GROK },
].map((ad) => ({ ...ad, img: loadImage(ad.src) }));

// Order along the road: pictures and drawn ads take turns.
const ROTATION = [
  IMAGE_ADS[0], XAI, IMAGE_ADS[1], GROK, IMAGE_ADS[2], STARSHIP,
  IMAGE_ADS[3], GROK_BOTS, IMAGE_ADS[4], SPACEX,
];

export function drawBillboards(c, distance, clock) {
  const first = Math.floor((distance - BILLBOARD_PHASE) / BILLBOARD_SPACING) - 1;
  for (let k = first; ; k++) {
    const x = k * BILLBOARD_SPACING + BILLBOARD_PHASE - distance;
    if (x - IMAGE_W > W + VIEW_PAD) break;
    if (x + IMAGE_W < -VIEW_PAD) continue;
    let ad = ROTATION[mod(k, ROTATION.length)];
    if (ad.img && !ready(ad.img)) ad = ad.fallback;
    if (ad.img) drawBillboard(c, x, IMAGE_W, IMAGE_H, ad, clock);
    else drawBillboard(c, x, BW, BH, ad, clock);
  }
}

// Billboards whose centre (side-view screen x) lies in [minX, maxX], with
// unloaded pictures already swapped for their fallback ads.
export function billboardsBetween(distance, minX, maxX) {
  const out = [];
  const first = Math.floor((distance + minX - BILLBOARD_PHASE) / BILLBOARD_SPACING);
  for (let k = first; ; k++) {
    const x = k * BILLBOARD_SPACING + BILLBOARD_PHASE - distance;
    if (x > maxX) break;
    if (x < minX) continue;
    let ad = ROTATION[mod(k, ROTATION.length)];
    if (ad.img && !ready(ad.img)) ad = ad.fallback;
    out.push({ x, ad });
  }
  return out;
}

// Paint an ad's artwork into any rectangle (used by the forward view).
export function drawAd(c, ad, l, t, w, h, clock) {
  c.save();
  c.beginPath();
  c.rect(l, t, w, h);
  c.clip();
  if (ad.img) {
    drawCover(c, ad.img, ad.focusY, l, t, w, h);
  } else {
    // Drawn ads are laid out for a BW×BH panel; scale that to fit.
    c.translate(l, t);
    c.scale(w / BW, h / BH);
    const g = c.createLinearGradient(0, 0, 0, BH);
    g.addColorStop(0, ad.bg[0]);
    g.addColorStop(1, ad.bg[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, BW, BH);
    c.textAlign = "left";
    c.textBaseline = "alphabetic";
    ad.paint(c, 0, 0, BW, BH, clock);
  }
  c.restore();
}

// Draw `img` cropped to fill the w×h box ("cover"), keeping focusY in view.
function drawCover(c, img, focusY, l, t, w, h) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) * focusY;
  c.drawImage(img, sx, sy, sw, sh, l, t, w, h);
}

function drawBillboard(c, x, bw, bh, ad, clock) {
  const l = x - bw / 2;
  const bottom = TOP + BH; // every sign sits on the same catwalk height
  const top = bottom - bh;
  const base = SIDEWALK_TOP + 12;

  // Light the sign throws onto the buildings behind it.
  c.save();
  c.globalCompositeOperation = "lighter";
  glow(c, x, top + bh / 2, bw * 0.85, ad.light, 0.16);
  c.restore();

  // Twin legs and a catwalk.
  c.fillStyle = "#1a2029";
  c.fillRect(x - 44, bottom, 8, base - bottom);
  c.fillRect(x + 36, bottom, 8, base - bottom);
  c.fillRect(l - 6, bottom + 4, bw + 12, 5);
  c.fillRect(x - 46, base - 4, 12, 4);
  c.fillRect(x + 34, base - 4, 12, 4);

  // Frame and panel.
  c.fillStyle = "#0d1016";
  roundRect(c, l - 6, top - 6, bw + 12, bh + 12, 4);
  c.fill();

  c.save();
  c.beginPath();
  c.rect(l, top, bw, bh);
  c.clip();
  if (ad.img) {
    drawCover(c, ad.img, ad.focusY, l, top, bw, bh);
  } else {
    const g = c.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, ad.bg[0]);
    g.addColorStop(1, ad.bg[1]);
    c.fillStyle = g;
    c.fillRect(l, top, bw, bh);
    c.textAlign = "left";
    c.textBaseline = "alphabetic";
    ad.paint(c, l, top, bw, bh, clock);
  }
  // Spotlights wash the top of the sign.
  const wash = c.createLinearGradient(0, top, 0, top + bh * 0.6);
  wash.addColorStop(0, "rgba(255, 245, 220, 0.18)");
  wash.addColorStop(1, "rgba(255, 245, 220, 0)");
  c.fillStyle = wash;
  c.fillRect(l, top, bw, bh);
  c.restore();

  // Three spotlights on arms above the sign.
  for (const f of [0.2, 0.5, 0.8]) {
    const sx = l + bw * f;
    c.fillStyle = "#1a2029";
    c.fillRect(sx - 1, top - 16, 2, 10);
    c.fillStyle = "#fff3d6";
    roundRect(c, sx - 6, top - 19, 12, 5, 2);
    c.fill();
    glow(c, sx, top - 16, 14, "rgba(255, 240, 200, ALPHA)", 0.5);
  }
}
