/**
 * Street level: pavements, road markings, trees, street lamps, billboards and
 * the pedestrians and Grok Bot robots walking along the far pavement (with
 * speech bubbles).
 *
 * Everything is drawn VIEW_PAD px past the screen edges so zoomed-out and
 * tilted cameras never show a gap.
 */
import { drawBillboards } from "./billboards.js";
import { H, LANES, ROAD_BOTTOM, ROAD_TOP, SIDEWALK_TOP, VIEW_PAD, W } from "./config.js";
import { glow, hash, mod, pick, rand, roundRect, shade } from "./utils.js";

// ---------------------------------------------------------------------------
// Pedestrians
// ---------------------------------------------------------------------------
const SKIN = ["#f1c7a5", "#e3b08a", "#c68b62", "#a86f4c", "#7a4a30", "#5a3522"];
const HAIR = ["#1b1410", "#3b2618", "#6b4423", "#c99a5b", "#2a2a2a", "#8c8c8c", "#a33b2b"];
const SHIRTS = ["#e76f51", "#2a9d8f", "#e9c46a", "#f4f1de", "#457b9d", "#9b5de5",
  "#f15bb5", "#00bbf9", "#ef476f", "#83c5be"];
const PANTS = ["#1d3557", "#2b2d42", "#3d405b", "#5c4033", "#22223b", "#6c757d"];
const BAGS = ["#7f5539", "#e63946", "#264653", "#f4a261"];

export function makePed(x) {
  const lane = Math.random(); // 0 = back of pavement, 1 = kerb side
  return {
    x,
    y: SIDEWALK_TOP + 18 + lane * 20, // feet
    scale: 0.86 + lane * 0.16,
    dir: Math.random() < 0.5 ? -1 : 1,
    speed: rand(26, 48),
    phase: rand(0, Math.PI * 2),
    skin: pick(SKIN),
    hair: pick(HAIR),
    shirt: pick(SHIRTS),
    pants: pick(PANTS),
    longHair: Math.random() < 0.4,
    bag: Math.random() < 0.3 ? pick(BAGS) : null,
    robot: Math.random() < 0.18, // a Grok Bot instead of a person
    bubble: "", // what they're saying
    bubbleT: 0, // seconds left showing it (a negative value is a start delay)
  };
}

// Show a speech bubble, optionally after `delay` seconds.
export function pedSay(ped, text, delay = 0) {
  ped.bubble = text;
  ped.bubbleT = 1.8 + delay;
}

export function seedPeds() {
  const peds = [];
  for (let x = rand(-VIEW_PAD, -200); x < W + VIEW_PAD; x += rand(60, 200)) peds.push(makePed(x));
  return peds;
}

// Walk everyone and keep the crowd topped up. `scrollSpeed` is 0 on the
// start / game over screens, where people still stroll in from both sides.
export function updatePeds(state, dt, scrollSpeed) {
  for (const ped of state.peds) {
    ped.x -= (scrollSpeed - ped.dir * ped.speed) * dt;
    ped.phase += dt * ped.speed * 0.16;
    ped.bubbleT = Math.max(0, ped.bubbleT - dt);
  }
  state.peds = state.peds.filter((ped) => ped.x > -VIEW_PAD && ped.x < W + VIEW_PAD + 60);

  if (scrollSpeed > 0 && state.distance >= state.nextPedAt) {
    state.peds.push(makePed(W + VIEW_PAD + rand(0, 40)));
    state.nextPedAt = state.distance + rand(70, 230);
  } else if (scrollSpeed === 0 && state.peds.length < 14 && Math.random() < dt * 0.6) {
    const ped = makePed(0);
    ped.x = ped.dir > 0 ? -VIEW_PAD + 10 : W + VIEW_PAD - 10;
    state.peds.push(ped);
  }
  state.peds.sort((a, b) => a.y - b.y); // back row drawn first
}

