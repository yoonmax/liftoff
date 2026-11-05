import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stageOneMaps, upperMaps, boosterMaps, foilMaps, solarMaps } from './textures.js';

// lf-1 "meridian": a fictional heavy-lift vehicle. y is metres above the engine exits.
//   0.0 - 3.0  nine-engine cluster
//   3.0 - 47   first stage     r = 3.05
//  47.0 - 53   interstage (hides the vacuum nozzle of the upper stage)
//  53.0 - 64   second stage
//  64.0 - 78   payload fairing, with a gold-foil probe inside
//   z = +-5.1  two strap-on boosters, 39 m tall, dropped on the way up
export const R = 3.05;
export const BOOSTER_Z = 5.1;
export const BOOSTER_R = 1.62;
export const BOOSTER_PIVOT = 22;

const box = (w, h, d, x = 0, y = 0, z = 0, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
const cyl = (r0, r1, h, x = 0, y = 0, z = 0, seg = 12, open = false) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, open); g.translate(x, y, z); return g; };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const beamBetween = (a, b, t, seg = 8) => {
  const d = new THREE.Vector3().subVectors(b, a), l = d.length();
  const g = new THREE.CylinderGeometry(t, t, l, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
};
const merge = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map(strip), false);
function strip(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

/** Lathe with u around the axis and v derived from height, mapping paint directly to metres. */
function lathe(points, seg, y0, y1, phiStart = 0, phiLength = Math.PI * 2) {
  const g = new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), seg, phiStart, phiLength);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - y0) / (y1 - y0));
  uv.needsUpdate = true;
  return g;
}
const ringed = (r, a, b, n) => { const out = []; for (let i = 0; i <= n; i++) out.push([r, a + (b - a) * i / n]); return out; };
/** A flat ring frame standing slightly proud of the skin. Square section, so it throws a crisp shadow line. */
const frame = (r, y, depth = 0.05, height = 0.14, seg = 96) => new THREE.LatheGeometry([[r - 0.02, y - height / 2], [r + depth, y - height / 2], [r + depth, y + height / 2], [r - 0.02, y + height / 2]].map((p) => new THREE.Vector2(p[0], p[1])), seg);

/** Haack ogive: the low-drag curve real noses are drawn from, rather than a rounded cone. */
function ogive(r0, y0, y1, n = 40, tipR = 0.1) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = 1 - t, th = Math.acos(1 - 2 * x);
    out.push([Math.max(tipR, r0 * Math.sqrt((th - Math.sin(2 * th) / 2) / Math.PI)), y0 + (y1 - y0) * t]);
  }
  return out;
}

function nozzle(ex, h, throat = 0.34) {
  const outer = [], inner = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22, r = throat + (ex - throat) * Math.pow(t, 0.62);
    outer.push(new THREE.Vector2(r + 0.03, h * (1 - t)));
    inner.push(new THREE.Vector2(r - 0.01, h * (1 - t)));
  }
  return { outer: new THREE.LatheGeometry(outer, 32), inner: new THREE.LatheGeometry(inner.reverse(), 32), radius: (t) => throat + (ex - throat) * Math.pow(t, 0.62) };
}

