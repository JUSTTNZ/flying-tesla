/**
 * Draws a frame of the scene. Owns the canvas (sized to CSS size ×
 * devicePixelRatio so it stays sharp), the camera, the sky palette that
 * changes with each level, and the occasional rocket launch in the distance.
 */
import { audio } from "./audio.js";
import {
  FLY_DURATION, H, HOP_HEIGHT, PLAYER_DRAW_H, PLAYER_SCREEN_X, SIDEWALK_TOP,
  TESLA_COLORS, VIEW_PAD, W, laneGround,
} from "./config.js";
import { drawSkyline, renderSkyline } from "./skyline.js";
import { drawStreet } from "./street.js";
import { clamp, glow, hexToRgb, lerpRgb, polyPath, rand, rgbStr, wrapAngle } from "./utils.js";
import { VEHICLES, drawBeam, drawShadow, drawVehicle } from "./vehicles.js";

// Sky per level (cycling): four gradient stops top → horizon, plus haze tint.
const PALETTES = [
  { sky: ["#070d1a", "#15254a", "#3a3a6e", "#7a4e78"], haze: "#6e5082" }, // dusk
  { sky: ["#02040a", "#0a1430", "#16244a", "#2a3a66"], haze: "#3c508c" }, // midnight
  { sky: ["#0b0418", "#2a0b45", "#5a1a6e", "#c23a7a"], haze: "#aa3c8c" }, // neon
  { sky: ["#0d1a2e", "#2a4a7a", "#c0707a", "#f2b27a"], haze: "#d29678" }, // dawn
].map((p) => ({ sky: p.sky.map(hexToRgb), haze: hexToRgb(p.haze) }));

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let scale = 0;
  // Current sky colours, eased toward the level's palette.
  const sky = { stops: PALETTES[0].sky.map((c) => [...c]), haze: [...PALETTES[0].haze] };
  // Camera: world point at screen centre, zoom and roll; eased toward a target.
  const cam = { x: W / 2, y: H / 2, zoom: 1, rot: 0 };
  // Distant rocket: rises from behind the skyline every so often.
  const rocket = { active: false, x: 0, t: 0, next: 6, trail: [] };

  function updateRocket(dt) {
    if (!rocket.active) {
      rocket.next -= dt;
      if (rocket.next <= 0) {
        Object.assign(rocket, { active: true, x: rand(W * 0.12, W * 0.88), t: 0, trail: [] });
        audio.rocket(clamp((rocket.x - W / 2) / (W / 2), -1, 1));
      }
      return;
    }
    rocket.t += dt;
    const pos = rocketPos(rocket);
    rocket.trail.push({ x: pos.x, y: pos.y, age: 0 });
    for (const puff of rocket.trail) puff.age += dt;
    rocket.trail = rocket.trail.filter((puff) => puff.age < 3);
    if (rocket.t > 12) {
      rocket.active = false;
      rocket.next = rand(25, 45);
    }
  }

  function resize() {
    const cssW = canvas.getBoundingClientRect().width || W;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const next = Math.max(0.5, (cssW * dpr) / W);
    if (Math.abs(next - scale) < 0.01) return;
    scale = next;
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    renderSkyline(scale);
  }

  function updateCamera(state, mode, dt, clock) {
    const p = state.player;
    const px = PLAYER_SCREEN_X + p.w / 2;
    const py = p.y + PLAYER_DRAW_H / 2;
    const crashed = !state.running && state.crashReason;
    let t;
    if (mode === "chase") {
      // Close behind the Tesla, following it up into the air.
      const z = crashed ? 1.7 : 1.45;
      t = { zoom: z, x: px + 330 / z, y: py - 80 / z, rot: 0 };
    } else if (mode === "cinematic") {
      // Pushes in and rolls with the car while flying; slow drift on the road.
      const z = crashed ? 1.6 : 1.16 + (p.flying ? 0.2 : 0);
      const roll = p.flying ? -wrapAngle(p.rot) * 0.07 : 0;
      t = { zoom: z, x: px + 260 / z, y: py - 50 / z, rot: -0.035 + roll + Math.sin(clock * 0.4) * 0.01 };
    } else if (mode === "wide") {
      // Zoomed out to see more traffic coming.
      t = { zoom: 0.86, x: W / 2 + 70, y: H / 2 - 10, rot: 0 };
    } else {
      t = { zoom: 1, x: W / 2, y: H / 2, rot: 0 };
    }
    // Keep zoomed-in views inside the scene's top and bottom edges.
    if (t.zoom >= 1) {
      const half = H / 2 / t.zoom;
      t.y = clamp(t.y, half, H - half);
    }
    const k = 1 - Math.exp(-dt * 3.5);
    for (const key of ["x", "y", "zoom", "rot"]) cam[key] += (t[key] - cam[key]) * k;
  }

    // `clock` drives ambient animation; `teslaColor` is a TESLA_COLORS key.
  function draw(state, { clock, dt, camera, teslaColor }) {
    // Ease the sky toward this level's palette.
    const pal = PALETTES[(state.level - 1) % PALETTES.length];
    const k = Math.min(1, dt * 0.8);
    sky.stops.forEach((c, i) => lerpRgb(c, pal.sky[i], k));
    lerpRgb(sky.haze, pal.haze, k);

    updateCamera(state, camera, dt, clock);
    const sx = (Math.random() - 0.5) * state.shake;
    const sy = (Math.random() - 0.5) * state.shake;
    ctx.setTransform(scale, 0, 0, scale, (W / 2 + sx) * scale, (H / 2 + sy) * scale);
    ctx.rotate(cam.rot);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    updateRocket(dt);
    drawSky(ctx, state.stars, clock, sky.stops);
    if (rocket.active) drawRocket(ctx, rocket, clock);
    drawSkyline(ctx, rgbStr(sky.haze, "ALPHA"));
    drawStreet(ctx, state, clock);
    drawTraffic(ctx, state, TESLA_COLORS[teslaColor] || TESLA_COLORS.white);
    drawPopups(ctx, state.popups);
  }

  resize();
  return { resize, draw };
}

