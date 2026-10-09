import { defineConfig, devices } from '@playwright/test';

const basePath = process.env.VITE_BASE_PATH || '/';
const mode = process.env.E2E_SERVER === 'dev' ? 'dev' : 'preview';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:4173${basePath}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-webkit',
      testMatch: ['mobile-layout.spec.ts', 'solver-fallback.spec.ts'],
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: `npm run ${mode} -- --host 127.0.0.1 --port 4173 --strictPort`,
    url: `http://127.0.0.1:4173${basePath}`,
    reuseExistingServer: false,
  },
});
