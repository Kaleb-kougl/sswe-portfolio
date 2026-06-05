'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * AdaptivePixelRatio — scales DPR based on R3F's performance.current.
 * Placed inside <Canvas> to respond to PerformanceMonitor regressions.
 *
 * When OrbitControls fires `change`, SceneOrchestrator calls
 * state.performance.regress() which lowers performance.current.
 * This component responds by reducing the pixel ratio accordingly.
 */
export function AdaptivePixelRatio() {
  const current = useThree((state) => state.performance.current);
  const setDpr = useThree((state) => state.setDpr);

  useEffect(() => {
    // Scale DPR between 1 and devicePixelRatio based on performance factor
    const targetDpr = Math.max(1, window.devicePixelRatio * current);
    setDpr(Math.min(targetDpr, 1.5)); // Never exceed 1.5 (TDD §6)
  }, [current, setDpr]);

  return null;
}
