// A ringed gas giant, its rings and their shadows ray traced together so occlusion is exact from every side
// of the ring plane, including crossing it.
precision highp float;
uniform vec3 uRo;       // camera, in planet radii, planet at origin
uniform vec3 uSun, uRingN;
uniform float uGain, uTime;
uniform sampler2D uRings;
varying vec3 vRay;

const float RING_IN = 1.28, RING_OUT = 2.42;
const vec3 AT1 = vec3(0.60, 0.72, 1.0);

vec4 ringSample(float r, vec3 p) {
  float u = (r - RING_IN) / (RING_OUT - RING_IN);
  vec4 t = texture2D(uRings, vec2(u, 0.5));
  float ang = atan(p.z, p.x);
  float clump = 0.86 + 0.28 * n3(vec3(r * 34.0, ang * 22.0, 0.3));
  // Thousands of ringlets, fading out before they can alias at a distance
  float px = fwidth(r);
  float fine = n3(vec3(r * 11.0, 0.13, 0.37)) * 0.5 + n3(vec3(r * 47.0, 0.73, 0.21)) * 0.32 + n3(vec3(r * 190.0, 0.31, 0.57)) * 0.18;
  float keep = smoothstep(0.03, 0.004, px);
  float gaps = mix(1.0, smoothstep(0.2, 0.56, fine) * 1.2, keep * 0.56);
  return vec4(t.rgb * (0.88 + 0.26 * fine * keep), clamp(t.a * clump * gaps, 0.0, 1.0));
}

// Zonal bands with irregular widths, sheared by turbulence that grows towards the band edges, plus one long-lived oval
// storm. Everything is sampled in stretched lon/lat coordinates, because that is the shape weather takes on a fast spinner.
vec3 bands(vec3 n, float lod) {
  float lat = dot(n, uRingN);
  vec3 tang = normalize(n - uRingN * lat);
  float lon = atan(dot(tang, vec3(0.0, 0.0, 1.0)), dot(tang, vec3(1.0, 0.0, 0.0)));
  float flow = uTime * 0.0035 * (1.0 + 2.6 * sin(lat * 9.0));
  vec2 cyl = vec2(cos(lon + flow), sin(lon + flow));

  // A storm swirls the coordinates around its centre before anything else is sampled.
  const float S_LON = 2.25, S_LAT = -0.27;
  float dl = atan(sin(lon - S_LON), cos(lon - S_LON));
  vec2 sq = vec2(dl / 0.3, (lat - S_LAT) / 0.075);
  float sd = dot(sq, sq);
  float swirl = 2.6 * exp(-sd * 1.4);
  float cs = cos(swirl), sn = sin(swirl);
  vec2 sr = vec2(sq.x * cs - sq.y * sn, sq.x * sn + sq.y * cs);
  float stormMask = exp(-sd * 0.8);
  float latW = mix(lat, S_LAT + sr.y * 0.075, stormMask * 0.8);
  vec2 cylW = mix(cyl, vec2(cos(S_LON + sr.x * 0.3), sin(S_LON + sr.x * 0.3)), stormMask * 0.6);

  vec3 q = vec3(cylW, latW * 7.0);
  vec3 warp = vec3(fbm3(q * vec3(0.5, 0.5, 0.44) + 0.2), fbm3(q * vec3(0.5, 0.5, 0.44) + 3.1), 0.0) - 0.5;
  float w2 = n3(q * vec3(1.9, 1.9, 1.1) + 7.0) - 0.5;
  float y = latW + warp.x * 0.05 + w2 * 0.018;

  // Irregular zones: noise along latitude, never a pure sine.
  float z1 = n3(vec3(y * 2.6, 0.13, 0.41)) * 2.0 - 1.0, z2 = n3(vec3(y * 7.3, 0.71, 0.13)) * 2.0 - 1.0, z3 = n3(vec3(y * 19.0, 0.37, 0.77)) * 2.0 - 1.0;
  float b = z1 * 0.8 + z2 * 0.42 + z3 * 0.2 + 0.1;
  // Long horizontal streaks, the fine grain of the weather
  float streak = n3(vec3(cylW * 2.0, y * 62.0)) - 0.5;
  float streak2 = n3(vec3(cylW * 5.0 + 0.4, y * 170.0)) - 0.5;
  b += (streak * 0.34 + streak2 * 0.2 * lod) * (0.65 + abs(z2));

  // A narrow palette: burnt umber, tobacco, sand and bone, with cold slate at the poles
  vec3 umber = vec3(0.42, 0.31, 0.22), tobacco = vec3(0.57, 0.44, 0.31), sand = vec3(0.75, 0.65, 0.5), bone = vec3(0.89, 0.84, 0.73);
  vec3 c = mix(umber, tobacco, smoothstep(-1.0, -0.3, b));
  c = mix(c, sand, smoothstep(-0.32, 0.22, b));
  c = mix(c, bone, smoothstep(0.2, 0.86, b));
  c = mix(c, vec3(0.34, 0.39, 0.43), smoothstep(0.56, 0.9, abs(latW)) * 0.86);
  // The storm itself: a pale core with a dark collar
  float stormCore = exp(-sd * 1.1), collar = exp(-pow(sqrt(sd) - 1.25, 2.0) * 7.0);
  c = mix(c, vec3(0.2, 0.125, 0.08), collar * 0.6);
  c = mix(c, vec3(0.95, 0.88, 0.76), stormCore * (0.62 + 0.38 * streak2));
  return c * c;
}

