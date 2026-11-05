import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { timeline } from './ExperienceController.js';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
ScrollTrigger.config({ ignoreMobileResize: true });

let trigger = null;

/** Binds the page's scroll range to the timeline. Numeric scrub keeps the motion smooth and responsive. */
export function bindScroll(spacer, { scrub = 0.42 } = {}) {
  trigger = ScrollTrigger.create({ trigger: spacer, start: 'top top', end: 'bottom bottom', animation: timeline, scrub });
  // Take up a restored scroll position at once, so a reload never replays the film from the start.
  ScrollTrigger.refresh();
  timeline.progress(trigger.progress, true);

  // The scroll range is measured in viewport units, so changing the window size changes what a pixel of scroll
  // means. Hold the journey still across a resize by keeping progress, not pixels.
  // Progress is tracked from scroll events at the current size, because ScrollTrigger reverts the page to its top
  // while it recalculates and would otherwise report zero.
  let w = innerWidth, h = innerHeight, held = trigger.progress;
  let saveTimer = 0;
  const track = () => {
    if (innerWidth !== w || innerHeight !== h) return;
    held = window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
    if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = 0; rememberProgress(held); }, 200);
  };
  const after = () => {
    if (innerWidth === w && innerHeight === h) return;
    w = innerWidth; h = innerHeight;
    window.scrollTo(0, held * scrollMax());
    ScrollTrigger.update();
    timeline.progress(held, true);
  };
  window.addEventListener('scroll', track, { passive: true });
  ScrollTrigger.addEventListener('refresh', after);
  return () => {
    window.removeEventListener('scroll', track);
    clearTimeout(saveTimer);
    ScrollTrigger.removeEventListener('refresh', after);
    trigger?.kill(); trigger = null;
  };
}

const scrollMax = () => ScrollTrigger.maxScroll(window);

// A reload returns to the same moment of the film. The browser's own restoration can't do this reliably, because
// the page isn't tall enough until the app has started. Storage may be unavailable, and that only costs the feature.
const KEY = 'liftoff:progress';
export function savedProgress() {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav || (nav.type !== 'reload' && nav.type !== 'back_forward')) return null;
    const v = parseFloat(sessionStorage.getItem(KEY));
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}
function rememberProgress(p) {
  try { sessionStorage.setItem(KEY, p.toFixed(5)); } catch { /* private mode */ }
}

export const progressToY = (p) => p * scrollMax();

export function scrollToProgress(p, { duration, immediate = false, onComplete } = {}) {
  const y = progressToY(p);
  if (immediate) {
    window.scrollTo(0, y);
    trigger?.update?.();
    timeline.progress(p, true);
    onComplete?.();
    return null;
  }
  const dist = Math.abs(timeline.progress() - p);
  const d = duration ?? Math.min(2.8, 0.9 + dist * 5);
  return gsap.to(window, { scrollTo: { y, autoKill: true }, duration: d, ease: 'power2.inOut', onComplete, overwrite: 'auto' });
}
