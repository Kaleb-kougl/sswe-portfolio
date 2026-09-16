import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./__tests__/setup.ts'],
    exclude: [
      'e2e/**',
      '**/node_modules/**',
      'r3f-scraper/**',
      // roblox-css compiles to Luau and its specs run under TestEZ inside
      // Roblox — they import `@rbxts/*` and reach for `game.WaitForChild`,
      // so vitest can only fail to load them. Counting its assertions is
      // `npm run roblox-css:check`, not this suite.
      'roblox-css/**',
    ],
  },
});