// A walking figure with swinging arms and legs; feet at (ped.x, ped.y).
export function drawPed(c, ped) {
  if (ped.robot) {
    drawRobot(c, ped);
    return;
  }
  const s = ped.scale;
  const x = ped.x;
  const hip = ped.y - 15 * s;
  const shoulder = hip - 15 * s;
  const swing = Math.sin(ped.phase) * 0.5;
  const legLen = 15 * s;
  const armLen = 12 * s;

  c.lineCap = "round";
  // Legs (far leg darker).
  c.lineWidth = 3.6 * s;
  for (const [sign, color] of [[-1, shade(ped.pants, -0.3)], [1, ped.pants]]) {
    c.strokeStyle = color;
    c.beginPath();
    c.moveTo(x, hip);
    c.lineTo(x + Math.sin(swing * sign) * legLen, hip + Math.cos(swing * sign) * legLen);
    c.stroke();
  }
  // Far arm.
  c.lineWidth = 2.8 * s;
  c.strokeStyle = shade(ped.shirt, -0.3);
  c.beginPath();
  c.moveTo(x, shoulder + 2 * s);
  c.lineTo(x + Math.sin(swing) * armLen, shoulder + 2 * s + Math.cos(swing) * armLen);
  c.stroke();
  // Torso.
  c.fillStyle = ped.shirt;
  roundRect(c, x - 4.5 * s, shoulder, 9 * s, 17 * s, 3.5 * s);
  c.fill();
  if (ped.bag) {
    c.fillStyle = ped.bag;
    roundRect(c, x + ped.dir * 3 * s - 3 * s, hip - 4 * s, 7 * s, 7 * s, 1.5 * s);
    c.fill();
  }
  // Near arm with hand.
  c.strokeStyle = ped.shirt;
  const ax = x + Math.sin(-swing) * armLen;
  const ay = shoulder + 2 * s + Math.cos(-swing) * armLen;
  c.beginPath();
  c.moveTo(x, shoulder + 2 * s);
  c.lineTo(ax, ay);
  c.stroke();
  c.fillStyle = ped.skin;
  c.beginPath();
  c.arc(ax, ay, 1.8 * s, 0, Math.PI * 2);
  c.fill();
  // Head, nudged toward the walking direction, with hair on top.
  const hy = shoulder - 6 * s;
  c.beginPath();
  c.arc(x + ped.dir * 0.8 * s, hy, 5 * s, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = ped.hair;
  c.beginPath();
  c.arc(x, hy - 1 * s, 5.2 * s, Math.PI, 0);
  c.fill();
  // Long hair falls down the back of the head.
  if (ped.longHair) c.fillRect(ped.dir > 0 ? x - 5.2 * s : x + 2.2 * s, hy - 1 * s, 3 * s, 9 * s);

  // Speech bubble (after any start delay), fading out at the end.
  const shown = ped.bubbleT > 0 && ped.bubbleT <= 1.8;
  if (shown && ped.bubble) drawBubble(c, x, hy - 10 * s, ped.bubble, Math.min(1, ped.bubbleT * 3));
}

// Grok Bot: white humanoid robot with a black visor and glowing eye strip.
function drawRobot(c, ped) {
  const s = ped.scale * 1.05;
  const x = ped.x;
  const hip = ped.y - 16 * s;
  const shoulder = hip - 15 * s;
  const swing = Math.sin(ped.phase) * 0.42;
  const limb = (x0, y0, a, len, color, width) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x0 + Math.sin(a) * len, y0 + Math.cos(a) * len);
    c.stroke();
  };

  c.lineCap = "round";
  limb(x, hip, -swing, 16 * s, "#8e98a6", 4 * s); // far leg
  limb(x, shoulder + 2 * s, swing, 12 * s, "#8e98a6", 3 * s); // far arm
  limb(x, hip, swing, 16 * s, "#dfe5ec", 4 * s); // near leg
  // Torso with a chest light.
  c.fillStyle = "#eef2f7";
  roundRect(c, x - 5 * s, shoulder, 10 * s, 17 * s, 4 * s);
  c.fill();
  c.fillStyle = "#1a1f27";
  c.fillRect(x - 3 * s, hip - 4 * s, 6 * s, 3 * s); // waist joint
  glow(c, x + ped.dir * 1.5 * s, shoulder + 6 * s, 5 * s, "rgba(80, 230, 255, ALPHA)", 0.9);
  limb(x, shoulder + 2 * s, -swing, 12 * s, "#dfe5ec", 3 * s); // near arm
  // Head: white shell, black visor, cyan eye strip facing the walking direction.
  const hy = shoulder - 7.5 * s;
  c.fillStyle = "#f4f7fb";
  roundRect(c, x - 5 * s, hy - 5 * s, 10 * s, 10.5 * s, 4 * s);
  c.fill();
  c.fillStyle = "#0b0f16";
  roundRect(c, x - 3.5 * s + ped.dir * 1.2 * s, hy - 2 * s, 7 * s, 4 * s, 2 * s);
  c.fill();
  c.fillStyle = "#5ee8ff";
  c.fillRect(x - 2.5 * s + ped.dir * 1.6 * s, hy - 0.5 * s, 5 * s, 1.2 * s);

  if (ped.bubbleT > 0 && ped.bubbleT <= 1.8 && ped.bubble) {
    drawBubble(c, x, hy - 8 * s, ped.bubble, Math.min(1, ped.bubbleT * 3));
  }
}

