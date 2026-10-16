/**
 * Game state and simulation: lanes, flight and flips, traffic, levels,
 * scoring, collisions, plus the honks and reactions that bring the street
 * to life. Pure logic — no DOM. `update()` reports what happened so main.js
 * can react.
 */
import { audio } from "./audio.js";
import {
  BASE_SPEED, BONUS, FLY_BOOST, FLY_DURATION, HOP_HEIGHT, LANES, LANE_SWITCH_SPEED,
  MODES, NITRO_GRACE, NITRO_SPEED, NITRO_TIME, PLAYER_DRAW_H, PLAYER_SCREEN_X,
  FLIP_TIME, SAFE_LANDING, SMASH_BONUS, SPAWN_X, START_LANE, VIEW_PAD,
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
// Grok Bots say these instead.
const BOT_WOW = ["Nice flip, human.", "Trajectory: optimal", "Beep boop!", "Impressive.", "Logging that jump"];
const BOT_OUCH = ["Error 404: road", "Rebooting…", "That was suboptimal", "Beep… oops"];
const BOT_CHATTER = ["Hello, human!", "I grok traffic.", "Charging…", "Beep boop!", "Ask me anything", "To Mars!"];
// Drivers leaning out of their cars.
const DRIVER_ANGRY = ["Excuse me sir!", "Move out, I'm late for home!", "Hey! Watch it!", "Move it, buddy!", "Who taught you to drive?!"];
const DRIVER_IDLE = ["Excuse me sir!", "Move out, I'm late for home!", "Come on, move!", "I'm late for dinner!", "Nice Tesla though", "Ugh, traffic…"];
const DRIVER_SMASHED = ["My car!!", "Are you serious?!", "I'm late for home!", "Insurance won't cover THIS"];
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
    pickups: [], // nitro canisters on the road
    nextNitroAt: 1500 + rand(0, 1500),
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
      targetRot: 0, // whole turns queued this flight; rot animates toward it
      nitro: 0, // seconds of boost left
      grace: 0, // seconds after a boost where hits still smash
      graceHold: false, // grace is held until the Tesla is free to hop again
      spin: 0, // held flip input: -1 back, 0 none, 1 front (chains more flips)
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
  p.rot = p.targetRot = 0;
  audio.takeoff();
  reactNearby(state, WOW, BOT_WOW, 0.5, 3);
}

// Start a full flip (dir 1 = front, -1 = back). Ignored on the ground, when
// it would reverse a flip in progress, or when it couldn't finish before
// landing — so flipping never makes you crash.
export function flip(state, dir) {
  const p = state.player;
  if (!state.running || !p.flying) return;
  const pending = p.targetRot - p.rot;
  if (pending !== 0 && Math.sign(pending) !== dir) return;
  const turns = (Math.abs(pending) + TAU) / TAU;
  if (turns * FLIP_TIME > FLY_DURATION - p.flyT - 0.05) return;
  p.targetRot += dir * TAU;
  audio.flip();
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
    if (car.lane === next && car.x + car.w < PX && car.x + car.w > PX - 170) honk(car, 0.15, DRIVER_ANGRY);
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
  const type = pick(NPC_TYPES);
  const spec = VEHICLES[type];
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
    type,
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
      type: car.type,
      spec: car.spec,
      pack: car.pack,
      shades: paintShades(pick(CAR_COLORS)),
      wheelAngle: 0,
      horn: rand(0.82, 1.25), // horn pitch
      honkT: 0, // > 0 while showing a honk
      jumped: false, // flown over by the Tesla
      whooshed: false,
      passed: false,
      knocked: null, // set when smashed by a nitro boost
      bubble: "", // driver shouting
      bubbleT: 0,
    });
  }
}

