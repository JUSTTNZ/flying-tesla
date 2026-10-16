/**
 * Screen-space overlays for the point-of-view cameras:
 *   driver — windshield frame, yoke and a Tesla-style centre screen
 *   hood   — the Tesla's bonnet across the bottom of the view
 *   drone  — camera HUD with REC light, timecode and flight readouts
 * Drawn after the world, in the fixed 1280×720 screen coordinates.
 */
import { BASE_SPEED, H, HOP_HEIGHT, LANES, NITRO_TIME, W } from "./config.js";
import { roundRect } from "./utils.js";

const FONT = "'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

// Game speed → a plausible km/h readout.
const kmh = (state) => Math.round((state.scrollSpeed / BASE_SPEED) * 72);

export function drawPovOverlay(c, mode, state, clock, shades) {
  if (mode === "driver") drawDriver(c, state, clock);
  else if (mode === "hood") drawHood(c, state, shades);
  else if (mode === "drone") drawDrone(c, state, clock);
}

// ---------------------------------------------------------------------------
// Hood: the front of the car in the Tesla's paint, with a speed readout.
// ---------------------------------------------------------------------------
function drawHood(c, state, shades) {
  const top = H - 92;
  const g = c.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, shades[0]);
  g.addColorStop(0.35, shades[1]);
  g.addColorStop(1, shades[2]);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-20, H + 10);
  c.lineTo(-20, top + 50);
  c.quadraticCurveTo(W / 2, top - 30, W + 20, top + 50);
  c.lineTo(W + 20, H + 10);
  c.closePath();
  c.fill();
  // Highlight along the crease and a reflection of the sky.
  c.strokeStyle = "rgba(255, 255, 255, 0.35)";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(80, top + 44);
  c.quadraticCurveTo(W / 2, top - 14, W - 80, top + 44);
  c.stroke();
  c.fillStyle = "#ffffff";
  c.font = `700 16px ${FONT}`;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillText(`${kmh(state)} km/h`, 40, 110);
}

// ---------------------------------------------------------------------------
// Driver: looking out through the windshield from the driver's seat.
// ---------------------------------------------------------------------------
const DASH_TOP = H - 168;

function windshieldPath(c) {
  c.moveTo(150, 64);
  c.lineTo(W - 150, 64);
  c.quadraticCurveTo(W - 112, 64, W - 96, 110);
  c.lineTo(W - 40, DASH_TOP - 30);
  c.quadraticCurveTo(W - 34, DASH_TOP, W - 80, DASH_TOP);
  c.lineTo(80, DASH_TOP);
  c.quadraticCurveTo(34, DASH_TOP, 40, DASH_TOP - 30);
  c.lineTo(96, 110);
  c.quadraticCurveTo(112, 64, 150, 64);
  c.closePath();
}

function drawDriver(c, state, clock) {
  const p = state.player;

  // Cabin: everything outside the windshield is interior.
  c.beginPath();
  c.rect(-10, -10, W + 20, H + 20);
  windshieldPath(c);
  const cabin = c.createLinearGradient(0, 0, 0, H);
  cabin.addColorStop(0, "#0b0e14");
  cabin.addColorStop(0.5, "#05070b");
  cabin.addColorStop(1, "#020305");
  c.fillStyle = cabin;
  c.fill("evenodd");

  // Glass tint and a soft reflection streak.
  c.save();
  c.beginPath();
  windshieldPath(c);
  c.clip();
  const tint = c.createLinearGradient(0, 64, 0, DASH_TOP);
  tint.addColorStop(0, "rgba(40, 60, 90, 0.28)");
  tint.addColorStop(0.25, "rgba(40, 60, 90, 0)");
  c.fillStyle = tint;
  c.fillRect(0, 64, W, DASH_TOP - 64);
  c.fillStyle = "rgba(255, 255, 255, 0.04)";
  c.beginPath();
  c.moveTo(W * 0.62, 64);
  c.lineTo(W * 0.7, 64);
  c.lineTo(W * 0.5, DASH_TOP);
  c.lineTo(W * 0.42, DASH_TOP);
  c.closePath();
  c.fill();
  c.restore();

  // Rear-view mirror.
  c.fillStyle = "#111620";
  roundRect(c, W / 2 - 74, 70, 148, 34, 12);
  c.fill();
  const mirror = c.createLinearGradient(0, 74, 0, 100);
  mirror.addColorStop(0, "#2a3a55");
  mirror.addColorStop(1, "#141c2a");
  c.fillStyle = mirror;
  roundRect(c, W / 2 - 68, 74, 136, 26, 9);
  c.fill();

  // Dashboard top edge with an ambient light strip.
  const dash = c.createLinearGradient(0, DASH_TOP, 0, H);
  dash.addColorStop(0, "#1a1f29");
  dash.addColorStop(1, "#07090d");
  c.fillStyle = dash;
  c.beginPath();
  c.moveTo(0, DASH_TOP + 18);
  c.quadraticCurveTo(W / 2, DASH_TOP - 10, W, DASH_TOP + 18);
  c.lineTo(W, H);
  c.lineTo(0, H);
  c.closePath();
  c.fill();
  c.fillStyle = "rgba(62, 198, 255, 0.55)";
  c.fillRect(140, DASH_TOP + 12, W - 280, 2);

  drawYoke(c, 300, H - 18, (p.lane - p.lanePos) * 0.9);
  drawCentreScreen(c, state, clock, W / 2 + 30, H - 150, 330, 118);
}

