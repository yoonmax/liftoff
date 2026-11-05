// A short volumetric march through a bounding cylinder: the plume is a density field, so it looks right from
// every angle and is never a textured cone. Heat, turbulence, shock diamonds and vacuum expansion are all in it.
export const exhaustVert = /* glsl */`
uniform vec3 uScale;
varying vec3 vLocal; varying vec3 vCamLocal;
void main() {
  // March in metres: undo the unit cylinder's scale for both the surface point and the camera.
  vLocal = position * uScale;
  vCamLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz * uScale;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

export const exhaustFrag = /* glsl */`
precision highp float;
uniform sampler3D uNoise;
uniform float uTime, uThrust, uLen, uR0, uR1, uSteps, uGroundY, uOriginY, uCos, uVac, uBoost, uSplit;
uniform vec3 uHot, uMid, uCool;
varying vec3 vLocal; varying vec3 vCamLocal;

float n3(vec3 p) { return texture(uNoise, p).r; }
float n3g(vec3 p) { return texture(uNoise, p).g; }

float plumeRadius(float z) { return mix(uR0, uR1, pow(z, mix(0.78, 0.96, uVac))); }

void main() {
  vec3 ro = vCamLocal, rd = normalize(vLocal - vCamLocal);
  // Bounding cylinder along -Y (y from 0 to -uLen), radius uR1 * 1.18
  float RB = uR1 * 1.18 + uSplit;
  float a = dot(rd.xz, rd.xz), b = dot(ro.xz, rd.xz), c = dot(ro.xz, ro.xz) - RB * RB;
  float h = b * b - a * c;
  if (h < 0.0) discard;
  h = sqrt(h);
  float t0 = (-b - h) / max(a, 1e-5), t1 = (-b + h) / max(a, 1e-5);
  float ty0 = (0.0 - ro.y) / rd.y, ty1 = (-uLen - ro.y) / rd.y;
  if (ty0 > ty1) { float s = ty0; ty0 = ty1; ty1 = s; }
  t0 = max(max(t0, ty0), 0.0); t1 = min(t1, ty1);
  if (t1 <= t0) discard;

  int N = int(uSteps);
  float dt = (t1 - t0) / float(N);
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec3 acc = vec3(0.0);
  float trans = 1.0;
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * (t0 + (float(i) + jitter) * dt);
    float z = clamp(-p.y / uLen, 0.0, 1.0);
    float wy = uOriginY + p.y * uCos;
    if (wy < uGroundY) continue;
    // Core and boosters are three separate flames at the nozzles, which merge into one further down.
    float r = length(p.xz);
    if (uSplit > 0.01) { vec2 q2 = p.xz; q2.y = abs(q2.y) - uSplit; r = min(r, length(q2)); }
    float R = plumeRadius(z);
    float q = r / max(R, 0.001);
    if (q > 1.25) continue;
    // Upward turbulence advected down the plume
    vec3 s = p * 0.055 / (0.6 + 0.4 * uR1 / 6.0);
    float flow = uTime * 1.4;
    float n1 = n3(s + vec3(0.0, flow, 0.0)) - 0.5;
    float n2 = n3g(s * 2.9 + vec3(0.3, flow * 2.1, 0.1)) - 0.5;
    float wob = (n1 * 0.9 + n2 * 0.5) * (0.2 + z * 1.1);
    q = q + wob * 0.75;
    float core = exp(-q * q * 9.0) * pow(1.0 - z, 1.7);
    float sheath = exp(-q * q * 2.6) * (1.0 - smoothstep(0.35, 1.0, z));
    // The flame is cut into eddies as it grows
    float breakup = smoothstep(0.1, 0.55, 0.5 + n2 * 1.6 + n1 * 0.8 + (1.0 - z) * 0.5);
    float shock = 1.0 + (1.0 - uVac) * 0.75 * sin(z * 38.0 - uTime * 2.0) * exp(-z * 4.0) * exp(-q * q * 6.0);
    float e = (core * 1.2 * shock + sheath * breakup * 0.34) * uThrust * smoothstep(0.0, 0.012, z);
    vec3 c = mix(uCool, uMid, smoothstep(0.04, 0.42, e));
    c = mix(c, uHot, smoothstep(0.4, 1.1, e));
    float near = exp(-z * 7.0) * exp(-q * q * 3.0);
    acc += trans * c * e * dt * (0.8 + near * 2.0);
    trans *= exp(-e * dt * 0.06);
  }
  vec3 col = acc * uBoost;
  if (dot(col, col) < 1e-5) discard;
  gl_FragColor = vec4(col, 1.0);
}`;
