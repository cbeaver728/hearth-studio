import { defineConfig } from '@playwright/test';
const baseURL = process.env.HEARTH_TEST_URL || 'http://127.0.0.1:5173';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 1500, height: 980 },
    headless: true,
    launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist'] },
  },
  webServer: { command: 'npm run dev', url: baseURL, reuseExistingServer: true },
  reporter: 'list',
});
