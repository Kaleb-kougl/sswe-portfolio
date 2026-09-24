import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * The embedding matcher's Node eval (sweep.eval.ts). Not part of
 * `npm run test:unit`: it downloads models (~25–35 MB each) on first run.
 *
 *   npx vitest run -c evals/embed/vitest.config.ts
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '../../src') } },
  test: {
    environment: 'node',
    include: ['evals/embed/**/*.eval.ts'],
    root: path.resolve(__dirname, '../..'),
    testTimeout: 60 * 60_000,
    hookTimeout: 60 * 60_000,
  },
});
