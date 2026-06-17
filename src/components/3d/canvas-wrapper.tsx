'use client';
'use no memo';

import { memo, Suspense, useRef, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Stats, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { BloomEffect } from 'postprocessing';
import { ACESFilmicToneMapping } from 'three';
import { useViewportRef } from '../viewport-ref-context';
import { WebGLErrorBoundary, type WebGLFallbackProps } from './error-boundary';
import { SceneOrchestrator, getSceneKey } from './scene-orchestrator';
import { AdaptivePixelRatio } from './adaptive-pixel-ratio';
import IBMFlex from './scenes/ibm-flex';
import IndeedFlex from './scenes/indeed-flex';
import { HammerBallFlex } from './scenes/hammerball-flex';
import { CombatSystemFlex } from './scenes/combat-system-flex';
import { AboutMeFlex } from './scenes/about-me-flex';
import DefaultScene from './scenes/default-scene';
import { useEngineStore } from '@/store/useEngineStore';

// Side-effect: registers Three.js classes for tree-shaking
import './three-setup';

/**
 * WebGL fallback for systems without WebGL support.
 * Shown via Canvas's `fallback` prop when WebGL is unavailable.
 */
function WebGLFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-bg-editor p-4 text-center">
      <div className="space-y-2">
        <p className="font-mono text-sm text-text-muted">
          WebGL is not supported on this device.
        </p>
        <a
          href="/KalebK_Resume.pdf"
          download
          className="inline-flex items-center gap-2 rounded-md bg-text-accent px-3 py-1.5 text-sm font-medium text-bg-editor transition-all hover:brightness-110"
        >
          Download Resume PDF
        </a>
      </div>
    </div>
  );
}

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
      makeDefault
      onChange={handleChange}
    />
  );
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

    const { activeFileId, combatSystemBloom } = useEngineStore.getState();
    const sceneKey = getSceneKey(activeFileId);
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
    </EffectComposer>
  );
});

/**
 * WebGLFallbackAlert — rendered when the WebGLErrorBoundary catches a GPU error.
 * Passed as `FallbackComponent={WebGLFallbackAlert}` — a stable component
 * reference that React 19 dev-mode can serialize without triggering
 * JSON.stringify on the Three.js scene graph's circular parent/children refs.
 */
function WebGLFallbackAlert({ error, reset }: WebGLFallbackProps) {
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-3 bg-bg-editor p-6 text-center"
    >
      <p className="font-mono text-sm text-text-red">
        3D visualization unavailable: {error.message}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-bg-hover px-3 py-1.5 font-mono text-sm text-text-primary transition-colors hover:bg-bg-active"
        >
          Retry
        </button>
        <a
          href="/KalebK_Resume.pdf"
          download
          className="rounded-md bg-text-accent px-3 py-1.5 text-sm font-medium text-bg-editor transition-all hover:brightness-110"
        >
          Download Resume Instead
        </a>
      </div>
    </div>
  );
}

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
 * MemoizedCanvasWrapper — the strict isolation boundary between React DOM and R3F.
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
    <WebGLErrorBoundary FallbackComponent={WebGLFallbackAlert}>
      <Canvas
        eventSource={viewportRef as React.RefObject<HTMLElement>}
        eventPrefix="offset"
        fallback={<WebGLFallback />}
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
        <DprController />
        <ConditionalBloom />
        <OrbitControlsWithGestureGuard />
        <AdaptivePixelRatio />
        <Stats className="stats-panel" parent={viewportRef as React.RefObject<HTMLElement>} />
      </Canvas>
    </WebGLErrorBoundary>
  );
}

export const MemoizedCanvasWrapper = memo(CanvasWrapperInner);
MemoizedCanvasWrapper.displayName = 'MemoizedCanvasWrapper';

