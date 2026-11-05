import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:5231',
    viewport: { width: 1280, height: 720 },
    channel: 'chromium',
    launchOptions: { args: ['--use-angle=metal', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure',
  },
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run build && npx vite preview --port 5231 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5231',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