function updateTraffic(state, dt) {
  // Cars drift left at the difference between scroll speed and their own speed.
  for (const car of state.cars) {
    car.x -= (state.scrollSpeed - car.speed) * dt;
    car.wheelAngle += (car.speed * dt) / (car.spec.r * car.h);
    car.honkT = Math.max(0, car.honkT - dt);
    car.bubbleT = Math.max(0, car.bubbleT - dt);
    // Smashed cars tumble up and away.
    const k = car.knocked;
    if (k) {
      k.t += dt;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.vy += 1500 * dt;
      k.rot += k.spin * dt;
    }
  }

  // Bunching: a faster car behind cannot pass the slower car ahead in its lane.
  // Left on screen = further back on the road; right = further ahead.
  state.cars.sort((a, b) => a.lane - b.lane || a.x - b.x);
  for (let i = 0; i < state.cars.length - 1; i++) {
    const behind = state.cars[i];
    const ahead = state.cars[i + 1];
    if (behind.lane !== ahead.lane || behind.knocked || ahead.knocked) continue;
    const gap = 18;
    if (behind.x + behind.w + gap > ahead.x) {
      behind.x = ahead.x - behind.w - gap;
      behind.speed = Math.min(behind.speed, ahead.speed);
    }
  }
  state.cars = state.cars.filter((c) => c.x + c.w > -340 && !(c.knocked && c.knocked.t > 1.6));
}

// Honk, and maybe have the driver shout one of `lines`.
function honk(car, delay = 0, lines = null) {
  if (car.honkT > 0 || car.knocked) return;
  car.honkT = 0.5 + delay;
  audio.honk(panAt(car.x + car.w), car.horn, delay);
  if (lines) driverSay(car, pick(lines), delay);
}

function driverSay(car, text, delay = 0) {
  car.bubble = text;
  car.bubbleT = 2.2 + delay; // shown once it drops to 2.2 (after the delay)
  audio.chatter(panAt(car.x + car.w / 2), Math.random() < 0.5, delay + 0.1);
}

// Random honks from visible traffic, more often on later levels.
function ambientHonks(state, dt) {
  state.honkTimer -= dt;
  if (state.honkTimer > 0) return;
  state.honkTimer = rand(2.5, 6) / (1 + 0.15 * (state.level - 1));
  const visible = state.cars.filter((c) => c.x > 0 && c.x < W - 60 && !c.knocked);
  // More than half the time the driver shouts something too.
  if (visible.length) honk(pick(visible), 0, Math.random() < 0.6 ? DRIVER_IDLE : null);
}

// ---------------------------------------------------------------------------
// Pedestrians talking
// ---------------------------------------------------------------------------

// People (and bots) near the Tesla react (on takeoff, on crash).
function reactNearby(state, lines, botLines, chance, max) {
  let people = 0;
  let bots = 0;
  for (const ped of state.peds) {
    if (people + bots >= max) break;
    if (Math.abs(ped.x - PX) < 380 && Math.random() < chance) {
      pedSay(ped, pick(ped.robot ? botLines : lines), (people + bots) * 0.25);
      if (ped.robot) bots++;
      else people++;
    }
  }
  if (people) audio.cheer(panAt(PX + 100));
  if (bots) audio.robot(panAt(PX + 100), 0.2);
}

