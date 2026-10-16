/**
 * Game state and simulation: lanes, flight and flips, traffic, levels,
 * scoring, collisions, plus the honks and reactions that bring the street
 * to life. Pure logic — no DOM. `update()` reports what happened so main.js
 * can react.
 */
import { audio } from "./audio.js";
import {
  BASE_SPEED, BONUS, FLY_BOOST, FLY_DURATION, HOP_HEIGHT, LANES, LANE_SWITCH_SPEED,
  MODES, PLAYER_DRAW_H, PLAYER_SCREEN_X, SAFE_LANDING, SPAWN_X, SPIN_SPEED, START_LANE,
  TRICK_BONUS, W, laneGround,
} from "./config.js";
import { advanceSkyline, resetSkyline } from "./skyline.js";
import { loadBest, saveBest } from "./storage.js";
import { pedSay, seedPeds, updatePeds } from "./street.js";
import { clamp, easeInOut, pick, rand, wrapAngle } from "./utils.js";
import { CAR_COLORS, NPC_TYPES, VEHICLES, paintShades } from "./vehicles.js";

const PX = PLAYER_SCREEN_X;
const TAU = Math.PI * 2;

const WOW = ["Whoa!", "Wow!", "It flies?!", "No way!", "Cool!", "Is that a Tesla?", "Look up!", "Amazing!"];
const OUCH = ["Oh no!", "Ouch!", "Yikes!", "Call someone!", "Not again…"];
const CHATTER = ["Nice night!", "Taxi!", "Hey!", "So much traffic…", "Love this city", "Coffee?", "Running late!", "Hi!"];

// `running` is false on the start screen and after a crash.
export function createState(running, mode = "normal") {
  resetSkyline();
  const cfg = MODES[mode];
  return {
    running,
    mode,
    cfg,
    crashReason: "",
    distance: 0,
    score: 0,
    best: loadBest(mode),
    level: 1,
    playerSpeed: BASE_SPEED * cfg.speed, // cruise speed (player auto-drives)
    scrollSpeed: BASE_SPEED * cfg.speed, // actual speed this frame, incl. flight boost
    cars: [], // sorted by lane, then x
    pending: LANES.map(() => null), // next car per lane, waiting for room (see planCar)
    peds: seedPeds(),
    nextPedAt: 0,
    popups: [], // floating score texts
    events: [], // one-off notices for main.js ("level")
    stars: seedStars(),
    shake: 0,
    honkTimer: rand(2, 4),
    chatterTimer: rand(2, 5),
    player: {
      w: VEHICLES.tesla.w,
      lane: START_LANE, // target lane
      lanePos: START_LANE, // animated lane position (fractional mid-switch)
      hop: 0, // height above the road
      y: laneGround(START_LANE) - PLAYER_DRAW_H,
      flying: false,
      flyT: 0,
      cooldown: 0,
      glow: 0,
      wheelAngle: 0,
      rot: 0, // flip angle (rad); positive = clockwise = front flip
      spin: 0, // flip input: -1 back, 0 none, 1 front
      spinTotal: 0, // rotation input this flight, to count flips
      nextFlipSound: Math.PI,
    },
  };
}

function seedStars() {
  return Array.from({ length: 110 }, () => ({
    x: rand(-300, W + 300),
    y: rand(-120, 260),
    r: Math.random() * 1.4 + 0.4,
    a: Math.random() * 0.5 + 0.25,
    tw: Math.random() * TAU,
  }));
}

// Stereo position for something at screen x.
const panAt = (x) => clamp((x - W / 2) / (W / 2), -1, 1);
const sameLane = (car, p) => Math.abs(car.lane - p.lanePos) < 0.55;

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------
export function tryFly(state) {
  const p = state.player;
  if (!state.running || p.flying || p.cooldown > 0) return;
  p.flying = true;
  p.flyT = 0;
  p.glow = 1;
  p.spinTotal = 0;
  p.nextFlipSound = Math.PI;
  audio.takeoff();
  reactNearby(state, WOW, 0.5, 3);
}

