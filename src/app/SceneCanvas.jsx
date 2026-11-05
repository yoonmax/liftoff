import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { World } from './World.jsx';
import { QUALITY, useQuality } from '../performance/QualityManager.js';

export function SceneCanvas() {
  const tier = useQuality((s) => s.tier);
  const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[tier].dpr);
  return (
    <div className="stage" aria-hidden="true">
      <Canvas
        flat linear dpr={dpr} frameloop="always"
        gl={{ antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}><World /></Suspense>
      </Canvas>
    </div>
  );
}
