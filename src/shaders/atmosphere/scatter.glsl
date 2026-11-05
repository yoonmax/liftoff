// Single scattering through an exponential atmosphere, in planet-radius units, with ozone absorption.
// The same function renders the sky from the launchpad and the thin blue line from orbit, which is what
// lets the climb to space be one continuous shot.
uniform vec3 uBetaR;
uniform float uBetaM;
uniform vec3 uBetaO;
uniform float uHR;
uniform float uHM;
uniform float uAtmoTop;
uniform float uMieG;
uniform int uSteps;
uniform int uLightSteps;
uniform float uSunPower;
uniform float uTwilight;

// Distances along a ray from ro (|ro| = camR) to a sphere radius r. x = near, y = far; x > y means no hit.
vec2 sphereHit(float b, float cc) { float d = b * b - cc; if (d < 0.0) return vec2(1.0, -1.0); d = sqrt(d); return vec2(-b - d, -b + d); }

vec3 densityAt(float h) {
  float rayleigh = exp(-h / uHR);
  float mie = exp(-h / uHM);
  float o = max(0.0, 1.0 - abs(h - 0.0039) / 0.0024);
  return vec3(rayleigh, mie, o);
}

vec3 sunOptical(vec3 p, vec3 sun) {
  float r = length(p);
  float b = dot(p, sun);
  // sun below the local horizon and blocked by the planet: fully dark, softened over a small band
  float top = 1.0 + uAtmoTop;
  vec2 hit = sphereHit(b, r * r - top * top);
  float len = max(hit.y, 0.0);
  vec3 od = vec3(0.0);
  float ds = len / float(uLightSteps);
  for (int i = 0; i < uLightSteps; i++) {
    vec3 q = p + sun * (ds * (float(i) + 0.5));
    float h = length(q) - 1.0;
    od += densityAt(max(h, -0.0002) ) * ds * (h < -0.0001 ? 40.0 : 1.0);
  }
  return od;
}

vec3 extinction(vec3 od) { return exp(-(uBetaR * od.x + vec3(uBetaM * 1.1) * od.y + uBetaO * od.z)); }

float phaseR(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
float phaseM(float mu) { float g = uMieG; float gg = g * g; return 3.0 / (8.0 * PI) * ((1.0 - gg) * (1.0 + mu * mu)) / ((2.0 + gg) * pow(max(1.0 + gg - 2.0 * g * mu, 1e-4), 1.5)); }

// Radiance scattered towards the camera along [t0, t1], plus the transmittance of that segment.
// Samples are placed where the air actually is: near the camera from inside, near the ground on rays that hit
// it, and around the point of closest approach on rays grazing the limb. Uniform steps would miss the thin shell.
float warp(float u, int mode) {
  if (mode == 0) return u * u;
  if (mode == 1) { float v = 1.0 - u; return 1.0 - v * v * v; }
  float x = 2.0 * u - 1.0; return 0.5 + 0.5 * x * abs(x);
}
void integrate(vec3 ro, vec3 rd, float t0, float t1, vec3 sun, float jitter, int mode, out vec3 scatter, out vec3 transmit) {
  vec3 sumR = vec3(0.0), sumM = vec3(0.0), od = vec3(0.0);
  float mu = dot(rd, sun);
  float pr = phaseR(mu), pm = phaseM(mu);
  int N = uSteps;
  float prev = 0.0;
  float span = t1 - t0;
  for (int i = 0; i < N; i++) {
    float u1 = (float(i) + 1.0) / float(N);
    float u0 = float(i) / float(N);
    float a = warp(u0, mode);
    float b = warp(u1, mode);
    float s = mix(a, b, 0.3 + 0.4 * jitter);
    float dt = (b - a) * span;
    vec3 p = ro + rd * (t0 + s * span);
    float h = max(length(p) - 1.0, 0.0);
    vec3 d = densityAt(h) * dt;
    od += d * 0.5;
    vec3 ods = sunOptical(p, sun);
    vec3 T = extinction(od + ods);
    sumR += T * d.x;
    sumM += T * d.y;
    od += d * 0.5;
  }
  scatter = uSunPower * (sumR * uBetaR * pr + sumM * uBetaM * pm);
  transmit = extinction(od);
  // Multiple scattering, roughly: thick columns glow faintly even with the sun below the horizon.
  float fill = 1.0 - exp(-(od.x * 90.0 + od.y * 40.0));
  scatter += vec3(0.012, 0.022, 0.05) * uSunPower * 0.05 * fill;
  scatter += vec3(0.0085, 0.0165, 0.036) * uTwilight * (1.0 - exp(-od.x * 260.0));
}
