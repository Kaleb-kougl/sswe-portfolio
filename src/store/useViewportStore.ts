import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

/**
 * Which of the three explicit viewport states is currently on screen.
 *
 *  live  — the interactive R3F <Canvas>. Default on pointer devices with
 *          WebGL 2 and no reduced-motion preference, and after the viewer
 *          taps "TAP TO LOAD 3D" from the still.
 *  still — a static preview + explicit load button. Touch-only devices and
 *          `prefers-reduced-motion: reduce`.
 *  text  — HTML-only card. WebGL is unavailable or the GPU errored out.
 */
export type ViewportMode = 'live' | 'still' | 'text';

interface ViewportState {
  /** Current viewport state. Written by the viewport gate, read by HUDs. */
  mode: ViewportMode;
  /**
   * Global motion pause. Read with `useViewportStore.getState().paused`
   * inside `useFrame` (never with the reactive hook — that would re-render
   * a component adjacent to the Canvas) and with the hook in DOM components.
   */
  paused: boolean;

  setMode: (mode: ViewportMode) => void;
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
}

/**
 * useViewportStore — tiny companion to useEngineStore for viewport-shell
 * concerns (which of the three states is showing, and whether motion is
 * paused). Kept separate so pausing never touches scene/engine state.
 *
 * Follows the same conventions as useEngineStore: `devtools` (dev only) +
 * `subscribeWithSelector` so frame loops can subscribe imperatively.
 */
export const useViewportStore = create<ViewportState>()(
  devtools(
    subscribeWithSelector((set) => ({
      mode: 'live' as ViewportMode,
      paused: false,

      setMode: (mode) => set({ mode }, undefined, 'viewport/setMode'),
      setPaused: (paused) => set({ paused }, undefined, 'viewport/setPaused'),
      togglePaused: () =>
        set((state) => ({ paused: !state.paused }), undefined, 'viewport/togglePaused'),
    })),
    {
      name: 'ViewportStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);
