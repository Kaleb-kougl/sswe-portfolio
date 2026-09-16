'use client';
'use no memo';

import { memo, Suspense, useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { BloomEffect } from 'postprocessing';
import { ACESFilmicToneMapping, Color } from 'three';
import { PALETTE } from './colors';
import { DesignStats } from './design-stats';
import { RendererStats } from './renderer-stats';
import { ViewportStill, ViewportTextCard, detectWebGL2 } from './viewport-fallback';
import { useViewportRef } from '../viewport-ref-context';
import { WebGLErrorBoundary } from './error-boundary';
import { SceneOrchestrator, getSceneKey } from './scene-orchestrator';
import { AdaptivePixelRatio } from './adaptive-pixel-ratio';
import { MorphTransition } from './morph-transition';
import IBMFlex from './scenes/ibm-flex';
import IndeedFlex from './scenes/indeed-flex';
import { HammerBallFlex } from './scenes/hammerball-flex';
import { CombatSystemFlex } from './scenes/combat-system-flex';
import { AboutMeFlex } from './scenes/about-me-flex';
import DefaultScene from './scenes/default-scene';
import { useEngineStore } from '@/store/useEngineStore';
import { useViewportStore } from '@/store/useViewportStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// Side-effect: registers Three.js classes for tree-shaking
import './three-setup';

/**
 * Drag momentum decay. OrbitControls' damping multiplies its pending rotation
 * by `(1 - dampingFactor)` on every update() — so 0.08 here *is* the
 * `spin *= 0.92` decay: let go of a drag and the scene spins down smoothly
 * instead of stopping dead. PauseController raises this to 1 while paused
 * (`spin *= 0`), which is the only way motion ever halts instantly.
 */
const DAMPING_FACTOR = 0.08;

/** A press counts as a click only if the pointer moved less than this. */
const CLICK_SLOP_PX = 5;

/**
 * OrbitControlsWithGestureGuard — disables touch events when mobile
 * drawer or bottom sheet is being actively dragged.
 * Also calls performance.regress() on camera changes for movement regression.
 */
const OrbitControlsWithGestureGuard = memo(function OrbitControlsWithGestureGuard() {
  const isGestureDragging = useEngineStore((s) => s.isGestureDragging);
  const { performance } = useThree((s) => ({ performance: s.performance }));

  const handleChange = useCallback(() => {
    performance.regress();
  }, [performance]);

  return (
    <OrbitControls
      enabled={!isGestureDragging}
      enablePan={false}
      enableZoom={true}
      enableRotate={true}
      enableDamping
      dampingFactor={DAMPING_FACTOR}
      makeDefault
      onChange={handleChange}
    />
  );
});

/**
 * PauseController — the single place motion stops.
 *
 * Reads `paused` with `getState()` inside useFrame, never with the reactive
 * hook: a re-render next to the Canvas is what triggers React 19 dev-mode's
 * circular-structure profiler crash documented below.
 *
 * Two levers, no scene edits required:
 *  1. The shared three.js Clock is stopped, so every scene's `useFrame(delta)`
 *     sees delta 0 and every `clock.elapsedTime` reader freezes in place.
 *     `autoStart` is disabled first, otherwise `Clock.getDelta()` restarts the
 *     clock (and zeroes elapsedTime) the moment R3F asks for the next delta.
 *     Resuming restores the banked elapsedTime so scenes continue rather than
 *     jumping back to t=0 — which is also why `setFrameloop('never')` is NOT
 *     used here: R3F's implementation resets `clock.elapsedTime` to 0.
 *  2. OrbitControls' damping factor becomes 1, zeroing any leftover drag
 *     momentum (`spin *= paused ? 0 : 0.92`).
 */
const PauseController = memo(function PauseController() {
  useFrame((state) => {
    const { paused } = useViewportStore.getState();
    const clock = state.clock;

    if (paused && clock.running) {
      clock.autoStart = false;
      clock.stop();
    } else if (!paused && !clock.running) {
      const banked = clock.elapsedTime;
      clock.autoStart = true;
      clock.start();
      clock.elapsedTime = banked;
    }

    const controls = state.controls as unknown as { dampingFactor?: number } | null;
    if (controls && typeof controls.dampingFactor === 'number') {
      controls.dampingFactor = paused ? 1 : DAMPING_FACTOR;
    }
  });

  return null;
});

/**
 * PointerGrammar — click-vs-drag discrimination for the whole viewport.
 *
 * R3F hands scenes an `event.delta` but does not itself swallow a click that
 * was really a drag (it only suppresses `onPointerMissed` past 2px), so
 * rotating the camera can read as "the viewer clicked that object". This
 * listens in the CAPTURE phase on the very element R3F is connected to: a
 * capture listener on that node runs before the node's own bubble-phase
 * listeners, so `stopPropagation()` here means R3F never sees the click at all.
 *
 * A press is a click only when `Math.hypot(up.x - down.x, up.y - down.y) < 5`.
 * Real clicks are re-broadcast as a `viewport:click` CustomEvent (carrying the
 * original MouseEvent) so DOM-side listeners can act on them.
 *
 * Nothing here touches wheel or scroll events, so scrolling never disturbs
 * camera rotation.
 */
const PointerGrammar = memo(function PointerGrammar() {
  const gl = useThree((s) => s.gl);
  const connected = useThree((s) => s.events?.connected);

  useEffect(() => {
    const target =
      ((connected as HTMLElement | undefined) ??
        gl?.domElement?.parentElement ??
        gl?.domElement) || null;
    if (!target || typeof target.addEventListener !== 'function') return;

    let downX = 0;
    let downY = 0;
    let pressed = false;
    let dragged = false;

    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      pressed = true;
      dragged = false;
    };

    const onMove = (e: PointerEvent) => {
      if (!pressed || dragged) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) >= CLICK_SLOP_PX) dragged = true;
    };

    const onUp = (e: PointerEvent) => {
      if (!pressed) return;
      pressed = false;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) >= CLICK_SLOP_PX) dragged = true;
      if (!dragged) {
        target.dispatchEvent(
          new CustomEvent('viewport:click', { detail: { x: e.clientX, y: e.clientY, source: e } }),
        );
      }
    };

    // Capture phase, same node R3F listens on → runs first, can veto.
    const onClickCapture = (e: Event) => {
      if (!dragged) return;
      dragged = false;
      e.stopPropagation();
    };

    target.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    target.addEventListener('click', onClickCapture, true);

    return () => {
      target.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      target.removeEventListener('click', onClickCapture, true);
    };
  }, [gl, connected]);

  return null;
});

