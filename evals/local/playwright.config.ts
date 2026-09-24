import { defineConfig } from '@playwright/test';

/**
 * The on-device model comparison (compare.eval.ts). Not part of the e2e
 * suite: it needs a real GPU, a warm model cache and a dev server you start
 * yourself (see the header of compare.eval.ts). Files are `*.eval.ts` so
 * neither vitest nor the e2e config picks them up.
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
