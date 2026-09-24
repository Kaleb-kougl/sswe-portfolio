'use client';

import { memo } from 'react';
import type { WebGLFallbackProps } from './error-boundary';

/**
 * Path of the rendered still preview.
 *
 * TODO(asset): the still has NOT been captured yet. Until a real
 * `public/viewport-still.webp` exists, `STILL_AVAILABLE` stays false and the
 * component paints a CSS-only placeholder, so the page never requests a
 * missing file (no 404) and never shows a broken-image glyph. Flip the flag to
 * true in the same commit that adds the file.
 */
export const STILL_SRC = '/viewport-still.webp';
export const STILL_AVAILABLE = false;

/** Repo the text fallback links to. */
const SOURCE_URL = 'https://github.com/Kaleb-kougl';

/**
 * StillBackdrop — the flat, CSS-drawn stand-in for the rendered preview.
 * Pure decoration: `aria-hidden`, no pointer events, no network request.
 */
const StillBackdrop = memo(function StillBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {/* Flat wash — no glow, hard edges only. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(160deg, color-mix(in srgb, var(--color-interactive) 14%, transparent) 0%, transparent 55%), linear-gradient(20deg, color-mix(in srgb, var(--color-action) 12%, transparent) 0%, transparent 45%)',
        }}
      />
      {/* Wireframe stand-in for the model: two offset squares + a horizon line. */}
      <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 sm:h-44 sm:w-44">
        <div className="absolute inset-0 border-[3px]" />
        <div className="absolute inset-0 translate-x-4 translate-y-4 border-[3px] opacity-60" />
        <div className="absolute left-0 top-0 h-[3px] w-[22px] origin-left rotate-45" />
        <div className="absolute bottom-0 right-0 h-[3px] w-[22px] origin-right rotate-45 opacity-60" />
      </div>
      <div className="absolute inset-x-0 bottom-1/3 h-[3px] opacity-20" />
    </div>
  );
});

export interface ViewportStillProps {
  /** Why the still is showing — drives the caption copy. */
  reason: 'touch' | 'reduced-motion';
  /** Promote the viewport to the live interactive scene. */
  onActivate: () => void;
}

/**
 * ViewportStill — state 2 of 3.
 *
 * A static preview with an explicit, real-HTML load button. Shown on
 * touch-only devices and whenever `prefers-reduced-motion: reduce` is set, so
 * neither group is handed an autoplaying WebGL scene — but neither is the demo
 * hidden from them: tapping promotes to the live canvas.
 */
export const ViewportStill = memo(function ViewportStill({
  reason,
  onActivate,
}: ViewportStillProps) {
  return (
    <div className="viewport-fallback__still">
      {STILL_AVAILABLE ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={STILL_SRC}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <StillBackdrop />
      )}

      <div className="relative flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onActivate}
          className="button button--brutal min-w-[44px] gap-2"
        >
          <span aria-hidden="true">▶</span> Tap to load 3D
        </button>
        <p className="viewport-fallback__caption">
          {reason === 'reduced-motion'
            ? 'Motion is reduced on this device. The 3D scene stays paused until you load it.'
            : 'Interactive 3D is heavy on phones. Load it when you want it.'}
        </p>
      </div>
    </div>
  );
});

/**
 * ViewportTextCard — state 3 of 3, and the single text fallback.
 *
 * Unifies what used to be two separate components: the Canvas `fallback`
 * (WebGL never initialised) and the WebGLErrorBoundary's FallbackComponent (the
 * GPU errored out mid-session). Both are the same situation from the viewer's
 * side — no 3D — so they get one card. `error`/`reset` are optional: with them
 * the card reports the failure and offers Retry, without them it reports plain
 * lack of WebGL support.
 *
 * Everything here is real HTML and needs no WebGL to render.
 */
export const ViewportTextCard = memo(function ViewportTextCard({
  error,
  reset,
}: Partial<WebGLFallbackProps>) {
  return (
    <div
      role="alert"
      className="viewport-fallback__card"
    >
      <p className="viewport-fallback__message">
        3D visualization unavailable{error ? `: ${error.message}` : ''}
      </p>
      {!error && (
        <p className="viewport-fallback__note">
          WebGL is not supported on this device.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {reset && (
          <button type="button" onClick={reset} className="button button--brutal min-w-[44px] gap-2">
            Retry
          </button>
        )}
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="button button--brutal min-w-[44px] gap-2"
        >
          View source on GitHub
        </a>
        <a href="/KalebK_Resume.pdf" download className="button button--brutal min-w-[44px] gap-2">
          Download Resume PDF
        </a>
      </div>
    </div>
  );
});

/**
 * Whether WebGL 2 is usable.
 *
 * Deliberately optimistic: it only reports `false` when the browser exposes
 * `WebGL2RenderingContext` *and* refuses to hand out a context — i.e. a
 * definite failure. Anywhere the probe cannot conclude (SSR, jsdom, a browser
 * with no WebGL2 constructor at all) it returns true and lets R3F's own Canvas
 * `fallback` path decide, which is a real context creation attempt rather than
 * a guess. Either route ends in <ViewportTextCard/>.
 */
function probeWebGL2(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof (window as { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext === 'undefined') {
    return true;
  }
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('webgl2');
    if (!ctx) return false;
    // Release the probe context immediately.
    (ctx as WebGL2RenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return true;
  }
}

/** Memoized so the throwaway probe context is created at most once per load. */
let webgl2Support: boolean | null = null;

export function detectWebGL2(): boolean {
  if (webgl2Support === null) webgl2Support = probeWebGL2();
  return webgl2Support;
}
