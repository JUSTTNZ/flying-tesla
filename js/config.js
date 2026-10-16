/**
 * Tuning values and scene layout shared by every module.
 * All drawing uses a fixed 1280×720 logical coordinate system.
 */

// Gameplay
export const BEST_KEY = "flyingTeslaBestScore";
export const PREFS_KEY = "flyingTeslaPrefs";
export const FLY_DURATION = 2; // seconds in the air
// Extra forward speed at the top of the arc. Without it, cars only slightly
// slower than the player barely move relative to it and can't be cleared in 2s.
export const FLY_BOOST = 0.7;
export const HOP_HEIGHT = 118; // px the Tesla rises at the top of the arc
export const BASE_SPEED = 280; // player world units / sec at the start of a run
export const BONUS = 150; // points per car cleared in the air
export const TRICK_BONUS = 300; // points per full flip landed
export const SPIN_SPEED = 6.5; // rad/s while a flip key is held (~1 flip per second)
export const SAFE_LANDING = 0.6; // max tilt (rad) from upright for a safe landing
export const LANE_SWITCH_SPEED = 6; // lanes per second
export const PLAYER_SCREEN_X = 210;

// Difficulty modes, picked on the start screen. Levels within a run make each
// mode faster (`speed` grows 10% per level) and denser (`room` shrinks).
//   cooldown  seconds after landing before the next hop
//   room      spare seconds of spacing between cars, on top of the safe minimum
//   pack      chance that a car tails the one ahead as a tight pair
//   levelDist distance (world px) per level
export const MODES = {
  easy: { label: "Easy", speed: 0.85, cooldown: 0.8, room: 3.6, roomMin: 1.4, pack: 0.06, packMax: 0.25, levelDist: 9000 },
  normal: { label: "Normal", speed: 1, cooldown: 1.15, room: 3.0, roomMin: 0.9, pack: 0.1, packMax: 0.4, levelDist: 8000 },
  hard: { label: "Hard", speed: 1.15, cooldown: 1.4, room: 2.2, roomMin: 0.5, pack: 0.18, packMax: 0.5, levelDist: 8000 },
};

// Camera modes, cycled with C / the CAM button (see renderer.js).
export const CAMERAS = ["side", "chase", "cinematic", "wide"];

// Scene size and layout (top → bottom).
export const W = 1280;
export const H = 720;
export const VIEW_PAD = 320; // scenery extends this far past the edges for zoomed-out / tilted cameras
export const SIDEWALK_TOP = 456; // buildings stand on this line
export const ROAD_TOP = 500; // far kerb
export const LANES = [568, 618, 668]; // tyre line of each lane, far → near
export const START_LANE = 1;
export const ROAD_BOTTOM = 690; // near kerb; a strip of pavement sits below it
export const PLAYER_DRAW_H = 54; // Tesla height including wheels
export const SKYLINE_PERIOD = W + 400; // skyline layers repeat every this many px
export const SPAWN_X = W + 220; // cars appear here (off screen even on the wide camera)

// Tyre line for a (possibly fractional, mid-switch) lane position.
export const laneGround = (pos) => LANES[0] + pos * (LANES[1] - LANES[0]);