void main() {
  vec3 rd = normalize(vRay);
  vec3 col = vec3(0.0);
  float alpha = 1.0;

  float b = dot(uRo, rd), rr = dot(uRo, uRo);
  float atmoTop = 1.02;
  float dA = b * b - (rr - atmoTop * atmoTop);
  float dP = b * b - (rr - 1.0);
  float tP = 1e9;
  if (dP > 0.0) { float t = -b - sqrt(dP); if (t > 0.0) tP = t; }

  // Ring plane crossing
  float dn = dot(rd, uRingN);
  float tR = abs(dn) > 1e-5 ? -dot(uRo, uRingN) / dn : -1.0;
  vec3 ringCol = vec3(0.0); float ringA = 0.0;
  if (tR > 0.0) {
    vec3 p = uRo + rd * tR; float r = length(p);
    if (r > RING_IN && r < RING_OUT) {
      vec4 t = ringSample(r, p);
      // shadow of the planet on the rings
      float sb = dot(p, uSun);
      float sd = dot(p, p) - sb * sb;
      float shade = sb < 0.0 ? smoothstep(0.98, 1.03, sqrt(sd)) : 1.0;
      float mu = dot(rd, uSun);
      float lit = abs(dot(uRingN, uSun));
      float forward = 0.55 + 1.5 * pow(saturate(mu), 6.0) + 0.5 * pow(saturate(-mu), 3.0);
      vec3 c = t.rgb * t.rgb * (0.65 + lit * 0.8) * forward * shade * 1.15;
      // Thin rings glow, dense rings occlude: scattered light goes as optical depth
      ringA = t.a;
      ringCol = c;
    }
  }

  // Planet
  if (tP < 1e8) {
    vec3 p = uRo + rd * tP, n = p;
    float mu0 = dot(n, uSun);
    vec3 albedo = bands(n, smoothstep(9.0, 2.0, sqrt(rr)));
    float lit = smoothstep(-0.06, 0.2, mu0) * pow(saturate(mu0 + 0.05), 0.8);
    // Deep atmosphere reddens the light towards the terminator.
    albedo *= mix(vec3(1.18, 0.74, 0.5), vec3(1.0), smoothstep(0.0, 0.32, mu0));
    // Shadow the rings cast onto the cloud tops
    float sn = dot(uSun, uRingN);
    float ringShadow = 1.0;
    if (abs(sn) > 1e-3) {
      float ts = -dot(p, uRingN) / sn;
      if (ts > 0.0) { vec3 q = p + uSun * ts; float r = length(q); if (r > RING_IN && r < RING_OUT) ringShadow = 1.0 - ringSample(r, q).a * 0.86; }
    }
    float rim = pow(1.0 - saturate(dot(n, -rd)), 3.2);
    vec3 surf = albedo * lit * ringShadow * 1.72;
    // Limb haze scatters blue-white sunlight
    surf = mix(surf, vec3(0.75, 0.82, 1.0) * saturate(mu0 * 1.5 + 0.3) * 1.2, rim * 0.55);
    // Ring-light bounces on to the night side: faint golden
    surf += albedo * vec3(0.14, 0.11, 0.07) * saturate(dot(n, -uSun)) * 0.28 * smoothstep(0.0, 0.8, dot(uRingN, n) * sign(dot(uRingN, uSun)));
    col = surf;
    alpha = 0.0;
  }

  // Atmosphere glow: the thin bright line around the disc, strongest towards the sun.
  if (dA > 0.0 && b < 0.0) {
    float closest = sqrt(max(rr - b * b, 0.0));
    float h = saturate((closest - 1.0) / (atmoTop - 1.0));
    if (tP > 1e8) {
      float g = pow(1.0 - h, 3.5) * (0.015 + 1.3 * pow(saturate(dot(normalize(uRo + rd * (-b)), uSun) * 0.5 + 0.5), 5.0));
      col += vec3(0.55, 0.68, 1.0) * g * 1.2;
    }
  }

  // Composite rings against the planet in correct depth order
  if (ringA > 0.0) {
    if (tR < tP) { col = mix(col, ringCol, ringA); float clear = 1.0 - ringA; alpha *= clear * clear * clear; }
  }

  gl_FragColor = vec4(col * uGain, mix(1.0, alpha, uGain));
}
