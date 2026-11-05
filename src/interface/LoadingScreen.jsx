import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useUI } from './useUI.js';
import { Wordmark } from './Wordmark.jsx';

export function LoadingScreen() {
  const ready = useUI((s) => s.ready);
  const loaded = useUI((s) => s.loaded);
  const root = useRef(null);
  useEffect(() => {
    if (ready && root.current) gsap.to(root.current, { autoAlpha: 0, duration: 1.1, ease: 'power2.inOut' });
  }, [ready]);
  const pct = Math.round(loaded * 100);
  return (
    <div className="loader" ref={root} role="status" aria-live="polite" aria-label={ready ? 'ready' : `loading, ${pct} percent`}>
      <Wordmark size="large" />
      <svg className="loader__arc" viewBox="0 0 400 60" aria-hidden="true" preserveAspectRatio="none">
        <path d="M0 58 C 160 58, 300 44, 400 2" pathLength="100" className="loader__track" />
        <path d="M0 58 C 160 58, 300 44, 400 2" pathLength="100" className="loader__run" style={{ strokeDashoffset: 100 - pct }} />
      </svg>
      <span className="loader__pct">{String(pct).padStart(3, ' ')}</span>
    </div>
  );
}
