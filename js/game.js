/**
 * Game state and simulation: player flight, traffic, scoring, collisions.
 * Pure logic — no DOM. `update()` reports what happened so main.js can react.
 */
import { audio } from "./audio.js";
import {
  BASE_SPEED, BONUS, COOLDOWN, FLY_BOOST, FLY_DURATION, GROUND_Y, HOP_HEIGHT,
  PLAYER_DRAW_H, PLAYER_GROUND_Y, PLAYER_SCREEN_X, W,
} from "./config.js";
import { advanceSkyline, resetSkyline } from "./skyline.js";
import { loadBest, saveBest } from "./storage.js";
import { seedPeds, updatePeds } from "./street.js";
import { easeInOut, pick, rand } from "./utils.js";
import { CAR_COLORS, NPC_TYPES, VEHICLES, paintShades } from "./vehicles.js";

// `running` is false on the start screen and after a crash.
export function createState(running) {
  resetSkyline();
  return {
    running,
    distance: 0,
    score: 0,
    best: loadBest(),
    playerSpeed: BASE_SPEED, // cruise speed (player auto-drives)
    scrollSpeed: BASE_SPEED, // actual speed this frame, incl. flight boost
    cars: [],
    pending: null, // next car waiting for room to spawn (see planCar)
    peds: seedPeds(),
    nextPedAt: 0,
    popups: [], // floating "+150" texts
    stars: seedStars(),
    shake: 0,
    player: {
      w: VEHICLES.tesla.w,
      h: 42, // hitbox: body only, not the wheels
      y: PLAYER_GROUND_Y,
      flying: false,
      flyT: 0,
      cooldown: 0,
      glow: 0,
      wheelAngle: 0,
    },
  };
}

function seedStars() {
  return Array.from({ length: 70 }, () => ({
    x: Math.random() * W,
    y: Math.random() * 260,
    r: Math.random() * 1.4 + 0.4,
    a: Math.random() * 0.5 + 0.25,
    tw: Math.random() * Math.PI * 2,
  }));
}

export function tryFly(state) {
  const p = state.player;
  if (!state.running || p.flying || p.cooldown > 0) return;
  p.flying = true;
  p.flyT = 0;
  p.glow = 1;
  audio.takeoff();
}

// Extra screen distance a car covers during one hop thanks to FLY_BOOST
// (integral of the boost over the sin-shaped arc), per unit of player speed.
const BOOST_TRAVEL = (FLY_BOOST * FLY_DURATION * 2) / Math.PI;

