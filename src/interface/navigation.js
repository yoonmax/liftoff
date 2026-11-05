import { chapterById, chapterEntry, CHAPTERS } from '../experience/ChapterRegistry.js';
import { scrollToProgress } from '../experience/ScrollController.js';
import { useUI } from './useUI.js';

let applyingHistory = false;

export function goToChapter(id, { push = true } = {}) {
  const c = chapterById(id);
  if (!c) return;
  const state = useUI.getState();
  if (state.reduced) {
    // The reduced presentation gives each chapter an equal slice of the page.
    const max = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo(0, ((CHAPTERS.indexOf(c) + 0.5) / CHAPTERS.length) * max);
  } else {
    scrollToProgress(chapterEntry(c));
  }
  if (push && !applyingHistory) history.pushState({ chapter: id }, '', id === 'prelaunch' ? location.pathname + location.search : `#${id}`);
}

/** Browser back and forward travel between visited chapters. */
export function bindHistory() {
  const onPop = () => {
    const id = location.hash.slice(1) || 'prelaunch';
    if (!chapterById(id)) return;
    applyingHistory = true;
    goToChapter(id, { push: false });
    applyingHistory = false;
  };
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}

export function initialFromHash() {
  const id = location.hash.slice(1);
  return CHAPTERS.find((c) => c.id === id) ?? null;
}
