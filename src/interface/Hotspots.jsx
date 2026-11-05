import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import * as THREE from 'three';
import { frame, track, timeline } from '../experience/ExperienceController.js';
import { EARTH_R, GIANT_POS, GIANT_R } from '../camera/CameraController.js';
import { G } from '../experience/Uniforms.js';
import { interfaceBus } from './interfaceBus.js';
import { band } from '../animation/Interpolation.js';
import { scrollToProgress } from '../experience/ScrollController.js';
import { useUI } from './useUI.js';

// Small, optional moments of contact. Anything clickable is also a real button and works by keyboard or touch.
// A focus never edits progress: it adds a soft look towards the subject and lets go as soon as scrolling resumes.
const ROCKET_SPOTS = [
  { id: 'fairing', y: 71, a: 2.6, title: 'payload fairing', text: 'two halves, split along a pyrotechnic seam. inside: a probe in gold foil.', from: 0.0, to: 0.135 },
  { id: 'interstage', y: 50, a: 2.6, title: 'interstage', text: 'graphite composite. it hides the vacuum engine until separation.', from: 0.0, to: 0.135 },
  { id: 'gridfins', y: 44.8, a: 0.78, title: 'grid fins', text: 'folded for ascent, four titanium lattices that steer the first stage home.', from: 0.0, to: 0.135 },
  { id: 'tank', y: 27, a: 2.6, title: 'first stage', text: '41 metres of aluminium-lithium tank, frosted where the oxidiser sits.', from: 0.0, to: 0.135 },
  { id: 'engines', y: 1.6, a: 3.4, title: 'nine engines', text: 'eight in a ring around one, all gimballing as a cluster.', from: 0.0, to: 0.135 },
];

const v = new THREE.Vector3(), ray = new THREE.Vector3(), tmp = new THREE.Vector3();

function pointerRay(nx, ny, out) {
  out.set(nx * G.uTan.value.x, ny * G.uTan.value.y, -1).applyMatrix3(G.uCamRot.value).normalize();
  return out;
}
function raySphere(ro, rd, center, r) {
  tmp.copy(ro).sub(center);
  const b = tmp.dot(rd), c = tmp.lengthSq() - r * r, d = b * b - c;
  if (d < 0) return -1;
  const t = -b - Math.sqrt(d);
  return t > 0 ? t : -1;
}
const EARTH_O = new THREE.Vector3();
const pads = { lat: 28.6, lon: -80.6 };

function earthLabel(hit) {
  const n = hit.normalize();
  // Same frame as the shader: Y up at the pad, X east, Z south.
  const la = pads.lat * Math.PI / 180;
  const north = -n.z, up = n.y, east = n.x;
  const y = Math.sin(la) * up + Math.cos(la) * north;
  const lat = Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI;
  const x2 = Math.cos(la) * up - Math.sin(la) * north;
  let lon = Math.atan2(east, x2) * 180 / Math.PI + pads.lon;
  if (lon > 180) lon -= 360; if (lon < -180) lon += 360;
  return `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'n' : 's'}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'e' : 'w'}`;
}

/** What the pointer is over, if anything. */
function pick(nx, ny) {
  const p = frame.p;
  pointerRay(nx, ny, ray);
  if (p > 0.385 && p < 0.53) {
    const t = raySphere(frame.cosmos, ray, EARTH_O, EARTH_R);
    if (t > 0) { const hit = v.copy(frame.cosmos).addScaledVector(ray, t); return { kind: 'earth', title: 'earth', text: earthLabel(hit), dir: ray.clone() }; }
  }
  if (p > 0.56 && p < 0.65) {
    const t = raySphere(frame.cosmos, ray, EARTH_O, EARTH_R);
    if (t > 0) return { kind: 'earth', title: 'earth', text: 'from here, you can cover it with your thumb', dir: ray.clone() };
  }
  if (p > 0.67 && p < 0.84) {
    const t = raySphere(frame.cosmos, ray, GIANT_POS, GIANT_R);
    if (t > 0) return { kind: 'giant', title: 'an unnamed giant', text: 'hydrogen, helium, and weather older than continents', dir: ray.clone() };
  }
  return null;
}

export function focusOn(dir, strength = 1) {
  const f = interfaceBus.focus;
  f.dir = dir.clone();
  f.p0 = timeline.progress();
  gsap.to(f, { weight: strength, duration: 1.4, ease: 'power2.inOut', overwrite: true });
}
export function releaseFocus() {
  gsap.to(interfaceBus.focus, { weight: 0, duration: 1.2, ease: 'power2.inOut', overwrite: true });
}