// Yoke steering wheel, turning while changing lanes.
function drawYoke(c, x, y, turn) {
  c.save();
  c.translate(x, y);
  c.rotate(turn);
  c.strokeStyle = "#1c222c";
  c.lineWidth = 22;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(-130, -40);
  c.lineTo(-130, -96);
  c.quadraticCurveTo(-130, -112, -110, -112);
  c.lineTo(110, -112);
  c.quadraticCurveTo(130, -112, 130, -96);
  c.lineTo(130, -40);
  c.stroke();
  c.strokeStyle = "#2b3340";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-120, -112);
  c.lineTo(120, -112);
  c.stroke();
  c.fillStyle = "#151a22";
  roundRect(c, -46, -100, 92, 60, 18); // hub
  c.fill();
  c.fillStyle = "#c9d2de";
  c.fillRect(-10, -74, 20, 3);
  c.restore();
}

function drawCentreScreen(c, state, clock, x, y, w, h) {
  const p = state.player;
  c.fillStyle = "#000";
  roundRect(c, x - 4, y - 4, w + 8, h + 8, 16);
  c.fill();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#0d1420");
  g.addColorStop(1, "#070b12");
  c.fillStyle = g;
  roundRect(c, x, y, w, h, 12);
  c.fill();

  // Speed.
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillStyle = "#ffffff";
  c.font = `700 42px ${FONT}`;
  c.fillText(String(kmh(state)), x + 18, y + 56);
  c.fillStyle = "#8aa0c0";
  c.font = `600 11px ${FONT}`;
  c.fillText("KM/H", x + 20, y + 74);

  // Lanes, current one highlighted.
  const lx = x + 120;
  for (let i = 0; i < LANES.length; i++) {
    const active = Math.abs(i - p.lanePos) < 0.5;
    c.fillStyle = active ? "#3ec6ff" : "rgba(255, 255, 255, 0.15)";
    roundRect(c, lx, y + 22 + i * 18, 70, 12, 4);
    c.fill();
  }
  c.fillStyle = "#8aa0c0";
  c.fillText(`LEVEL ${state.level}`, lx, y + 96);

  // Flight status with a recharge bar.
  const sx = x + 212;
  let label = "FLY READY";
  let colour = "#7fe3ff";
  let fill = 1;
  if (!state.running && state.crashReason) {
    label = "COLLISION";
    colour = "#ff5a6a";
  } else if (p.nitro > 0) {
    label = "NITRO";
    colour = "#5ee8ff";
    fill = p.nitro / NITRO_TIME;
  } else if (p.flying) {
    label = "AIRBORNE";
    colour = "#ffd166";
    fill = 1 - p.flyT / 2;
  } else if (p.cooldown > 0) {
    label = "CHARGING";
    colour = "#8aa0c0";
    fill = 1 - p.cooldown / state.cfg.cooldown;
  }
  const blink = label === "COLLISION" && Math.floor(clock * 4) % 2;
  c.fillStyle = blink ? "transparent" : colour;
  c.font = `700 13px ${FONT}`;
  c.fillText(label, sx, y + 40);
  c.fillStyle = "rgba(255, 255, 255, 0.12)";
  roundRect(c, sx, y + 52, 100, 8, 4);
  c.fill();
  c.fillStyle = colour;
  roundRect(c, sx, y + 52, Math.max(8, 100 * fill), 8, 4);
  c.fill();
  c.fillStyle = "#8aa0c0";
  c.font = `600 11px ${FONT}`;
  c.fillText(p.flying ? `ALT ${Math.round(p.hop / 3)} m` : "AUTOPILOT", sx, y + 86);
}

// ---------------------------------------------------------------------------
// Drone: a camera drone shadowing the car.
// ---------------------------------------------------------------------------
function drawDrone(c, state, clock) {
  const p = state.player;

  // Lens vignette.
  const v = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
  v.addColorStop(0, "rgba(0, 0, 0, 0)");
  v.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);

  // Corner brackets.
  c.strokeStyle = "rgba(255, 255, 255, 0.85)";
  c.lineWidth = 2.5;
  const L = 34;
  const [x0, y0, x1, y1] = [56, 96, W - 56, H - 56];
  c.beginPath();
  for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    c.moveTo(cx + dx * L, cy);
    c.lineTo(cx, cy);
    c.lineTo(cx, cy + dy * L);
  }
  c.stroke();

  // Centre crosshair.
  c.lineWidth = 1.5;
  c.strokeStyle = "rgba(255, 255, 255, 0.5)";
  c.beginPath();
  c.moveTo(W / 2 - 12, H / 2);
  c.lineTo(W / 2 + 12, H / 2);
  c.moveTo(W / 2, H / 2 - 12);
  c.lineTo(W / 2, H / 2 + 12);
  c.stroke();

  // REC light and timecode.
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.font = `700 14px ${MONO}`;
  if (Math.floor(clock * 1.5) % 2 === 0) {
    c.fillStyle = "#ff3045";
    c.beginPath();
    c.arc(x0 + 20, y0 + 26, 6, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#ffffff";
  c.fillText("REC", x0 + 34, y0 + 27);
  const t = Math.floor(clock);
  const tc = [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map((n) => String(n).padStart(2, "0")).join(":");
  c.fillText(tc, x0 + 82, y0 + 27);

  // Flight readouts.
  c.font = `600 13px ${MONO}`;
  c.fillStyle = "rgba(255, 255, 255, 0.9)";
  const alt = 40 + Math.round((p.hop / HOP_HEIGHT) * 40);
  c.fillText(`ALT ${alt}m   SPD ${kmh(state)}km/h   LANE ${p.lane + 1}   LVL ${state.level}`, x0 + 20, y1 - 22);
  c.textAlign = "right";
  c.fillText("DRONE CAM · 4K", x1 - 20, y0 + 27);
}
