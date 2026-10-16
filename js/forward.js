/**
 * Forward (first-person / behind-the-car) view, like a racing game.
 *
 * The simulation is the same side-scrolling one: everything ahead of the
 * Tesla in the side view is simply projected into perspective here.
 *   z  distance ahead of the camera (world px along the road)
 *   X  lateral position (0 = middle lane, negative = left / far side)
 *   Y  height above the road
 * Side-view screen x maps to z via z = x - (Tesla front) + zOff.
 */
import { drawAd, billboardsBetween } from "./billboards.js";
import {
  HOP_HEIGHT, LANES, PLAYER_SCREEN_X, SIDEWALK_TOP, VIEW_PAD, W, H,
} from "./config.js";
import { drawHorizon } from "./skyline.js";
import { drawBubble, drawPed } from "./street.js";
import { glow, hash, rgbStr, roundRect, shade } from "./utils.js";

const F = 560; // focal length
const LANE_W = 64;
const ROAD_HALF = 100; // road edge
const KERB = 106;
const FACADE = 190; // building fronts
const Z_NEAR = 30;
const Z_FAR = 2400;
const FADE_START = 1150; // traffic fades in between here and FADE_END
const FADE_END = 1550;

// Per-view camera setup. zOff: camera distance behind the Tesla's front bumper.
export const FORWARD_VIEWS = {
  driver: { camH: 34, zOff: 70, horizon: 300, roll: true },
  hood: { camH: 24, zOff: 34, horizon: 320, roll: true },
  behind: { camH: 76, zOff: 280, horizon: 250, roll: false, showTesla: true },
};

// Rear-view footprint (width units) per vehicle type.
const REAR_W = { tesla: 52, sedan: 50, hatch: 47, suv: 54, van: 56, pickup: 55 };
const FACADES = ["#2b3a55", "#33405e", "#3a3350", "#24414a", "#41394f", "#2d4a5a", "#3b3f4c"];
const AWNINGS = ["#d94f4f", "#2a9d8f", "#e9c46a", "#457b9d", "#c06c84"];

const fade = (z) => Math.max(0, Math.min(1, (FADE_END - z) / (FADE_END - FADE_START)));

/**
 * Draw the whole forward scene. `sky` = { stops, haze } current palette;
 * `teslaShades` paints the player's car in the behind view.
 */
export function drawForward(c, state, view, { clock, sky, teslaShades, carAngle }) {
  const v = FORWARD_VIEWS[view];
  const p = state.player;
  const front = PLAYER_SCREEN_X + p.w; // Tesla's front bumper in side-view x
  // Camera follows lane changes and rises when the car flies.
  const cam = {
    x: (p.lanePos - 1) * LANE_W,
    h: v.camH + p.hop * (v.showTesla ? 0.6 : 1),
    horizon: v.horizon,
  };
  const proj = (z, X, Y = 0) => {
    const s = F / z;
    return { x: W / 2 + (X - cam.x) * s, y: cam.horizon + (cam.h - Y) * s, s };
  };
  const zOf = (sideX) => sideX - front + v.zOff;
  const worldZ = (wx) => zOf(wx - state.distance); // world position → z

  c.save();
  // Flips and lane leans roll the whole view in the cockpit cameras.
  if (v.roll) {
    c.translate(W / 2, cam.horizon);
    c.rotate(-carAngle(p));
    c.translate(-W / 2, -cam.horizon);
  }

  drawSkyAndGround(c, state, cam, sky, clock);
  drawRoad(c, state, cam, proj, worldZ);
  drawBuildings(c, state, proj, worldZ, -1);
  drawBuildings(c, state, proj, worldZ, 1);
  drawStreetProps(c, state, proj, worldZ);
  drawBillboardsAhead(c, state, proj, zOf, clock);
  drawPeople(c, state, proj, zOf);

  // Road objects far → near.
  const items = [];
  for (const car of state.cars) {
    const z = zOf(car.x);
    if (z + 40 < Z_NEAR || z > FADE_END) continue;
    items.push({ z, draw: () => drawCarRear(c, car, z, proj, clock) });
  }
  for (const pk of state.pickups) {
    const z = zOf(pk.x);
    if (z > Z_NEAR && z < FADE_END) items.push({ z, draw: () => drawCanister(c, pk, z, proj, clock) });
  }
  if (v.showTesla) {
    const z = v.zOff - p.w;
    items.push({ z, draw: () => drawPlayerRear(c, p, z, proj, teslaShades, clock, carAngle) });
  }
  items.sort((a, b) => b.z - a.z);
  for (const it of items) it.draw();

  // Fog where the road meets the sky.
  const fog = c.createLinearGradient(0, cam.horizon - 30, 0, cam.horizon + 60);
  fog.addColorStop(0, rgbStr(sky.haze, 0));
  fog.addColorStop(0.4, rgbStr(sky.haze, 0.35));
  fog.addColorStop(1, rgbStr(sky.haze, 0));
  c.fillStyle = fog;
  c.fillRect(-VIEW_PAD, cam.horizon - 30, W + VIEW_PAD * 2, 90);

  if (p.nitro > 0) drawSpeedStreaks(c, cam, clock);
  c.restore();

  drawForwardPopups(c, state.popups);
}

