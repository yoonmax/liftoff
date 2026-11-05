// A volumetric nebula, marched at reduced resolution. Gas is domain-warped ridged noise, so it forms filaments and walls
// rather than fog. Dark dust sits in front as real silhouettes. Young stars light the gas from inside, one short
// shadow tap per step gives each wall a bright and a dark side, and clear voids are left so that it has depth.
precision highp float;
uniform float uSteps, uTravel, uDensity, uTime;
varying vec3 vRay;

const vec3 STAR_A = vec3(-520.0, 90.0, -2300.0);
const vec3 STAR_B = vec3(620.0, -160.0, -3300.0);
const vec3 STAR_C = vec3(-90.0, 340.0, -1200.0);

// A rounded crease. A sharp abs() here would print the noise volume's texel grid into the gas as a dot screen.
float ridge(float x) { float d = 2.0 * x - 1.0; return 1.0 - sqrt(d * d + 0.012); }

// x: emission gas (0..1), y: dark dust (0..1)
vec2 field(vec3 p, float t) {
  vec3 w = vec3(n3(p * 0.00058 + 0.11), n3(p * 0.00058 + 0.47), n3(p * 0.00058 + 0.83)) - 0.5;
  vec3 q = p + w * 1500.0;
  // Large voids decide where any gas is at all.
  float big = n3(q * 0.00031 + 0.23);
  float mass = smoothstep(0.47, 0.66, big);
  // The finest octave has no mip levels: far away it would alias into a regular dot screen, so it fades with distance.
  float fineOn = smoothstep(1500.0, 260.0, t);
  float r1 = ridge(n3(q * 0.00083 + 0.3)), r2 = ridge(n3(q * 0.0023 + 0.7)), r3 = fineOn > 0.001 ? ridge(texture(uNoise, q * 0.0062).g) : 0.5;
  float fil = pow(max(r1, 0.0), 2.4) * 0.74 + pow(max(r2, 0.0), 2.0) * 0.17 + mix(0.07, r3 * r1 * 0.14, fineOn);
  float gas = clamp((fil * 1.5 - 0.1) * mass, 0.0, 1.0);
  // Dust: thick pillars with soft-edged bites taken out
  vec3 q2 = p + w.zxy * 900.0;
  float d0 = n3(q2 * 0.00066 + 0.61) + (n3(q2 * 0.0021 + 0.1) - 0.5) * 0.42;
  float dust = smoothstep(0.53, 0.62, d0);
  return vec2(gas, dust);
}

// The same field at low detail, for the shadow tap: light only cares about the large shapes.
vec2 fieldLite(vec3 p) {
  vec3 w = vec3(n3(p * 0.00058 + 0.11), n3(p * 0.00058 + 0.47), n3(p * 0.00058 + 0.83)) - 0.5;
  vec3 q = p + w * 1500.0;
  float gas = pow(max(ridge(n3(q * 0.00083 + 0.3)), 0.0), 2.4) * smoothstep(0.47, 0.66, n3(q * 0.00031 + 0.23));
  float dust = smoothstep(0.53, 0.62, n3((p + w.zxy * 900.0) * 0.00066 + 0.61));
  return vec2(gas, dust);
}

void main() {
  vec3 rd = normalize(vRay);
  vec3 ro = vec3(0.0, 0.0, -uTravel);
  int N = int(uSteps);
  float maxT = 4600.0;
  vec3 h3 = fract(vec3(gl_FragCoord.xyx) * 0.1031); h3 += dot(h3, h3.yzx + 33.33);
  // Barely any jitter: this target is upscaled, and each noisy low-resolution pixel would become a visible dot.
  float j = 0.46 + 0.08 * fract((h3.x + h3.y) * h3.z);
  vec3 acc = vec3(0.0); float T = 1.0;
  float stepK = pow(maxT / 40.0, 1.0 / float(N));
  for (int i = 0; i < N; i++) {
    // Steps grow with distance: detail near, depth far.
    float t0 = 40.0 * pow(stepK, float(i)), t1 = t0 * stepK;
    float dt = t1 - t0, t = t0 + dt * j;
    vec3 p = ro + rd * t;
    vec2 f = field(p, t);
    float gas = f.x, dust = f.y;
    if (gas + dust < 0.004) continue;
    vec3 toA = STAR_A - p, toB = STAR_B - p, toC = STAR_C - p;
    float da = dot(toA, toA), db = dot(toB, toB), dc = dot(toC, toC);
    float la = 1.0 / (1.0 + da * 0.000012), lb = 1.0 / (1.0 + db * 0.000012), lc = 1.0 / (1.0 + dc * 0.000034);
    // One shadow tap towards the strongest light: walls facing it burn, walls facing away go dark.
    vec3 Ldir = la >= lb ? toA / sqrt(da) : toB / sqrt(db);
    vec2 sh = fieldLite(p + Ldir * 150.0);
    float lit = exp(-(sh.x * 2.2 + sh.y * 4.2));
    // Hydrogen deep rose, oxygen petrol-teal, and hot gold right beside the stars
    vec3 rose = vec3(0.95, 0.15, 0.3), teal = vec3(0.05, 0.6, 0.74), gold = vec3(1.0, 0.72, 0.42);
    float ion = smoothstep(0.15, 0.9, la + lc * 0.7);
    vec3 emit = mix(teal, rose, smoothstep(0.34, 0.62, n3(p * 0.00037 + 0.9) + ion * 0.2));
    emit = mix(emit, gold, pow(saturate(la * 1.15 + lc * 0.9), 4.0));
    emit *= gas * (0.1 + lit * (la * 3.6 + lb * 2.6 + lc * 3.2));
    // Dust only blocks, apart from a thin rim where starlight catches its edge.
    float rim = dust * (1.0 - dust) * 4.0;
    emit = emit * (1.0 - dust) + gold * rim * 0.12 * (la + lc) * lit;
    float sigma = (gas * 0.00062 + dust * 0.0042) * uDensity;
    float a = 1.0 - exp(-sigma * dt);
    acc += T * emit * a * 2.1;
    T *= 1.0 - a;
    if (T < 0.02) break;
  }
  // Embedded stars' halos, seen through whatever remains
  for (int i = 0; i < 3; i++) {
    vec3 s = i == 0 ? STAR_A : (i == 1 ? STAR_B : STAR_C);
    vec3 v = s - ro; float dist = length(v); v /= dist;
    float a = acos(clamp(dot(rd, v), -1.0, 1.0));
    vec3 tint = i == 0 ? vec3(1.0, 0.7, 0.42) : (i == 1 ? vec3(0.6, 0.8, 1.0) : vec3(1.0, 0.84, 0.62));
    acc += tint * (exp(-a * 420.0) * 16.0 + exp(-a * 46.0) * 0.5) * smoothstep(3200.0, 900.0, dist) * uDensity * (0.2 + T);
  }
  gl_FragColor = vec4(acc, T);
}