// Cars far lane → near lane, with the Tesla slotted into its own lane
// (or on top of everything while flying).
function drawTraffic(c, state, teslaShades) {
  const p = state.player;
  // Headlight beams first so no beam paints over another car's body.
  c.globalCompositeOperation = "lighter";
  for (const car of state.cars) drawBeam(c, car.x, laneGround(car.lane) - car.h, car.w, car.h, car.spec);
  if (!p.flying) drawBeam(c, PLAYER_SCREEN_X, p.y, p.w, PLAYER_DRAW_H, VEHICLES.tesla);
  c.globalCompositeOperation = "source-over";

  let teslaDrawn = false;
  for (const car of state.cars) {
    if (!teslaDrawn && !p.flying && car.lane > p.lanePos + 0.01) {
      drawTesla(c, p, teslaShades);
      teslaDrawn = true;
    }
    const ground = laneGround(car.lane);
    const y = ground - car.h;
    drawShadow(c, car.x, car.w, 0, ground);
    drawVehicle(c, car.x, y, car.w, car.h, car.spec, car.shades, car.wheelAngle);
    if (car.honkT > 0) drawHonk(c, car, y);
  }
  if (!teslaDrawn) drawTesla(c, p, teslaShades);
}

// Sound lines and a "HONK!" over a honking car.
function drawHonk(c, car, y) {
  const fx = car.x + car.w + 6;
  const fy = y + car.h * 0.4;
  c.save();
  c.globalAlpha = Math.min(1, car.honkT * 3);
  c.strokeStyle = "#ffd166";
  c.lineWidth = 2;
  c.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc(fx, fy, 6 + i * 6, -0.6, 0.6);
    c.stroke();
  }
  c.font = "800 13px 'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif";
  c.textAlign = "center";
  c.fillStyle = "#ffd166";
  c.fillText("HONK!", car.x + car.w * 0.6, y - 8);
  c.restore();
}

function drawSky(c, stars, clock, stops) {
  const g = c.createLinearGradient(0, 0, 0, SIDEWALK_TOP);
  [0, 0.5, 0.82, 1].forEach((at, i) => g.addColorStop(at, rgbStr(stops[i])));
  c.fillStyle = g;
  c.fillRect(-VIEW_PAD, -VIEW_PAD, W + VIEW_PAD * 2, SIDEWALK_TOP + VIEW_PAD);

  c.fillStyle = "#e4eeff";
  for (const s of stars) {
    c.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(clock * 2 + s.tw));
    c.fillRect(s.x, s.y, s.r, s.r);
  }
  c.globalAlpha = 1;

  // Moon with halo and a couple of craters.
  const mx = W * 0.6;
  const my = 120;
  glow(c, mx, my, 90, "rgba(190, 215, 255, ALPHA)", 0.22);
  c.fillStyle = "#f2f6ff";
  c.beginPath();
  c.arc(mx, my, 30, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(170, 185, 210, 0.35)";
  c.beginPath();
  c.arc(mx - 9, my - 6, 6, 0, Math.PI * 2);
  c.arc(mx + 8, my + 9, 4, 0, Math.PI * 2);
  c.fill();
}

