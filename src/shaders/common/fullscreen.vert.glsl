// Fullscreen triangle that also yields the world-space view ray for analytic ray tracing.
uniform mat3 uCamRot;
uniform vec2 uTan;
varying vec3 vRay;
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  vRay = uCamRot * vec3(position.x * uTan.x, position.y * uTan.y, -1.0);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