// ---------------------------------------------------------------------------
// Sky, horizon city and ground
// ---------------------------------------------------------------------------
function drawSkyAndGround(c, state, cam, sky, clock) {
  const g = c.createLinearGradient(0, 0, 0, cam.horizon);
  [0, 0.5, 0.82, 1].forEach((at, i) => g.addColorStop(at, rgbStr(sky.stops[i])));
  c.fillStyle = g;
  c.fillRect(-VIEW_PAD, -VIEW_PAD, W + VIEW_PAD * 2, cam.horizon + VIEW_PAD);

  c.fillStyle = "#e4eeff";
  for (const s of state.stars) {
    c.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(clock * 2 + s.tw));
    c.fillRect(s.x, s.y * 0.8, s.r, s.r);
  }
  c.globalAlpha = 1;
  glow(c, W * 0.72, 90, 80, "rgba(190, 215, 255, ALPHA)", 0.22);
  c.fillStyle = "#f2f6ff";
  c.beginPath();
  c.arc(W * 0.72, 90, 24, 0, Math.PI * 2);
  c.fill();

  drawHorizon(c, cam.horizon, cam.x, rgbStr(sky.haze, "ALPHA"));

  // Pavement everywhere below the horizon; the road is drawn on top.
  const ground = c.createLinearGradient(0, cam.horizon, 0, H);
  ground.addColorStop(0, "#2a303c");
  ground.addColorStop(1, "#3a4252");
  c.fillStyle = ground;
  c.fillRect(-VIEW_PAD, cam.horizon, W + VIEW_PAD * 2, H - cam.horizon + VIEW_PAD);
}

// Quad on the ground between two depths and two lateral positions.
function groundQuad(c, proj, zA, zB, X1, X2, Y = 0) {
  const a1 = proj(zA, X1, Y);
  const a2 = proj(zA, X2, Y);
  const b2 = proj(zB, X2, Y);
  const b1 = proj(zB, X1, Y);
  c.beginPath();
  c.moveTo(a1.x, a1.y);
  c.lineTo(a2.x, a2.y);
  c.lineTo(b2.x, b2.y);
  c.lineTo(b1.x, b1.y);
  c.closePath();
  c.fill();
}

// Repeating marks (dashes, slabs) at world positions every `period`.
function eachMark(state, worldZ, period, len, fn) {
  const startW = state.distance + PLAYER_SCREEN_X - 200;
  for (let wx = Math.floor(startW / period) * period; ; wx += period) {
    const zA = worldZ(wx);
    const zB = worldZ(wx + len);
    if (zA > Z_FAR) break;
    if (zB < Z_NEAR) continue;
    fn(Math.max(zA, Z_NEAR), Math.min(zB, Z_FAR));
  }
}

