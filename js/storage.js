/**
 * Best scores (one per difficulty mode) and preferences in localStorage.
 * Access can throw (private mode, blocked storage), so the game keeps
 * working without saved data instead of crashing.
 */
import { BEST_KEY, PREFS_KEY, WALLET_KEY } from "./config.js";

// Normal mode keeps the original key so earlier best scores carry over.
const bestKey = (mode) => (mode === "normal" ? BEST_KEY : `${BEST_KEY}:${mode}`);

export function loadBest(mode) {
  try {
    const n = Number(localStorage.getItem(bestKey(mode)) || 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function saveBest(mode, score) {
  const best = Math.max(loadBest(mode), Math.floor(score));
  try {
    localStorage.setItem(bestKey(mode), String(best));
  } catch {
    /* storage unavailable: best lasts for this session only */
  }
  return best;
}

// Token wallet kept across runs: { grok, cursor }.
export function loadWallet() {
  try {
    const w = JSON.parse(localStorage.getItem(WALLET_KEY)) || {};
    return { grok: Number(w.grok) || 0, cursor: Number(w.cursor) || 0 };
  } catch {
    return { grok: 0, cursor: 0 };
  }
}

export function saveWallet(wallet) {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
  } catch {
    /* not saved; this session only */
  }
}

// Remembered choices: difficulty mode, camera, mute.
export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* not saved; defaults next time */
  }
}
