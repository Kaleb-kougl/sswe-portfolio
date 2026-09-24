import { defineConfig } from '@playwright/test';

/**
 * The on-device chat faithfulness spike (run.eval.ts). Not part of the e2e
 * suite: it needs a real GPU, cached weights and a dev server you start
 * yourself (see the header of run.eval.ts).
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.eval\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60 * 60_000,
});
