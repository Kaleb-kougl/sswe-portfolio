/**
 * frame-watchdog — decides, from evidence, whether this device can afford the
 * animated backdrop. Used by `morph-canvas.tsx`; kept separate because the
 * rule is worth testing on its own, and a rule that lives inside a `useFrame`
 * callback inside an R3F `Canvas` is not.
 *
 * WHY THIS MEASURES WORK AND NOT FRAME RATE
 * -----------------------------------------
 * It used to measure frame rate, and downgraded below 40fps. That was wrong,
 * because the rate `requestAnimationFrame` is offered at is the compositor's
 * to choose and says nothing about whether this scene can be drawn. A browser
 * capped at 30Hz delivers a flawless 33.3ms every frame — measured 33.7 33.4
 * 33.4 33.2 33.3, about 1ms of jitter — while sitting on enormous headroom,
 * and against a floor of 40 that is indistinguishable from a device drowning.
 * So the backdrop animated for the ~3.7s the window needs and then latched off
 * for the session, snapping back to stage 0: the KK glyph reappearing halfway
 * down the page, on hardware with nothing wrong with it.
 *
 * 30Hz is not exotic — macOS Low Power Mode, 4K over HDMI at 30, Chrome
 * throttling a window it believes is occluded, Windows and Android battery
 * savers — and no floor value could have rescued the old rule, because the two
 * populations overlap. Measured on this scene, before any downgrade:
 *
 *   desktop 1280x720                      ~93fps
 *   ...CPU throttled 20x                   ~39fps
 *   Pixel 5 emulation, DPR 1.25           ~120fps
 *   ...CPU throttled 20x                   ~57fps
 *   ...50x                                 ~32fps
 *   any viewport, display capped at 30Hz    ~30fps
 *
 * A phone under a fiftyfold CPU handicap runs FASTER than a healthy browser on
 * a 30Hz display. There is no number between those two rows, so there was no
 * frame-rate floor to pick.
 *
 * So the loop times itself instead. `MorphingBlocks` takes R3F's render
 * priority and calls `gl.render` by hand, which makes the whole frame — the
 * instance-buffer write and the draw — one bracketed span of main-thread time,
 * handed here as `workMs`. That span is immune to the cadence: a capped device
 * spends a fraction of a millisecond inside a 33ms frame, a drowning one
 * spends the frame. It is the question the watchdog was always trying to ask.
 *
 * The honest limitation: GL commands are submitted, not completed, inside that
 * span, so a purely fill-rate-bound GPU shows up only through the back-pressure
 * it puts on the next frame's submission rather than directly. That is a weaker
 * signal than a timer query would be, and `EXT_disjoint_timer_query_webgl2` is
 * too widely unavailable to rely on. It still beats counting frames.
 */

/** Frames the rolling window holds at most — 1s at 60fps, 2s at 30fps. */
const WATCHDOG_SAMPLES = 60;
/**
 * Frames before the window is allowed to have an opinion.
 *
 * A frame count, not a duration, and that is the point: the window has to be
 * long enough to be an average rather than a spike, but a device at 8fps takes
 * 7.5s to produce 60 frames, and waiting that long to notice would leave the
 * reader scrolling through the exact experience this is meant to end. 20 frames
 * is 0.17s of evidence on a healthy device and 2.5s on a badly broken one —
 * which is the right way round, because the broken one is the one whose frames
 * are individually damning.
 */
export const WATCHDOG_MIN_SAMPLES = 20;
/** Startup jank (chunk eval, shader compile, the GLB swap) is not evidence. */
export const WATCHDOG_WARMUP_S = 1;
/**
 * Rolling-average main-thread milliseconds per frame above which the window
 * counts as bad.
 *
 * Measured as the bracketed span, averaged over the window, under CDP CPU
 * throttling — which scales the span almost exactly linearly, because the span
 * is nothing but main-thread work:
 *
 *              desktop 1280x720   Pixel 5, DPR 1.25
 *   no throttle       under 0.1ms         under 0.1ms
 *   10x                     0.5ms               0.4ms
 *   20x                     1.1ms               0.9ms
 *   50x                     4.6ms               3.7ms
 *   100x                    9.3ms               3.5ms
 *   200x                   14.7ms              10.9ms
 *   400x               over budget         over budget
 *
 * The striking number is the first row. 112 instances written into two buffers
 * and one draw call costs this scene well under a tenth of a millisecond, so a
 * fiftyfold CPU handicap — a device at ~32fps, which the old rule downgraded —
 * still spends only 4.6ms of a 31ms frame on the backdrop. Turning it off there
 * would have bought back a seventh of a frame. The backdrop is essentially
 * never the reason a device is slow, and a rule that measures the backdrop
 * should say so by almost never firing.
 *
 * 16 is the 60fps budget: the scene alone can no longer hold 60fps, whatever
 * the display is doing. Everything healthy is two orders of magnitude under it,
 * and a capped 30Hz display does not appear in the table at all, because a cap
 * changes how often a frame runs and not what it costs.
 */
