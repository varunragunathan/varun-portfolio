import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 15_000,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',       // use system Chrome — no browser download needed
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],

  // Start vite dev server automatically; reuse if already running locally.
  webServer: {
    command: 'yarn dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
    env: { VITE_ENABLE_AUTH: 'false' }, // run smoke tests without auth to avoid secrets
  },
});
