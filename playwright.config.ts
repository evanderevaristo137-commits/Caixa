import { defineConfig, devices } from '@playwright/test';

// End-to-end checks of the real app in an emulated Android phone (Chrome).
const BASE = '/caixa-e2e/';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Pixel 5'],
    baseURL: `http://localhost:4174${BASE}`,
    trace: 'off',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4174 --strictPort',
    env: { BASE_PATH: BASE },
    url: `http://localhost:4174${BASE}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
