/**
 * Street level: pavements, road markings, trees, street lamps and the
 * pedestrians walking along the far pavement.
 */
import { GROUND_Y, H, ROAD_BOTTOM, ROAD_TOP, SIDEWALK_TOP, W } from "./config.js";
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
  };
}

export function seedPeds() {
  const peds = [];
  for (let x = rand(20, 80); x < W + 40; x += rand(60, 200)) peds.push(makePed(x));
  return peds;
}

// Walk everyone and keep the crowd topped up. `scrollSpeed` is 0 on the
// start / game over screens, where people still stroll in from both sides.
export function updatePeds(state, dt, scrollSpeed) {
  for (const ped of state.peds) {
    ped.x -= (scrollSpeed - ped.dir * ped.speed) * dt;
    ped.phase += dt * ped.speed * 0.16;
  }
  state.peds = state.peds.filter((ped) => ped.x > -40 && ped.x < W + 120);

  if (scrollSpeed > 0 && state.distance >= state.nextPedAt) {
    state.peds.push(makePed(W + rand(20, 60)));
    state.nextPedAt = state.distance + rand(70, 230);
  } else if (scrollSpeed === 0 && state.peds.length < 9 && Math.random() < dt * 0.5) {
    const ped = makePed(0);
    ped.x = ped.dir > 0 ? -30 : W + 30;
    state.peds.push(ped);
  }
  state.peds.sort((a, b) => a.y - b.y); // back row drawn first
}

// A walking figure with swinging arms and legs; feet at (ped.x, ped.y).
export function drawPed(c, ped) {
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
  c.fillRect(-20, top, W + 40, bottom - top);
  c.fillStyle = "rgba(0, 0, 0, 0.22)";
  const off = mod(distance, 48);
  for (let x = -off; x < W; x += 48) c.fillRect(x, top, 2, bottom - top);
  c.fillStyle = "rgba(255, 255, 255, 0.06)";
  c.fillRect(-20, top, W + 40, 2);
}

export function drawRoad(c, distance) {
  const g = c.createLinearGradient(0, ROAD_TOP, 0, ROAD_BOTTOM);
  g.addColorStop(0, "#232a35");
  g.addColorStop(1, "#151a22");
  c.fillStyle = g;
  c.fillRect(-20, ROAD_TOP, W + 40, ROAD_BOTTOM - ROAD_TOP);

  // Kerbs.
  c.fillStyle = "#6b7484";
  c.fillRect(-20, ROAD_TOP - 3, W + 40, 5);
  c.fillRect(-20, ROAD_BOTTOM - 2, W + 40, 6);

  // Edge lines, a yellow centre line behind traffic, and near lane dashes.
  c.fillStyle = "rgba(230, 236, 245, 0.75)";
  c.fillRect(-20, ROAD_TOP + 8, W + 40, 3);
  c.fillRect(-20, ROAD_BOTTOM - 12, W + 40, 3);
  const off = mod(distance, 80);
  c.fillStyle = "#f2d16b";
  for (let x = -off; x < W; x += 80) c.fillRect(x, ROAD_TOP + 52, 42, 5);
  c.fillStyle = "rgba(240, 244, 250, 0.5)";
  for (let x = -off; x < W; x += 80) c.fillRect(x + 20, GROUND_Y + 40, 42, 4);
}

// Props are anchored to world positions, so they scroll with the road.
function forEachProp(distance, spacing, phase, fn) {
  const first = Math.floor((distance - phase) / spacing) - 1;
  for (let k = first; ; k++) {
    const x = k * spacing + phase - distance;
    if (x > W + 100) break;
    if (x > -100) fn(x, k);
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
export function drawStreet(c, state) {
  drawPavement(c, state.distance, SIDEWALK_TOP, ROAD_TOP);
  drawTrees(c, state.distance);
  for (const ped of state.peds) drawPed(c, ped);
  drawLamps(c, state.distance);
  drawRoad(c, state.distance);
  drawPavement(c, state.distance, ROAD_BOTTOM, H + 10);
}
