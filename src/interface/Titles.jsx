import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { timeline } from '../experience/ExperienceController.js';
import { beginAgain } from '../experience/TransitionManager.js';

gsap.registerPlugin(useGSAP);

// The film's words, as few as possible. Each entry owns a window on the global progress axis; a second GSAP timeline
// with the same one-to-one mapping scrubs them, so type is as reversible as the picture. The lines come in the way a
// lens finds focus: out of a soft bloom, opening their spacing as they settle. Nothing slides, nothing is masked.
export const TITLES = [
  { id: 'hero', lines: ['from earth,', 'into the unknown.'], in: -1, hold: 0.0, out: 0.022, end: 0.036, cls: 't-hero' },
  { id: 'ignite', lines: ['leave the', 'ordinary.'], in: 0.106, hold: 0.122, out: 0.146, end: 0.158, cls: 't-right' },
  { id: 'climb', lines: ['the sky', 'runs out.'], in: 0.292, hold: 0.306, out: 0.326, end: 0.336, cls: 't-low' },
  { id: 'orbit', lines: ['the edge of', 'everything.'], in: 0.418, hold: 0.432, out: 0.472, end: 0.486, cls: 't-orbit' },
  { id: 'moon', lines: ['the oldest', 'quiet.'], in: 0.572, hold: 0.584, out: 0.606, end: 0.618, cls: 't-moon' },
  { id: 'beyond', lines: ['beyond the', 'familiar.'], in: 0.768, hold: 0.778, out: 0.796, end: 0.806, cls: 't-mid' },
  { id: 'nebula', lines: ['where the', 'maps stop.'], in: 0.812, hold: 0.822, out: 0.838, end: 0.848, cls: 't-center' },
  { id: 'gate', lines: ['someone', 'left a light on.'], in: 0.884, hold: 0.896, out: 0.914, end: 0.924, cls: 't-gate' },
];

function Lines({ lines }) {
  return lines.map((l, i) => <span className="tline" key={i} aria-hidden="true">{l}</span>);
}

const SOFT = 'blur(0.22em)', CLEAR = 'blur(0em)', GONE = 'blur(0.14em)';

function focusIn(tl, lines, start, span) {
  lines.forEach((line, i) => {
    const t0 = start + span * 0.26 * i, d = span * 0.74;
    tl.fromTo(line, { opacity: 0, filter: SOFT, letterSpacing: '0.055em' }, { opacity: 1, filter: CLEAR, letterSpacing: '-0.004em', duration: d, ease: 'power2.out' }, t0);
  });
}
function focusOut(tl, lines, start, span) {
  lines.forEach((line, i) => {
    const t0 = start + span * 0.14 * i, d = span * 0.86;
    tl.fromTo(line, { opacity: 1, filter: CLEAR, letterSpacing: '-0.004em' }, { opacity: 0, filter: GONE, letterSpacing: '0.03em', duration: d, ease: 'power1.in', immediateRender: false }, t0);
  });
}

export function buildTitleTimeline(root) {
  const tl = gsap.timeline({ paused: true, defaults: { immediateRender: false } });
  tl.set({}, {}, 1);
  for (const t of TITLES) {
    const el = root.querySelector(`[data-title="${t.id}"]`);
    const lines = el.querySelectorAll('.tline');
    gsap.set(el, { autoAlpha: t.in < 0 ? 1 : 0 });
    if (t.in >= 0) {
      gsap.set(lines, { opacity: 0, filter: SOFT });
      tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.001, ease: 'none' }, t.in);
      focusIn(tl, lines, t.in, t.hold - t.in);
    }
    focusOut(tl, lines, t.out, t.end - t.out);
    tl.fromTo(el, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.001, ease: 'none' }, t.end);
  }
  tl.progress(0);
  return tl;
}

export function Titles() {
  const root = useRef(null);
  const closingRef = useRef(null);

  useGSAP(() => {
    const tl = buildTitleTimeline(root.current);
    const closing = closingRef.current;
    const closeLine = closing.querySelectorAll('.tline');
    const closeTl = gsap.timeline({ paused: true, defaults: { immediateRender: false } });
    gsap.set(closing, { autoAlpha: 0 }); gsap.set(closeLine, { opacity: 0, filter: SOFT });
    closeTl.set({}, {}, 1);
    closeTl.fromTo(closing, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.001, ease: 'none' }, 0.978);
    focusIn(closeTl, closeLine, 0.978, 0.016);
    closeTl.fromTo(closing.querySelector('.begin'), { opacity: 0 }, { opacity: 1, duration: 0.006, ease: 'none' }, 0.99);
    closeTl.progress(0);
    const sync = () => { const p = timeline.progress(); tl.progress(p); closeTl.progress(p); closing.style.pointerEvents = p > 0.985 ? 'auto' : 'none'; };
    gsap.ticker.add(sync);
    return () => gsap.ticker.remove(sync);
  }, { scope: root });

  return (
    <div className="titles" ref={root}>
      {TITLES.map((t) => (
        <h2 key={t.id} className={`title ${t.cls}`} data-title={t.id} aria-label={t.lines.join(' ')}>
          <Lines lines={t.lines} />
        </h2>
      ))}
      <div className="closing" ref={closingRef}>
        <h2 className="title title--closing" aria-label="there is always further."><Lines lines={['there is always further.']} /></h2>
        <button type="button" className="begin" onClick={beginAgain}>begin again</button>
      </div>
    </div>
  );
}
