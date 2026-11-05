// The Moon as a ray-traced sphere with a relief-marched crust, so craters are real depth and the limb is a
// jagged horizon rather than a clean circle. NASA colour and elevation at large scale, a baked crater tile
// for detail below the resolution of those maps.
precision highp float;
uniform vec3 uRo;       // camera, in moon radii, moon at origin
uniform vec3 uSun;
uniform float uGain, uReliefSteps, uLoaded, uPixel;
uniform sampler2D uColor, uHeight, uTile;
varying vec3 vRay;

const float RELIEF = 0.0052;

// Large forms for the relief march, sampled from smooth mips so 8-bit steps never become terraces.
vec3 triW(vec3 n) { vec3 w = pow(abs(n), vec3(8.0)); return w / (w.x + w.y + w.z); }
float tileH(vec3 n, float f, float lod) {
  vec3 w = triW(n);
  return textureLod(uTile, n.yz * f, lod).r * w.x + textureLod(uTile, n.zx * f, lod).r * w.y + textureLod(uTile, n.xy * f, lod).r * w.z;
}
float terrain(vec3 n, float detail) {
  // Longitude runs the other way in this right-handed world, or the maria would be mirrored.
  vec2 ll = latlongUv(n * vec3(1.0, 1.0, -1.0)); ll.x = fract(ll.x);
  float h = textureLod(uHeight, ll, 0.0).r * 0.2;
  h += tileH(n, 1.1, 1.5) * 0.46;
  h += tileH(n, 4.3, 1.5) * 0.3 * detail;
  return h;
}
// Crater normals at scales finer than the march, from the baked tile.
vec3 tileN(vec3 n, float f) {
  vec3 w = triW(n);
  vec2 a = texture2D(uTile, n.yz * f).gb - 0.5, b = texture2D(uTile, n.zx * f).gb - 0.5, c = texture2D(uTile, n.xy * f).gb - 0.5;
  return vec3(0.0, a.x, a.y) * w.x + vec3(b.y, 0.0, b.x) * w.y + vec3(c.x, c.y, 0.0) * w.z;
}

void main() {
  vec3 rd = normalize(vRay);
  float b = dot(uRo, rd);
  float rr = dot(uRo, uRo);
  float top = 1.0 + RELIEF;
  float dO = b * b - (rr - top * top);
  if (dO < 0.0) discard;
  float s = sqrt(dO);
  float t0 = max(-b - s, 0.0), t1 = -b + s;
  if (t1 <= 0.0) discard; // the whole sphere is behind the camera
  float camH = sqrt(rr) - 1.0;
  float detail = smoothstep(0.75, 0.05, camH);

  // March through the relief shell until the ray dips under the terrain.
  float tb = dot(uRo, rd);
  float dI = tb * tb - (rr - 1.0);
  if (dI > 0.0 && -tb - sqrt(dI) > 0.0) t1 = min(t1, -tb - sqrt(dI)); else dI = -1.0;
  int steps = int(uReliefSteps);
  float dt = (t1 - t0) / float(steps);
  float t = t0 + dt * ign(gl_FragCoord.xy) * 0.6;
  bool hit = dI > 0.0;
  vec3 n = vec3(0.0);
  float prevD = 1.0, prevT = t;
  for (int i = 0; i < steps; i++) {
    vec3 p = uRo + rd * t;
    float r = length(p);
    n = p / r;
    float d = (r - 1.0) / RELIEF - terrain(n, detail);
    if (d < 0.0) {
      float k = prevD / max(prevD - d, 1e-4);
      t = mix(prevT, t, k);
      hit = true;
      p = uRo + rd * t; n = normalize(p);
      break;
    }
    prevD = d; prevT = t;
    t += dt;
  }
  if (!hit) discard;
  vec3 p = uRo + rd * t; n = normalize(p);
  float dist = t;
  // Analytic silhouette coverage hides the stair-step of a discrete march on the limb.
  // Normal from terrain differences, scaled by footprint.
  float eps = max(0.0016, dist * uPixel * 2.0);
  vec3 tx = normalize(cross(n, vec3(0.13, 0.97, 0.21)));
  vec3 ty = cross(n, tx);
  float h0 = terrain(n, detail);
  float hx = terrain(normalize(n + tx * eps), detail), hy = terrain(normalize(n + ty * eps), detail);
  float k = RELIEF * 1.7 / eps;
  vec3 N = normalize(n - tx * (hx - h0) * k - ty * (hy - h0) * k);
  N = normalize(N - (tileN(n, 4.3) * 0.75 + tileN(n, 19.0) * 0.9 + tileN(n, 83.0) * 0.8) * detail);

  vec3 albedo = sampleSphere(uColor, n * vec3(1.0, 1.0, -1.0)).rgb;
  albedo *= 0.88 + tileH(n, 19.0, 0.0) * 0.24 * detail;
  albedo = mix(albedo, vec3(dot(albedo, vec3(0.3, 0.5, 0.2))) * vec3(1.03, 1.0, 0.95), 0.72);
  // Regolith albedo sits low, and the maria lower still; the exaggeration keeps the plains from turning to one grey.
  float a0 = dot(albedo, vec3(0.33));
  albedo *= 0.24 + a0 * 0.7;

  // Lommel-Seeliger blend: regolith barely darkens at the limb, and shows no specular.
  float mu0 = max(dot(N, uSun), 0.0), mu = max(dot(N, -rd), 0.001);
  float ls = mu0 / (mu0 + mu) * 2.0;
  float lam = mu0;
  float brdf = mix(lam, ls, 0.42);
  brdf = pow(brdf, 1.12);

  // Self-shadowing: a short walk towards the sun over the height field.
  float shadow = 1.0;
  if (mu0 > 0.0 && uReliefSteps > 9.0) {
    vec3 q = p + n * RELIEF * 0.02;
    float ds = RELIEF * 1.0 / max(dot(n, uSun), 0.05) * 0.2;
    for (int i = 0; i < 8; i++) {
      q += uSun * ds * (1.0 + float(i) * 0.6);
      float rq = length(q);
      float dh = (rq - 1.0) / RELIEF - terrain(q / rq, 0.6);
      shadow = min(shadow, smoothstep(-0.02, 0.09, dh));
      if (rq > top) break;
    }
  }
  float terminator = smoothstep(-0.015, 0.02, dot(n, uSun));
  vec3 col = albedo * brdf * shadow * terminator * 0.98;
  // Earthshine: the night side is faintly legible.
  col += albedo * vec3(0.006, 0.009, 0.016) * (0.4 + 0.6 * max(dot(N, normalize(-uRo)), 0.0));

  gl_FragColor = vec4(col * uGain * uLoaded, 0.0);
}