function drawRoad(c, state, cam, proj, worldZ) {
  // Asphalt.
  c.fillStyle = "#1c222c";
  groundQuad(c, proj, Z_NEAR, Z_FAR, -ROAD_HALF, ROAD_HALF);
  // Subtle bands so speed reads even on an empty road.
  c.fillStyle = "rgba(255, 255, 255, 0.025)";
  eachMark(state, worldZ, 160, 80, (zA, zB) => groundQuad(c, proj, zA, zB, -ROAD_HALF, ROAD_HALF));
  // Kerbs.
  c.fillStyle = "#6b7484";
  groundQuad(c, proj, Z_NEAR, Z_FAR, -KERB, -ROAD_HALF, 2);
  groundQuad(c, proj, Z_NEAR, Z_FAR, ROAD_HALF, KERB, 2);
  // Paving slab joints.
  c.fillStyle = "rgba(0, 0, 0, 0.18)";
  eachMark(state, worldZ, 48, 3, (zA, zB) => {
    groundQuad(c, proj, zA, zB, -FACADE, -KERB);
    groundQuad(c, proj, zA, zB, KERB, FACADE);
  });
  // Double yellow on the left edge, white on the right.
  c.fillStyle = "#f2d16b";
  groundQuad(c, proj, Z_NEAR, Z_FAR, -96, -94);
  groundQuad(c, proj, Z_NEAR, Z_FAR, -91, -89);
  c.fillStyle = "rgba(230, 236, 245, 0.8)";
  groundQuad(c, proj, Z_NEAR, Z_FAR, 90, 93);
  // Lane dashes rushing toward you.
  c.fillStyle = "rgba(240, 244, 250, 0.7)";
  eachMark(state, worldZ, 80, 42, (zA, zB) => {
    for (let i = 0; i < LANES.length - 1; i++) {
      const X = (i - 0.5) * LANE_W;
      groundQuad(c, proj, zA, zB, X - 1.6, X + 1.6);
    }
  });
}

// ---------------------------------------------------------------------------
// Buildings lining both sides
// ---------------------------------------------------------------------------
function drawBuildings(c, state, proj, worldZ, side) {
  const SPACING = 150;
  const X = side * FACADE;
  const startW = state.distance + PLAYER_SCREEN_X - 300;
  const blocks = [];
  for (let k = Math.floor(startW / SPACING); ; k++) {
    const zA = worldZ(k * SPACING);
    if (zA > Z_FAR) break;
    const zB = worldZ(k * SPACING + 136);
    if (zB < Z_NEAR) continue;
    blocks.push({ k, zA: Math.max(zA, Z_NEAR), zB: Math.min(zB, Z_FAR), wx: k * SPACING });
  }
  // Far blocks first.
  for (const b of blocks.reverse()) {
    const seed = b.k * 2 + (side > 0 ? 1 : 0);
    const hgt = 110 + hash(seed) * 230;
    const base = FACADES[Math.floor(hash(seed + 0.5) * FACADES.length)];
    const near = proj(b.zA, X);
    const far = proj(b.zB, X);
    const nearTop = proj(b.zA, X, hgt);
    const farTop = proj(b.zB, X, hgt);
    const quad = (pts) => {
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (const q of pts.slice(1)) c.lineTo(q.x, q.y);
      c.closePath();
      c.fill();
    };
    // Facade, a lit roof edge and the shopfront.
    c.fillStyle = shade(base, -0.1);
    quad([near, far, farTop, nearTop]);
    c.fillStyle = shade(base, 0.25);
    quad([nearTop, farTop, proj(b.zB, X, hgt - 4), proj(b.zA, X, hgt - 4)]);
    c.fillStyle = "rgba(255, 196, 120, 0.75)";
    quad([proj(b.zA, X, 4), proj(b.zB, X, 4), proj(b.zB, X, 26), proj(b.zA, X, 26)]);
    c.fillStyle = AWNINGS[Math.floor(hash(seed + 0.3) * AWNINGS.length)];
    quad([proj(b.zA, X, 26), proj(b.zB, X, 26), proj(b.zB, X, 32), proj(b.zA, X, 32)]);

    // Windows (skipped far away where they'd be specks).
    if (b.zA > 1500) continue;
    let row = 0;
    for (let Y = 46; Y < hgt - 16; Y += 28, row++) {
      let col = 0;
      for (let wx = b.wx + 12; wx < b.wx + 124; wx += 28, col++) {
        const zA = worldZ(wx);
        const zB = worldZ(wx + 14);
        if (zA < Z_NEAR || zB > Z_FAR) continue;
        const lit = hash(seed * 31 + row * 7 + col) < 0.42;
        c.fillStyle = lit ? (hash(seed + row) < 0.75 ? "#ffd58f" : "#bfe6ff") : "#121a29";
        quad([proj(zA, X, Y), proj(zB, X, Y), proj(zB, X, Y + 15), proj(zA, X, Y + 15)]);
      }
    }
  }
}

