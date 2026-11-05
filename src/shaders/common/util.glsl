#define PI 3.14159265359
float saturate(float x) { return clamp(x, 0.0, 1.0); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 rotateAxis(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }

// Noise from the shared 64^3 tiling volume: far cheaper than evaluating procedural noise per step.
uniform sampler3D uNoise;
float n3(vec3 p) { return texture(uNoise, p).r; }
vec2 n3rg(vec3 p) { return texture(uNoise, p).rg; }
float fbm3(vec3 p) { return n3(p) * 0.5 + n3(p * 2.03 + 0.17) * 0.3 + n3(p * 4.11 + 0.41) * 0.2; }

// Equirectangular coordinates with the dateline seam resolved by picking the continuous wrap (Tarini).
vec2 latlongUv(vec3 n) { return vec2(atan(n.z, n.x) / (2.0 * PI), 0.5 - asin(clamp(n.y, -1.0, 1.0)) / PI); }
vec4 sampleSphere(sampler2D tex, vec3 n) {
  vec2 uv = latlongUv(n);
  vec2 uvA = vec2(fract(uv.x), uv.y), uvB = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
  vec2 axA = dFdx(uvA), ayA = dFdy(uvA), axB = dFdx(uvB), ayB = dFdy(uvB);
  // Choose by a threshold, not by comparison, so every pixel of a quad agrees except right on the seam.
  bool useA = max(abs(axA.x), abs(ayA.x)) < 0.25;
  return useA ? textureGrad(tex, uvA, axA, ayA) : textureGrad(tex, uvB, axB, ayB);
}