function ambientChatter(state, dt) {
  state.chatterTimer -= dt;
  if (state.chatterTimer > 0) return;
  state.chatterTimer = rand(3, 7);
  const visible = state.peds.filter((p) => p.x > 60 && p.x < W - 60 && !p.bubbleT);
  if (!visible.length) return;
  const ped = pick(visible);
  pedSay(ped, pick(ped.robot ? BOT_CHATTER : CHATTER));
  if (ped.robot) audio.robot(panAt(ped.x));
  else audio.chatter(panAt(ped.x));
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

  // Nitro: faster and double points. Afterwards hits keep smashing until the
  // Tesla has landed and FLY has recharged, plus a moment to react — the boost
  // can leave you mid-cooldown right in front of a car otherwise.
  if (p.nitro > 0) {
    p.nitro = Math.max(0, p.nitro - dt);
    if (p.nitro === 0) {
      p.grace = NITRO_GRACE;
      p.graceHold = true;
    }
  } else if (p.graceHold && (p.flying || p.cooldown > 0)) {
    p.grace = NITRO_GRACE;
  } else {
    p.graceHold = false; // once free, the grace runs out even if you hop again
    p.grace = Math.max(0, p.grace - dt);
  }
  const boost = p.nitro > 0 ? NITRO_SPEED : 1;

  // The world scrolls faster mid-flight so the Tesla actually gets past traffic.
  state.scrollSpeed = state.playerSpeed * (1 + FLY_BOOST * lift) * boost;
  const scroll = state.scrollSpeed * dt;
  state.distance += scroll;
  state.score += scroll * 0.12 * (p.nitro > 0 ? 2 : 1);
  p.wheelAngle += scroll / (VEHICLES.tesla.r * PLAYER_DRAW_H);
  advanceSkyline(scroll);
  updatePeds(state, dt, state.scrollSpeed);

  spawnCars(state);
  updateTraffic(state, dt);
  updatePickups(state, dt);
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

  // Holding a flip key chains another flip once the current one is half done.
  if (p.spin && Math.abs(p.targetRot - p.rot) < Math.PI) flip(state, p.spin);
  // Turn toward the queued rotation at one full turn per FLIP_TIME.
  const left = p.targetRot - p.rot;
  p.rot += Math.sign(left) * Math.min(Math.abs(left), (TAU / FLIP_TIME) * dt);

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

  const flips = Math.round(p.targetRot / TAU);
  if (flips !== 0) {
    const n = Math.abs(flips);
    state.score += TRICK_BONUS * n;
    const name = flips > 0 ? "FRONTFLIP" : "BACKFLIP";
    addPopup(state, `${name}${n > 1 ? ` x${n}` : ""} +${TRICK_BONUS * n}`, "#ffd166");
    audio.trick();
  }
  p.rot = p.targetRot = 0;
  audio.landing();
  // Landing right in front of someone gets you honked at.
  for (const car of state.cars) {
    if (sameLane(car, p) && car.x + car.w < PX && car.x + car.w > PX - 160 && Math.random() < 0.8) {
      honk(car, 0.15, DRIVER_ANGRY);
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
    if (car.knocked) continue;
    if (overlapX && inLane) {
      if (!p.flying) {
        // Boosting (or just after) smashes cars out of the way instead.
        if (p.nitro > 0 || p.grace > 0) smash(state, car);
        else return true;
      } else {
        car.jumped = true;
      }
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

// Knock a car tumbling out of the way.
function smash(state, car) {
  car.knocked = { t: 0, x: 0, y: 0, vx: rand(120, 260), vy: -rand(420, 560), rot: 0, spin: rand(-9, 9) };
  car.passed = true;
  state.score += SMASH_BONUS;
  state.shake = Math.max(state.shake, 5);
  addPopup(state, `SMASH +${SMASH_BONUS}`, "#ff8a4c");
  audio.smash(panAt(car.x));
  driverSay(car, pick(DRIVER_SMASHED));
}

// ---------------------------------------------------------------------------
// Nitro pickups
// ---------------------------------------------------------------------------
function updatePickups(state, dt) {
  const p = state.player;
  // Drop a canister into a lane that's clear around the spawn point.
  if (state.distance >= state.nextNitroAt) {
    const free = LANES.map((_, i) => i).filter(
      (lane) => !state.cars.some((c) => c.lane === lane && Math.abs(c.x - SPAWN_X) < 260),
    );
    if (free.length) {
      state.pickups.push({ x: SPAWN_X, lane: pick(free) });
      state.nextNitroAt = state.distance + rand(2600, 4600);
    }
  }
  // Canisters sit on the road, so they scroll with it.
  for (const pk of state.pickups) pk.x -= state.scrollSpeed * dt;
  state.pickups = state.pickups.filter((pk) => {
    const hit = Math.abs(pk.lane - p.lanePos) < 0.55 && pk.x < PX + p.w && pk.x + 34 > PX && p.hop < 40;
    if (hit) {
      p.nitro = NITRO_TIME;
      p.grace = 0;
      p.graceHold = false;
      addPopup(state, "NITRO!", "#5ee8ff");
      audio.nitro();
      return false;
    }
    return pk.x > -VIEW_PAD;
  });
}

function crash(state, reason) {
  state.running = false;
  state.crashReason = reason;
  state.shake = 10;
  audio.crash();
  reactNearby(state, OUCH, BOT_OUCH, 0.6, 3);
  state.best = saveBest(state.mode, state.score);
  return "crash";
}
