/**
 * Selectable drivers: a name, a small perk, and a portrait.
 *
 * Portraits are drawn cartoons (signature outfit, hair, glasses). If a photo
 * exists at assets/drivers/<id>.jpg (or .png) it's used instead; those files
 * are local only and not part of the public repo.
 */
import { roundRect } from "./utils.js";

// Perk multipliers default to 1 / 0 (see PERK_DEFAULTS).
export const DRIVERS = {
  elon: {
    name: "Elon Musk",
    short: "Elon",
    perkText: "2× Grok tokens",
    perks: { grokTokens: 2 },
    look: { skin: "#f0c8a8", hair: "#3a2a1e", style: "swept", outfit: "#15171c", collar: "tee" },
  },
  bezos: {
    name: "Jeff Bezos",
    short: "Jeff",
    perkText: "Nitro lasts 1s longer",
    perks: { nitroExtra: 1 },
    look: { skin: "#f1c6a2", hair: null, style: "bald", outfit: "#2d4f7c", collar: "vest" },
  },
  pichai: {
    name: "Sundar Pichai",
    short: "Sundar",
    perkText: "More gift boxes",
    perks: { giftRate: 1.6 },
    look: { skin: "#b9805a", hair: "#1c1612", style: "short", outfit: "#5b6b7d", collar: "sweater", glasses: "rect" },
  },
  jensen: {
    name: "Jensen Huang",
    short: "Jensen",
    perkText: "1.5× flip bonus",
    perks: { flipBonus: 1.5 },
    look: { skin: "#e6b98f", hair: "#16120f", style: "side", outfit: "#0b0b0d", collar: "leather" },
  },
  jobs: {
    name: "Steve Jobs",
    short: "Steve",
    perkText: "1.5× fly-over bonus",
    perks: { flyBonus: 1.5 },
    look: { skin: "#ecc3a0", hair: "#4a3d33", style: "receding", outfit: "#0f0f10", collar: "turtleneck", glasses: "round", stubble: true },
  },
};

export const DRIVER_IDS = Object.keys(DRIVERS);

const PERK_DEFAULTS = { grokTokens: 1, cursorTokens: 1, nitroExtra: 0, giftRate: 1, flipBonus: 1, flyBonus: 1 };
export const perksOf = (id) => ({ ...PERK_DEFAULTS, ...(DRIVERS[id] || DRIVERS.elon).perks });

// Optional local photos: try .jpg, then .png.
const photos = {};
for (const id of DRIVER_IDS) {
  if (typeof Image === "undefined") break; // e.g. tests running outside a browser
  const img = new Image();
  img.onerror = () => {
    if (!img.src.endsWith(".png")) img.src = `assets/drivers/${id}.png`;
  };
  img.src = `assets/drivers/${id}.jpg`;
  photos[id] = img;
}
const photoReady = (id) => photos[id] && photos[id].complete && photos[id].naturalWidth > 0;

/** Round portrait of a driver centred at (cx, cy) with radius r. */
export function drawAvatar(c, id, cx, cy, r) {
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.clip();
  if (photoReady(id)) {
    const img = photos[id];
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    c.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) * 0.3, s, s, cx - r, cy - r, r * 2, r * 2);
  } else {
    drawCartoon(c, DRIVERS[id].look, cx, cy, r);
  }
  c.restore();
}

