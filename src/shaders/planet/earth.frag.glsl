// Earth, ray traced as a true sphere per pixel: surface, clouds, cloud shadows, night lights, ocean glint and
// the atmosphere are one integrated calculation, valid from a metre above the ground to deep space.
precision highp float;
uniform vec3 uCamDir;    // unit vector, planet centre to camera
uniform float uCamH;     // camera altitude, in radii
uniform vec3 uSun;
uniform mat3 uEarthRot;  // world to earth-fixed
uniform sampler2D uDay, uNight, uMask, uClouds;
uniform float uTime, uGain, uCloudDrift, uLoaded;
uniform vec2 uRes;
varying vec3 vRay;

const float CLOUD_H = 0.0021;

float cloudsAt(vec3 nFixed, float detailAmt, float lod) {
  vec3 m = rotateAxis(nFixed, vec3(0.0, 1.0, 0.0), uCloudDrift);
  float c = sampleSphere(uClouds, m).r;
  if (detailAmt > 0.001) {
    // Detail only erodes and frays what the map says is there: it never invents cloud over clear sky.
    float d = fbm3(m * 13.0 + uTime * 0.0004) * 0.55 + fbm3(m * 57.0) * 0.45;
    float d2 = fbm3(m * 190.0);
    float eroded = smoothstep(0.02, 0.5, c + ((d - 0.5) * 0.8 + (d2 - 0.5) * 0.28) * (1.0 - c * 0.3));
    c = mix(c, eroded * smoothstep(0.0, 0.1, c), detailAmt);
  }
  // A little more contrast than the map has: denser decks, clearer air, fine fraying in between.
  c = smoothstep(0.03, 0.82, c);
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec3 rd = normalize(vRay);
  vec3 up = uCamDir;
  float camR = 1.0 + uCamH;
  vec3 ro = up * camR;
  float b = camR * dot(up, rd);
  float top = uAtmoTop;
  // Stable quadratic constant: |ro|^2 - r^2 = (h - q)(2 + h + q)
  vec2 hitA = sphereHit(b, (uCamH - top) * (2.0 + uCamH + top));
  if (hitA.x > hitA.y || hitA.y < 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float t0 = max(hitA.x, 0.0), t1 = hitA.y;

  vec2 hitP = sphereHit(b, uCamH * (2.0 + uCamH));
  bool ground = hitP.x <= hitP.y && hitP.y > 0.0;
  float tGround = 0.0;
  if (ground) {
    // numerically stable near root
    float d = sqrt(max(b * b - uCamH * (2.0 + uCamH), 0.0));
    tGround = uCamH * (2.0 + uCamH) / max(-b + d, 1e-9);
    t1 = min(t1, tGround);
  }

  float jitter = ign(gl_FragCoord.xy);
  int mode = uCamH < top ? 0 : (ground ? 1 : 2);
  vec3 scatter, transmit;
  integrate(ro, rd, t0, t1, uSun, jitter, mode, scatter, transmit);

  vec3 col = vec3(0.0);
  float alpha = (transmit.r + transmit.g + transmit.b) / 3.0;
  float zoom = smoothstep(0.08, 0.002, uCamH);

  // cloud shell along the ray
  vec2 hitC = sphereHit(b, (uCamH - CLOUD_H) * (2.0 + uCamH + CLOUD_H));
  float tCloud = -1.0;
  if (hitC.x <= hitC.y) {
    if (uCamH > CLOUD_H) { if (hitC.x > 0.0) tCloud = hitC.x; }
    else if (hitC.y > 0.0) tCloud = hitC.y;
  }
  if (ground && tCloud > tGround) tCloud = -1.0;
  vec3 cloudColor = vec3(0.0); float cloudA = 0.0;
  if (tCloud > 0.0) {
    vec3 pc = normalize(ro + rd * tCloud);
    vec3 fx = uEarthRot * pc;
    float c = cloudsAt(fx, smoothstep(0.7, 0.03, uCamH), 0.0);
    // Height-based self-shadow: step the coverage towards the sun.
    vec3 sunFx = uEarthRot * uSun;
    float shade = cloudsAt(normalize(fx + sunFx * 0.012), 0.0, 0.0);
    float mu = dot(pc, uSun);
    vec3 T = extinction(sunOptical(pc * (1.0 + CLOUD_H), uSun));
    float lit = smoothstep(-0.05, 0.3, mu + 0.02);
    vec3 direct = T * uSunPower * 0.078 * lit * (1.0 - shade * 0.62) * (0.6 + 0.4 * saturate(mu * 2.0));
    float edge = pow(saturate(1.0 - c), 2.0) * 0.5;
    float silver = pow(saturate(dot(rd, uSun)), 8.0) * edge * 3.0;
    vec3 ambient = vec3(0.009, 0.014, 0.027) + vec3(0.045, 0.075, 0.13) * smoothstep(-0.18, 0.2, mu);
    cloudColor = direct * (1.0 + silver) + ambient * uSunPower * 0.1 * 0.5;
    cloudA = saturate(c * mix(1.15, 0.95, smoothstep(0.0, 0.05, uCamH)));
  }

  if (ground) {
    vec3 hp = normalize(ro + rd * tGround);
    vec3 fx = uEarthRot * hp;
    vec3 day = sampleSphere(uDay, fx).rgb;
    float water = sampleSphere(uMask, fx).r;
    vec3 night = sampleSphere(uNight, fx).rgb;
    // Fine terrain modulation hides texel size when low.
    float fine = fbm3(fx * 28.0) * 0.6 + fbm3(fx * 120.0) * 0.4;
    day *= mix(1.0, 0.72 + fine * 0.72, (1.0 - water) * smoothstep(0.07, 0.008, uCamH));
    // The map is a bright mosaic: pull the land down towards what film would hold, keeping sand from going pink under
    // the blue air it is seen through, and take the oceans to a deep, dark blue.
    float land = 1.0 - water;
    float dayL = dot(day, vec3(0.3, 0.55, 0.15));
    vec3 landC = pow(mix(vec3(dayL), day, 0.66), vec3(1.2)) * vec3(0.82, 0.88, 0.76);
    // Texture below the resolution of the map, at every altitude: the planet should never look like a blurred photo.
    float grainL = fbm3(fx * 95.0) * 0.5 + fbm3(fx * 370.0) * 0.5;
    landC *= 0.74 + grainL * 0.52;
    day = mix(day, landC, land);
    day = mix(day, day * vec3(0.4, 0.62, 0.92) * 0.42, water * 0.86);

    // Relief, from the map's own brightness: mountains and coasts catch a low sun instead of lying flat.
    vec3 sunFxG = uEarthRot * uSun;
    vec3 tA = normalize(cross(fx, vec3(0.13, 0.97, 0.21))), tB = cross(fx, tA);
    float reliefOn = land * smoothstep(2.4, 0.2, uCamH);
    float mu = dot(hp, uSun);
    if (reliefOn > 0.01) {
      float e = 0.0016 + uCamH * 0.0012;
      const vec3 Y = vec3(0.3, 0.55, 0.15);
      float h0 = dot(day, Y), ha = dot(sampleSphere(uDay, normalize(fx + tA * e)).rgb, Y), hb = dot(sampleSphere(uDay, normalize(fx + tB * e)).rgb, Y);
      vec3 Nf = normalize(fx - (tA * (ha - h0) + tB * (hb - h0)) * 1.5 * reliefOn);
      mu = mix(mu, dot(Nf, sunFxG), 0.85);
    }
    vec3 T = extinction(sunOptical(hp * (1.0 + 2e-4), uSun));
    float lit = saturate(mu + 0.02);
    // cloud shadow falls offset along the sun direction
    float cs = cloudsAt(normalize(fx + (uEarthRot * uSun) * CLOUD_H / max(mu, 0.12)), 0.0, 0.0);
    vec3 surf = day * T * uSunPower * mix(0.078, 0.1, water) * lit * (1.0 - cs * 0.74);
    // sky light
    surf += day * vec3(0.05, 0.085, 0.15) * uSunPower * 0.05 * smoothstep(-0.2, 0.25, mu);

    // ocean: fresnel sky reflection and the long glint of the rising sun
    vec3 v = -rd, h = normalize(v + uSun);
    float fres = pow(1.0 - saturate(dot(hp, v)), 5.0);
    float rough = mix(90.0, 340.0, smoothstep(0.3, 0.0, uCamH));
    // Wind streaks break the glint into a field of glitter rather than a smooth bloom on the water.
    float ripples = 0.7 + 0.6 * n3(fx * 180.0);
    float glint = pow(saturate(dot(hp, h)), rough * ripples) * (rough + 8.0) / 25.0;
    surf += water * T * uSunPower * 0.03 * glint * smoothstep(-0.02, 0.1, mu) * (1.0 - cs * 0.85);
    surf += water * fres * vec3(0.1, 0.2, 0.42) * uSunPower * 0.04 * smoothstep(-0.1, 0.2, mu);

    // city lights fade through dawn and glow softly through thin cloud
    float dark = 1.0 - smoothstep(-0.13, 0.07, mu);
    vec3 lights = pow(max(night - 0.07, 0.0), vec3(1.6)) * vec3(1.15, 0.86, 0.56) * 2.1;
    surf += lights * dark * (1.0 - cs * 0.82) * 1.4;
    // A dim, moonlit night side so the planet never goes fully flat black.
    surf += day * vec3(0.012, 0.018, 0.03) * dark * 0.65;
    col = surf;
  }

  // composite clouds, then everything through the air between them and the camera
  col = mix(col, cloudColor, cloudA);
  // Haze is strongest towards the limb; looking straight down, the ground stays clean.
  float limbward = ground && uCamH > top ? mix(0.34, 0.86, pow(1.0 - saturate(dot(normalize(ro + rd * t1), -rd)), 2.0)) : 1.0;
  col = col * transmit + scatter * limbward;

  // Below the cloud deck looking up, or from above, opacity to the stars behind.
  if (ground) alpha = 0.0;
  else if (cloudA > 0.0) alpha *= (1.0 - cloudA);

  // Earth limb antialiasing without MSAA help
  gl_FragColor = vec4(col * uGain * uLoaded, alpha);
}
