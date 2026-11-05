import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { CHAPTERS } from '../experience/ChapterRegistry.js';
import { timeline } from '../experience/ExperienceController.js';
import { interfaceBus } from './interfaceBus.js';
import { useUI } from './useUI.js';

// For people who asked their system for less motion: the film becomes seven held frames. Scrolling or the chapter
// list moves between them through a short fade, and nothing on screen travels. Stills are chosen for their picture.
export function ReducedPresentation() {
  const [index, setIndex] = useState(0);
  const current = useRef(0);
  const set = useUI((s) => s.set);
  useEffect(() => {
    const show = (i, instant) => {
      current.current = i; setIndex(i); set({ chapter: CHAPTERS[i].id });
      const apply = () => timeline.progress(CHAPTERS[i].still, true);
      if (instant) { apply(); return; }
      gsap.to(interfaceBus, { veil: 1, duration: 0.28, ease: 'none', overwrite: true, onComplete() { apply(); gsap.to(interfaceBus, { veil: 0, duration: 0.42, ease: 'none' }); } });
    };
    show(0, true);
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const i = Math.min(CHAPTERS.length - 1, Math.floor(window.scrollY / Math.max(1, max) * CHAPTERS.length));
      if (i !== current.current) show(i, false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [set]);
  const c = CHAPTERS[index];
  return (
    <div className="reduced" aria-live="polite">
      <p><b>{c.n}, {c.name}</b>{c.summary}</p>
    </div>
  );
}
