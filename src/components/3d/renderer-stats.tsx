'use client';
'use no memo';

import { memo, useEffect } from 'react';
import * as fiber from '@react-three/fiber';
import { PALETTE } from './colors';

const { useThree } = fiber;

/**
 * `addAfterEffect` resolved defensively: test doubles of @react-three/fiber
 * throw on access to exports they don't define, and this panel must never be
 * the reason a viewport fails to mount.
 */
function getAddAfterEffect(): ((cb: () => void) => () => void) | null {
  try {
    const fn = (fiber as { addAfterEffect?: (cb: () => void) => () => void }).addAfterEffect;
    return typeof fn === 'function' ? fn : null;
  } catch {
    return null;
  }
}

interface RendererStatsProps {
  /** Viewport element the readout is appended to (same parent as <DesignStats/>). */
  parent?: React.RefObject<HTMLElement>;
  /** Extra classes for the container. */
  className?: string;
}

/** Rows, in render order. */
const ROWS = ['DRAW CALLS', 'TRIANGLES', 'GEOMETRIES', 'TEXTURES', 'ASSETS'] as const;

/** Asset extensions counted in the "ASSETS" row. */
const ASSET_RE = /\.(glb|gltf|bin|drc|ktx2|hdr|exr|basis)(\?|$)/i;

/** DOM writes are throttled to this interval (~2Hz). */
const WRITE_INTERVAL_MS = 500;

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

/**
 * Sum of transferred bytes for 3D assets fetched so far.
 * Uses the Resource Timing buffer, so it needs no hooks into the loaders.
 */
function loadedAssetBytes(): number {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return 0;
  }
  let total = 0;
  for (const entry of performance.getEntriesByType('resource')) {
    if (!ASSET_RE.test(entry.name)) continue;
    const r = entry as PerformanceResourceTiming;
    total += r.encodedBodySize || r.transferSize || 0;
  }
  return total;
}

/**
 * RendererStats — the real three.js numbers, next to the stats.js FPS panel.
 *
 * WHY POST-RENDER: `WebGLRenderer.render()` calls `info.reset()` at the *start*
 * of every frame (while `info.autoReset` is true), so `info.render.calls` /
 * `.triangles` are only meaningful between the end of a render and the start of
 * the next one. `useFrame` — at any priority — runs *before* R3F's render, so it
 * would read the previous frame's already-zeroed counters. `addAfterEffect`
 * registers a callback R3F invokes after it has flushed the render for every
 * root, which is the first safe moment to read them.
 *
 * WHY IMPERATIVE DOM: this lives inside the <Canvas> tree. Driving it with React
 * state would re-render a component adjacent to the Canvas every frame, which is
 * exactly what triggers React 19 dev-mode's "Converting circular structure to
 * JSON" profiler crash (see the comment blocks in canvas-wrapper.tsx). Counters
 * are sampled every frame into plain locals; only the text nodes are touched,
 * and only every 500ms.
 *
 * A11Y: `aria-hidden` — decorative telemetry, not content. It also must not
 * announce on every update, which a live region would do twice a second.
 */
export const RendererStats = memo(function RendererStats({
  parent,
  className,
}: RendererStatsProps) {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const host = parent?.current ?? document.body;
    const addAfterEffect = getAddAfterEffect();
    if (!host || !addAfterEffect) return;

    const container = document.createElement('div');
    container.setAttribute('aria-hidden', 'true');
    container.style.cssText = [
      'position:absolute',
      'right:4px',
      'top:76px',
      'z-index:20',
      'opacity:0.8',
      'min-width:104px',
      'padding:0',
      'pointer-events:none',
      `border:3px solid ${PALETTE.ink}`,
      `background:${PALETTE.paper}`,
      `box-shadow:5px 5px 0 ${PALETTE.ink}`,
      "font-family:var(--font-mono),'Space Mono',monospace",
      'font-size:9px',
      'font-weight:700',
      'letter-spacing:0.08em',
      'text-transform:uppercase',
      `color:${PALETTE.ink}`,
      'line-height:1.35',
    ].join(';');
    if (className) {
      className.split(' ').filter(Boolean).forEach((c) => container.classList.add(c));
    }

    const caption = document.createElement('div');
    caption.textContent = 'RENDERER';
    caption.style.cssText = `padding:0 4px;background:${PALETTE.paper};border-bottom:2px solid ${PALETTE.ink};white-space:nowrap`;
    container.appendChild(caption);

    const values: HTMLSpanElement[] = ROWS.map((label) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;padding:0 4px';

      const key = document.createElement('span');
      key.textContent = label;
      key.style.cssText = `color:${PALETTE.muted}`;

      const value = document.createElement('span');
      value.textContent = '—';

      row.append(key, value);
      container.appendChild(row);
      return value;
    });

    host.appendChild(container);

    /**
     * Park the readout directly under the FPS panel. `.stats-panel` is
     * positioned from globals.css (and moves on mobile), so measure rather
     * than hardcode. Runs after <DesignStats/> has mounted its own node —
     * effects fire in tree order and DesignStats is rendered first.
     */
    const place = () => {
      const fps = host.querySelector<HTMLElement>('.stats-panel');
      if (!fps || fps === container) return;
      const hostBox = host.getBoundingClientRect();
      const fpsBox = fps.getBoundingClientRect();
      if (!fpsBox.height) return;
      container.style.top = `${Math.round(fpsBox.bottom - hostBox.top) + 10}px`;
      container.style.right = `${Math.max(0, Math.round(hostBox.right - fpsBox.right))}px`;
    };
    const placeFrame = requestAnimationFrame(place);
    window.addEventListener('resize', place);

    // --- Per-frame sampling (cheap), 2Hz DOM writes ---
    let calls = 0;
    let triangles = 0;
    let lastWrite = 0;
    let lastAssetSample = 0;
    let assetBytes = 0;

    const info = gl?.info;

    const unsubscribe = addAfterEffect(() => {
      if (!info) return;
      // Valid ONLY here: three resets these at the top of the next render.
      calls = info.render.calls;
      triangles = info.render.triangles;

      const now = performance.now();
      if (now - lastWrite < WRITE_INTERVAL_MS) return;
      lastWrite = now;

      // Resource Timing scan is comparatively expensive — 1Hz is plenty.
      if (now - lastAssetSample > WRITE_INTERVAL_MS * 2) {
        lastAssetSample = now;
        assetBytes = loadedAssetBytes();
      }

      values[0].textContent = formatCount(calls);
      values[1].textContent = formatCount(triangles);
      values[2].textContent = formatCount(info.memory.geometries);
      values[3].textContent = formatCount(info.memory.textures);
      values[4].textContent = formatBytes(assetBytes);
    });

    return () => {
      cancelAnimationFrame(placeFrame);
      window.removeEventListener('resize', place);
      unsubscribe();
      container.remove();
    };
  }, [gl, parent, className]);

  return null;
});
