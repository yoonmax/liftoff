// Wet concrete fading into dark scrub, on one continuous surface. Floodlights and fire appear as long glossy streaks and
// the rocket and tower are mirrored in the wet, all evaluated analytically (no second scene render). The far edge
// dissolves into the planet shader below.
precision highp float;
uniform vec3 uCam, uSun;
uniform vec4 uLights[4];
uniform vec3 uLightColors[4];
uniform vec4 uFlame;
uniform float uPad, uTime, uRocketY;
uniform sampler3D uNoise;
varying vec3 vW;

float saturate(float x) { return clamp(x, 0.0, 1.0); }
float n(vec3 p) { return texture(uNoise, p).r; }
float fb(vec2 p) { return n(vec3(p, 0.31)) * 0.55 + n(vec3(p * 2.1, 0.61)) * 0.3 + n(vec3(p * 4.3, 0.17)) * 0.15; }

void main() {
  vec3 P = vW;
  vec3 V = normalize(uCam - vW);
  float d = length(P.xz), camD = length(uCam - vW);

  float big = fb(P.xz * 0.004), mid = fb(P.xz * 0.03), fine = fb(P.xz * 0.27), micro = fb(P.xz * 1.7);
  // The dressed concrete stops at an irregular, patched edge, and thins out through gravel into dark scrub.
  float pad = 1.0 - smoothstep(58.0, 76.0, d + (mid - 0.5) * 22.0);
  float apron = 1.0 - smoothstep(120.0, 250.0, d + (big - 0.5) * 120.0);
  vec3 scrub = mix(vec3(0.010, 0.013, 0.011), vec3(0.030, 0.031, 0.024), smoothstep(0.3, 0.7, big * 0.6 + fine * 0.4));
  vec3 concrete = vec3(0.09, 0.09, 0.094) * (0.68 + fine * 0.58 + micro * 0.24);
  // Slabs: an expansion-joint grid, every slab a slightly different pour
  vec2 cell = P.xz / 7.0;
  vec2 tile = abs(fract(cell) - 0.5);
  float joint = smoothstep(0.484, 0.497, max(tile.x, tile.y));
  float pour = n(vec3(floor(cell) * 0.137, 0.47));
  // Slab joints and pours are close-up detail; from a distance, wet concrete is one sheet.
  float nearby = 1.0 / (1.0 + camD * camD * 0.00005);
  concrete *= mix(1.0, 0.88 + pour * 0.24, nearby) * (1.0 - joint * 0.62 * pad * nearby);
  // Roads radiating from the pad, and the twin concrete strips of a crawlerway towards the camera side
  float road = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = 0.2 + float(i) * 1.57;
    vec2 dirn = vec2(cos(a), sin(a));
    float across = abs(dot(P.xz, vec2(-dirn.y, dirn.x)));
    road = max(road, (1.0 - smoothstep(4.0, 6.0, across)) * step(0.0, dot(P.xz, dirn)));
  }
  vec2 crawl = normalize(vec2(-0.78, 0.62));
  float cw = abs(dot(P.xz, vec2(-crawl.y, crawl.x)));
  float strips = (smoothstep(12.0, 11.2, abs(cw - 9.0))) * step(0.0, dot(P.xz, crawl)) * (1.0 - smoothstep(420.0, 700.0, d));
  road = max(road, strips * 0.85);
  vec3 albedo = mix(scrub, vec3(0.055, 0.056, 0.058) * (0.7 + mid * 0.6), road * 0.85);
  albedo = mix(albedo, vec3(0.075, 0.075, 0.074) * (0.6 + mid * 0.8 + fine * 0.3), apron * 0.7);
  albedo = mix(albedo, concrete, pad);

  // Years of launches: scorch fans along the trench axis, and a burnt ring around the mount.
  float fan = exp(-pow(P.z / (6.0 + abs(P.x) * 0.34), 2.0)) * (1.0 - smoothstep(16.0, 96.0, abs(P.x) + mid * 34.0));
  float scorch = max((1.0 - smoothstep(10.0, 42.0, d + mid * 18.0)) * 0.86, fan * 0.82);
  albedo *= 1.0 - scorch;
  // Contact shadow where the pedestal meets the mound
  float contact = smoothstep(11.0, 24.0, d);
  albedo *= mix(0.3, 1.0, contact);

  // Wetness puddles: sharp mirror-like pools that break up the highlights.
  float puddle = smoothstep(0.44, 0.6, mid * 0.75 + big * 0.25);
  float wet = (0.56 + 0.44 * puddle) * (pad * 0.98 + apron * 0.42 + road * 0.2);
  float wobble = (0.24 - puddle * 0.215) / (1.0 + camD * 0.012);
  vec3 N = normalize(vec3((micro - 0.5) * wobble, 1.0, (fine - 0.5) * wobble));

  vec3 col = vec3(0.0);
  // floodlight pools from the masts
  for (int i = 0; i < 4; i++) {
    vec3 Lp = uLights[i].xyz - vW; float dist = length(Lp); vec3 L = Lp / dist;
    float atten = 13000.0 / (dist * dist + 90.0);
    col += albedo * uLightColors[i] * saturate(dot(N, L)) * atten * uPad * 0.2;
    vec3 H = normalize(L + V);
    float nh = saturate(dot(N, H));
    float spec = pow(nh, mix(40.0, 420.0, wet)) * mix(0.2, 8.0, wet);
    col += uLightColors[i] * spec * atten * uPad * 0.08 * wet;
  }
  // engine fire: broad warm flooding and a tall reflected column
  {
    vec3 Lp = uFlame.xyz - vW; float dist = length(Lp); vec3 L = Lp / dist;
    float atten = 22000.0 / (dist * dist + 240.0);
    vec3 fire = vec3(1.0, 0.5, 0.18) * uFlame.w;
    col += albedo * fire * saturate(dot(N, L)) * atten * 0.75;
    vec3 H = normalize(L + V);
    float spec = pow(saturate(dot(N, H)), mix(24.0, 200.0, wet)) * mix(0.3, 7.0, wet);
    col += fire * spec * atten * 0.22 * wet;
    // the trench itself glows
    float trench = (1.0 - smoothstep(6.0, 15.0, d));
    col += vec3(1.0, 0.45, 0.14) * trench * uFlame.w * 2.4;
  }
  // ambient: the blue hour on everything, warmer towards the sunrise
  float eastward = saturate(normalize(P.xz + 1.0).x * 0.5 + 0.5);
  vec3 sky = mix(vec3(0.05, 0.075, 0.15), vec3(0.075, 0.08, 0.13), eastward);
  col += albedo * sky * 1.5;

  // What the wet surface sees: the sky gradient, and the vehicle and tower standing in it.
  vec3 R = reflect(-V, N);
  float fres = 0.02 + 0.98 * pow(1.0 - saturate(dot(N, V)), 5.0);
  float up = saturate(R.y);
  vec3 refl = mix(vec3(0.075, 0.125, 0.23), vec3(0.018, 0.04, 0.1), pow(up, 0.5));
  refl = mix(refl, vec3(0.5, 0.26, 0.14), pow(saturate(R.x * 0.5 + 0.5), 9.0) * pow(1.0 - up, 3.0));
  if (R.y > 0.002) {
    // A wet surface smears reflections along the view: the further the eye, the longer and softer they get.
    vec2 rd = normalize(R.xz + vec2(micro - 0.5, fine - 0.5) * 0.09);
    float k = max(length(R.xz), 1e-4);
    float blur = 0.5 + camD * 0.012;
    // Distance from the ray to a vertical axis, and how far along the ray it passes, in the ground plane.
    float along = -dot(P.xz, rd);
    float miss = abs(P.x * rd.y - P.z * rd.x);
    if (along > 0.0) {
      float y = vW.y + R.y / k * along;
      float m = (1.0 - smoothstep(2.6, 3.6 + blur, miss)) * smoothstep(uRocketY - 1.0, uRocketY + 1.0, y) * (1.0 - smoothstep(uRocketY + 74.0, uRocketY + 79.0, y));
      float band = smoothstep(uRocketY + 4.0, uRocketY + 34.0, y);
      vec3 body = vec3(0.34, 0.32, 0.29) * (0.3 + 0.9 * band) * (uPad * 0.9 + 0.08) + vec3(1.0, 0.6, 0.3) * uFlame.w * 0.8 * (1.0 - band);
      refl = mix(refl, body, m * 0.86);
    }
    // The tower is a dark lattice that lets the sky through.
    vec2 q = P.xz - vec2(24.0, -7.0);
    float along2 = -dot(q, rd), miss2 = abs(q.x * rd.y - q.y * rd.x);
    if (along2 > 0.0) {
      float y = vW.y + R.y / k * along2;
      float m = (1.0 - smoothstep(5.0, 7.0 + blur, miss2)) * (1.0 - smoothstep(88.0, 96.0, y));
      refl = mix(refl, vec3(0.02, 0.018, 0.02) + vec3(0.2, 0.13, 0.1) * uPad * 0.2 + vec3(1.0, 0.5, 0.2) * uFlame.w * 0.06, m * 0.5);
    }
  }
  col += refl * fres * wet * 1.05;

  // Aerial haze: distance dissolves the ground into the atmosphere rendered beneath it.
  // Beyond a couple of kilometres the near set hands over to the planet itself, whose horizon comes from the same
  // air as the sky above it. That is why there is no line where ground meets sky.
  float haze = 1.0 - exp(-camD * 0.00045);
  vec3 hazeC = mix(vec3(0.022, 0.042, 0.095), vec3(0.04, 0.072, 0.15), smoothstep(400.0, 3200.0, camD));
  col = mix(col, hazeC, haze * 0.92);
  float alpha = 1.0 - smoothstep(2200.0, 5600.0, camD);
  alpha *= 1.0 - smoothstep(400.0, 2600.0, uCam.y - 40.0);
  gl_FragColor = vec4(col, alpha);
}