export function drawBubble(c, x, y, text, alpha) {
  c.save();
  c.globalAlpha = alpha;
  c.font = "700 12px 'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif";
  const w = c.measureText(text).width + 14;
  const h = 20;
  const bx = x - w / 2;
  const by = y - h - 6;
  c.fillStyle = "rgba(255, 255, 255, 0.95)";
  roundRect(c, bx, by, w, h, 8);
  c.fill();
  c.beginPath(); // tail
  c.moveTo(x - 4, by + h - 1);
  c.lineTo(x + 4, by + h - 1);
  c.lineTo(x, by + h + 6);
  c.closePath();
  c.fill();
  c.fillStyle = "#1b2333";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, x, by + h / 2 + 1);
  c.restore();
}

// ---------------------------------------------------------------------------
// Pavement, road and street furniture
// ---------------------------------------------------------------------------

// Paving slabs that scroll with the road.
export function drawPavement(c, distance, top, bottom) {
  const g = c.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, "#3a4252");
  g.addColorStop(1, "#2a303c");
  c.fillStyle = g;
  c.fillRect(-VIEW_PAD, top, W + VIEW_PAD * 2, bottom - top);
  c.fillStyle = "rgba(0, 0, 0, 0.22)";
  const off = mod(distance, 48);
  for (let x = -VIEW_PAD - off; x < W + VIEW_PAD; x += 48) c.fillRect(x, top, 2, bottom - top);
  c.fillStyle = "rgba(255, 255, 255, 0.06)";
  c.fillRect(-VIEW_PAD, top, W + VIEW_PAD * 2, 2);
}

