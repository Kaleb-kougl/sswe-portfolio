import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canvasMatchesHost,
  RecoverableResizeObserver,
  remeasureBackdrop,
} from '@/components/3d/canvas-measure';

/**
 * `canvas-measure.ts` exists because react-three-fiber will not create its root
 * until something reports a non-zero box, and the only thing that ever reports
 * one is a ResizeObserver delivery that a non-rendering document never gets.
 * These cover the two halves of the escape hatch: recognising the failure, and
 * being able to act on it.
 *
 * The end-to-end proof — a real page whose ResizeObserver never calls back,
 * recovering anyway — is `e2e/backdrop-renders.spec.ts`. jsdom has no layout,
 * so it can only check the logic, never the outcome.
 */

/** jsdom ships no ResizeObserver; this is the seam the real class wraps. */
class FakeResizeObserver {
  static live: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;

  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.live.push(this);
  }
  observe(target: Element) {
    this.observed.push(target);
  }
  unobserve(target: Element) {
    this.observed = this.observed.filter((el) => el !== target);
  }
  disconnect() {
    this.disconnected = true;
  }
}

beforeEach(() => {
  FakeResizeObserver.live = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A host whose box jsdom would otherwise report as 0x0. */
function hostOf(width: number, height: number): HTMLElement {
  const host = document.createElement('div');
  host.getBoundingClientRect = () =>
    ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;
  return host;
}

/** A canvas reporting a CSS box, which jsdom does not compute either. */
function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { value: width });
  Object.defineProperty(canvas, 'clientHeight', { value: height });
  return canvas;
}

describe('canvasMatchesHost', () => {
  it('rejects the 300x150 intrinsic default inside a real host', () => {
    // Exactly the shape the backdrop shipped in: a full-viewport host, and a
    // canvas nothing ever called setSize on.
    expect(canvasMatchesHost(canvasOf(300, 150), hostOf(1718, 962))).toBe(false);
  });

  it('accepts a canvas R3F has sized to its host', () => {
    expect(canvasMatchesHost(canvasOf(1718, 962), hostOf(1718, 962))).toBe(true);
  });

  it('tolerates a pixel of rounding on a fractional host box', () => {
    expect(canvasMatchesHost(canvasOf(1718, 962), hostOf(1718.4, 962.4))).toBe(true);
  });

  it('rejects a stale size, not just a missing one', () => {
    expect(canvasMatchesHost(canvasOf(1718, 962), hostOf(1280, 720))).toBe(false);
  });

  it('treats a collapsed host as nothing to size to', () => {
    // Not the failure this module is about, and retrying forever would be the
    // wrong answer to it.
    expect(canvasMatchesHost(canvasOf(300, 150), hostOf(0, 0))).toBe(true);
  });
});

describe('RecoverableResizeObserver', () => {
  it('observes through the native observer', () => {
    const target = document.createElement('div');
    const observer = new RecoverableResizeObserver(vi.fn());
    observer.observe(target);

    expect(FakeResizeObserver.live).toHaveLength(1);
    expect(FakeResizeObserver.live[0].observed).toEqual([target]);
  });

  it('runs the measure callback when asked out of band', () => {
    const callback = vi.fn();
    new RecoverableResizeObserver(callback).observe(document.createElement('div'));

    // The whole point: a measurement without a delivery.
    expect(callback).not.toHaveBeenCalled();
    remeasureBackdrop();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('stays quiet until it is observing something', () => {
    const callback = vi.fn();
    new RecoverableResizeObserver(callback);

    remeasureBackdrop();
    expect(callback).not.toHaveBeenCalled();
  });

  it('is not pokeable once disconnected', () => {
    const callback = vi.fn();
    const observer = new RecoverableResizeObserver(callback);
    observer.observe(document.createElement('div'));
    observer.disconnect();

    remeasureBackdrop();
    expect(callback).not.toHaveBeenCalled();
    expect(FakeResizeObserver.live[0].disconnected).toBe(true);
  });

  it('pokes every live observer, so a second canvas is not left behind', () => {
    const first = vi.fn();
    const second = vi.fn();
    new RecoverableResizeObserver(first).observe(document.createElement('div'));
    new RecoverableResizeObserver(second).observe(document.createElement('div'));

    remeasureBackdrop();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
