import gsap from 'gsap';
import { progressToY } from './ScrollController.js';
import { useUI } from '../interface/useUI.js';

// Hands-free viewing. Playback moves the real scroll position at a steady rate, so it is not a second way of running the
// film: the picture, titles, chapter rail and saved position all follow scroll exactly as they do by hand. Taking over
// by scrolling pauses it. Chapter jumps are honoured, and the film carries on from wherever they land.
export const FILM_SECONDS = 210;
// The reduced-motion presentation has seven held frames, so each gets nine seconds.
export const REDUCED_SECONDS = 63;
const EASE_IN_SECONDS = 1.2;
// Further than one frame of playback could ever move: something other than playback moved the page.
const TAKEN_OVER_PX = 48;

let p = null, lastY = 0, ramp = 0, lock = null;

const fraction = () => Math.min(1, window.scrollY / Math.max(1, progressToY(1)));
export const isAtEnd = () => fraction() > 0.9995;
export const isPlaying = () => useUI.getState().playing;

function tick(_time, deltaMs) {
  // A chapter jump is under way: wait for it, then continue from where it lands.
  if (gsap.isTweening(window)) { p = null; return; }
  const max = progressToY(1);
  if (max <= 0) return;
  if (p === null) { p = fraction(); ramp = 0; lastY = window.scrollY; }
  else if (Math.abs(window.scrollY - lastY) > TAKEN_OVER_PX) { pausePlayback(); return; }
  const dt = Math.min(deltaMs, 100) / 1000;
  ramp = Math.min(1, ramp + dt / EASE_IN_SECONDS);
  p += dt * ramp / (useUI.getState().reduced ? REDUCED_SECONDS : FILM_SECONDS);
  if (p >= 1) { window.scrollTo(0, max); pausePlayback(); return; }
  window.scrollTo(0, p * max);
  lastY = window.scrollY;
}

// Inputs that scroll the page by themselves. Left, right and space are not here: they are handled, not taken over.
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
const onInput = () => pausePlayback();
const onKey = (e) => { if (SCROLL_KEYS.has(e.key)) pausePlayback(); };

// A phone would otherwise dim and lock halfway through a film nobody is touching. Not available everywhere; that only
// costs this convenience.
async function holdScreen() {
  try { lock = await navigator.wakeLock?.request('screen'); } catch { lock = null; }
  if (!isPlaying()) { lock?.release?.().catch?.(() => {}); lock = null; }
}
const onVisible = () => { if (document.visibilityState === 'visible' && isPlaying()) holdScreen(); };

export function startPlayback() {
  if (isPlaying()) return;
  p = null;
  useUI.getState().set({ playing: true });
  gsap.ticker.add(tick);
  window.addEventListener('wheel', onInput, { passive: true });
  window.addEventListener('touchmove', onInput, { passive: true });
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisible);
  holdScreen();
}

export function pausePlayback() {
  if (!isPlaying()) return;
  useUI.getState().set({ playing: false });
  gsap.ticker.remove(tick);
  window.removeEventListener('wheel', onInput);
  window.removeEventListener('touchmove', onInput);
  window.removeEventListener('keydown', onKey);
  document.removeEventListener('visibilitychange', onVisible);
  lock?.release?.().catch?.(() => {});
  lock = null;
}
