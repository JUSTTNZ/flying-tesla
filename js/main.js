/**
 * Flying Tesla — side-view endless runner.
 * The world scrolls right → left. The player auto-drives on the left, changes
 * lanes, hops over traffic for 2s (with a cooldown) and can flip in the air.
 *
 * Entry point: wires the DOM (HUD, buttons, overlay) and input to the game loop.
 *
 *   config.js    tuning, modes, layout   game.js     state & simulation
 *   renderer.js  camera & frame drawing  vehicles.js car shapes & drawing
 *   skyline.js   parallax city           street.js   road, props, pedestrians
 *   audio.js     Web Audio sound         storage.js  best scores & prefs
 */
import { audio } from "./audio.js";
import { CAMERAS, MODES, TESLA_COLORS } from "./config.js";
import { changeLane, createState, flip, tryFly, update } from "./game.js";
import { createRenderer } from "./renderer.js";
import { loadPrefs, savePrefs } from "./storage.js";

const $ = (id) => document.getElementById(id);
const flyBtn = $("flyBtn");
const cooldownBar = $("cooldownBar");
const muteBtn = $("muteBtn");
const camBtn = $("camBtn");
const pauseBtn = $("pauseBtn");
const pauseOverlay = $("pauseOverlay");
const overlay = $("overlay");
const restartBtn = $("restartBtn");
const banner = $("banner");
const modeBtns = [...document.querySelectorAll(".mode-btn")];
const colorBtns = [...document.querySelectorAll(".color-btn")];

// Remembered choices.
const prefs = { mode: "normal", camera: "side", muted: false, teslaColor: "white", ...loadPrefs() };
if (!MODES[prefs.mode]) prefs.mode = "normal";
if (!CAMERAS.includes(prefs.camera)) prefs.camera = "side";
if (!TESLA_COLORS[prefs.teslaColor]) prefs.teslaColor = "white";
audio.setMuted(prefs.muted);

const renderer = createRenderer($("game"));
let state = createState(false, prefs.mode);
let paused = false;

// Held flip keys/buttons (holding chains flips); applied to the player every frame.
const spinHeld = { back: false, front: false };

// ---------------------------------------------------------------------------
// HUD and overlay
// ---------------------------------------------------------------------------
function updateHud() {
  $("score").textContent = Math.floor(state.score);
  // BEST tracks the current run live once you beat the saved record.
  $("best").textContent = Math.floor(Math.max(state.best, state.score));
  $("level").textContent = state.level;
  const p = state.player;
  const cooling = p.cooldown > 0;
  flyBtn.disabled = p.flying || cooling || !state.running || paused;
  pauseBtn.disabled = !state.running;
  // Dark overlay on the button: full while flying, draining during cooldown.
  const ratio = cooling ? p.cooldown / state.cfg.cooldown : p.flying ? 1 : 0;
  cooldownBar.style.height = `${ratio * 100}%`;
}

function updateLabels() {
  $("modeTag").textContent = MODES[prefs.mode].label.toUpperCase();
  camBtn.textContent = `CAM · ${prefs.camera.toUpperCase()}`;
  muteBtn.textContent = prefs.muted ? "SOUND OFF" : "SOUND ON";
  for (const b of modeBtns) b.setAttribute("aria-checked", String(b.dataset.mode === prefs.mode));
  for (const b of colorBtns) b.setAttribute("aria-checked", String(b.dataset.color === prefs.teslaColor));
}

// One overlay serves as both the start screen and the game over screen.
function showOverlay(kind) {
  const over = kind === "over";
  $("overlayKicker").textContent = over ? state.crashReason.toUpperCase() : "READY";
  $("overlayTitle").textContent = over ? "Game Over" : "Flying Tesla";
  $("overlayResult").hidden = !over;
  restartBtn.textContent = over ? "Restart" : "Start";
  $("finalScore").textContent = Math.floor(state.score);
  $("finalBest").textContent = Math.floor(state.best);
  $("finalLevel").textContent = state.level;
  overlay.classList.remove("hidden");
  restartBtn.focus();
}