export function changeLane(state, dir) {
  const p = state.player;
  if (!state.running) return;
  const next = clamp(p.lane + dir, 0, LANES.length - 1);
  if (next === p.lane) return;
  p.lane = next;
  audio.lane();
  // Cutting in just ahead of someone gets you honked at.
  for (const car of state.cars) {
    if (car.lane === next && car.x + car.w < PX && car.x + car.w > PX - 170) honk(car, 0.15);
  }
}

// ---------------------------------------------------------------------------
// Traffic
// ---------------------------------------------------------------------------

// Extra screen distance a car covers during one hop thanks to FLY_BOOST
// (integral of the boost over the sin-shaped arc), per unit of player speed.
const BOOST_TRAVEL = (FLY_BOOST * FLY_DURATION * 2) / Math.PI;

// Pick the next car for a lane. It is spawned once there is room for it.
function planCar(state, lane, last) {
  const { cfg, level } = state;
  const spec = VEHICLES[pick(NPC_TYPES)];
  const scale = rand(0.94, 1.08);
  const P = state.playerSpeed;
  const w = spec.w * scale;
  // Packs (a car tailing the one ahead) get more common each level.
  const packChance = Math.min(cfg.packMax, cfg.pack + 0.04 * (level - 1));
  let pack = false;
  if (last && !last.pack && Math.random() < packChance) {
    // Only form a pack one hop can clear: both cars plus the Tesla, with margin.
    const reach = (P - last.speed) * FLY_DURATION + BOOST_TRAVEL * P;
    pack = last.w + 34 + w + VEHICLES.tesla.w + 30 <= reach;
  }
  return {
    lane,
    spec,
    w,
    h: spec.h * scale,
    pack,
    // Pack followers match the leader so the pack holds together; others are
    // capped at 0.82× player speed so every car is clearable.
    speed: pack ? last.speed : P * rand(0.4, 0.82),
    extra: Math.random(), // how much breathing room beyond the safe minimum
  };
}

// Gap (screen px) needed between `last` and a new car in the same lane so
// that, after hopping `last` at the last moment, the Tesla can land, recharge
// and hop again. Every lane on its own is therefore always survivable.
function safeGap(state, last, car) {
  const { cfg, level } = state;
  const P = state.playerSpeed;
  const rel = P - car.speed; // how fast the new car approaches on screen
  const turnaround = FLY_DURATION + cfg.cooldown + 0.45; // hop + recharge + reaction
  let gap = rel * turnaround + BOOST_TRAVEL * P - last.w + P * 0.15;
  // If the new car is slower, `last` will catch up with it before reaching the
  // player (bunching), so leave room for the gap to shrink.
  if (car.speed < last.speed) {
    const timeToPlayer = Math.max(0, last.x - PX) / (P - last.speed);
    gap += (last.speed - car.speed) * timeToPlayer;
  }
  // Breathing room shrinks each level, so traffic gets denser.
  const room = Math.max(cfg.roomMin, cfg.room - 0.3 * (level - 1));
  return gap + car.extra * room * rel;
}

function spawnCars(state) {
  for (let lane = 0; lane < LANES.length; lane++) {
    let last = null; // rightmost car in this lane
    for (const c of state.cars) if (c.lane === lane && (!last || c.x > last.x)) last = c;
    const car = (state.pending[lane] ??= planCar(state, lane, last));
    // First car in a lane is staggered so lanes don't arrive in step.
    let x = SPAWN_X + rand(0, 700);
    if (last) {
      const gap = car.pack ? rand(22, 34) : safeGap(state, last, car);
      x = last.x + last.w + gap;
      if (x > SPAWN_X) continue; // not enough room yet
    }
    state.pending[lane] = null;
    state.cars.push({
      x,
      lane,
      w: car.w,
      h: car.h,
      speed: car.speed,
      spec: car.spec,
      pack: car.pack,
      shades: paintShades(pick(CAR_COLORS)),
      wheelAngle: 0,
      horn: rand(0.82, 1.25), // horn pitch
      honkT: 0, // > 0 while showing a honk
      jumped: false, // flown over by the Tesla
      whooshed: false,
      passed: false,
    });
  }
}