function drawCartoon(c, look, cx, cy, r) {
  const u = r / 50; // design units: the portrait is drawn on a 100×100 grid
  const bg = c.createLinearGradient(0, cy - r, 0, cy + r);
  bg.addColorStop(0, "#2a3a5c");
  bg.addColorStop(1, "#141c2c");
  c.fillStyle = bg;
  c.fillRect(cx - r, cy - r, r * 2, r * 2);

  // Shoulders and outfit.
  c.fillStyle = look.outfit;
  c.beginPath();
  c.ellipse(cx, cy + 52 * u, 44 * u, 30 * u, 0, Math.PI, 0);
  c.fill();
  c.fillRect(cx - 44 * u, cy + 52 * u, 88 * u, 10 * u);
  // Neck.
  c.fillStyle = look.skin;
  c.fillRect(cx - 8 * u, cy + 8 * u, 16 * u, 16 * u);
  // Collar details.
  if (look.collar === "turtleneck") {
    c.fillStyle = look.outfit;
    roundRect(c, cx - 12 * u, cy + 14 * u, 24 * u, 14 * u, 5 * u);
    c.fill();
  } else if (look.collar === "leather") {
    c.fillStyle = "#2a2b30";
    c.beginPath();
    c.moveTo(cx - 10 * u, cy + 22 * u);
    c.lineTo(cx - 26 * u, cy + 40 * u);
    c.lineTo(cx - 6 * u, cy + 50 * u);
    c.closePath();
    c.moveTo(cx + 10 * u, cy + 22 * u);
    c.lineTo(cx + 26 * u, cy + 40 * u);
    c.lineTo(cx + 6 * u, cy + 50 * u);
    c.closePath();
    c.fill();
    c.fillStyle = "#16171a";
    c.fillRect(cx - 6 * u, cy + 24 * u, 12 * u, 30 * u);
  } else if (look.collar === "vest") {
    c.fillStyle = "#e9edf2";
    c.beginPath();
    c.moveTo(cx - 9 * u, cy + 22 * u);
    c.lineTo(cx, cy + 36 * u);
    c.lineTo(cx + 9 * u, cy + 22 * u);
    c.closePath();
    c.fill();
  } else if (look.collar === "sweater") {
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.moveTo(cx - 8 * u, cy + 22 * u);
    c.lineTo(cx, cy + 30 * u);
    c.lineTo(cx + 8 * u, cy + 22 * u);
    c.closePath();
    c.fill();
  }

  // Head and ears.
  c.fillStyle = look.skin;
  c.beginPath();
  c.ellipse(cx, cy - 6 * u, 19 * u, 23 * u, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(cx - 19 * u, cy - 4 * u, 4 * u, 6 * u, 0, 0, Math.PI * 2);
  c.ellipse(cx + 19 * u, cy - 4 * u, 4 * u, 6 * u, 0, 0, Math.PI * 2);
  c.fill();
  if (look.stubble) {
    c.fillStyle = "rgba(70, 55, 45, 0.35)";
    c.beginPath();
    c.ellipse(cx, cy + 6 * u, 16 * u, 11 * u, 0, 0, Math.PI);
    c.fill();
  }

  // Hair.
  if (look.hair) {
    c.fillStyle = look.hair;
    c.beginPath();
    if (look.style === "swept") {
      c.ellipse(cx + 2 * u, cy - 22 * u, 21 * u, 12 * u, -0.15, Math.PI, 0);
      c.moveTo(cx - 19 * u, cy - 20 * u);
      c.quadraticCurveTo(cx - 6 * u, cy - 40 * u, cx + 20 * u, cy - 26 * u);
    } else if (look.style === "short") {
      c.ellipse(cx, cy - 22 * u, 20 * u, 11 * u, 0, Math.PI, 0);
    } else if (look.style === "side") {
      c.ellipse(cx, cy - 21 * u, 21 * u, 13 * u, 0, Math.PI, 0);
      c.rect(cx - 21 * u, cy - 22 * u, 5 * u, 12 * u);
    } else if (look.style === "receding") {
      c.ellipse(cx - 16 * u, cy - 14 * u, 5 * u, 9 * u, 0.3, 0, Math.PI * 2);
      c.ellipse(cx + 16 * u, cy - 14 * u, 5 * u, 9 * u, -0.3, 0, Math.PI * 2);
    }
    c.fill();
  }

  // Eyes, brows and a smile.
  c.fillStyle = "#1a1410";
  c.beginPath();
  c.arc(cx - 7 * u, cy - 6 * u, 2 * u, 0, Math.PI * 2);
  c.arc(cx + 7 * u, cy - 6 * u, 2 * u, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "rgba(40, 25, 15, 0.8)";
  c.lineWidth = 1.6 * u;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(cx - 11 * u, cy - 12 * u);
  c.lineTo(cx - 4 * u, cy - 12 * u);
  c.moveTo(cx + 4 * u, cy - 12 * u);
  c.lineTo(cx + 11 * u, cy - 12 * u);
  c.moveTo(cx - 6 * u, cy + 7 * u);
  c.quadraticCurveTo(cx, cy + 11 * u, cx + 6 * u, cy + 7 * u);
  c.stroke();

  // Glasses.
  if (look.glasses) {
    c.strokeStyle = "#111";
    c.lineWidth = 1.5 * u;
    c.beginPath();
    if (look.glasses === "round") {
      c.arc(cx - 7 * u, cy - 6 * u, 5.5 * u, 0, Math.PI * 2);
      c.moveTo(cx + 12.5 * u, cy - 6 * u);
      c.arc(cx + 7 * u, cy - 6 * u, 5.5 * u, 0, Math.PI * 2);
    } else {
      c.rect(cx - 13 * u, cy - 10 * u, 11 * u, 8 * u);
      c.rect(cx + 2 * u, cy - 10 * u, 11 * u, 8 * u);
    }
    c.moveTo(cx - 1.5 * u, cy - 6 * u);
    c.lineTo(cx + 1.5 * u, cy - 6 * u);
    c.stroke();
  }
}
