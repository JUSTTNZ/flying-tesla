/**
 * Flying Tesla — side-view endless runner.
 * The world scrolls right → left. The player auto-drives on the left.
 * Space / FLY lifts the car in a 2s arc over traffic, then a cooldown applies.
 *
 * Entry point: wires the DOM (HUD, buttons, overlay) to the game loop.
 *
 *   config.js    tuning + layout        game.js     state & simulation
 *   renderer.js  frame drawing          vehicles.js car shapes & drawing
 *   skyline.js   parallax city          street.js   road, props, pedestrians
 *   audio.js     Web Audio FX           storage.js  best score
 */
import { audio } from "./audio.js";
import { COOLDOWN } from "./config.js";
import { createState, tryFly, update } from "./game.js";
import { createRenderer } from "./renderer.js";

const $ = (id) => document.getElementById(id);
const scoreEl = $("score");
const bestEl = $("best");
const flyBtn = $("flyBtn");
const cooldownBar = $("cooldownBar");
const muteBtn = $("muteBtn");
const overlay = $("overlay");
const restartBtn = $("restartBtn");

const renderer = createRenderer($("game"));
let state = createState(false);

// ---------------------------------------------------------------------------
// HUD and overlay
// ---------------------------------------------------------------------------
function updateHud() {
  scoreEl.textContent = Math.floor(state.score);
  // BEST tracks the current run live once you beat the saved record.
  bestEl.textContent = Math.floor(Math.max(state.best, state.score));
  const p = state.player;
  const cooling = p.cooldown > 0;
  flyBtn.disabled = p.flying || cooling || !state.running;
  // Dark overlay on the button: full while flying, draining during cooldown.
  const ratio = cooling ? p.cooldown / COOLDOWN : p.flying ? 1 : 0;
  cooldownBar.style.height = `${ratio * 100}%`;
}

// One overlay serves as both the start screen and the game over screen.
function showOverlay(kind) {
  const over = kind === "over";
  $("overlayKicker").textContent = over ? "RUN OVER" : "READY";
  $("overlayTitle").textContent = over ? "Game Over" : "Flying Tesla";
  $("finalScore").parentElement.hidden = !over;
  $("overlayHelp").hidden = over;
  restartBtn.textContent = over ? "Restart" : "Start";
  $("finalScore").textContent = Math.floor(state.score);
  $("finalBest").textContent = Math.floor(state.best);
  overlay.classList.remove("hidden");
  restartBtn.focus();
}

function start() {
  audio.ensure();
  state = createState(true);
  overlay.classList.add("hidden");
  updateHud();
}

function fly() {
  audio.ensure();
  tryFly(state);
}

function toggleMute() {
  audio.muted = !audio.muted;
  muteBtn.textContent = audio.muted ? "SOUND OFF" : "SOUND ON";
  if (!audio.muted) audio.ensure();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
// pointerdown fires on touch immediately (click waits for release).
flyBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  fly();
});
// Keyboard activation (Enter on a focused button) reports detail === 0.
flyBtn.addEventListener("click", (e) => {
  if (e.detail === 0) fly();
});

addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (state.running) fly();
    else start();
  }
  if (e.code === "KeyR" && !state.running) start();
  if (e.code === "KeyM") toggleMute();
});

restartBtn.addEventListener("click", start);
muteBtn.addEventListener("click", toggleMute);
addEventListener("resize", renderer.resize);

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
let last = performance.now();
let clock = 0;

function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); // clamp after tab switches
  last = now;
  clock += dt;
  if (update(state, dt) === "crash") showOverlay("over");
  updateHud();
  renderer.draw(state, clock);
  requestAnimationFrame(frame);
}

showOverlay("ready");
updateHud();
requestAnimationFrame(frame);