function engineCluster() {
  const metal = [], burnt = [], inner = [];
  const positions = [[0, 0]];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; positions.push([Math.cos(a) * 2.16, Math.sin(a) * 2.16]); }
  for (const [x, z] of positions) {
    const n = nozzle(0.78, 2.3, 0.3);
    n.outer.translate(x, 0, z); n.inner.translate(x, 0, z);
    burnt.push(n.outer); inner.push(n.inner);
    // Regeneratively cooled bell: a stack of hoop stiffeners on the outside of the wall.
    for (let k = 0; k < 7; k++) { const t = 0.12 + k * 0.13, y = 2.3 * (1 - t), r = n.radius(t) + 0.03; const tr = new THREE.TorusGeometry(r, 0.016 + (k === 0 ? 0.016 : 0), 6, 32); tr.rotateX(Math.PI / 2); tr.translate(x, y, z); burnt.push(tr); }
    // Turbopump, combustion chamber, gimbal block and the plumbing between them
    metal.push(cyl(0.3, 0.26, 0.42, x, 2.46, z, 16));
    metal.push(cyl(0.14, 0.14, 0.3, x, 2.82, z, 10));
    metal.push(cyl(0.17, 0.17, 0.62, x + 0.36, 2.5, z + 0.1, 12));
    metal.push(cyl(0.11, 0.11, 0.46, x - 0.3, 2.42, z - 0.24, 10));
    metal.push(beamBetween(V3(x + 0.36, 2.2, z + 0.1), V3(x + 0.12, 1.48, z + 0.28), 0.04));
    metal.push(beamBetween(V3(x - 0.3, 2.2, z - 0.24), V3(x - 0.4, 1.2, z - 0.1), 0.03));
    metal.push(beamBetween(V3(x + 0.28, 2.76, z - 0.3), V3(x + 0.05, 2.12, z), 0.05));
    metal.push(beamBetween(V3(x - 0.34, 2.68, z + 0.26), V3(x - 0.06, 2.1, z + 0.05), 0.035));
    // gimbal actuators
    metal.push(beamBetween(V3(x + 0.1, 2.95, z + 0.46), V3(x + 0.26, 1.56, z + 0.22), 0.03));
    metal.push(beamBetween(V3(x - 0.46, 2.95, z + 0.1), V3(x - 0.24, 1.56, z + 0.1), 0.03));
  }
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    metal.push(beamBetween(V3(0, 2.8, 0), V3(Math.cos(a) * 3.0, 2.92, Math.sin(a) * 3.0), 0.07));
  }
  // Thermal blanket, quilted by a grid of straps
  const plate = new THREE.CircleGeometry(3.34, 56); plate.rotateX(Math.PI / 2); plate.translate(0, 2.98, 0); burnt.push(plate);
  for (let i = -6; i <= 6; i++) { burnt.push(box(6.4, 0.024, 0.03, 0, 2.965, i * 0.5)); burnt.push(box(0.03, 0.024, 6.4, i * 0.5, 2.965, 0)); }
  return { metal: merge(metal), burnt: merge(burnt), inner: merge(inner) };
}

function gridFin() {
  const parts = [], W = 2.2, H = 1.7, T = 0.34, cols = 9, rows = 7;
  for (let i = 0; i <= cols; i++) { const x = -W / 2 + W * i / cols; const g = box(0.028, T, H * 1.42, x, 0, 0); g.rotateY(Math.PI / 4); parts.push(g); }
  for (let i = 0; i <= rows; i++) { const x = -W / 2 + W * i / rows; const g = box(0.028, T, H * 1.42, x, 0, 0); g.rotateY(-Math.PI / 4); parts.push(g); }
  const g = merge(parts).clone();
  const frameParts = [box(W + 0.14, T, 0.07, 0, 0, H / 2), box(W + 0.14, T, 0.07, 0, 0, -H / 2), box(0.07, T, H, W / 2, 0, 0), box(0.07, T, H, -W / 2, 0, 0), box(0.5, 0.3, 0.3, 0, 0, -H / 2 - 0.12)];
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, Math.max(-W / 2, Math.min(W / 2, pos.getX(i))));
    pos.setZ(i, Math.max(-H / 2, Math.min(H / 2, pos.getZ(i))));
  }
  return merge([g, ...frameParts]);
}

function placedAround(geo, n, radius, y, offset = 0, face = true) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + offset, g = geo.clone();
    if (face) g.rotateY(-a);
    g.translate(Math.cos(a) * radius, y, Math.sin(a) * radius);
    out.push(g);
  }
  return out;
}

/** A flat service plate on the skin, facing the tower, with quick-disconnect barrels. */
function umbilicalPlate(y, angle, list) {
  const rr = R + 0.05, x = Math.cos(angle) * rr, z = Math.sin(angle) * rr;
  const p = box(0.16, 1.5, 1.1); p.rotateY(-angle); p.translate(x, y, z); list.push(p);
  for (const [dy, dz] of [[-0.36, -0.26], [-0.36, 0.26], [0.1, -0.26], [0.1, 0.26], [0.48, 0]]) {
    const c = new THREE.CylinderGeometry(0.075, 0.075, 0.3, 10); c.rotateZ(Math.PI / 2); c.translate(0.14, dy, dz); c.rotateY(-angle); c.translate(x, y, z); list.push(c);
  }
}

