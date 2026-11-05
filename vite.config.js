import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.glsl'],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks(id) { if (id.includes('node_modules/three') || id.includes('@react-three')) return 'three'; if (id.includes('node_modules/gsap') || id.includes('@gsap')) return 'gsap'; } } },
  },
});
