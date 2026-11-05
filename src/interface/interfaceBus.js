import * as THREE from 'three';
// Fast values shared between the render loop and the interface without going through React state.
export const interfaceBus = {
  camera: null,
  veil: 0,
  heat: { amount: 0, a: new THREE.Vector2(0.5, 0.3), b: new THREE.Vector2(0.5, 0.1) },
  pointer: new THREE.Vector2(0, 0),
  pointerActive: false,
  focus: { weight: 0, dir: null, p0: 0, releasing: false },
  portalHover: 0,
  gatePos: null,
};
