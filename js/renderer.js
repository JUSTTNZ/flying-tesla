/**
 * Draws a frame of the scene. Owns the canvas and keeps its backing store
 * matched to CSS size × devicePixelRatio so everything stays sharp.
 */
import {
  BONUS, FLY_DURATION, GROUND_Y, H, HOP_HEIGHT, PLAYER_DRAW_H, PLAYER_GROUND_Y,
  PLAYER_SCREEN_X, SIDEWALK_TOP, W,
} from "./config.js";
import { drawSkyline, renderSkyline } from "./skyline.js";
import { drawStreet } from "./street.js";
import { glow, polyPath } from "./utils.js";
import { VEHICLES, drawBeam, drawShadow, drawVehicle } from "./vehicles.js";

const TESLA_SHADES = ["#ffffff", "#eef2f7", "#b9c4d2"];

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let scale = 0;

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

  // `clock` drives ambient animation (twinkling stars).
  function draw(state, clock) {
    const sx = (Math.random() - 0.5) * state.shake;
    const sy = (Math.random() - 0.5) * state.shake;
    ctx.setTransform(scale, 0, 0, scale, sx * scale, sy * scale);

    drawSky(ctx, state.stars, clock);
    drawSkyline(ctx);
    drawStreet(ctx, state);

    // Headlight beams first so no beam paints over another car's body.
    ctx.globalCompositeOperation = "lighter";
    for (const car of state.cars) drawBeam(ctx, car.x, car.y, car.w, car.h, car.spec);
    const p = state.player;
    if (!p.flying) drawBeam(ctx, PLAYER_SCREEN_X, p.y, p.w, PLAYER_DRAW_H, VEHICLES.tesla);
    ctx.globalCompositeOperation = "source-over";

    for (const car of state.cars) {
      drawShadow(ctx, car.x, car.w, 0);
      drawVehicle(ctx, car.x, car.y, car.w, car.h, car.spec, car.shades, car.wheelAngle);
    }
    drawTesla(ctx, p);
    drawPopups(ctx, state.popups);
  }

  resize();
  return { resize, draw };
}

function drawSky(c, stars, clock) {
  const g = c.createLinearGradient(0, 0, 0, SIDEWALK_TOP);
  g.addColorStop(0, "#070d1a");
  g.addColorStop(0.5, "#15254a");
  g.addColorStop(0.82, "#3a3a6e");
  g.addColorStop(1, "#7a4e78"); // dusk glow on the horizon
  c.fillStyle = g;
  c.fillRect(-20, -20, W + 40, SIDEWALK_TOP + 20);

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

function drawTesla(c, p) {
  const x = PLAYER_SCREEN_X;
  const y = p.y;
  drawShadow(c, x, p.w, (PLAYER_GROUND_Y - y) / HOP_HEIGHT);

  // Soft cyan glow under the car while it flies, reaching down to the road.
  if (p.glow > 0) {
    c.save();
    c.globalCompositeOperation = "lighter";
    const under = y + PLAYER_DRAW_H;
    glow(c, x + p.w * 0.5, under + 4, 80, "rgba(110, 210, 255, ALPHA)", 0.5 * p.glow);
    const beam = c.createLinearGradient(0, under, 0, GROUND_Y);
    beam.addColorStop(0, `rgba(120, 220, 255, ${0.28 * p.glow})`);
    beam.addColorStop(1, "rgba(120, 220, 255, 0)");
    c.fillStyle = beam;
    c.beginPath();
    c.moveTo(x + p.w * 0.2, under);
    c.lineTo(x + p.w * 0.8, under);
    c.lineTo(x + p.w * 0.95, GROUND_Y);
    c.lineTo(x + p.w * 0.05, GROUND_Y);
    c.closePath();
    c.fill();
    c.restore();
  }

  // Slight nose-up on the way up, nose-down on the way down.
  const tilt = p.flying ? -Math.cos((p.flyT / FLY_DURATION) * Math.PI) * 0.06 : 0;
  const cx = x + p.w / 2;
  const cy = y + PLAYER_DRAW_H / 2;
  c.save();
  c.translate(cx, cy);
  c.rotate(tilt);
  c.translate(-cx, -cy);
  drawVehicle(c, x, y, p.w, PLAYER_DRAW_H, VEHICLES.tesla, TESLA_SHADES, p.wheelAngle);
  // Glass roof and a chrome door handle make it read as "Tesla-style".
  c.fillStyle = "rgba(20, 30, 45, 0.85)";
  polyPath(c, [[0.37, 0.07], [0.56, 0.05], [0.6, 0.09], [0.38, 0.11]], x, y, p.w, PLAYER_DRAW_H);
  c.fill();
  c.fillStyle = "#c9d2de";
  c.fillRect(x + p.w * 0.56, y + PLAYER_DRAW_H * 0.46, 8, 2);
  c.restore();
}

// Floating "+150" texts that rise and fade over one second.
function drawPopups(c, popups) {
  c.font = "800 22px 'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif";
  c.textAlign = "center";
  c.fillStyle = "#7fe3ff";
  for (const pop of popups) {
    c.globalAlpha = 1 - pop.t;
    c.fillText(`+${BONUS}`, pop.x, pop.y - pop.t * 40);
  }
  c.globalAlpha = 1;
}
