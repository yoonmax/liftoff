import { useEffect, useId, useRef, useState } from 'react';
import { QUALITY, TIERS, useQuality } from '../performance/QualityManager.js';

export function QualitySettings() {
  const tier = useQuality((s) => s.tier);
  const auto = useQuality((s) => s.auto);
  const setTier = useQuality((s) => s.setTier);
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (e.key === 'Escape' || (e.type === 'pointerdown' && !root.current?.contains(e.target))) setOpen(false); };
    window.addEventListener('keydown', close); window.addEventListener('pointerdown', close);
    return () => { window.removeEventListener('keydown', close); window.removeEventListener('pointerdown', close); };
  }, [open]);
  return (
    <div className="quality" ref={root}>
      <button type="button" className="tool" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        quality <b>{auto ? `auto, ${QUALITY[tier].label}` : QUALITY[tier].label}</b>
      </button>
      {open ? (
        <div className="quality__menu" id={id} role="group" aria-label="render quality">
          <button type="button" className={auto ? 'is-on' : ''} aria-pressed={auto} onClick={() => { setTier(tier, true); setOpen(false); }}>auto</button>
          {TIERS.map((t) => (
            <button type="button" key={t} className={!auto && t === tier ? 'is-on' : ''} aria-pressed={!auto && t === tier} onClick={() => { setTier(t, false); setOpen(false); }}>{QUALITY[t].label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
