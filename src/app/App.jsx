import { useEffect, useMemo, useRef } from 'react';
import { SceneCanvas } from './SceneCanvas.jsx';
import { bindScroll, savedProgress, scrollToProgress } from '../experience/ScrollController.js';
import { CHAPTERS, chapterEntry } from '../experience/ChapterRegistry.js';
import { timeline, track, frame } from '../experience/ExperienceController.js';
import { loadStage, stagesFor } from '../performance/AssetPreloader.js';
import { useUI } from '../interface/useUI.js';
import { HUD } from '../interface/HUD.jsx';
import { Titles } from '../interface/Titles.jsx';
import { Hotspots } from '../interface/Hotspots.jsx';
import { LoadingScreen } from '../interface/LoadingScreen.jsx';
import { bindHistory, initialFromHash } from '../interface/navigation.js';
import { ReducedPresentation } from '../interface/ReducedPresentation.jsx';
import { Fallback } from '../interface/Fallback.jsx';
import { useQuality, initialTier } from '../performance/QualityManager.js';

function webglInfo() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const info = { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '' };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return info;
  } catch { return null; }
}

export function App() {
  const spacer = useRef(null);
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const reduced = useMemo(() => params.has('reduced') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [params]);
  const gl = useMemo(() => (params.has('nowebgl') ? null : webglInfo()), [params]);
  const set = useUI((s) => s.set);
  const chapter = useUI((s) => s.chapter);
  const fixed = params.get('p');

  useEffect(() => {
    set({ reduced });
    const forced = params.get('tier');
    if (forced) useQuality.getState().setTier(forced, false);
    else useQuality.getState().setTier(initialTier({ isMobile: matchMedia('(pointer: coarse)').matches, memory: navigator.deviceMemory, cores: navigator.hardwareConcurrency, renderer: gl?.renderer }), true);
  }, [set, reduced, params, gl]);

  // Scroll is bound first so a restored position is known before anything loads.
  useEffect(() => {
    if (!gl) return undefined;
    if (fixed !== null) { timeline.progress(parseFloat(fixed), true); return undefined; }
    if (reduced) return undefined;
    history.scrollRestoration = 'manual';
    const off = bindScroll(spacer.current);
    const saved = savedProgress();
    const from = initialFromHash();
    if (saved !== null) scrollToProgress(saved, { immediate: true });
    else if (from) scrollToProgress(chapterEntry(from), { immediate: true });
    const unhistory = bindHistory();
    return () => { off(); unhistory(); };
  }, [gl, fixed, reduced]);

  // Load what the current position needs, then let the rest follow in the background.
  useEffect(() => {
    if (!gl) return;
    window.__liftoff = { timeline, track, frame, scenes: {}, seek: (p) => { timeline.progress(p, true); } };
    let cancelled = false;
    const start = timeline.progress();
    document.fonts.load('300 64px "Jost Variable"').catch(() => {}).finally(() => {
      loadStage(stagesFor(start), null, (x) => { if (!cancelled) set({ loaded: Math.min(0.92, x * 0.92) }); }).then(() => {
        if (cancelled) return;
        set({ loaded: 1, assetsReady: true });
        loadStage(['critical', 'orbit', 'lunar'], null).then(() => { if (!cancelled) set({ allAssets: true }); });
      }).catch((e) => { console.error(e); set({ loaded: 1, assetsReady: true }); });
    });
    return () => { cancelled = true; };
  }, [gl, set]);

  if (!gl) return <Fallback />;
  return (
    <>
      <a className="skip" href="#chapters">skip to the chapter list</a>
      <h1 className="sr-only">liftoff, a scroll-driven film from a launchpad on Earth to the edge of the unknown</h1>
      <SceneCanvas />
      {reduced ? null : <Titles />}
      <HUD />
      <Hotspots />
      <LoadingScreen />
      <div ref={spacer} className="spacer" id="top" />
      {reduced ? <ReducedPresentation /> : null}
      <nav id="chapters" className="sr-only" aria-label="chapter summaries">
        <ol>{CHAPTERS.map((c) => <li key={c.id}><button type="button" onClick={() => document.querySelector(`.tick[aria-label*="${c.name}"]`)?.click()}>{c.n}, {c.name}: {c.summary}</button></li>)}</ol>
      </nav>
      <p className="sr-only" aria-live="polite">{`chapter ${chapter}: ${CHAPTERS.find((c) => c.id === chapter)?.summary ?? ''}`}</p>
      <ReadyMark />
    </>
  );
}

function ReadyMark() {
  const ready = useUI((s) => s.ready);
  const all = useUI((s) => s.allAssets);
  return <>{ready ? <span data-testid="scene-ready" hidden /> : null}{ready && all ? <span data-testid="ready" hidden /> : null}</>;
}