export function Hotspots() {
  const refs = useRef({});
  const craterRef = useRef(null), portalRef = useRef(null), tipRef = useRef(null);
  const [tip, setTip] = useState(null);
  const [active, setActive] = useState(null);
  const reduced = useUI((s) => s.reduced);
  const inset = useUI((s) => s.inset);
  const set = useUI((s) => s.set);

  useEffect(() => {
    const local = new THREE.Vector3();
    const tick = () => {
      const p = timeline.progress(), cam = interfaceBus.camera;
      if (!cam) return;
      for (const s of ROCKET_SPOTS) {
        const el = refs.current[s.id]; if (!el) continue;
        const on = band(p, s.from - 0.01, s.from, s.to - 0.012, s.to);
        // Dots sit on the side of the vehicle facing the camera, slightly spread so they never stack.
        tmp.copy(frame.nearPos).sub(frame.rocketPos); tmp.y = 0; tmp.normalize();
        const ang = Math.atan2(tmp.z, tmp.x) + (s.a - 2) * 0.32;
        local.set(Math.cos(ang) * 3.3, s.y, Math.sin(ang) * 3.3).add(frame.rocketPos);
        local.project(cam);
        const front = local.z < 1 && Math.abs(local.x) < 0.98 && Math.abs(local.y) < 0.95;
        el.style.opacity = front ? on : 0;
        el.style.pointerEvents = front && on > 0.5 ? 'auto' : 'none';
        el.style.visibility = front && on > 0.01 ? 'visible' : 'hidden';
        el.style.transform = `translate3d(${(local.x * 0.5 + 0.5) * innerWidth}px, ${(0.5 - local.y * 0.5) * innerHeight}px, 0)`;
      }
      // A crater on the lunar pass: anchored in the sky of the shot, fixed offset from screen centre.
      if (craterRef.current) {
        const on = band(p, 0.578, 0.586, 0.606, 0.614);
        craterRef.current.style.opacity = on; craterRef.current.style.pointerEvents = on > 0.5 ? 'auto' : 'none';
        craterRef.current.style.visibility = on > 0.01 ? 'visible' : 'hidden';
        craterRef.current.style.transform = `translate3d(${innerWidth * 0.34}px, ${innerHeight * 0.74}px, 0)`;
      }
      if (portalRef.current) {
        const on = track.portal > 0.25 && p < 0.955 ? 1 : 0;
        portalRef.current.style.visibility = on ? 'visible' : 'hidden';
        portalRef.current.style.opacity = on;
        portalRef.current.style.transform = `translate3d(${innerWidth / 2}px, ${innerHeight / 2}px, 0)`;
      }
      // Let go of any focus once the journey moves on.
      const f = interfaceBus.focus;
      if (f.weight > 0 && Math.abs(p - f.p0) > 0.0018) { if (!f.releasing) { f.releasing = true; releaseFocus(); setActive(null); } } else f.releasing = false;
      if (useUI.getState().inset && (p < 0.57 || p > 0.62)) useUI.getState().set({ inset: null });
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);

  useEffect(() => {
    if (matchMedia('(hover: none)').matches) return undefined;
    let raf = 0;
    const move = (e) => {
      interfaceBus.pointer.set(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2);
      interfaceBus.pointerActive = true;
      interfaceBus.portalHover = 0;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (e.target?.closest?.('button,a,nav')) { setTip(null); return; }
        const hit = pick(interfaceBus.pointer.x, interfaceBus.pointer.y);
        setTip(hit ? { ...hit, x: e.clientX, y: e.clientY } : null);
      });
    };
    const click = (e) => {
      if (e.target.closest?.('button,a,nav')) return;
      const hit = pick(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2);
      if (hit && !reduced) focusOn(hit.dir, 0.8);
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('click', click);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('click', click); cancelAnimationFrame(raf); };
  }, [reduced]);

  return (
    <div className="spots">
      {ROCKET_SPOTS.map((s) => (
        <div key={s.id} ref={(el) => { refs.current[s.id] = el; }} className={`spot${active === s.id ? ' is-open' : ''}`}>
          <button
            type="button" className="spot__dot" aria-label={`${s.title}: ${s.text}`} aria-expanded={active === s.id}
            onClick={() => {
              if (active === s.id) { setActive(null); releaseFocus(); return; }
              setActive(s.id);
              if (!reduced) { const d = new THREE.Vector3(0, s.y, 0).add(frame.rocketPos).sub(frame.nearPos).normalize(); focusOn(d, 0.85); }
            }}
          />
          <div className="spot__card" aria-hidden="true"><b>{s.title}</b><span>{s.text}</span></div>
        </div>
      ))}
      <div ref={craterRef} className={`spot spot--crater${inset ? ' is-open' : ''}`}>
        <button type="button" className="spot__dot" aria-pressed={!!inset} aria-label={inset ? 'close the crater close-up' : 'look closer at this crater'} onClick={() => {
          if (inset) { set({ inset: null }); return; }
          // The ray through this dot, so the long lens looks at the terrain under it.
          set({ inset: { dir: pointerRay((innerWidth * 0.34) / innerWidth * 2 - 1, 1 - 0.74 * 2, new THREE.Vector3()).clone() } });
        }} />
        <div className="spot__card" aria-hidden="true"><b>{inset ? 'close' : 'look closer'}</b></div>
      </div>
      <div ref={portalRef} className="spot spot--portal" style={{ visibility: 'hidden' }}>
        <button
          type="button" className="portal-btn" aria-label="enter the gate"
          onPointerEnter={() => { interfaceBus.portalHover = 1; }} onPointerLeave={() => { interfaceBus.portalHover = 0; }}
          onClick={() => scrollToProgress(0.975, { duration: 3.4 })}
        ><span>enter</span></button>
      </div>
      {tip ? (
        <div className="cursor-tip" ref={tipRef} style={{ transform: `translate3d(${tip.x + 18}px, ${tip.y + 14}px, 0)` }} aria-hidden="true">
          <b>{tip.title}</b><span>{tip.text}</span>
        </div>
      ) : null}
      {inset ? <div className="inset-frame" role="img" aria-label="a magnified view of a crater on the lunar surface"><span>crater rim, low sun</span></div> : null}
    </div>
  );
}
