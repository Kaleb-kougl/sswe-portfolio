'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  fallback: (error: Error, reset: () => void) => ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Error boundary for GPU context crashes and WebGL failures.
 * Uses the render function pattern for the fallback: fallback={(error, reset) => ...}
 *
 * Placed around the R3F <Canvas> to catch:
 * - WebGL context lost events
 * - Disabled/faulty GPU drivers
 * - R3F internal rendering errors
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
      return this.props.fallback(this.state.error, this.handleReset);
    }
    return this.props.children;
  }
}
