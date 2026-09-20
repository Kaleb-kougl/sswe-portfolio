import { describe, expect, it, vi } from 'vitest';

import {
  WATCHDOG_MAX_WORK_MS,
  WATCHDOG_MIN_SAMPLES,
  WATCHDOG_STALL_S,
  WATCHDOG_SUSTAIN_S,
  WATCHDOG_WARMUP_S,
  createFrameWatchdog,
  sampleFrame,
} from '@/components/3d/frame-watchdog';

/**
 * The downgrade rule, on its own. It used to be unreachable — buried in a
 * `useFrame` callback inside an R3F `Canvas` — and the only coverage was an
 * end-to-end test that forced a downgrade with CDP CPU throttling. That test
 * could prove the rule fired; it could not prove the rule was *right*, and the
 * rule was wrong: it judged frame rate, so a healthy browser on a 30Hz display
 * was downgraded within four seconds of loading the page.
 *
 * The regression that matters is therefore the third case below, and it is one
 * a browser test cannot easily stage: there is no Chromium flag that caps rAF
 * to 30Hz on demand. Here it is three lines.
 */

/** A frame that costs nothing, at whatever cadence the display offers. */
const CHEAP_MS = 0.05;
/** A frame the scene itself has eaten. */
const EXPENSIVE_MS = WATCHDOG_MAX_WORK_MS * 2;

const FPS_60 = 1 / 60;
const FPS_30 = 1 / 30;

/** Runs `seconds` of loop time at `delta` per frame, and counts downgrades. */
function run(
  seconds: number,
  delta: number,
  workMs: number,
  watchdog = createFrameWatchdog(),
  onTooSlow = vi.fn(),
) {
  for (let t = 0; t < seconds; t += delta) sampleFrame(watchdog, delta, workMs, onTooSlow);
  return { watchdog, onTooSlow };
}

describe('the work-time watchdog', () => {
  it('leaves a healthy 60fps device alone', () => {
    const { onTooSlow } = run(30, FPS_60, CHEAP_MS);
    expect(onTooSlow).not.toHaveBeenCalled();
  });

  it('leaves a device alone whose frames are cheap but slow to arrive', () => {
    // The bug. A display capped at 30Hz delivers a metronomic 33.3ms frame and
    // the scene fills a twentieth of a millisecond of it. The old rule read
    // that as 30fps, compared it to a 40fps floor, and turned the backdrop off.
    const { onTooSlow } = run(30, FPS_30, CHEAP_MS);
    expect(onTooSlow).not.toHaveBeenCalled();
  });

  it('leaves a genuinely throttled device alone while the scene stays cheap', () => {
    // Measured: a Pixel 5 emulation under a 50x CPU handicap runs at ~32fps and
    // spends 3.7ms per frame in this scene. Slow device, cheap backdrop — and
    // the backdrop is not what is costing it anything.
    const { onTooSlow } = run(30, 1 / 32, 3.7);
    expect(onTooSlow).not.toHaveBeenCalled();
  });

  it('downgrades when the scene itself is eating the frame', () => {
    const { onTooSlow } = run(30, FPS_30, EXPENSIVE_MS);
    expect(onTooSlow).toHaveBeenCalledTimes(1);
  });

  it('says nothing during the warm-up, however expensive the frames are', () => {
    // Startup jank — chunk eval, shader compile, the GLB swap — is not evidence.
    const { onTooSlow } = run(WATCHDOG_WARMUP_S * 0.9, FPS_60, EXPENSIVE_MS);
    expect(onTooSlow).not.toHaveBeenCalled();
  });

  it('will not judge a window it has not filled to the minimum', () => {
    const watchdog = createFrameWatchdog();
    const onTooSlow = vi.fn();
    // Clear the warm-up first, so only the sample count is under test.
    run(WATCHDOG_WARMUP_S + FPS_60, FPS_60, CHEAP_MS, watchdog, onTooSlow);
    watchdog.frames.fill(0);
    watchdog.cursor = 0;
    watchdog.filled = 0;
    watchdog.sum = 0;

    for (let i = 0; i < WATCHDOG_MIN_SAMPLES - 1; i++) {
      sampleFrame(watchdog, FPS_60, EXPENSIVE_MS, onTooSlow);
    }
    expect(watchdog.badFor).toBe(0);
    expect(onTooSlow).not.toHaveBeenCalled();
  });

  it('needs the badness sustained, not merely present', () => {
    const watchdog = createFrameWatchdog();
    const onTooSlow = vi.fn();
    run(WATCHDOG_WARMUP_S + WATCHDOG_SUSTAIN_S * 0.5, FPS_60, EXPENSIVE_MS, watchdog, onTooSlow);
    expect(onTooSlow).not.toHaveBeenCalled();
  });

  it('resets the streak on a single frame back inside the budget', () => {
    const watchdog = createFrameWatchdog();
    const onTooSlow = vi.fn();
    run(WATCHDOG_WARMUP_S, FPS_60, CHEAP_MS, watchdog, onTooSlow);

    // Nudge the average over the budget, then drop one cheap frame in
    // repeatedly: the streak never gets to accumulate `WATCHDOG_SUSTAIN_S`.
    for (let i = 0; i < 500; i++) {
      sampleFrame(watchdog, FPS_60, EXPENSIVE_MS, onTooSlow);
      if (watchdog.badFor > 0) {
        watchdog.frames.fill(0);
        watchdog.sum = 0;
        sampleFrame(watchdog, FPS_60, 0, onTooSlow);
        expect(watchdog.badFor).toBe(0);
      }
    }
    expect(onTooSlow).not.toHaveBeenCalled();
  });

  it('throws the window away on a stall rather than counting it', () => {
    const watchdog = createFrameWatchdog();
    const onTooSlow = vi.fn();
    run(WATCHDOG_WARMUP_S + 1, FPS_60, EXPENSIVE_MS, watchdog, onTooSlow);
    expect(watchdog.filled).toBeGreaterThan(0);

    // A tab comes back after two seconds away.
    sampleFrame(watchdog, WATCHDOG_STALL_S + 1.5, EXPENSIVE_MS, onTooSlow);

    expect(watchdog.filled).toBe(0);
    expect(watchdog.sum).toBe(0);
    expect(watchdog.badFor).toBe(0);
    expect(Array.from(watchdog.frames).every((v) => v === 0)).toBe(true);
    expect(onTooSlow).not.toHaveBeenCalled();
  });

  it('treats a zero or negative delta as a stall, not as an infinite frame rate', () => {
    const watchdog = createFrameWatchdog();
    const onTooSlow = vi.fn();
    run(WATCHDOG_WARMUP_S + 1, FPS_60, EXPENSIVE_MS, watchdog, onTooSlow);
    sampleFrame(watchdog, 0, EXPENSIVE_MS, onTooSlow);
    expect(watchdog.filled).toBe(0);
  });

  it('latches: it downgrades once and is inert afterwards', () => {
    const watchdog = createFrameWatchdog();
    const onTooSlow = vi.fn();
    run(30, FPS_30, EXPENSIVE_MS, watchdog, onTooSlow);
    expect(onTooSlow).toHaveBeenCalledTimes(1);
    expect(watchdog.tripped).toBe(true);

    // There is no promotion path either: feeding it perfect frames changes
    // nothing, because a scene that oscillated would be worse than either state.
    run(30, FPS_60, CHEAP_MS, watchdog, onTooSlow);
    expect(onTooSlow).toHaveBeenCalledTimes(1);
  });
});