/**
 * ConditionalBloom — controls bloom post-processing imperatively.
 *
 * ARCHITECTURE: Always mounts EffectComposer + Bloom (renders exactly ONCE).
 * Toggling is done imperatively via `composer.enabled` and `bloom.intensity`.
 *
 * WHY NOT CONDITIONAL RENDERING: React 19's dev-mode profiler diffs
 * memoizedProps of every re-rendering component. When ConditionalBloom used
 * useState to toggle between `null` and `<EffectComposer>`, each re-render
 * produced new React elements whose underlying Three.js objects (render
 * targets, textures, scene graph) have circular parent↔children refs.
 * The profiler walked into these via addObjectDiffToProperties → JSON.stringify
 * → "Converting circular structure to JSON" crash.
 *
 * By always mounting and controlling intensity imperatively, this component
 * renders exactly ONCE. React 19's profiler never diffs its children.
 *
 * GPU COST: A zero-intensity bloom pass is a single fullscreen quad with
 * near-zero contribution. Measured overhead: <0.1ms/frame on integrated GPUs.
 */
const ConditionalBloom = memo(function ConditionalBloom() {
  const bloomRef = useRef<BloomEffect>(null);

  // ALL state checks happen inside useFrame — ZERO React re-renders.
  // matchMedia() is browser-cached and effectively free per-frame.
  useFrame(() => {
    const bloom = bloomRef.current;
    if (!bloom) return;

    // renderedFileId (not activeFileId) so bloom stays on until the morph has
    // snapshotted the outgoing combat scene.
    const { renderedFileId, combatSystemBloom } = useEngineStore.getState();
    const sceneKey = getSceneKey(renderedFileId);
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shouldBeActive = sceneKey === 'combat_system' && !isMobile && !prefersReduced;

    // Set intensity: slider value when active, 0 when inactive.
    // Zero-intensity bloom is effectively a visual passthrough.
    bloom.intensity = shouldBeActive ? combatSystemBloom : 0;
  });

  return (
    <EffectComposer>
      <Bloom
        ref={bloomRef}
        luminanceThreshold={0}
        intensity={0}
        radius={0.5}
      />
      {/* Must stay last: morphs the fully post-processed frame between scenes. */}
      <MorphTransition />
    </EffectComposer>
  );
});

