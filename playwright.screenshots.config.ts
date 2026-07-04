import { defineConfig } from '@playwright/test';

/**
 * Screenshot generator for the docs/site — NOT part of the e2e suite (that
 * config's testDir is ./e2e; this one lives in ./scripts so `npm run test:e2e`
 * never picks it up). Reuses the same built-app server + disposable workspace.
 * Run with: npm run screenshots  (builds first)
 */
export default defineConfig({
  testDir: './scripts',
  testMatch: 'screenshots.spec.ts',
  globalSetup: './scripts/screenshots-setup.ts',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4340',
    viewport: { width: 1360, height: 850 },
    deviceScaleFactor: 2,
  },
  webServer: {
    command: 'node server/dist/index.js .screenshots-workspace --port 4340',
    url: 'http://localhost:4340/api/decks',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