function drawTesla(c, p, shades) {
  const x = PLAYER_SCREEN_X;
  const y = p.y;
  const ground = laneGround(p.lanePos);
  drawShadow(c, x, p.w, p.hop / HOP_HEIGHT, ground);

  // Soft cyan glow under the car while it flies, reaching down to the road.
  if (p.glow > 0) {
    c.save();
    c.globalCompositeOperation = "lighter";
    const under = y + PLAYER_DRAW_H;
    glow(c, x + p.w * 0.5, under + 4, 80, "rgba(110, 210, 255, ALPHA)", 0.5 * p.glow);
    const beam = c.createLinearGradient(0, under, 0, ground);
    beam.addColorStop(0, `rgba(120, 220, 255, ${0.28 * p.glow})`);
    beam.addColorStop(1, "rgba(120, 220, 255, 0)");
    c.fillStyle = beam;
    c.beginPath();
    c.moveTo(x + p.w * 0.2, under);
    c.lineTo(x + p.w * 0.8, under);
    c.lineTo(x + p.w * 0.95, ground);
    c.lineTo(x + p.w * 0.05, ground);
    c.closePath();
    c.fill();
    c.restore();
  }

  // Flip angle, plus a slight nose-up / nose-down following the arc and a
  // little lean while changing lanes.
  const arcTilt = p.flying ? -Math.cos((p.flyT / FLY_DURATION) * Math.PI) * 0.06 : 0;
  const laneLean = (p.lane - p.lanePos) * -0.12;
  const cx = x + p.w / 2;
  const cy = y + PLAYER_DRAW_H / 2;
  c.save();
  c.translate(cx, cy);
  c.rotate(p.rot + arcTilt + laneLean);
  c.translate(-cx, -cy);
  drawVehicle(c, x, y, p.w, PLAYER_DRAW_H, VEHICLES.tesla, shades, p.wheelAngle);
  // A thin light rim keeps a black car visible against the night road.
  if (shades === TESLA_COLORS.black) {
    polyPath(c, VEHICLES.tesla.body, x, y, p.w, PLAYER_DRAW_H);
    c.strokeStyle = "rgba(200, 220, 255, 0.35)";
    c.lineWidth = 1.2;
    c.stroke();
  }
  // Glass roof and a chrome door handle make it read as "Tesla-style".
  c.fillStyle = "rgba(20, 30, 45, 0.85)";
  polyPath(c, [[0.37, 0.07], [0.56, 0.05], [0.6, 0.09], [0.38, 0.11]], x, y, p.w, PLAYER_DRAW_H);
  c.fill();
  c.fillStyle = "#c9d2de";
  c.fillRect(x + p.w * 0.56, y + PLAYER_DRAW_H * 0.46, 8, 2);
  c.restore();
}

// Rocket path: rises from behind the skyline, arcing slightly downrange.
function rocketPos(r) {
  const u = r.t / 12;
  return { x: r.x + u * u * 260, y: SIDEWALK_TOP - 120 - u * u * 720 };
}

function drawRocket(c, r, clock) {
  // Exhaust trail: puffs that grow and fade.
  for (const puff of r.trail) {
    c.fillStyle = `rgba(200, 205, 220, ${0.22 * (1 - puff.age / 3)})`;
    c.beginPath();
    c.arc(puff.x, puff.y + 14, 3 + puff.age * 7, 0, Math.PI * 2);
    c.fill();
  }
  const { x, y } = rocketPos(r);
  const flicker = 1 + Math.sin(clock * 40) * 0.2;
  glow(c, x, y + 16, 26 * flicker, "rgba(255, 170, 60, ALPHA)", 0.9);
  // Steel body, slightly tilted downrange.
  c.save();
  c.translate(x, y);
  c.rotate(0.06 + (r.t / 12) * 0.25);
  c.fillStyle = "#dfe4ec";
  c.beginPath();
  c.moveTo(-3.5, 12);
  c.lineTo(-3.5, -12);
  c.quadraticCurveTo(0, -20, 3.5, -12);
  c.lineTo(3.5, 12);
  c.closePath();
  c.fill();
  c.fillStyle = "#ffd27a";
  c.beginPath();
  c.moveTo(-3, 12);
  c.lineTo(3, 12);
  c.lineTo(0, 22 + 4 * flicker);
  c.closePath();
  c.fill();
  c.restore();
}

// Floating score texts that rise and fade.
function drawPopups(c, popups) {
  c.font = "800 22px 'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif";
  c.textAlign = "center";
  for (const pop of popups) {
    const y = pop.y - pop.t * 40;
    c.globalAlpha = Math.max(0, 1 - pop.t / 1.2);
    c.fillStyle = "rgba(0, 0, 0, 0.45)";
    c.fillText(pop.text, pop.x + 1.5, y + 2);
    c.fillStyle = pop.color;
    c.fillText(pop.text, pop.x, y);
  }
  c.globalAlpha = 1;
}