export const WATCHDOG_MAX_WORK_MS = 16;
/** How long it has to stay bad, continuously, before the still takes over. */
export const WATCHDOG_SUSTAIN_S = 2;
/**
 * Any frame longer than this is read as a stall, not as a measurement: a
 * resumed tab, a breakpoint, a scheduler hiccup. It resets the window rather
 * than counting toward it, so the watchdog only ever fires on sustained,
 * ordinary cost — the direction that errs toward keeping the animation.
 */
export const WATCHDOG_STALL_S = 0.5;

/**
 * Rolling window of per-frame work times. One instance per mounted frame loop,
 * allocated once — `sampleFrame` touches nothing but these fields and the ring
 * buffer, so the watchdog costs the loop no allocation and no garbage.
 */
export interface FrameWatchdog {
  /** Ring buffer of the last `WATCHDOG_SAMPLES` frames' work times, in ms. */
  frames: Float32Array;
  /** Next slot to overwrite. */
  cursor: number;
  /** How many slots are populated, capped at `frames.length`. */
  filled: number;
  /** Running sum of `frames`, so the average is O(1) per frame. */
  sum: number;
  /** Seconds of loop time observed, used to skip the warm-up. */
  elapsed: number;
  /** Seconds the rolling average has been continuously over the budget. */
  badFor: number;
  /** Latched: once true this watchdog is inert for good. */
  tripped: boolean;
}

export function createFrameWatchdog(): FrameWatchdog {
  return {
    frames: new Float32Array(WATCHDOG_SAMPLES),
    cursor: 0,
    filled: 0,
    sum: 0,
    elapsed: 0,
    badFor: 0,
    tripped: false,
  };
}

/**
 * Feeds one frame to the watchdog, and calls `onTooSlow` at most once, ever.
 *
 * `workMs` is what the frame cost this device. `delta` is the interval since
 * the previous frame, and is used only to tell a stall from a sequence and to
 * measure how long a bad streak has lasted; nothing judges it, which is the
 * whole point — see the note at the top of this file.
 *
 * The rule is deliberately hard to satisfy. A single expensive frame proves
 * nothing — so does an expensive tenth of a second — and a backdrop that
 * flickered between animated and still would be worse than either. What trips
 * it is the rolling average of the window (up to `WATCHDOG_SAMPLES` frames)
 * staying over `WATCHDOG_MAX_WORK_MS` for `WATCHDOG_SUSTAIN_S` of continuous
 * loop time, after the warm-up. Any single frame back inside the budget resets
 * the streak to zero.
 *
 * It is one-way on purpose. There is no promotion path back to the animation:
 * the watchdog latches here and the caller latches for the session, so a device
 * that has proved itself once is never re-measured and the scene cannot
 * oscillate.
 */
export function sampleFrame(
  watchdog: FrameWatchdog,
  delta: number,
  workMs: number,
  onTooSlow: () => void,
): void {
  if (watchdog.tripped) return;

  // A stall is not a measurement. Drop the window on the floor and start over:
  // the samples on either side of a multi-second gap are not a sequence.
  if (delta > WATCHDOG_STALL_S || delta <= 0) {
    // `fill` matters: `sum` is maintained by subtracting the slot being
    // overwritten, so leaving stale durations in the ring while zeroing `sum`
    // would let the two disagree, and an average computed from a sum that does
    // not match its samples is not an average of anything. It is 60 floats, on
    // an event that happens when a tab comes back.
    watchdog.frames.fill(0);
    watchdog.cursor = 0;
    watchdog.filled = 0;
    watchdog.sum = 0;
    watchdog.badFor = 0;
    return;
  }

  watchdog.elapsed += delta;
  if (watchdog.elapsed < WATCHDOG_WARMUP_S) return;

  const { frames } = watchdog;
  // The slot being overwritten is 0 until the ring has wrapped once, so this
  // keeps `sum` equal to the sum of exactly `filled` samples either way.
  watchdog.sum += workMs - frames[watchdog.cursor];
  frames[watchdog.cursor] = workMs;
  watchdog.cursor = (watchdog.cursor + 1) % frames.length;
  if (watchdog.filled < frames.length) watchdog.filled++;

  // Judge nothing until there is enough of a window to average.
  if (watchdog.filled < WATCHDOG_MIN_SAMPLES) return;

  const averageWorkMs = watchdog.sum / watchdog.filled;
  if (averageWorkMs <= WATCHDOG_MAX_WORK_MS) {
    watchdog.badFor = 0;
    return;
  }

  watchdog.badFor += delta;
  if (watchdog.badFor < WATCHDOG_SUSTAIN_S) return;

  watchdog.tripped = true;
  onTooSlow();
}
