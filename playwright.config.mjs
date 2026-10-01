import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.mjs',
  workers: 1,
  timeout: 60000,
  globalSetup: './e2e/global-setup.mjs',
  reporter: [['list']],
});