function showBanner(html) {
  banner.innerHTML = html;
  banner.classList.remove("show");
  void banner.offsetWidth; // restart the CSS animation
  banner.classList.add("show");
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
function start() {
  setPaused(false);
  audio.ensure();
  state = createState(true, prefs.mode);
  overlay.classList.add("hidden");
  showBanner(`LEVEL 1<small>${MODES[prefs.mode].label.toUpperCase()}</small>`);
  updateHud();
}

// Pause / play. Only a run in progress can be paused.
function setPaused(on) {
  if (on && !state.running) return;
  paused = on;
  spinHeld.back = spinHeld.front = false;
  pauseOverlay.classList.toggle("hidden", !on);
  pauseBtn.textContent = on ? "▶ PLAY" : "❚❚ PAUSE";
  if (on) {
    audio.pause();
    $("resumeBtn").focus();
  } else {
    audio.resume();
  }
}

function fly() {
  if (paused) return;
  audio.ensure();
  tryFly(state);
}

function lane(dir) {
  if (paused) return;
  audio.ensure();
  changeLane(state, dir);
}

function setMode(mode) {
  if (state.running || !MODES[mode]) return;
  prefs.mode = mode;
  savePrefs(prefs);
  // Show this mode's best score on the menu.
  const { score, level, crashReason } = state;
  state = createState(false, mode);
  Object.assign(state, { score, level, crashReason });
  $("finalBest").textContent = Math.floor(state.best);
  updateLabels();
  updateHud();
}

function cycleCamera() {
  prefs.camera = CAMERAS[(CAMERAS.indexOf(prefs.camera) + 1) % CAMERAS.length];
  savePrefs(prefs);
  updateLabels();
}

function setColor(color) {
  if (!TESLA_COLORS[color]) return;
  prefs.teslaColor = color;
  savePrefs(prefs);
  updateLabels();
}

function toggleColor() {
  setColor(prefs.teslaColor === "white" ? "black" : "white");
}

function toggleMute() {
  prefs.muted = !prefs.muted;
  savePrefs(prefs);
  audio.ensure();
  audio.setMuted(prefs.muted);
  updateLabels();
}

// ---------------------------------------------------------------------------
// Input: keyboard
// ---------------------------------------------------------------------------
addEventListener("keydown", (e) => {
  const k = e.code;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) e.preventDefault();
  if (e.repeat && k !== "Space") return;
  if (k === "KeyP" || k === "Escape") {
    setPaused(!paused);
    return;
  }
  if (paused) {
    // While paused only Space (resume) and the view toggles work.
    if (k === "Space" && !e.repeat) setPaused(false);
    if (k === "KeyC") cycleCamera();
    if (k === "KeyT") toggleColor();
    if (k === "KeyM") toggleMute();
    return;
  }
  if (k === "Space") {
    if (state.running) fly();
    else if (!e.repeat) start();
  }
  if (k === "ArrowUp" || k === "KeyW") lane(-1);
  if (k === "ArrowDown" || k === "KeyS") lane(1);
  // A tap starts a full flip; holding keeps flipping.
  if (k === "ArrowLeft" || k === "KeyA") {
    spinHeld.back = true;
    flip(state, -1);
  }
  if (k === "ArrowRight" || k === "KeyD") {
    spinHeld.front = true;
    flip(state, 1);
  }
  if (k === "KeyC") cycleCamera();
  if (k === "KeyT") toggleColor();
  if (k === "KeyM") toggleMute();
  if (k === "KeyR" && !state.running) start();
  if (!state.running && ["Digit1", "Digit2", "Digit3"].includes(k)) {
    setMode(["easy", "normal", "hard"][Number(k.slice(-1)) - 1]);
  }
});

addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") spinHeld.back = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") spinHeld.front = false;
});

// Releasing keys while the window is unfocused would otherwise stick.
addEventListener("blur", () => {
  spinHeld.back = spinHeld.front = false;
});

// ---------------------------------------------------------------------------
// Input: buttons, touch and swipes
// ---------------------------------------------------------------------------
// pointerdown fires on touch immediately (click waits for release).
function tap(el, fn) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  });
  // Keyboard activation (Enter on a focused button) reports detail === 0.
  el.addEventListener("click", (e) => {
    if (e.detail === 0) fn();
  });
}

// Flip buttons: a tap flips once, holding keeps flipping.
function hold(el, key) {
  const set = (on) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    spinHeld[key] = on;
    el.classList.toggle("held", on);
    if (on) flip(state, key === "front" ? 1 : -1);
  };
  el.addEventListener("pointerdown", set(true));
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) el.addEventListener(ev, set(false));
}

tap(flyBtn, fly);
tap($("laneUpBtn"), () => lane(-1));
tap($("laneDownBtn"), () => lane(1));
hold($("spinBackBtn"), "back");
hold($("spinFrontBtn"), "front");

// Swipe up/down on the game to change lane; a plain tap flies.
let swipeStart = null;
$("game").addEventListener("pointerdown", (e) => {
  swipeStart = { x: e.clientX, y: e.clientY };
});
$("game").addEventListener("pointerup", (e) => {
  if (!swipeStart) return;
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx)) lane(dy < 0 ? -1 : 1);
  else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && state.running) fly();
});

restartBtn.addEventListener("click", start);
pauseBtn.addEventListener("click", () => setPaused(!paused));
$("resumeBtn").addEventListener("click", () => setPaused(false));
$("pauseRestartBtn").addEventListener("click", start);
// Switching tabs or apps pauses the run.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.running) setPaused(true);
});
muteBtn.addEventListener("click", toggleMute);
camBtn.addEventListener("click", cycleCamera);
for (const b of modeBtns) b.addEventListener("click", () => setMode(b.dataset.mode));
for (const b of colorBtns) b.addEventListener("click", () => setColor(b.dataset.color));
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

  state.player.spin = (spinHeld.front ? 1 : 0) - (spinHeld.back ? 1 : 0);
  if (!paused && update(state, dt) === "crash") showOverlay("over");
  for (const ev of state.events.splice(0)) {
    if (ev === "level") showBanner(`LEVEL ${state.level}<small>TRAFFIC SPEEDS UP</small>`);
  }
  updateHud();
  audio.update({ running: state.running, speed: state.scrollSpeed, thrust: state.player.glow });
  renderer.draw(state, { clock, dt: paused ? 0 : dt, camera: prefs.camera, teslaColor: prefs.teslaColor });
  requestAnimationFrame(frame);
}

updateLabels();
showOverlay("ready");
updateHud();
requestAnimationFrame(frame);