/**
 * DprController — manages DPR imperatively inside the Canvas.
 *
 * WHY THIS EXISTS: Moving DPR management out of CanvasWrapperInner prevents
 * React 19 dev-mode's logComponentRender profiler from diffing the Canvas's
 * children prop. When CanvasWrapperInner held a `useState(dpr)`, every DPR
 * change caused a full re-render of the outer component. React 19's dev-mode
 * then called addObjectDiffToProperties() on the old vs new memoizedProps,
 * which recursively walked into the children array, hit R3F's fiber nodes
 * holding Three.js Object3D trees (circular parent ↔ children refs), and
 * crashed with "Converting circular structure to JSON".
 *
 * By moving DPR into a child component that calls useThree().setDpr
 * imperatively, CanvasWrapperInner renders exactly ONCE — React 19 never
 * diffs its props, and the circular structure is never serialized.
 */
const DprController = memo(function DprController() {
  const setDpr = useThree((s) => s.setDpr);

  return (
    <PerformanceMonitor
      onIncline={() => setDpr(1.5)}
      onDecline={() => setDpr(1)}
      onChange={({ factor }) => setDpr(0.5 + 1.5 * factor)}
      flipflops={3}
      onFallback={() => setDpr(1)}
    />
  );
});

/**
 * SceneBackground — sets scene.background imperatively per rendered scene.
 * Subscribes to renderedFileId (swapped by the morph transition) via Zustand;
 * renders nothing.
 */
const SceneBackground = memo(function SceneBackground() {
  const scene = useThree((s) => s.scene);
  const colors = useMemo(
    () => ({ lime: new Color(PALETTE.lime), darkPaper: new Color(PALETTE.darkPaper) }),
    [],
  );

  useEffect(() => {
    return useEngineStore.subscribe(
      (state) => state.renderedFileId,
      (renderedFileId) => {
        const key = getSceneKey(renderedFileId);
        if (key === 'about-me') scene.background = colors.lime;
        else if (key === 'combat_system') scene.background = colors.darkPaper;
        else scene.background = null;
      },
      { fireImmediately: true },
    );
  }, [scene, colors]);

  return null;
});

/**
 * CanvasWrapperInner — the strict isolation boundary between React DOM and R3F.
 * Exported to the app (via ViewportGate) as the memoized <LiveCanvas/>.
 *
 * Contract:
 * - Wrapped in React.memo() with ZERO props
 * - All data flows through Zustand subscriptions, never through props
 * - React Compiler cannot safely optimize R3F's Canvas boundary (R3F hooks
 *   rely on imperative mutations) — React.memo() is intentional here
 * - eventSource ref consumed from ViewportRefContext
 * - ZERO state in this component — prevents React 19 dev-mode prop diffing
 *   from walking into R3F's circular fiber tree (see DprController above)
 */