function updateTraffic(state, dt) {
  // Cars drift left at the difference between scroll speed and their own speed.
  for (const car of state.cars) {
    car.x -= (state.scrollSpeed - car.speed) * dt;
    car.wheelAngle += (car.speed * dt) / (car.spec.r * car.h);
    car.honkT = Math.max(0, car.honkT - dt);
  }

  // Bunching: a faster car behind cannot pass the slower car ahead in its lane.
  // Left on screen = further back on the road; right = further ahead.
  state.cars.sort((a, b) => a.lane - b.lane || a.x - b.x);
  for (let i = 0; i < state.cars.length - 1; i++) {
    const behind = state.cars[i];
    const ahead = state.cars[i + 1];
    if (behind.lane !== ahead.lane) continue;
    const gap = 18;
    if (behind.x + behind.w + gap > ahead.x) {
      behind.x = ahead.x - behind.w - gap;
      behind.speed = Math.min(behind.speed, ahead.speed);
    }
  }
  state.cars = state.cars.filter((c) => c.x + c.w > -340);
}

function honk(car, delay = 0) {
  if (car.honkT > 0) return;
  car.honkT = 0.5 + delay;
  audio.honk(panAt(car.x + car.w), car.horn, delay);
}

// Random honks from visible traffic, more often on later levels.
function ambientHonks(state, dt) {
  state.honkTimer -= dt;
  if (state.honkTimer > 0) return;
  state.honkTimer = rand(2.5, 6) / (1 + 0.15 * (state.level - 1));
  const visible = state.cars.filter((c) => c.x > 0 && c.x < W - 60);
  if (visible.length) honk(pick(visible));
}

// ---------------------------------------------------------------------------
// Pedestrians talking
// ---------------------------------------------------------------------------

// People near the Tesla react (on takeoff, on crash).
function reactNearby(state, lines, chance, max) {
  let n = 0;
  for (const ped of state.peds) {
    if (n >= max) break;
    if (Math.abs(ped.x - PX) < 380 && Math.random() < chance) {
      pedSay(ped, pick(lines), n * 0.25);
      n++;
    }
  }
  if (n) audio.cheer(panAt(PX + 100));
}

