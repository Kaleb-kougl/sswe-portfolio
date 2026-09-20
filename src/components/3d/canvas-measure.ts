/**
 * canvas-measure — the backdrop's insurance against a measurement that never
 * arrives.
 *
 * THE FAILURE THIS EXISTS FOR
 * ---------------------------
 * `<Canvas>` creates its R3F root inside exactly one guard
 * (`node_modules/@react-three/fiber/dist/react-three-fiber.cjs.dev.js`):
 *
 *     if (containerRect.width > 0 && containerRect.height > 0 && canvas) {
 *       if (!root.current) root.current = createRoot(canvas)
 *       ...
 *     }
 *
 * `containerRect` comes from `react-use-measure`, and the ONLY thing that ever
 * fills it in is a ResizeObserver callback. ResizeObserver delivery is a step
 * of the document's *rendering* lifecycle, so a document that is not being
 * rendered when the canvas mounts gets no delivery at all — verified in Chrome:
 * in a backgrounded tab neither `requestAnimationFrame` nor a ResizeObserver on
 * `document.body` fires. R3F has no second way in, so the root is never
 * created, `gl.setSize` never runs, and the element keeps the 300x150 intrinsic
 * default HTML hands an unsized `<canvas>` — inside a host measuring the full
 * viewport.
 *
 * And nothing tells you. There is no exception for a component that simply
 * never started: `WebGLErrorBoundary` can only catch throws, the `Canvas`
 * `fallback` only renders when context creation fails, and the host is
 * `aria-hidden`. It fails open into blank white, silently, in the one element
 * deliberately excluded from every signal this repo collects.
 *
 * WHAT THIS ADDS
 * --------------
 * `RecoverableResizeObserver` is the native observer plus one out-of-band
 * entry point. Handed to `<Canvas resize={{ polyfill }}>` it behaves exactly
 * like the observer react-use-measure would have built for itself, and adds
 * `remeasureBackdrop()` — a way to say "measure now" without waiting for a
 * delivery that may never come.
 *
 * Deliberately NOT `window.dispatchEvent(new Event('resize'))`. That is the
 * other lever react-use-measure exposes, but it is a global broadcast: it would
 * also re-run `startScrollTracking`'s `remeasure`, Next's own listeners, and
 * anything a future section adds. This reaches the one observer that needs it.
 */

/** react-use-measure ignores both arguments; the shape is for the type. */
type MeasureCallback = (entries: unknown[], observer: ResizeObserver) => void;

/**
 * Live observers, by the "measure now" thunk each one was built with.
 *
 * A `Set` rather than a single slot because nothing guarantees there is only
 * ever one canvas on the page — the projectiles demo opens a second one — and
 * an observer that has been `disconnect`ed must not be pokeable afterwards.
 */
const pending = new Set<() => void>();

export class RecoverableResizeObserver {
  private readonly native: ResizeObserver;
  private readonly remeasure: () => void;

  constructor(callback: MeasureCallback) {
    this.native = new ResizeObserver(callback as ResizeObserverCallback);
    this.remeasure = () => callback([], this.native);
  }

  observe(target: Element, options?: ResizeObserverOptions): void {
    pending.add(this.remeasure);
    this.native.observe(target, options);
  }

  unobserve(target: Element): void {
    this.native.unobserve(target);
  }

  disconnect(): void {
    pending.delete(this.remeasure);
    this.native.disconnect();
  }
}

/** Ask every live `RecoverableResizeObserver` to measure its target again. */
export function remeasureBackdrop(): void {
  for (const remeasure of pending) remeasure();
}

/**
 * Whether R3F has sized this canvas to its host.
 *
 * `gl.setSize` writes both the backing store and the CSS box, so a canvas whose
 * CSS box matches its host is a canvas R3F has taken charge of. A canvas still
 * at its intrinsic default is one it never reached. Compared at 1px tolerance
 * because a fractional host box (1718.4px) rounds when it becomes a style.
 *
 * A zero-sized host is reported as a match: there is nothing to size to, and a
 * backdrop in a collapsed container is not the failure this module is about.
 */
export function canvasMatchesHost(canvas: HTMLCanvasElement, host: HTMLElement): boolean {
  const box = host.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return true;
  return (
    Math.abs(canvas.clientWidth - box.width) <= 1 && Math.abs(canvas.clientHeight - box.height) <= 1
  );
}
