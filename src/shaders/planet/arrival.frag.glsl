// The destination: a dark basalt world crazed with thin molten lines, under a pale rose and gold atmosphere,
// seen backlit against its star. Reuses the atmosphere integrator with different gases.
precision highp float;
uniform vec3 uCamDir, uSun;
uniform float uCamH, uGain, uTime, uLines;
varying vec3 vRay;

float voroEdge(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(hash13(i + g), hash13(i + g + 7.1), hash13(i + g + 13.7));
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}

void main() {
  vec3 rd = normalize(vRay);
  float camR = 1.0 + uCamH;
  vec3 ro = uCamDir * camR;
  float b = camR * dot(uCamDir, rd);
  float top = uAtmoTop;
  vec2 hitA = sphereHit(b, (uCamH - top) * (2.0 + uCamH + top));
  if (hitA.x > hitA.y || hitA.y < 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float t0 = max(hitA.x, 0.0), t1 = hitA.y;
  vec2 hitP = sphereHit(b, uCamH * (2.0 + uCamH));
  bool ground = hitP.x <= hitP.y && hitP.x > 0.0;
  if (ground) t1 = hitP.x;
  vec3 scatter, transmit;
  integrate(ro, rd, t0, t1, uSun, ign(gl_FragCoord.xy), uCamH < top ? 0 : (ground ? 1 : 2), scatter, transmit);
  vec3 col = vec3(0.0);
  float alpha = (transmit.r + transmit.g + transmit.b) / 3.0;
  if (ground) {
    vec3 n = normalize(ro + rd * t1);
    float mu = dot(n, uSun);
    float big = fbm3(n * 2.3), fine = fbm3(n * 13.0);
    vec3 rock = mix(vec3(0.016, 0.018, 0.024), vec3(0.052, 0.046, 0.052), big * 0.7 + fine * 0.3);
    col = rock * saturate(mu + 0.1) * uSunPower * 0.18;
    // Molten seams: architecture or geology, nobody can say
    float e = voroEdge(n * 24.0 + (fbm3(n * 4.0) - 0.5) * 2.6);
    float e2 = voroEdge(n * 91.0);
    float seam = smoothstep(0.06, 0.0, e) * (0.5 + big) + smoothstep(0.05, 0.0, e2) * 0.1;
    col += vec3(1.0, 0.55, 0.24) * seam * (0.8 + 2.2 * uLines) * 0.34;
    alpha = 0.0;
  }
  col = col * transmit + scatter;
  gl_FragColor = vec4(col * uGain, mix(1.0, alpha, uGain));
}
