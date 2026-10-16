/**
 * Animated splash screen shown once per page load, before the menu: the Tesla
 * flies (and flips) across the night skyline while the title comes in and the
 * page finishes loading. Any key or tap continues — that first gesture is also
 * what lets the browser start audio.
 */
import { H, PLAYER_DRAW_H, W } from "./config.js";
import { drawHorizon } from "./skyline.js";
import { glow } from "./utils.js";
import { VEHICLES, drawVehicle } from "./vehicles.js";

const MIN_SHOW = 1.8; // seconds before it can be dismissed (loading bar fills)
const LOOP = 3.4; // seconds per fly-past

export function runSplash({ teslaShades, onDone }) {
  const root = document.getElementById("splash");
  const canvas = document.getElementById("splashCanvas");
  const bar = document.getElementById("splashBar");
  const prompt = document.getElementById("splashPrompt");
  const ctx = canvas.getContext("2d");
  const stars = Array.from({ length: 140 }, () => [Math.random() * W, Math.random() * H * 0.6, Math.random() * 1.6 + 0.4, Math.random() * 6]);
  let loaded = document.readyState === "complete";
  addEventListener("load", () => (loaded = true), { once: true });

  let t = 0;
  let last = performance.now();
  let ready = false;
  let closing = false;
  let raf = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;

    // Loading bar: time-based, but waits for the page (images) to finish.
    const progress = Math.min(t / MIN_SHOW, loaded ? 1 : 0.9);
    bar.style.transform = `scaleX(${progress})`;
    if (progress >= 1 && !ready) {
      ready = true;
      prompt.classList.add("show");
    }

    draw(t);
    raf = requestAnimationFrame(frame);
  }

  function draw(time) {
    // Cover the window with the 1280×720 scene.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    const s = Math.max(cw / W, ch / H) * dpr;
    ctx.setTransform(s, 0, 0, s, (canvas.width - W * s) / 2, (canvas.height - H * s) / 2);

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#03060d");
    sky.addColorStop(0.55, "#121f40");
    sky.addColorStop(0.8, "#3a3a6e");
    sky.addColorStop(1, "#7a4e78");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#e4eeff";
    for (const [x, y, r, tw] of stars) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 2 + tw);
      ctx.fillRect(x, y, r, r);
    }
    ctx.globalAlpha = 1;
    drawHorizon(ctx, H - 40, time * 40, "rgba(110, 80, 130, ALPHA)");
    ctx.fillStyle = "#06080d";
    ctx.fillRect(0, H - 40, W, 40);

    // The Tesla arcs across, flipping once at the top.
    const u = (time % LOOP) / LOOP;
    const spec = VEHICLES.tesla;
    const x = -200 + u * (W + 400);
    const y = H - 150 - Math.sin(u * Math.PI) * 260;
    const flip = u > 0.35 && u < 0.65 ? ((u - 0.35) / 0.3) * Math.PI * 2 : 0;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glow(ctx, x + spec.w / 2, y + PLAYER_DRAW_H + 6, 110, "rgba(110, 210, 255, ALPHA)", 0.55);
    // Light trail behind it.
    for (let i = 1; i <= 14; i++) {
      const uu = u - i * 0.012;
      if (uu < 0) break;
      const tx = -200 + uu * (W + 400) + spec.w / 2;
      const ty = H - 150 - Math.sin(uu * Math.PI) * 260 + PLAYER_DRAW_H;
      ctx.fillStyle = `rgba(120, 220, 255, ${0.25 * (1 - i / 14)})`;
      ctx.beginPath();
      ctx.arc(tx, ty, 10 - i * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(x + spec.w / 2, y + PLAYER_DRAW_H / 2);
    ctx.rotate(flip - Math.cos(u * Math.PI) * 0.12);
    ctx.translate(-(x + spec.w / 2), -(y + PLAYER_DRAW_H / 2));
    drawVehicle(ctx, x, y, spec.w, PLAYER_DRAW_H, spec, teslaShades(), time * 18);
    ctx.restore();
  }

  function dismiss(e) {
    if (!ready || closing) {
      if (e) e.stopImmediatePropagation();
      return;
    }
    closing = true;
    e.preventDefault();
    e.stopImmediatePropagation(); // don't let this key/tap also start the run
    root.classList.add("leaving");
    setTimeout(() => {
      cancelAnimationFrame(raf);
      root.remove();
      removeEventListener("keydown", dismiss, true);
      removeEventListener("pointerdown", dismiss, true);
      onDone();
    }, 600);
  }

  // Capture phase so the splash sees input before the game does.
  addEventListener("keydown", dismiss, true);
  addEventListener("pointerdown", dismiss, true);
  raf = requestAnimationFrame(frame);
}