// Pick the next car's look and speed. It is spawned once there is room for it.
function planCar(state) {
  const spec = VEHICLES[pick(NPC_TYPES)];
  const scale = rand(0.94, 1.08);
  const last = state.cars[state.cars.length - 1];
  const P = state.playerSpeed;
  const w = spec.w * scale;
  // Packs (a car tailing the one ahead) get more common as the run goes on.
  const packChance = Math.min(0.4, 0.12 + state.distance / 60000);
  let pack = false;
  if (last && !last.pack && Math.random() < packChance) {
    // Only form a pack one hop can clear: both cars plus the Tesla, with margin.
    const reach = (P - last.speed) * FLY_DURATION + BOOST_TRAVEL * P;
    pack = last.w + 34 + w + VEHICLES.tesla.w + 30 <= reach;
  }
  state.pending = {
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

// Gap (screen px) needed between `last` and a new car so that, after hopping
// `last` at the last moment, the Tesla can land, recharge and hop again.
function safeGap(state, last, car) {
  const P = state.playerSpeed;
  const rel = P - car.speed; // how fast the new car approaches on screen
  const turnaround = FLY_DURATION + COOLDOWN + 0.45; // hop + recharge + reaction
  let gap = rel * turnaround + BOOST_TRAVEL * P - last.w + P * 0.15;
  // If the new car is slower, `last` will catch up with it before reaching the
  // player (bunching), so leave room for the gap to shrink.
  if (car.speed < last.speed) {
    const timeToPlayer = Math.max(0, last.x - PLAYER_SCREEN_X) / (P - last.speed);
    gap += (last.speed - car.speed) * timeToPlayer;
  }
  // Breathing room shrinks as the run goes on, so traffic gets denser.
  const room = Math.max(0.5, 2.6 - state.distance / 9000);
  return gap + car.extra * room * rel;
}

function spawnCars(state) {
  if (!state.pending) planCar(state);
  const car = state.pending;
  const last = state.cars[state.cars.length - 1];
  let x = W + 120;
  if (last) {
    const gap = car.pack ? rand(22, 34) : safeGap(state, last, car);
    x = last.x + last.w + gap;
    if (x > W + 60) return; // not enough room on screen yet
  }
  state.pending = null;
  state.cars.push({
    x,
    y: GROUND_Y - car.h, // box includes wheels; its bottom is the road
    w: car.w,
    h: car.h,
    speed: car.speed,
    spec: car.spec,
    pack: car.pack,
    shades: paintShades(pick(CAR_COLORS)),
    wheelAngle: 0,
    passed: false,
  });
}

/** Advance the world by `dt` seconds. Returns "crash" on the frame the run ends. */
export function update(state, dt) {
  state.shake = Math.max(0, state.shake - dt * 18);
  for (const pop of state.popups) pop.t += dt;
  state.popups = state.popups.filter((pop) => pop.t < 1);

  // Start / game over screens: the street stays alive but nothing scrolls.
  if (!state.running) {
    updatePeds(state, dt, 0);
    return null;
  }

  // Difficulty: speed ramps up gently (and traffic speed with it, since cars
  // are spawned relative to it); safeGap() tightens spacing over distance.
  state.playerSpeed = BASE_SPEED * Math.min(1 + state.distance / 15000, 2);

  const lift = updateFlight(state.player, dt);

  // The world scrolls faster mid-flight so the Tesla actually gets past traffic.
  state.scrollSpeed = state.playerSpeed * (1 + FLY_BOOST * lift);
  const scroll = state.scrollSpeed * dt;
  state.distance += scroll;
  state.score += scroll * 0.12;
  state.player.wheelAngle += scroll / (VEHICLES.tesla.r * PLAYER_DRAW_H);
  advanceSkyline(scroll);
  updatePeds(state, dt, state.scrollSpeed);

  spawnCars(state);
  updateTraffic(state, dt);
  return checkCars(state) ? crash(state) : null;
}

// Move the player along the takeoff → land arc. Returns lift 0..1.
function updateFlight(p, dt) {
  if (!p.flying) {
    p.cooldown = Math.max(0, p.cooldown - dt);
    return 0;
  }
  p.flyT += dt;
  if (p.flyT >= FLY_DURATION) {
    p.flying = false;
    p.flyT = 0;
    p.y = PLAYER_GROUND_Y;
    p.cooldown = COOLDOWN;
    p.glow = 0;
    audio.landing();
    return 0;
  }
  const lift = Math.sin((p.flyT / FLY_DURATION) * Math.PI);
  p.y = PLAYER_GROUND_Y - easeInOut(lift) * HOP_HEIGHT;
  p.glow = 0.45 + lift * 0.7;
  return lift;
}

function updateTraffic(state, dt) {
  // Cars drift left at the difference between scroll speed and their own speed.
  for (const car of state.cars) {
    car.x -= (state.scrollSpeed - car.speed) * dt;
    car.wheelAngle += (car.speed * dt) / (car.spec.r * car.h);
  }

  // Bunching: a faster car behind cannot pass the slower car ahead.
  // Left on screen = further back on the road; right = further ahead.
  state.cars.sort((a, b) => a.x - b.x);
  for (let i = 0; i < state.cars.length - 1; i++) {
    const behind = state.cars[i];
    const ahead = state.cars[i + 1];
    const gap = 18;
    if (behind.x + behind.w + gap > ahead.x) {
      behind.x = ahead.x - behind.w - gap;
      behind.speed = Math.min(behind.speed, ahead.speed);
    }
  }
  state.cars = state.cars.filter((c) => c.x + c.w > -80);
}

// Returns true if the Tesla hit a car on the ground; also awards fly-over bonuses.
function checkCars(state) {
  const p = state.player;
  const box = { x: PLAYER_SCREEN_X, y: p.y, w: p.w, h: p.h };
  for (const car of state.cars) {
    if (!p.flying && overlaps(box, car)) return true;
    // A car can only get fully behind the Tesla by being flown over
    // (on the ground it would have collided first), so that earns the bonus.
    if (!car.passed && car.x + car.w < PLAYER_SCREEN_X) {
      car.passed = true;
      state.score += BONUS;
      state.popups.push({ x: PLAYER_SCREEN_X + p.w * 0.5, y: p.y - 10, t: 0 });
      audio.bonus();
    }
  }
  return false;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function crash(state) {
  state.running = false;
  state.shake = 10;
  audio.crash();
  state.best = saveBest(state.score);
  return "crash";
}
