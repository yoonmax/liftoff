import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { CHAPTERS, chapterAt } from '../experience/ChapterRegistry.js';
import { timeline } from '../experience/ExperienceController.js';
import { readouts } from '../experience/MissionProfile.js';
import { useUI } from './useUI.js';
import { Wordmark } from './Wordmark.jsx';
import { QualitySettings } from './QualitySettings.jsx';
import { SoundToggle } from './SoundToggle.jsx';
import { goToChapter } from './navigation.js';

export function ProgressIndicator() {
  const fill = useRef(null);
  const current = useUI((s) => s.chapter);
  useEffect(() => {
    const tick = () => { if (fill.current) fill.current.style.transform = `scaleY(${timeline.progress().toFixed(4)})`; };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);
  return (
    <nav className="rail" aria-label="chapters">
      <div className="rail__line" aria-hidden="true"><div className="rail__fill" ref={fill} /></div>
      <ol>
        {CHAPTERS.map((c) => (
          <li key={c.id} style={{ top: `${c.start * 100}%` }}>
            <button type="button" className={`tick${current === c.id ? ' is-on' : ''}`} onClick={() => goToChapter(c.id)} aria-current={current === c.id ? 'step' : undefined} aria-label={`chapter ${c.n}, ${c.name}`}>
              <span className="tick__mark" aria-hidden="true" />
              <span className="tick__label" aria-hidden="true"><i>{c.n}</i> {c.name}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function ChapterIndicator() {
  const chapter = useUI((s) => s.chapter);
  const c = CHAPTERS.find((x) => x.id === chapter);
  const a = useRef(null), b = useRef(null), cc = useRef(null), root = useRef(null);
  useEffect(() => {
    let last = '';
    const tick = () => {
      const p = timeline.progress();
      const r = readouts(p);
      const key = r.a[1] + r.b[1] + r.c[1];
      if (key !== last && a.current) {
        last = key;
        a.current.textContent = r.a[1]; b.current.textContent = r.b[1]; cc.current.textContent = r.c[1];
      }
      const next = chapterAt(p).id;
      if (useUI.getState().chapter !== next) useUI.getState().set({ chapter: next });
      if (root.current) { root.current.classList.toggle('is-quiet', p > 0.94); root.current.classList.toggle('is-under-way', p > 0.1); }
      document.documentElement.classList.toggle('in-white', p > 0.942 && p < 0.981);
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);
  return (
    <div className="dock" ref={root}>
      <div className="dock__chapter">
        <span className="dock__n" key={c.n}>{c.n}</span>
        <span className="dock__name" key={c.name}>{c.name}</span>
      </div>
      <dl className="dock__data" aria-label="fictional mission profile">
        <div><dt>altitude</dt><dd ref={a}>0 km</dd></div>
        <div><dt>velocity</dt><dd ref={b}>0 km/s</dd></div>
        <div><dt>clock</dt><dd ref={cc}>t− 10:00</dd></div>
      </dl>
      <p className="dock__note">fictional mission profile, lf-1 meridian</p>
    </div>
  );
}

function ScrollHint() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const tick = () => setShow((s) => { const want = timeline.progress() < 0.004; return s === want ? s : want; });
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);
  return (
    <div className={`hint${show ? '' : ' is-off'}`} aria-hidden={!show}>
      <span>scroll to begin the countdown</span>
      <i aria-hidden="true" />
    </div>
  );
}

export function HUD() {
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input,select,textarea')) return;
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const p = timeline.progress();
      const i = CHAPTERS.indexOf(chapterAt(p));
      const n = e.key === 'ArrowRight' ? Math.min(CHAPTERS.length - 1, i + 1) : Math.max(0, p > CHAPTERS[i].start + 0.012 ? i : i - 1);
      goToChapter(CHAPTERS[n].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="hud">
      <a className="brand" href="#top" onClick={(e) => { e.preventDefault(); goToChapter('prelaunch'); }} aria-label="liftoff, back to the launchpad"><Wordmark /></a>
      <div className="tools">
        <SoundToggle />
        <QualitySettings />
      </div>
      <ProgressIndicator />
      <ChapterIndicator />
      <ScrollHint />
    </div>
  );
}
