// Launch smoke is stateless: each billboard's position is a closed-form function of (now - birth), so scrubbing
// backwards unburns the fuel. Density comes from a baked atlas of billows with normals, so it can be lit.
export const smokeVert = /* glsl */`
attribute vec4 aA;   // birth (film seconds), life, startSize, endSize
attribute vec3 aP;   // emission point
attribute vec3 aV;   // initial velocity
attribute vec4 aB;   // seed, atlas cell, spin, kind (0 trench billow, 1 column, 2 vapor)
uniform float uT, uTime, uPadVapor, uFlameY, uFlameI, uFade, uFlood, uCamDist;
uniform vec3 uFlamePos;
varying vec2 vUv; varying vec4 vCell; varying float vA; varying vec3 vGlow; varying vec2 vRot; varying float vKind; varying vec3 vFlood; varying float vSeed; varying float vWorldY; varying float vHot; varying float vLowMist;

void main() {
  float kind = aB.w;
  float age, life = aA.y;
  if (kind > 1.5) { age = mod(uTime * 0.75 + aB.x * 40.0, life); }
  else age = uT - aA.x;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float u = age / life;
  float k = kind < 0.5 ? 0.48 : (kind < 1.5 ? 0.13 : 0.2);
  vec3 pos = aP + aV * (1.0 - exp(-k * age)) / k;
  float s = aB.x * 6.283;
  // buoyancy and rolling billows
  // Boil-off is colder than the air around it: it sinks down the tank in sheets, and ground mist just lies there.
  float low = kind > 1.5 ? step(aP.y, 8.0) : 0.0;
  float buoy = kind < 0.5 ? (0.7 + aB.x * 1.2) : (kind < 1.5 ? 0.16 : mix(-0.16, 0.02, low));
  pos.y += buoy * pow(age, 1.28);
  float roll = kind < 1.5 ? 1.0 : 0.16;
  pos.x += sin(age * 0.33 + s) * (1.4 + age * 0.3) * roll + sin(uTime * 0.2 + s) * 0.3;
  pos.z += cos(age * 0.27 + s * 1.7) * (1.4 + age * 0.3) * roll + cos(uTime * 0.24 + s) * 0.3;
  pos.y = max(pos.y, 0.8);

  float size = mix(aA.z, aA.w, 1.0 - exp(-age * (kind < 0.5 ? 0.32 : 0.14)));
  float env = smoothstep(0.0, kind > 1.5 ? 0.24 : 0.015, u) * pow(1.0 - u, kind > 1.5 ? 1.4 : 1.1);
  vec4 mv = viewMatrix * vec4(pos, 1.0);
  float ang = aB.z + age * 0.06 * (aB.x - 0.5);
  float c = cos(ang), sn = sin(ang);
  vRot = vec2(c, sn);
  vec2 q = position.xy;
  mv.xy += vec2(q.x * c - q.y * sn, q.x * sn + q.y * c) * size;
  gl_Position = projectionMatrix * mv;
  vUv = q * 0.5 + 0.5;
  float cell = aB.y;
  vCell = vec4(mod(cell, 4.0), floor(cell / 4.0), 0.25, 0.25);
  // Particles close to the camera fade before they can clip through it.
  float near = smoothstep(4.0, 34.0, -mv.z);
  vA = env * near * (kind > 1.5 ? uPadVapor : uFade) ;
  vec3 toFlame = uFlamePos - pos;
  float d2 = dot(toFlame, toFlame);
  // Fire falls off fast: orange where the steam is close to the flame, and the blue hour everywhere else.
  float fall = 1.0 / (1.0 + d2 * 0.0105);
  vGlow = uFlameI * mix(vec3(1.0, 0.36, 0.1), vec3(1.0, 0.62, 0.3), fall) * fall * (0.3 + 0.7 * pow(1.0 - u, 1.1));
  vHot = uFlameI * exp(-d2 * 0.0016) * (1.0 - u);
  vWorldY = pos.y + q.y * size;
  vLowMist = mix(0.2, 0.075, low);
  vKind = kind; vSeed = aB.x;
  vFlood = vec3(0.24, 0.25, 0.27) * uFlood * exp(-max(pos.y - 18.0, 0.0) * 0.008) * (1.0 / (1.0 + dot(pos.xz, pos.xz) * 0.00003));
}`;

export const smokeFrag = /* glsl */`
precision highp float;
uniform sampler2D uAtlas;
uniform vec3 uAmbient;
uniform vec3 uFlamePos;
varying vec2 vUv; varying vec4 vCell; varying float vA; varying vec3 vGlow; varying vec2 vRot; varying float vKind; varying vec3 vFlood; varying float vSeed; varying float vWorldY; varying float vHot; varying float vLowMist;
void main() {
  vec2 uv = (vCell.xy + vUv) * vCell.zw;
  vec3 t = texture2D(uAtlas, uv).rgb;
  float d = t.b;
  if (d < 0.01) discard;
  vec2 n2 = t.rg * 2.0 - 1.0;
  n2 = vec2(n2.x * vRot.x - n2.y * vRot.y, n2.x * vRot.y + n2.y * vRot.x);
  vec3 N = normalize(vec3(n2, 0.55));
  // Fill from above, fire from below, in view space close enough for soft smoke. Creases go dark: that is what makes a
  // billow read as a solid thing with a lit side and a shadow side.
  float top = 0.5 + 0.5 * N.y;
  float side = max(dot(N, normalize(vec3(-0.5, 0.45, 0.72))), 0.0);
  float crease = smoothstep(0.1, 0.8, N.z);
  float tone = 0.72 + vSeed * 0.5;
  vec3 base = uAmbient * (0.35 + 1.15 * top) + vFlood * (0.25 + 1.3 * side);
  vec3 fire = vGlow * (0.14 + 1.55 * (1.0 - top)) * (0.55 + 0.7 * vSeed);
  vec3 col = (base * tone + fire) * mix(0.42, 1.0, crease);
  col += vec3(1.0, 0.72, 0.42) * vHot * 0.9 * (0.4 + d);
  // The ground has no depth edge to cut against: billows thin out as they reach it.
  float a = smoothstep(0.02, 0.62, d) * vA * (vKind > 1.5 ? vLowMist : 0.78) * smoothstep(0.0, 7.0, vWorldY);
  gl_FragColor = vec4(col * a, a);
}`;
