'use client';
'use no memo';

import { Component, type ReactNode, type ErrorInfo } from 'react';

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
 * Recovery is manual, via the fallback's own reset(). An earlier version also
 * auto-reset on activeFileId changes — the IDE's tab-switch affordance. The
 * scrolling page has no tabs and never sets that field, so the subscription
 * could never fire; it was removed along with the IDE.
 */
export class WebGLErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
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