// Lamps along both kerbs, trees on the left pavement.
function drawStreetProps(c, state, proj, worldZ) {
  const props = [];
  const startW = state.distance + PLAYER_SCREEN_X - 300;
  for (let k = Math.floor(startW / 320); ; k++) {
    const zl = worldZ(k * 320);
    const zt = worldZ(k * 320 + 160);
    if (zl > Z_FAR && zt > Z_FAR) break;
    props.push({ z: zl, kind: "lamp", side: -1 });
    props.push({ z: zl + 160, kind: "lamp", side: 1 });
    props.push({ z: zt, kind: "tree", side: -1, k });
  }
  props.sort((a, b) => b.z - a.z);
  for (const pr of props) {
    if (pr.z < Z_NEAR + 10 || pr.z > Z_FAR) continue;
    if (pr.kind === "lamp") {
      const X = pr.side * (KERB + 4);
      const base = proj(pr.z, X);
      const top = proj(pr.z, X, 95);
      const head = proj(pr.z, X - pr.side * 22, 95);
      c.strokeStyle = "#1c222c";
      c.lineWidth = Math.max(1, 3 * base.s);
      c.beginPath();
      c.moveTo(base.x, base.y);
      c.lineTo(top.x, top.y);
      c.lineTo(head.x, head.y);
      c.stroke();
      c.save();
      c.globalCompositeOperation = "lighter";
      glow(c, head.x, head.y + 2 * base.s, 40 * base.s, "rgba(255, 220, 160, ALPHA)", 0.6);
      c.restore();
    } else {
      const X = -(KERB + 40);
      const size = 0.8 + hash(pr.k) * 0.45;
      const base = proj(pr.z, X);
      const s = base.s * size;
      c.fillStyle = "#3b2a20";
      c.fillRect(base.x - 3 * s, base.y - 34 * s, 6 * s, 34 * s);
      c.fillStyle = "#1f4a3a";
      for (const [bx, by, br] of [[0, -50, 22], [-16, -38, 16], [16, -40, 17], [-6, -62, 15], [10, -60, 14]]) {
        c.beginPath();
        c.arc(base.x + bx * s, base.y + by * s, br * s, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
}

function drawBillboardsAhead(c, state, proj, zOf, clock) {
  const front = PLAYER_SCREEN_X + state.player.w;
  const list = billboardsBetween(state.distance, front - 200, front + Z_FAR);
  for (const { x, ad } of list.reverse()) {
    const z = zOf(x);
    if (z < Z_NEAR + 20 || z > Z_FAR) continue;
    // Facing the traffic, raised on legs over the left pavement.
    const X = -(FACADE + 6);
    const w = 150;
    const h = ad.img ? 80 : 74;
    const bottom = proj(z, X, 70);
    const s = bottom.s;
    const l = bottom.x - (w / 2) * s;
    const t = bottom.y - h * s;
    const ground = proj(z, X);
    c.fillStyle = "#1a2029";
    c.fillRect(bottom.x - 30 * s, bottom.y, 5 * s, ground.y - bottom.y);
    c.fillRect(bottom.x + 25 * s, bottom.y, 5 * s, ground.y - bottom.y);
    c.save();
    c.globalCompositeOperation = "lighter";
    glow(c, bottom.x, t + (h * s) / 2, w * s * 0.8, ad.light, 0.18);
    c.restore();
    c.fillStyle = "#0d1016";
    c.fillRect(l - 4 * s, t - 4 * s, (w + 8) * s, (h + 8) * s);
    drawAd(c, ad, l, t, w * s, h * s, clock);
  }
}

// People and Grok Bots on the left pavement, reusing the side-view figures.
function drawPeople(c, state, proj, zOf) {
  const list = [];
  for (const ped of state.peds) {
    const z = zOf(ped.x);
    if (z < Z_NEAR + 15 || z > 1300) continue;
    const lane = (ped.y - (SIDEWALK_TOP + 18)) / 20; // 0 back … 1 kerb
    list.push({ ped, z, X: -(FACADE - 20) + lane * 50 });
  }
  list.sort((a, b) => b.z - a.z);
  for (const { ped, z, X } of list) {
    const at = proj(z, X);
    drawPed(c, { ...ped, x: at.x, y: at.y, scale: (30 * at.s) / 41 });
  }
}

// ---------------------------------------------------------------------------
// Vehicles seen from behind
// ---------------------------------------------------------------------------
function rearShape(c, cx, by, w, h, shades, type) {
  const x0 = cx - w / 2;
  const y0 = by - h;
  const boxy = type === "van" || type === "suv";
  // Tyres.
  c.fillStyle = "#0c0e12";
  roundRect(c, x0 + w * 0.04, by - h * 0.2, w * 0.18, h * 0.22, h * 0.04);
  c.fill();
  roundRect(c, x0 + w * 0.78, by - h * 0.2, w * 0.18, h * 0.22, h * 0.04);
  c.fill();
  // Cabin (narrower on top unless it's boxy), then the rear window.
  const inset = boxy ? 0.05 : 0.14;
  c.fillStyle = shades[0];
  c.beginPath();
  c.moveTo(x0 + w * 0.06, y0 + h * 0.46);
  c.lineTo(x0 + w * inset, y0);
  c.lineTo(x0 + w * (1 - inset), y0);
  c.lineTo(x0 + w * 0.94, y0 + h * 0.46);
  c.closePath();
  c.fill();
  const glass = c.createLinearGradient(0, y0, 0, y0 + h * 0.42);
  glass.addColorStop(0, "#5a7290");
  glass.addColorStop(1, "#141d2b");
  c.fillStyle = glass;
  c.beginPath();
  c.moveTo(x0 + w * 0.13, y0 + h * 0.42);
  c.lineTo(x0 + w * (inset + 0.06), y0 + h * 0.08);
  c.lineTo(x0 + w * (0.94 - inset), y0 + h * 0.08);
  c.lineTo(x0 + w * 0.87, y0 + h * 0.42);
  c.closePath();
  c.fill();
  // Lower body.
  const body = c.createLinearGradient(0, y0 + h * 0.4, 0, by);
  body.addColorStop(0, shades[1]);
  body.addColorStop(1, shades[2]);
  c.fillStyle = body;
  roundRect(c, x0, y0 + h * 0.42, w, h * 0.42, h * 0.08);
  c.fill();
  // Bumper and plate.
  c.fillStyle = "rgba(0, 0, 0, 0.35)";
  c.fillRect(x0 + w * 0.02, y0 + h * 0.76, w * 0.96, h * 0.08);
  c.fillStyle = "#e8e6dc";
  c.fillRect(cx - w * 0.1, y0 + h * 0.6, w * 0.2, h * 0.1);
  return { x0, y0 };
}

function taillights(c, x0, y0, w, h, lightBar) {
  c.save();
  c.globalCompositeOperation = "lighter";
  glow(c, x0 + w * 0.12, y0 + h * 0.52, w * 0.28, "rgba(255, 40, 60, ALPHA)", 0.45);
  glow(c, x0 + w * 0.88, y0 + h * 0.52, w * 0.28, "rgba(255, 40, 60, ALPHA)", 0.45);
  c.restore();
  c.fillStyle = "#ff3045";
  if (lightBar) {
    c.fillRect(x0 + w * 0.04, y0 + h * 0.5, w * 0.92, h * 0.05);
  } else {
    c.fillRect(x0 + w * 0.04, y0 + h * 0.48, w * 0.2, h * 0.09);
    c.fillRect(x0 + w * 0.76, y0 + h * 0.48, w * 0.2, h * 0.09);
  }
}

function drawCarRear(c, car, z, proj, clock) {
  const X = (car.lane - 1) * LANE_W;
  const zc = Math.max(z, Z_NEAR);
  const at = proj(zc, X);
  const w = (REAR_W[car.type] || 50) * at.s;
  const h = car.h * 0.8 * at.s;
  c.save();
  c.globalAlpha = fade(z);
  const k = car.knocked;
  let by = at.y;
  if (k) {
    // Tumbling after a nitro smash.
    by += k.y * at.s * 0.6;
    c.globalAlpha *= Math.max(0, 1 - k.t / 1.6);
    c.translate(at.x, by - h / 2);
    c.rotate(k.rot);
    c.translate(-at.x, -(by - h / 2));
  } else {
    c.fillStyle = "rgba(0, 0, 0, 0.4)";
    c.beginPath();
    c.ellipse(at.x, at.y, w * 0.62, h * 0.08, 0, 0, Math.PI * 2);
    c.fill();
  }
  const { x0, y0 } = rearShape(c, at.x, by, w, h, car.shades, car.type);
  taillights(c, x0, y0, w, h, false);
  c.restore();

  if (k) return;
  if (car.honkT > 0) {
    c.fillStyle = "#ffd166";
    c.font = `800 ${Math.max(10, 12 * at.s * 2)}px 'Avenir Next', 'Segoe UI', sans-serif`;
    c.textAlign = "center";
    c.fillText("HONK!", at.x, y0 - 6 * at.s);
  }
  if (car.bubble && car.bubbleT > 0 && car.bubbleT <= 2.2) {
    drawBubble(c, at.x, y0 - (car.honkT > 0 ? 20 : 4), car.bubble, Math.min(1, car.bubbleT * 3));
  }
}

function drawPlayerRear(c, p, z, proj, shades, clock, carAngle) {
  const at = proj(z, (p.lanePos - 1) * LANE_W);
  const lifted = proj(z, (p.lanePos - 1) * LANE_W, p.hop);
  const w = REAR_W.tesla * at.s;
  const h = 46 * 0.8 * at.s;
  // Shadow on the road, shrinking as the car rises.
  const k = 1 - (p.hop / HOP_HEIGHT) * 0.45;
  c.fillStyle = `rgba(0, 0, 0, ${0.45 * k})`;
  c.beginPath();
  c.ellipse(at.x, at.y, w * 0.62 * k, h * 0.08 * k, 0, 0, Math.PI * 2);
  c.fill();
  if (p.glow > 0) {
    c.save();
    c.globalCompositeOperation = "lighter";
    glow(c, lifted.x, lifted.y + 4, w * 0.9, "rgba(110, 210, 255, ALPHA)", 0.5 * p.glow);
    c.restore();
  }
  if (p.grace > 0 && Math.floor(clock * 14) % 2) return;
  c.save();
  c.translate(lifted.x, lifted.y - h / 2);
  c.rotate(carAngle(p));
  c.translate(-lifted.x, -(lifted.y - h / 2));
  if (p.nitro > 0) {
    // Blue thrust under the rear bumper.
    c.save();
    c.globalCompositeOperation = "lighter";
    const f = 1 + Math.sin(clock * 50) * 0.2;
    glow(c, lifted.x, lifted.y - h * 0.12, w * 0.7 * f, "rgba(80, 170, 255, ALPHA)", 0.8);
    c.restore();
  }
  const { x0, y0 } = rearShape(c, lifted.x, lifted.y, w, h, shades, "tesla");
  taillights(c, x0, y0, w, h, true);
  c.fillStyle = "rgba(20, 30, 45, 0.9)"; // glass roof
  c.fillRect(x0 + w * 0.2, y0 + h * 0.01, w * 0.6, h * 0.06);
  c.restore();
}

function drawCanister(c, pk, z, proj, clock) {
  const at = proj(z, (pk.lane - 1) * LANE_W, 14 + Math.sin(clock * 4 + pk.x * 0.01) * 3);
  const ground = proj(z, (pk.lane - 1) * LANE_W);
  const s = at.s;
  c.save();
  c.globalAlpha = fade(z);
  c.fillStyle = "rgba(0, 0, 0, 0.35)";
  c.beginPath();
  c.ellipse(ground.x, ground.y, 12 * s, 3 * s, 0, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = "lighter";
  glow(c, at.x, at.y - 14 * s, 34 * s, "rgba(60, 200, 255, ALPHA)", 0.6);
  c.globalCompositeOperation = "source-over";
  const body = c.createLinearGradient(at.x - 10 * s, 0, at.x + 10 * s, 0);
  body.addColorStop(0, "#1559c7");
  body.addColorStop(0.45, "#5ec8ff");
  body.addColorStop(1, "#0d3a8a");
  c.fillStyle = body;
  roundRect(c, at.x - 10 * s, at.y - 28 * s, 20 * s, 28 * s, 5 * s);
  c.fill();
  c.fillStyle = "#cfd8e4";
  c.fillRect(at.x - 4 * s, at.y - 34 * s, 8 * s, 6 * s);
  if (s > 0.6) {
    c.fillStyle = "#ffffff";
    c.font = `800 ${8 * s}px 'Avenir Next', 'Segoe UI', sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("N₂O", at.x, at.y - 14 * s);
  }
  c.restore();
}

// Streaks flying past from the vanishing point during nitro.
function drawSpeedStreaks(c, cam, clock) {
  c.save();
  c.globalCompositeOperation = "lighter";
  c.strokeStyle = "rgba(150, 220, 255, 0.35)";
  c.lineWidth = 2;
  for (let i = 0; i < 24; i++) {
    const a = hash(i) * Math.PI * 2;
    const t = (clock * 2.5 + hash(i + 50)) % 1;
    const r1 = 120 + t * 700;
    const r2 = r1 + 60 + t * 140;
    c.beginPath();
    c.moveTo(W / 2 + Math.cos(a) * r1, cam.horizon + Math.sin(a) * r1 * 0.6);
    c.lineTo(W / 2 + Math.cos(a) * r2, cam.horizon + Math.sin(a) * r2 * 0.6);
    c.stroke();
  }
  c.restore();
}

// Score popups float up in the middle of the screen in forward views.
function drawForwardPopups(c, popups) {
  c.font = "800 26px 'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  popups.forEach((pop, i) => {
    const y = 190 - pop.t * 50 + i * 4;
    c.globalAlpha = Math.max(0, 1 - pop.t / 1.2);
    c.fillStyle = "rgba(0, 0, 0, 0.5)";
    c.fillText(pop.text, W / 2 + 2, y + 2);
    c.fillStyle = pop.color;
    c.fillText(pop.text, W / 2, y);
  });
  c.globalAlpha = 1;
}

