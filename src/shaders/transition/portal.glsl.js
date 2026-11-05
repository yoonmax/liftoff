// The gate's aperture: not a target of rings but a body of light with a thin bright lip. Filaments of plasma stream
// inward along the radius, spiralling slowly, and the centre burns through to white as it opens.
export const portalVert = /* glsl */`varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
export const portalFrag = /* glsl */`
precision highp float;
uniform sampler3D uNoise; uniform float uOpen, uTime, uHover;
varying vec2 vUv;
void main() {
  float r = length(vUv), a = atan(vUv.y, vUv.x);
  if (r > 1.0) discard;
  float o = uOpen;
  float R = o * 0.72;             // radius of the opening
  float swirl = a + uTime * 0.03 + (1.0 - r) * 2.4 * o;
  // Polar noise: thin streaks that run along the radius, drawn slowly towards the centre
  vec3 s = vec3(cos(swirl), sin(swirl), r * 0.5 - uTime * 0.018);
  float f1 = texture(uNoise, s * vec3(1.8, 1.8, 0.6)).r, f2 = texture(uNoise, s * vec3(5.2, 5.2, 0.9) + 0.3).g, f3 = texture(uNoise, s * vec3(15.0, 15.0, 1.3) + 0.6).g;
  float strands = smoothstep(0.38, 0.72, f1 * 0.55 + f2 * 0.3 + f3 * 0.15);
  float inside = smoothstep(R, R - 0.34, r);
  float lip = exp(-pow((r - R) * 64.0, 2.0)) * o;
  float lip2 = exp(-pow((r - R * 1.05) * 150.0, 2.0)) * o * 0.5;
  float outer = exp(-max(r - R, 0.0) * 10.0) * (1.0 - inside);
  vec3 warm = vec3(1.0, 0.62, 0.3), pale = vec3(1.0, 0.92, 0.8);
  vec3 c = pale * inside * (1.6 + strands * 4.2 + pow(saturate(1.0 - r / max(R, 0.01)), 2.0) * 16.0) * o * o;
  c += warm * lip * 11.0 + pale * lip2 * 9.0;
  c += warm * outer * (0.06 + strands * 0.5) * o;
  c *= 1.0 + uHover * 0.35;
  float alpha = smoothstep(1.0, 0.86, r);
  gl_FragColor = vec4(c * alpha, 1.0);
}
float saturate_unused;`.replace('float saturate_unused;', '').replace('precision highp float;', 'precision highp float;\nfloat saturate(float x) { return clamp(x, 0.0, 1.0); }');
