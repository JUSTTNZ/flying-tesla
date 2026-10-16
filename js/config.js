/**
 * Tuning values and scene layout shared by every module.
 * All drawing uses a fixed 1280×720 logical coordinate system.
 */

// Gameplay
export const BEST_KEY = "flyingTeslaBestScore";
export const FLY_DURATION = 2; // seconds in the air
export const COOLDOWN = 1.15; // seconds after landing before the next hop
// Extra forward speed at the top of the arc. Without it, cars only slightly
// slower than the player barely move relative to it and can't be cleared in 2s.
export const FLY_BOOST = 0.7;
export const HOP_HEIGHT = 118; // px the Tesla rises at the top of the arc
export const BASE_SPEED = 280; // player world units / sec at the start of a run
export const BONUS = 150; // points per car cleared in the air
export const PLAYER_SCREEN_X = 210;

// Scene size and layout (top → bottom).
export const W = 1280;
export const H = 720;
export const SIDEWALK_TOP = 456; // buildings stand on this line
export const ROAD_TOP = 500; // far kerb
export const GROUND_Y = 612; // where every tyre touches the tarmac
export const ROAD_BOTTOM = 690; // near kerb; a strip of pavement sits below it
export const PLAYER_DRAW_H = 54; // Tesla height including wheels
export const PLAYER_GROUND_Y = GROUND_Y - PLAYER_DRAW_H; // Tesla top when on the road
export const SKYLINE_PERIOD = W + 400; // skyline layers repeat every this many px
