import path from 'node:path';

import { expect, test } from '@playwright/test';

import { isMobileProject, isolateNetwork, settle, skipIfNotFor, skipUnlessBemConfig, STATES } from './states';

/**
 * Pixel-exact screenshots of every state in ./states.ts (maxDiffPixels: 0).
 * Baselines: e2e/bem/__baseline__/screenshots/<project>/<state>.png.
 *
 * DETERMINISM
 *   - reducedMotion 'reduce': the 3D backdrop renders one static arrangement
 *     and globals.css zeroes CSS transitions/animations; `animations:
 *     'disabled'` finishes anything left; `caret: 'hide'` for focused fields.
 *   - fonts: `document.fonts.ready` before every shot.
 *   - off-origin requests are aborted (reCAPTCHA arms on contact-form focus).
 *   - <canvas> is HIDDEN (visibility: hidden, screenshot-only style), not
 *     `mask:`ed. The homepage backdrop canvas is `fixed inset-0`, so a mask
 *     paints the whole viewport a flat colour and the shot defends nothing
 *     (see e2e/visual-regression.spec.ts). Hidden, the page's own pixels stay
 *     in frame; WebGL output depends on the GPU/driver, not on our CSS.
 */

test.use({ contextOptions: { reducedMotion: 'reduce' } });

for (const state of STATES) {
  test(`screenshot: ${state.name}`, async ({ page, context, baseURL }, testInfo) => {
    skipUnlessBemConfig(testInfo);
    skipIfNotFor(state, testInfo);
    await isolateNetwork(context, baseURL!);

    await state.run(page, { mobile: isMobileProject(testInfo) });
    await settle(page);

    await expect(page).toHaveScreenshot(`${state.name}.png`, {
      fullPage: state.shot.kind === 'full',
      animations: 'disabled',
      caret: 'hide',
      scale: 'device',
      maxDiffPixels: 0,
      stylePath: path.join(__dirname, 'screenshot.css'),
      timeout: 30_000,
    });
  });
}
