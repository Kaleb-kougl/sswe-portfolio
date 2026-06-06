'use client';
'use no memo';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { useEngineStore } from '@/store/useEngineStore';

export interface WebGLFallbackProps {
  error: Error;
  reset: () => void;
}

interface ErrorBoundaryProps {
  FallbackComponent: React.ComponentType<WebGLFallbackProps>;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Error boundary for GPU context crashes and WebGL failures.
 *
 * Uses a **component prop** pattern (`FallbackComponent={MyComponent}`)
 * instead of a render-function pattern (`fallback={(error, reset) => ...}`).
 *
 * WHY: React 19 dev-mode prop diffing calls JSON.stringify on every prop
 * to detect unnecessary re-renders. A render function captures the R3F
 * fiber context in its closure — and Three.js Object3D has circular
 * parent ↔ children references, which crashes JSON.stringify.
 * A component _reference_ (a stable function identity) serializes safely.
 *
 * Placed around the R3F <Canvas> to catch:
 * - WebGL context lost events
 * - Disabled/faulty GPU drivers
 * - R3F internal rendering errors
 *
 * AUTO-RECOVERY: Subscribes to activeFileId changes in the Zustand store.
 * When a scene crashes and the user clicks a different tab, the boundary
 * auto-resets so the new scene can load without a manual "Retry" click.
 */
export class WebGLErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private unsubscribe: (() => void) | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidMount() {
    // Subscribe to activeFileId — when the user switches tabs while
    // the boundary is in an error state, auto-reset to retry rendering.
    this.unsubscribe = useEngineStore.subscribe(
      (state) => state.activeFileId,
      () => {
        if (this.state.error) {
          console.info('[WebGLErrorBoundary] Tab changed — auto-resetting after crash');
          this.setState({ error: null });
        }
      }
    );
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[WebGLErrorBoundary] GPU/3D error caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const { FallbackComponent } = this.props;
      return <FallbackComponent error={this.state.error} reset={this.handleReset} />;
    }
    return this.props.children;
  }
}
