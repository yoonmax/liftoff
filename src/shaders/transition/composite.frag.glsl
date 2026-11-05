// Final grade: heat shimmer, lens fringing, bloom with halation, light shafts, anamorphic streak, the sun's flare,
// filmic curve, per-chapter colour script, vignette, grain.
precision highp float;
uniform sampler2D uHdr, uBloom, uShaft, uStreak;
uniform sampler3D uNoise;
uniform float uBloomGain, uTime, uGrain, uHeat, uAspect, uCA, uShaftGain, uStreakGain, uSat, uContrast, uExposure;
uniform vec2 uRes, uHeatA, uHeatB;
uniform vec4 uVeil;
uniform vec3 uLens;      // light position in the frame, xy; how clear it is, z
uniform vec3 uLensTint, uShadowTint, uHighTint;
varying vec2 vUv;

vec3 filmic(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

// A six-bladed aperture's star and a soft veil. No ghosts: in a dark sky they read as a smudge on the screen.
vec3 lensFlare(vec2 uv) {
  vec2 q = (uv - uLens.xy) * vec2(uAspect, 1.0);
  float r = length(q);
  float spikes = 0.0;
  for (int i = 0; i < 3; i++) {
    float ang = 0.42 + float(i) * 1.0472;
    vec2 ax = vec2(cos(ang), sin(ang));
    spikes += exp(-abs(dot(q, vec2(-ax.y, ax.x))) * 1100.0) * exp(-abs(dot(q, ax)) * 20.0);
  }
  vec3 c = uLensTint * (spikes * 0.5 + exp(-r * 8.0) * 0.1 + exp(-r * 40.0) * 0.55);
  return c;
}

void main() {
  vec2 uv = vUv;
  // Heat rises from the segment between the engines and the bottom of the plume.
  if (uHeat > 0.001) {
    vec2 ab = uHeatB - uHeatA;
    vec2 q = vec2((uv.x - uHeatA.x) * uAspect, uv.y - uHeatA.y);
    vec2 abn = vec2(ab.x * uAspect, ab.y);
    float t = clamp(dot(q, abn) / max(dot(abn, abn), 1e-5), 0.0, 1.4);
    float d = length(q - abn * t);
    float mask = exp(-d * d * 180.0) * uHeat;
    vec2 w = vec2(texture(uNoise, vec3(uv * vec2(7.0, 3.0), uTime * 0.34)).g, texture(uNoise, vec3(uv * vec2(6.0, 3.0) + 0.3, uTime * 0.27)).g) - 0.5;
    uv += w * mask * 0.022;
  }
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 ca = cc * r2 * 0.0036 * uCA;
  vec3 col = vec3(texture2D(uHdr, uv - ca).r, texture2D(uHdr, uv).g, texture2D(uHdr, uv + ca).b);
  // Halation: light scattered back through film stock comes out warmer than it went in.
  vec3 bloom = texture2D(uBloom, uv).rgb * vec3(1.06, 0.97, 0.9);
  col += bloom * 0.115 * uBloomGain;
  if (uShaftGain > 0.001) col += texture2D(uShaft, uv).rgb * uLensTint * uShaftGain;
  col += texture2D(uStreak, uv).rgb * vec3(0.62, 0.72, 1.0) * uStreakGain;
  if (uLens.z > 0.001) col += lensFlare(uv) * uLens.z;

  col = filmic(col * 0.92 * uExposure);

  // Colour script: tints the shadows and the highlights separately, then contrast about mid grey and saturation.
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(uShadowTint, uHighTint, smoothstep(0.02, 0.62, luma));
  col = 0.18 * pow(max(col, 0.0) / 0.18, vec3(uContrast));
  luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSat);

  // vignette
  float v = 1.0 - smoothstep(0.16, 0.92, r2 * 1.6) * 0.5;
  col *= v;

  // veil: the white of arrival and the dark of the return journey
  col = mix(col, uVeil.rgb, uVeil.a);

  // sRGB, then film grain weighted to the midtones so blacks stay clean
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  float g = h12(gl_FragCoord.xy + fract(uTime) * 311.0) - 0.5;
  col += g * uGrain * 0.024 * (0.4 + 0.6 * smoothstep(0.0, 0.25, luma + 0.02));
  gl_FragColor = vec4(col, 1.0);
}
