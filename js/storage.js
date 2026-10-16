/**
 * Best score in localStorage. Access can throw (private mode, blocked
 * storage), so the game keeps working without a saved best instead of crashing.
 */
import { BEST_KEY } from "./config.js";

export function loadBest() {
  try {
    const n = Number(localStorage.getItem(BEST_KEY) || 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function saveBest(score) {
  const best = Math.max(loadBest(), Math.floor(score));
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    /* storage unavailable: best lasts for this session only */
  }
  return best;
}