function ambientChatter(state, dt) {
  state.chatterTimer -= dt;
  if (state.chatterTimer > 0) return;
  state.chatterTimer = rand(3, 7);
  const visible = state.peds.filter((p) => p.x > 60 && p.x < W - 60 && !p.bubbleT);
  if (!visible.length) return;
  const ped = pick(visible);
  pedSay(ped, pick(CHATTER));
  audio.chatter(panAt(ped.x));
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** Advance the world by `dt` seconds. Returns "crash" on the frame the run ends. */
export function update(state, dt) {
  state.shake = Math.max(0, state.shake - dt * 18);
  for (const pop of state.popups) pop.t += dt;
  state.popups = state.popups.filter((pop) => pop.t < 1.2);

  // Start / game over screens: the street stays alive but nothing scrolls.
  if (!state.running) {
    updatePeds(state, dt, 0);
    ambientChatter(state, dt);
    return null;
  }

  // Levels: each one is faster; safeGap() and planCar() also tighten traffic.
  const level = 1 + Math.floor(state.distance / state.cfg.levelDist);
  if (level > state.level) {
    state.level = level;
    state.events.push("level");
    audio.levelUp();
  }
  const target = BASE_SPEED * state.cfg.speed * Math.min(1 + 0.1 * (level - 1), 2);
  state.playerSpeed += (target - state.playerSpeed) * Math.min(1, dt * 0.8);

  const p = state.player;
  const lift = updateFlight(state, dt);
  if (lift === "bad landing") return crash(state, "Bad landing");

  // Slide toward the target lane.
  const dl = p.lane - p.lanePos;
  p.lanePos += Math.sign(dl) * Math.min(Math.abs(dl), LANE_SWITCH_SPEED * dt);
  p.y = laneGround(p.lanePos) - PLAYER_DRAW_H - p.hop;

  // The world scrolls faster mid-flight so the Tesla actually gets past traffic.
  state.scrollSpeed = state.playerSpeed * (1 + FLY_BOOST * lift);
  const scroll = state.scrollSpeed * dt;
  state.distance += scroll;
  state.score += scroll * 0.12;
  p.wheelAngle += scroll / (VEHICLES.tesla.r * PLAYER_DRAW_H);
  advanceSkyline(scroll);
  updatePeds(state, dt, state.scrollSpeed);

  spawnCars(state);
  updateTraffic(state, dt);
  ambientHonks(state, dt);
  ambientChatter(state, dt);
  return checkCars(state) ? crash(state, "Crashed into traffic") : null;
}

// Move the player along the takeoff → land arc and apply flips.
// Returns lift 0..1, or "bad landing".
function updateFlight(state, dt) {
  const p = state.player;
  if (!p.flying) {
    p.cooldown = Math.max(0, p.cooldown - dt);
    return 0;
  }
  p.flyT += dt;

  if (p.spin) {
    const d = p.spin * SPIN_SPEED * dt;
    p.rot += d;
    p.spinTotal += d;
    if (Math.abs(p.spinTotal) >= p.nextFlipSound) {
      audio.flip();
      p.nextFlipSound += Math.PI;
    }
  } else {
    // Without input the car eases itself level, but only when nearly upright.
    const a = wrapAngle(p.rot);
    if (Math.abs(a) < 0.5) p.rot -= a * Math.min(1, dt * 5);
  }

  if (p.flyT >= FLY_DURATION) return land(state) ? 0 : "bad landing";
  const lift = Math.sin((p.flyT / FLY_DURATION) * Math.PI);
  p.hop = easeInOut(lift) * HOP_HEIGHT;
  p.glow = 0.45 + lift * 0.7;
  return lift;
}

// Touch down. Returns false if the car came down too far from upright.
function land(state) {
  const p = state.player;
  p.flying = false;
  p.flyT = 0;
  p.hop = 0;
  p.y = laneGround(p.lanePos) - PLAYER_DRAW_H;
  p.glow = 0;
  p.cooldown = state.cfg.cooldown;
  if (Math.abs(wrapAngle(p.rot)) > SAFE_LANDING) return false;

  const flips = Math.round(p.spinTotal / TAU);
  if (flips !== 0) {
    const n = Math.abs(flips);
    state.score += TRICK_BONUS * n;
    const name = flips > 0 ? "FRONTFLIP" : "BACKFLIP";
    addPopup(state, `${name}${n > 1 ? ` x${n}` : ""} +${TRICK_BONUS * n}`, "#ffd166");
    audio.trick();
  }
  p.rot = 0;
  p.spinTotal = 0;
  audio.landing();
  // Landing right in front of someone gets you honked at.
  for (const car of state.cars) {
    if (sameLane(car, p) && car.x + car.w < PX && car.x + car.w > PX - 160 && Math.random() < 0.8) {
      honk(car, 0.15);
    }
  }
  return true;
}

function addPopup(state, text, color = "#7fe3ff") {
  const p = state.player;
  // Stack popups that appear together so they don't overlap.
  const stack = state.popups.filter((q) => q.t < 0.3).length;
  state.popups.push({ x: PX + p.w * 0.5, y: p.y - 12 - stack * 26, t: 0, text, color });
}

// Returns true if the Tesla hit a car on the ground; also awards fly-over
// bonuses and plays pass-by sounds.
function checkCars(state) {
  const p = state.player;
  for (const car of state.cars) {
    const overlapX = car.x < PX + p.w && car.x + car.w > PX;
    const inLane = sameLane(car, p);
    if (overlapX && inLane) {
      if (!p.flying) return true;
      car.jumped = true;
    }
    // Whoosh as a car goes by (louder in nearby lanes).
    if (!car.whooshed && car.x < PX + p.w * 0.5) {
      car.whooshed = true;
      const near = Math.abs(car.lane - p.lanePos);
      if (near < 1.6) audio.whoosh(-0.2, near < 0.6 ? 0.08 : 0.045);
    }
    if (!car.passed && car.x + car.w < PX) {
      car.passed = true;
      if (car.jumped) {
        state.score += BONUS;
        addPopup(state, `+${BONUS}`);
        audio.bonus();
      }
    }
  }
  return false;
}

function crash(state, reason) {
  state.running = false;
  state.crashReason = reason;
  state.shake = 10;
  audio.crash();
  reactNearby(state, OUCH, 0.6, 3);
  state.best = saveBest(state.mode, state.score);
  return "crash";
}
