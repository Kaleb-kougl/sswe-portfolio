'use client';

import { memo, Suspense, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Stats, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { ACESFilmicToneMapping } from 'three';
import { useViewportRef } from '../viewport-ref-context';
import { WebGLErrorBoundary } from './error-boundary';
import { SceneOrchestrator } from './scene-orchestrator';
import { AdaptivePixelRatio } from './adaptive-pixel-ratio';
import IBMFlex from './scenes/ibm-flex';
import IndeedFlex from './scenes/indeed-flex';
import { HammerBallFlex } from './scenes/hammerball-flex';
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
function OrbitControlsWithGestureGuard() {
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
}

/**
 * MemoizedCanvasWrapper — the strict isolation boundary between React DOM and R3F.
 *
 * Contract:
 * - Wrapped in React.memo() with ZERO props
 * - All data flows through Zustand subscriptions, never through props
 * - React Compiler cannot safely optimize R3F's Canvas boundary (R3F hooks
 *   rely on imperative mutations) — React.memo() is intentional here
 * - eventSource ref consumed from ViewportRefContext
 */
function CanvasWrapperInner() {
  const viewportRef = useViewportRef();
  const [dpr, setDpr] = useState<number | [number, number]>([1, 1.5]);

  return (
    <WebGLErrorBoundary
      fallback={(error, reset) => (
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
      )}
    >
      <Canvas
        eventSource={viewportRef as React.RefObject<HTMLElement>}
        eventPrefix="offset"
        fallback={<WebGLFallback />}
        dpr={dpr}
        gl={{
          antialias: true,
          toneMapping: ACESFilmicToneMapping,
        }}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr(1.5)}
          onDecline={() => setDpr(1)}
          onChange={({ factor }) => setDpr(0.5 + 1.5 * factor)}
          flipflops={3}
          onFallback={() => setDpr(1)}
        >
          <SceneOrchestrator>
            <Suspense fallback={null}>
              <IBMFlex />
              <IndeedFlex />
              <HammerBallFlex />
              <DefaultScene />
            </Suspense>
          </SceneOrchestrator>
        </PerformanceMonitor>
        <OrbitControlsWithGestureGuard />
        <AdaptivePixelRatio />
        <Stats className="stats-panel" parent={viewportRef as React.RefObject<HTMLElement>} />
      </Canvas>
    </WebGLErrorBoundary>
  );
}

export const MemoizedCanvasWrapper = memo(CanvasWrapperInner);
MemoizedCanvasWrapper.displayName = 'MemoizedCanvasWrapper';

