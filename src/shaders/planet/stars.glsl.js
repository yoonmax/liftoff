// Points at infinity. Size and brightness come from a magnitude attribute; the atmosphere dims them by
// painting over them with its own transmittance, so they fade out naturally at dawn.
export const starsVert = /* glsl */`
uniform mat3 uViewRot; uniform mat4 uProj; uniform float uPx, uTime, uTwinkle;
attribute float aMag; attribute vec3 aTint;
varying vec3 vC; varying float vB;
void main() {
  vec3 d = uViewRot * position;
  gl_Position = uProj * vec4(d, 1.0);
  gl_Position.z = gl_Position.w * 0.9999;
  float tw = 1.0 + uTwinkle * 0.5 * sin(uTime * (3.0 + aMag * 7.0) + position.x * 300.0 + position.y * 170.0);
  vB = aMag * tw;
  vC = aTint;
  gl_PointSize = uPx * (0.9 + aMag * 1.7);
}`;
export const starsFrag = /* glsl */`
precision highp float;
uniform float uGain;
varying vec3 vC; varying float vB;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  float m = smoothstep(1.0, 0.0, d); m *= m;
  gl_FragColor = vec4(vC * vB * m * uGain, 1.0);
}`;
