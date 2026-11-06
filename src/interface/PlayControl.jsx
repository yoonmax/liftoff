import { useEffect, useMemo, useState } from 'react';
import gsap from 'gsap';
import { timeline } from '../experience/ExperienceController.js';
import { isAtEnd, isPlaying, pausePlayback, startPlayback } from '../experience/Playback.js';
import { scrollToProgress } from '../experience/ScrollController.js';
import { beginAgain } from '../experience/TransitionManager.js';
import { useUI } from './useUI.js';

function toggle() {
  if (isPlaying()) { pausePlayback(); return; }
  if (!useUI.getState().ready) return;
  if (!isAtEnd()) { startPlayback(); return; }
  // From the last frame, play means from the beginning, through the same fade as begin again.
  if (useUI.getState().reduced) { scrollToProgress(0, { immediate: true }); startPlayback(); } else beginAgain({ thenPlay: true });
}

const Glyph = ({ playing }) => (
  <svg className="play-glyph" viewBox="0 0 10 10" aria-hidden="true">
    {playing ? <path d="M2 1h2v8H2zM6 1h2v8H6z" /> : <path d="M2 .8 9 5 2 9.2z" />}
  </svg>
);

/** The permanent control, in the top corner with sound and quality. Space does the same thing from anywhere. */
export function PlayToggle() {
  const playing = useUI((s) => s.playing);
  const held = useMemo(() => new URLSearchParams(location.search).has('p'), []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' || e.repeat || e.target.closest?.('button,a,input,select,textarea')) return;
      e.preventDefault(); // space would otherwise jump the page a whole screen further on
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (held) return null;
  return (
    <button type="button" className="tool tool--play" aria-label={playing ? 'pause the film' : 'play the film'} aria-keyshortcuts="Space" onClick={toggle}>
      <Glyph playing={playing} /> <b>{playing ? 'pause' : 'play'}</b>
    </button>
  );
}

/** The first thing on offer, under the opening title, for anyone who would rather just watch. */
export function PlayInvitation() {
  const playing = useUI((s) => s.playing);
  const reduced = useUI((s) => s.reduced);
  const [atStart, setAtStart] = useState(true);
  const held = useMemo(() => new URLSearchParams(location.search).has('p'), []);
  useEffect(() => {
    const tick = () => setAtStart((s) => { const want = timeline.progress() < 0.004; return s === want ? s : want; });
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);
  if (held || reduced) return null;
  const on = atStart && !playing;
  return (
    <button
      type="button" className={`play-invite${on ? '' : ' is-off'}`} tabIndex={on ? 0 : -1} aria-hidden={!on}
      onClick={() => { startPlayback(); document.querySelector('.tool--play')?.focus({ preventScroll: true }); }}
    >
      <Glyph playing={false} /> play the film
    </button>
  );
}
