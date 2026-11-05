// The backdrop: a baked Milky Way panorama and the sun. Stars are separate points drawn on top.
precision highp float;
uniform samplerCube uMilky;
uniform vec3 uSun, uSunColor;
uniform float uSkyGain, uSunVis;
varying vec3 vRay;
void main() {
  vec3 rd = normalize(vRay);
  vec3 c = textureLod(uMilky, rd, 0.0).rgb * uSkyGain;
  float mu = dot(rd, uSun);
  float a = acos(clamp(mu, -1.0, 1.0));
  float disc = smoothstep(0.0058, 0.0044, a);
  float corona = exp(-a * 130.0) * 1.1 + exp(-a * 26.0) * 0.012;
  c += uSunColor * uSunVis * (disc * 90.0 + corona * 5.0);
  gl_FragColor = vec4(c, 1.0);
}
