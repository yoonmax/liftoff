import { create } from 'zustand';

// Quality is a data table. Counts are clamped through draw ranges and step counts through uniforms, so
// switching tier never rebuilds geometry or recompiles a shader.
export const QUALITY = {
  low: { label: 'low', dpr: 1, msaa: 0, atmoSteps: 6, lightSteps: 2, smoke: 420, puffs: 60, sparks: 220, dust: 280, rocks: 280, ringRocks: 240, nebulaSteps: 14, nebulaScale: 0.34, moonRelief: 8, bloomLevels: 4, shadow: 0, grain: 0.6, shafts: false, streak: false },
  balanced: { label: 'balanced', dpr: 1.25, msaa: 0, atmoSteps: 8, lightSteps: 3, smoke: 800, puffs: 110, sparks: 480, dust: 520, rocks: 520, ringRocks: 480, nebulaSteps: 20, nebulaScale: 0.42, moonRelief: 14, bloomLevels: 5, shadow: 1024, grain: 0.8, shafts: true, streak: false },
  high: { label: 'high', dpr: 1.5, msaa: 4, atmoSteps: 12, lightSteps: 4, smoke: 1150, puffs: 170, sparks: 900, dust: 900, rocks: 860, ringRocks: 760, nebulaSteps: 24, nebulaScale: 0.5, moonRelief: 22, bloomLevels: 6, shadow: 2048, grain: 1, shafts: true, streak: true },
  ultra: { label: 'ultra', dpr: 2, msaa: 4, atmoSteps: 16, lightSteps: 6, smoke: 2200, puffs: 240, sparks: 1500, dust: 1500, rocks: 1300, ringRocks: 1200, nebulaSteps: 32, nebulaScale: 0.58, moonRelief: 32, bloomLevels: 6, shadow: 4096, grain: 1, shafts: true, streak: true },
};
export const TIERS = ['low', 'balanced', 'high', 'ultra'];
export const MAX_COUNTS = QUALITY.ultra;

/** A first guess before any frame has been measured. Automatic mode then adjusts from real frame times. */
export function initialTier({ isMobile, memory, cores, renderer = '' }) {
  const software = /swiftshader|llvmpipe|software/i.test(renderer);
  if (software) return 'low';
  if (isMobile) return memory && memory >= 6 ? 'balanced' : 'low';
  if (cores && cores <= 4) return 'balanced';
  if (/apple m[2-9]|rtx|radeon rx|geforce gtx 1[6-9]|arc/i.test(renderer)) return 'high';
  return 'balanced';
}

/** Steps a tier down when frames are slow and back up only after a long stretch of headroom. */
export function nextTier(tier, fps) {
  const i = TIERS.indexOf(tier);
  if (fps < 34 && i > 0) return TIERS[i - 1];
  if (fps > 58 && i < TIERS.indexOf('high')) return TIERS[i + 1];
  return tier;
}

export const useQuality = create((set) => ({
  tier: 'balanced',
  auto: true,
  setTier: (tier, auto = false) => set({ tier, auto }),
  autoStep: (tier) => set({ tier }),
}));

export const quality = () => QUALITY[useQuality.getState().tier];