function buildBooster(paint, steel, burnt, inner, carbon, side) {
  const g = new THREE.Group(), r = BOOSTER_R;
  const body = lathe([[r, 2.3], ...ringed(r, 2.6, 33.4, 12), ...ogive(r, 33.4, 39, 30, 0.04)], 48, 2, 39);
  g.add(new THREE.Mesh(body, paint));
  const hard = [];
  for (const y of [4, 10, 16, 22, 28, 33.4]) hard.push(frame(r, y, 0.04, 0.18, 48));
  // A skirt that flares around the single large nozzle
  hard.push(lathe([[r + 0.3, 1.9], [r + 0.18, 2.6], [r + 0.02, 4]], 48, 2, 39));
  // Systems tunnel on the outboard face, and the thrust vector actuator housing
  const out = side;
  for (let y = 6; y < 33; y += 2.4) hard.push(box(0.6, 0.08, 0.18, 0, y, out * (r + 0.14)));
  g.add(new THREE.Mesh(merge(hard), steel));
  g.add(new THREE.Mesh(box(0.42, 28, 0.16, 0, 19.4, out * (r + 0.06)), carbon));
  const n = nozzle(1.18, 2.6, 0.5);
  g.add(new THREE.Mesh(merge([n.outer, ...[0.2, 0.34, 0.5, 0.66, 0.82].map((t) => { const tr = new THREE.TorusGeometry(n.radius(t) + 0.03, 0.02, 6, 36); tr.rotateX(Math.PI / 2); tr.translate(0, 2.6 * (1 - t), 0); return tr; })]), burnt));
  g.add(new THREE.Mesh(n.inner, inner));
  // Small separation motors that fire at staging, each a dark nozzle near the nose and tail
  const sep = [];
  for (const y of [5.2, 34.2]) for (const a of [-0.8, 0, 0.8]) { const c = new THREE.CylinderGeometry(0.06, 0.1, 0.2, 10); c.rotateX(side * Math.PI / 2); c.translate(Math.sin(a) * (r + 0.02), y, side * Math.cos(a) * (r + 0.02)); sep.push(c); }
  g.add(new THREE.Mesh(merge(sep), carbon));
  return g;
}