function CanvasWrapperInner() {
  const viewportRef = useViewportRef();

  return (
    <WebGLErrorBoundary FallbackComponent={ViewportTextCard}>
      <Canvas
        eventSource={viewportRef as React.RefObject<HTMLElement>}
        eventPrefix="offset"
        fallback={<ViewportTextCard />}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          toneMapping: ACESFilmicToneMapping,
        }}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      >
        <SceneOrchestrator>
          <Suspense fallback={null}>
            <IBMFlex />
            <IndeedFlex />
            <HammerBallFlex />
            <CombatSystemFlex />
            <AboutMeFlex />
            <DefaultScene />
          </Suspense>
        </SceneOrchestrator>
        <SceneBackground />
        <DprController />
        <ConditionalBloom />
        <OrbitControlsWithGestureGuard />
        <PauseController />
        <PointerGrammar />
        <AdaptivePixelRatio />
        <DesignStats className="stats-panel" parent={viewportRef as React.RefObject<HTMLElement>} />
        <RendererStats parent={viewportRef as React.RefObject<HTMLElement>} />
      </Canvas>
    </WebGLErrorBoundary>
  );
}

/**
 * LiveCanvas — memoized with ZERO props, so ViewportGate re-rendering (media
 * query flips, the WebGL probe resolving, the viewer tapping "load 3D") bails
 * out of the memo instead of producing a fresh element tree for React 19's
 * dev-mode profiler to diff. CanvasWrapperInner therefore still renders
 * exactly once per mount.
 */
const LiveCanvas = memo(CanvasWrapperInner);
LiveCanvas.displayName = 'LiveCanvas';

/**
 * ViewportGate — picks one of the three explicit viewport states.
 *
 *   live  — WebGL 2 present, pointer device, reduced motion off. Also reached
 *           from `still` once the viewer taps the load button.
 *   still — touch-only (useIsMobile) or `prefers-reduced-motion: reduce`
 *           (useReducedMotion), until promoted.
 *   text  — the WebGL 2 probe definitively failed. The other two routes into
 *           this same card are R3F's Canvas `fallback` and WebGLErrorBoundary,
 *           both of which also render <ViewportTextCard/>.
 *
 * ALL the state lives here, deliberately *outside* the Canvas subtree — this
 * component never renders R3F children of its own, it only chooses between
 * <LiveCanvas/> (memoized, zero props) and plain HTML.
 */
function ViewportGate() {
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const [promoted, setPromoted] = useState(false);
  // Memoized module-side probe — runs at most once per page load, and returns
  // true wherever it cannot conclude, so the canvas is never withheld from a
  // browser the probe simply can't read.
  const hasWebGL2 = detectWebGL2();

  const needsOptIn = (isMobile || prefersReducedMotion) && !promoted;
  const mode = !hasWebGL2 ? 'text' : needsOptIn ? 'still' : 'live';

  const setMode = useViewportStore((s) => s.setMode);
  useEffect(() => {
    setMode(mode);
  }, [mode, setMode]);

  /**
   * SceneOrchestrator is the only thing that clears `isAssetLoading`, and it
   * only exists inside the Canvas. Without this, clicking a file while the
   * still or text state is showing would leave CanvasLoadingHUD's
   * "Loading scene…" overlay stuck on screen forever.
   */
  useEffect(() => {
    if (mode === 'live') return;
    const clear = () => {
      const state = useEngineStore.getState();
      if (typeof state.setAssetLoading === 'function') state.setAssetLoading(false);
    };
    clear();
    return useEngineStore.subscribe((s) => s.isAssetLoading, (loading) => {
      if (loading) clear();
    });
  }, [mode]);

  const handleActivate = useCallback(() => setPromoted(true), []);

  if (mode === 'text') return <ViewportTextCard />;
  if (mode === 'still') {
    return (
      <ViewportStill
        reason={prefersReducedMotion ? 'reduced-motion' : 'touch'}
        onActivate={handleActivate}
      />
    );
  }
  return <LiveCanvas />;
}

export const MemoizedCanvasWrapper = memo(ViewportGate);
MemoizedCanvasWrapper.displayName = 'MemoizedCanvasWrapper';