export function drawRoad(c, distance) {
  const L = -VIEW_PAD;
  const RW = W + VIEW_PAD * 2;
  const g = c.createLinearGradient(0, ROAD_TOP, 0, ROAD_BOTTOM);
  g.addColorStop(0, "#232a35");
  g.addColorStop(1, "#151a22");
  c.fillStyle = g;
  c.fillRect(L, ROAD_TOP, RW, ROAD_BOTTOM - ROAD_TOP);

  // Kerbs.
  c.fillStyle = "#6b7484";
  c.fillRect(L, ROAD_TOP - 3, RW, 5);
  c.fillRect(L, ROAD_BOTTOM - 2, RW, 6);

  // Double yellow at the far edge, white near edge, dashed lines between lanes.
  c.fillStyle = "#f2d16b";
  c.fillRect(L, ROAD_TOP + 8, RW, 3);
  c.fillRect(L, ROAD_TOP + 14, RW, 3);
  c.fillStyle = "rgba(230, 236, 245, 0.75)";
  c.fillRect(L, ROAD_BOTTOM - 12, RW, 3);
  const off = mod(distance, 80);
  c.fillStyle = "rgba(240, 244, 250, 0.55)";
  for (let i = 0; i < LANES.length - 1; i++) {
    const y = LANES[i] + 22;
    for (let x = L - off; x < W + VIEW_PAD; x += 80) c.fillRect(x, y, 42, 4);
  }
}

// Props are anchored to world positions, so they scroll with the road.
function forEachProp(distance, spacing, phase, fn) {
  const first = Math.floor((distance - phase) / spacing) - 1;
  for (let k = first; ; k++) {
    const x = k * spacing + phase - distance;
    if (x > W + VIEW_PAD) break;
    if (x > -VIEW_PAD) fn(x, k);
  }
}

export function drawTrees(c, distance) {
  const blobs = [[0, -18, 22], [-16, -6, 16], [16, -8, 17], [-6, -30, 15], [10, -28, 14]];
  forEachProp(distance, 320, 160, (x, k) => {
    const size = 0.8 + hash(k) * 0.45; // stable per tree
    const base = SIDEWALK_TOP + 10;
    const top = base - 34 * size;
    c.fillStyle = "#3b2a20";
    c.fillRect(x - 3, top, 6, 34 * size);
    c.fillStyle = "#1e1a17";
    c.fillRect(x - 12, base - 2, 24, 5); // tree pit
    c.fillStyle = "#1f4a3a";
    for (const [bx, by, br] of blobs) {
      c.beginPath();
      c.arc(x + bx * size, top + by * size, br * size, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "rgba(140, 220, 160, 0.16)"; // lamplight on the leaves
    c.beginPath();
    c.arc(x + 6 * size, top - 24 * size, 12 * size, 0, Math.PI * 2);
    c.fill();
  });
}

export function drawLamps(c, distance) {
  forEachProp(distance, 320, 0, (x) => {
    const base = ROAD_TOP - 2;
    const top = base - 118;
    // Pool of light on the pavement and road, plus the bulb's halo.
    c.save();
    c.globalCompositeOperation = "lighter";
    const pool = c.createRadialGradient(x + 22, base + 6, 0, x + 22, base + 6, 90);
    pool.addColorStop(0, "rgba(255, 210, 140, 0.22)");
    pool.addColorStop(1, "rgba(255, 210, 140, 0)");
    c.fillStyle = pool;
    c.beginPath();
    c.ellipse(x + 22, base + 6, 90, 34, 0, 0, Math.PI * 2);
    c.fill();
    glow(c, x + 26, top + 6, 40, "rgba(255, 220, 160, ALPHA)", 0.5);
    c.restore();

    c.fillStyle = "#1c222c";
    c.fillRect(x - 2, top, 4, base - top); // pole
    c.fillRect(x - 5, base - 6, 10, 6); // foot
    c.fillRect(x, top, 26, 3); // arm
    c.fillStyle = "#ffe9c2";
    roundRect(c, x + 18, top + 2, 16, 5, 2);
    c.fill();
  });
}

// Everything from the far pavement to the near kerb, back to front.
export function drawStreet(c, state, clock) {
  drawPavement(c, state.distance, SIDEWALK_TOP, ROAD_TOP);
  drawBillboards(c, state.distance, clock);
  drawTrees(c, state.distance);
  for (const ped of state.peds) drawPed(c, ped);
  drawLamps(c, state.distance);
  drawRoad(c, state.distance);
  drawPavement(c, state.distance, ROAD_BOTTOM, H + VIEW_PAD);
}