export function buildRocket() {
  const m1 = stageOneMaps(), m2 = upperMaps(), mb = boosterMaps(), foil = foilMaps(), solar = solarMaps();
  const paint1 = new THREE.MeshStandardMaterial({ ...m1, metalness: 1, roughness: 1 });
  const paint2 = new THREE.MeshStandardMaterial({ ...m2, metalness: 1, roughness: 1 });
  const paintB = new THREE.MeshStandardMaterial({ ...mb, metalness: 1, roughness: 1 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.48, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.4, metalness: 0.96 });
  const burnt = new THREE.MeshStandardMaterial({ color: 0x3f3731, roughness: 0.46, metalness: 0.94 });
  const titanium = new THREE.MeshStandardMaterial({ color: 0x38383a, roughness: 0.46, metalness: 0.9 });
  const nozzleInner = new THREE.MeshStandardMaterial({ color: 0x16120f, roughness: 0.7, metalness: 0.4, emissive: new THREE.Color(1, 0.46, 0.14), emissiveIntensity: 0 });
  const niobium = new THREE.MeshStandardMaterial({ color: 0x6a6a72, roughness: 0.26, metalness: 0.98, side: THREE.DoubleSide });
  const vacInner = new THREE.MeshStandardMaterial({ color: 0x18141a, roughness: 0.7, emissive: new THREE.Color(0.6, 0.7, 1), emissiveIntensity: 0, side: THREE.BackSide });
  const gold = new THREE.MeshStandardMaterial({ ...foil, color: 0xffffff, metalness: 1, roughness: 0.27, bumpScale: 2.2 });
  const white = new THREE.MeshStandardMaterial({ color: 0xdfe0dc, roughness: 0.42, metalness: 0.1 });
  const cells = new THREE.MeshStandardMaterial({ ...solar, metalness: 0.4, roughness: 1 });
  const fairingIn = new THREE.MeshStandardMaterial({ color: 0x8e8c84, roughness: 0.7, side: THREE.BackSide });

  // ---- first stage
  const skirt = lathe([[3.46, 3.0], [3.38, 3.3], [3.2, 5.0], [3.05, 6.2]], 128, 3, 53);
  const tank = lathe([[R, 6.2], ...ringed(R, 6.8, 46.8, 22), [R, 47]], 128, 3, 53);
  const inter = lathe([[R, 47], ...ringed(R, 47.4, 52.8, 6), [R, 53]], 128, 3, 53);
  const stageOnePaint = merge([skirt, tank, inter]);

  const hardware = [], darkware = [];
  for (let y = 6.2; y < 47; y += 5.1) hardware.push(frame(R, y, 0.035, 0.12, 128));
  hardware.push(frame(R, 47, 0.06, 0.2, 128), frame(R, 53, 0.06, 0.2, 128));
  // Aft skirt stiffeners follow the flare, so the base is never a smooth cone.
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    hardware.push(beamBetween(V3(c * 3.45, 3.05, s * 3.45), V3(c * 3.09, 6.15, s * 3.09), 0.022, 4));
  }
  // The intertank: real corrugation, 120 hat-section ribs between the propellant tanks
  for (let i = 0; i < 120; i++) {
    const a = i / 120 * Math.PI * 2;
    const g = box(0.09, 3.4, 0.05); g.rotateY(-a + Math.PI / 2); g.translate(Math.cos(a) * (R + 0.02), 29.65, Math.sin(a) * (R + 0.02)); darkware.push(g);
  }
  hardware.push(frame(R, 27.95, 0.05, 0.16, 128), frame(R, 31.35, 0.05, 0.16, 128));

  const raceways = [], brackets = [];
  for (const a of [0.34, Math.PI + 0.34]) {
    const rr = R + 0.09, x = Math.cos(a), z = Math.sin(a);
    const g = box(0.58, 40.6, 0.12); g.rotateY(-a + Math.PI / 2); g.translate(x * (rr - 0.03), 26.6, z * (rr - 0.03)); raceways.push(g);
    const g2 = box(0.38, 40.6, 0.16); g2.rotateY(-a + Math.PI / 2); g2.translate(x * (rr + 0.04), 26.6, z * (rr + 0.04)); raceways.push(g2);
    for (let y = 7.4; y < 46.5; y += 1.3) { const b = box(0.66, 0.05, 0.3); b.rotateY(-a + Math.PI / 2); b.translate(x * (rr + 0.01), y, z * (rr + 0.01)); brackets.push(b); }
  }
  // Oxidiser feed: a big external line with flanged joints and clamps, plus a thinner pressurisation line
  const pipes = [];
  { const a = 2.1, rr = R + 0.2, x = Math.cos(a), z = Math.sin(a); pipes.push(cyl(0.17, 0.17, 24.4, x * rr, 18.8, z * rr, 14)); for (let y = 7.6; y < 31; y += 3.4) { pipes.push(cyl(0.22, 0.22, 0.09, x * rr, y, z * rr, 14)); const c = box(0.5, 0.06, 0.28); c.rotateY(-a + Math.PI / 2); c.translate(x * (rr - 0.14), y + 0.4, z * (rr - 0.14)); pipes.push(c); } }
  { const a = 4.5, rr = R + 0.1, x = Math.cos(a), z = Math.sin(a); pipes.push(cyl(0.06, 0.06, 38, x * rr, 27, z * rr, 8)); for (let y = 9; y < 45; y += 2.6) pipes.push(cyl(0.085, 0.085, 0.06, x * rr, y, z * rr, 8)); }
  { const a = 5.6, rr = R + 0.08, x = Math.cos(a), z = Math.sin(a); pipes.push(cyl(0.04, 0.04, 30, x * rr, 30, z * rr, 6)); }
  // Umbilical plates face the tower, at the height each service arm meets the vehicle
  for (const y of [16, 44]) umbilicalPlate(y, -0.2, pipes);

  const gridFins = placedAround(gridFin().rotateX(Math.PI / 2), 4, R + 0.28, 44.8, Math.PI / 4);
  const gridHinges = placedAround(box(0.42, 0.5, 0.7), 4, R + 0.12, 44.0, Math.PI / 4);
  const thrusters = placedAround(cyl(0.22, 0.3, 0.42).rotateZ(Math.PI / 2), 4, R + 0.1, 49.8, 0);
  const thrusterNoz = placedAround(cyl(0.05, 0.11, 0.2).rotateZ(-Math.PI / 2), 4, R + 0.4, 49.8, 0);
  // Booster attach points: an aft thrust beam and a forward ball joint, which stay with the core after staging.
  const attach = [];
  for (const s of [1, -1]) {
    for (const y of [6.4, 31]) { attach.push(box(1.1, 0.5, 0.38, 0, y, s * (R + 0.2))); }
    attach.push(beamBetween(V3(0.7, 6.4, s * (R + 0.1)), V3(0.3, 8.6, s * (R + 0.02)), 0.07));
    attach.push(beamBetween(V3(-0.7, 6.4, s * (R + 0.1)), V3(-0.3, 8.6, s * (R + 0.02)), 0.07));
  }
  const cluster = engineCluster();

  const stage1 = new THREE.Group();
  stage1.add(new THREE.Mesh(stageOnePaint, paint1));
  stage1.add(new THREE.Mesh(merge([...hardware, ...brackets, ...pipes, ...attach]), steel));
  stage1.add(new THREE.Mesh(merge(raceways), new THREE.MeshStandardMaterial({ color: 0x8c8a82, roughness: 0.62, metalness: 0.1 })));
  stage1.add(new THREE.Mesh(merge([...gridFins, ...gridHinges]), titanium));
  stage1.add(new THREE.Mesh(merge([...thrusters, ...thrusterNoz, ...darkware]), carbon));
  stage1.add(new THREE.Mesh(cluster.metal, steel));
  stage1.add(new THREE.Mesh(cluster.burnt, burnt));
  stage1.add(new THREE.Mesh(cluster.inner, nozzleInner));

  // ---- strap-on boosters, each in a pivot group so it can tip away about its own middle
  const boosters = [1, -1].map((s) => {
    const pivot = new THREE.Group();
    const body = buildBooster(paintB, steel, burnt, nozzleInner, carbon, s);
    body.position.y = -BOOSTER_PIVOT;
    pivot.add(body);
    pivot.position.set(0, BOOSTER_PIVOT, s * BOOSTER_Z);
    return { side: s, pivot };
  });
  // Struts that hold the boosters on: part of each booster, so they leave with it.
  for (const b of boosters) {
    const s = b.side, struts = [];
    const near = -s * (BOOSTER_Z - R - 0.3); // towards the core, in the booster's frame
    for (const dx of [-0.34, 0.34]) struts.push(beamBetween(V3(dx, 6.4 - BOOSTER_PIVOT, near), V3(dx * 1.6, 8.2 - BOOSTER_PIVOT, -s * (BOOSTER_R - 0.02)), 0.09));
    struts.push(beamBetween(V3(0, 31 - BOOSTER_PIVOT, near), V3(0, 31 - BOOSTER_PIVOT, -s * (BOOSTER_R - 0.02)), 0.15));
    struts.push(beamBetween(V3(0.5, 30 - BOOSTER_PIVOT, near), V3(0.3, 32 - BOOSTER_PIVOT, -s * (BOOSTER_R - 0.02)), 0.05));
    b.pivot.add(new THREE.Mesh(merge(struts), steel));
  }

  // ---- second stage, with the vacuum engine that stays hidden until separation
  const upper = new THREE.Group();
  const s2tank = lathe([[R, 53.5], ...ringed(R, 54, 63.6, 8), [R, 64]], 128, 53, 78);
  upper.add(new THREE.Mesh(s2tank, paint2));
  const dome = lathe([[0.01, 52.2], [1.2, 52.32], [2.2, 52.74], [2.85, 53.28], [R, 53.5]], 64, 53, 78);
  upper.add(new THREE.Mesh(dome, burnt));
  const vac = [];
  for (let i = 0; i <= 26; i++) { const t = i / 26; vac.push(new THREE.Vector2(0.28 + 1.5 * Math.pow(t, 0.56), 52.6 - t * 5.3)); }
  upper.add(new THREE.Mesh(new THREE.LatheGeometry(vac, 64), niobium));
  upper.add(new THREE.Mesh(new THREE.LatheGeometry(vac.map((v) => new THREE.Vector2(v.x - 0.01, v.y)), 64), vacInner));
  { const parts = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; parts.push(beamBetween(V3(0.3 * Math.cos(a), 52.0, 0.3 * Math.sin(a)), V3(2.6 * Math.cos(a + 0.4), 53.2, 2.6 * Math.sin(a + 0.4)), 0.05)); } parts.push(cyl(0.5, 0.42, 1.1, 0, 52.8, 0, 16)); for (let i = 0; i < 12; i++) { const t = 0.05 + i * 0.08, y = 52.6 - t * 5.3, r = 0.28 + 1.5 * Math.pow(t, 0.56) + 0.02; const tr = new THREE.TorusGeometry(r, 0.012, 5, 40); tr.rotateX(Math.PI / 2); tr.translate(0, y, 0); parts.push(tr); } upper.add(new THREE.Mesh(merge(parts), steel)); }
  const s2rings = [frame(R, 53.5, 0.05, 0.16, 128), frame(R, 64, 0.06, 0.18, 128), frame(R, 57, 0.03, 0.08, 128), frame(R, 60.5, 0.03, 0.08, 128)];
  { const a = 1.0, rr = R + 0.07; const g = box(0.4, 9, 0.12); g.rotateY(-a + Math.PI / 2); g.translate(Math.cos(a) * rr, 58.7, Math.sin(a) * rr); s2rings.push(g); }
  umbilicalPlate(61, -0.2, s2rings);
  // Attitude thruster quads, four around the top of the tank
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * (R + 0.08), z = Math.sin(a) * (R + 0.08);
    const b = box(0.32, 0.34, 0.32, 0, 0, 0); b.rotateY(-a); b.translate(x, 62.6, z); s2rings.push(b);
  }
  upper.add(new THREE.Mesh(merge(s2rings), steel));

  // ---- fairing halves split along the x = 0 plane: a hammerhead shoulder, then a long ogive
  const base = [[3.05, 64], [3.2, 64.5], [3.42, 65.7]];
  const nose = ogive(3.42, 65.7, 78, 40, 0.06).slice(1);
  const dense = [...base, ...nose];
  const halfA = lathe(dense, 64, 53, 78, 0, Math.PI), halfB = lathe(dense, 64, 53, 78, Math.PI, Math.PI);
  const fairA = new THREE.Group(), fairB = new THREE.Group();
  const tip = lathe([[0.075, 77.75], [0.04, 78.15], [0.016, 79.5], [0.005, 79.56]], 12, 53, 78, 0, Math.PI);
  const tipB = lathe([[0.075, 77.75], [0.04, 78.15], [0.016, 79.5], [0.005, 79.56]], 12, 53, 78, Math.PI, Math.PI);
  fairA.add(new THREE.Mesh(halfA, paint2)); fairA.add(new THREE.Mesh(lathe(dense, 64, 53, 78, 0, Math.PI), fairingIn)); fairA.add(new THREE.Mesh(tip, steel));
  fairB.add(new THREE.Mesh(halfB, paint2)); fairB.add(new THREE.Mesh(lathe(dense, 64, 53, 78, Math.PI, Math.PI), fairingIn)); fairB.add(new THREE.Mesh(tipB, steel));
  // Each half's seam rail and shoulder ring are real geometry, and travel with it.
  for (const [g, a0] of [[fairA, 0], [fairB, Math.PI]]) {
    const ring = new THREE.LatheGeometry([[3.33, 65.64], [3.47, 65.64], [3.47, 65.78], [3.33, 65.78]].map((p) => new THREE.Vector2(p[0], p[1])), 64, a0, Math.PI);
    g.add(new THREE.Mesh(ring, steel));
    const r2 = new THREE.LatheGeometry([[3.0, 63.98], [3.12, 63.98], [3.12, 64.14], [3.0, 64.14]].map((p) => new THREE.Vector2(p[0], p[1])), 64, a0, Math.PI);
    g.add(new THREE.Mesh(r2, steel));
  }

  // ---- probe
  const probe = new THREE.Group();
  const adapter = lathe([[3.05, 64], [2.4, 64.8], [1.7, 65.4]], 48, 53, 78);
  probe.add(new THREE.Mesh(adapter, carbon));
  const bus = new THREE.CylinderGeometry(1.75, 1.75, 3.6, 8); bus.translate(0, 67.2, 0);
  { const uv = bus.attributes.uv, pos = bus.attributes.position; for (let i = 0; i < pos.count; i++) { uv.setXY(i, Math.atan2(pos.getZ(i), pos.getX(i)) * 0.6, pos.getY(i) * 0.3); } }
  probe.add(new THREE.Mesh(bus, gold));
  // Equipment on the bus: white radiator faces with a grid of heat pipes, thruster clusters, star trackers
  const radiators = [], kit = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * 1.66, z = Math.sin(a) * 1.66;
    const g = box(0.04, 2.3, 1.05); g.rotateY(-a); g.translate(x, 67.2, z); radiators.push(g);
    for (let k = -2; k <= 2; k++) { const r = box(0.03, 2.3, 0.02, 0.03, 0, k * 0.2); r.rotateY(-a); r.translate(x, 67.2, z); kit.push(r); }
    const a2 = a + Math.PI / 4, tx = Math.cos(a2) * 1.72, tz = Math.sin(a2) * 1.72;
    for (const y of [65.7, 68.7]) { const c = new THREE.CylinderGeometry(0.05, 0.11, 0.2, 10); c.rotateZ(-Math.PI / 2); c.rotateY(-a2); c.translate(tx, y, tz); kit.push(c); const b = box(0.2, 0.2, 0.2); b.rotateY(-a2); b.translate(tx * 0.96, y, tz * 0.96); kit.push(b); }
  }
  probe.add(new THREE.Mesh(merge(radiators), white));
  const topDeck = cyl(1.2, 1.76, 0.6, 0, 69.3, 0, 8);
  probe.add(new THREE.Mesh(topDeck, carbon));
  const dishPts = []; for (let i = 0; i <= 24; i++) { const r = i / 24 * 1.6; dishPts.push(new THREE.Vector2(r, 70.0 + r * r * 0.22)); }
  probe.add(new THREE.Mesh(new THREE.LatheGeometry(dishPts, 64), new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.34, metalness: 0.2, side: THREE.DoubleSide })));
  const rimTorus = new THREE.TorusGeometry(1.6, 0.02, 6, 64); rimTorus.rotateX(Math.PI / 2); rimTorus.translate(0, 70.56, 0); kit.push(rimTorus);
  const feed = merge([cyl(0.05, 0.08, 1.1, 0, 70.6, 0, 8), cyl(0.14, 0.14, 0.18, 0, 71.2, 0, 12), beamBetween(V3(1.2, 70.34, 0), V3(0.1, 71.15, 0), 0.016), beamBetween(V3(-0.6, 70.34, 1.04), V3(-0.05, 71.15, 0.09), 0.016), beamBetween(V3(-0.6, 70.34, -1.04), V3(-0.05, 71.15, -0.09), 0.016)]);
  probe.add(new THREE.Mesh(feed, steel));
  const boom = merge([cyl(0.04, 0.04, 3.2, 0, 0, 0, 8).rotateZ(1.2).translate(-2.8, 68.0, 1.2), box(0.36, 0.36, 0.36, -4.2, 68.5, 1.2), ...kit]);
  probe.add(new THREE.Mesh(boom, steel));

  // Solar wings hinge at the bus, folded flat against it inside the fairing: four long panels on a truss yoke.
  const wings = [];
  const PANEL_L = 3.3, PANEL_H = 2.7;
  for (const side of [1, -1]) {
    const root = new THREE.Group(); root.position.set(0, 67.2, side * 1.8);
    const yoke = merge([beamBetween(V3(0, -0.9, 0), V3(0, 0, side * 0.5), 0.03), beamBetween(V3(0, 0.9, 0), V3(0, 0, side * 0.5), 0.03), beamBetween(V3(0, 0, 0), V3(0, 0, side * 0.5), 0.05)]);
    root.add(new THREE.Mesh(yoke, steel));
    const segs = [];
    let parent = root;
    for (let i = 0; i < 4; i++) {
      const hinge = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.05, PANEL_H, PANEL_L).translate(0, 0, side * PANEL_L / 2), cells);
      hinge.add(panel);
      hinge.position.z = i > 0 ? side * PANEL_L : side * 0.5;
      parent.add(hinge);
      segs.push(hinge); parent = hinge;
    }
    probe.add(root);
    wings.push({ side, root, segs });
  }

  return {
    stage1, upper, fairA, fairB, probe, wings, boosters,
    materials: { paint1, paint2, paintB, carbon, steel, burnt, titanium, nozzleInner, niobium, vacInner, gold, white, cells, fairingIn },
    dispose() {
      for (const g of [stage1, upper, fairA, fairB, probe, ...boosters.map((b) => b.pivot)]) g.traverse((o) => o.geometry?.dispose?.());
      for (const m of Object.values(this.materials)) { for (const k of ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'bumpMap']) m[k]?.dispose?.(); m.dispose(); }
    },
  };
}
