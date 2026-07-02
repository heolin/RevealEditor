import { defineConfig } from '@playwright/test';

/**
 * E2E suite driving the BUILT app against a disposable copy of the demo
 * workspace (tests save files — the real demo-workspace stays pristine).
 * Run with: npm run test:e2e  (builds first)
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  retries: 1,
  workers: 1, // tests share one workspace + server; keep them serial
  use: {
    baseURL: 'http://localhost:4340',
  },
  webServer: {
    command: 'node server/dist/index.js .e2e-workspace --port 4340',
    url: 'http://localhost:4340/api/decks',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
