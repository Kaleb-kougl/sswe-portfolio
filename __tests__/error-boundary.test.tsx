import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebGLErrorBoundary, type WebGLFallbackProps } from '../src/components/3d/error-boundary';
import { useEngineStore } from '../src/store/useEngineStore';

// Mock the engine store
vi.mock('../src/store/useEngineStore', () => ({
  useEngineStore: {
    subscribe: vi.fn(),
  }
}));

const Fallback = ({ error, reset }: WebGLFallbackProps) => (
  <div data-testid="fallback-ui">
    <p>{error.message}</p>
    <button onClick={reset}>Retry</button>
  </div>
);

const FaultyComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Synthetic WebGL failure');
  }
  return <div data-testid="valid-content">WebGL Context Active</div>;
};

describe('WebGLErrorBoundary', () => {
  let subscribeMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    subscribeMock = vi.mocked(useEngineStore.subscribe);
  });

  it('renders children when no WebGL error occurs', () => {
    render(
      <WebGLErrorBoundary FallbackComponent={Fallback}>
        <FaultyComponent shouldThrow={false} />
      </WebGLErrorBoundary>
    );
    expect(screen.getByTestId('valid-content')).toBeInTheDocument();
    expect(screen.queryByTestId('fallback-ui')).not.toBeInTheDocument();
  });

  it('suppresses crash on synthetic WebGL failures, rendering an HTML fallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    render(
      <WebGLErrorBoundary FallbackComponent={Fallback}>
        <FaultyComponent shouldThrow={true} />
      </WebGLErrorBoundary>
    );
    
    expect(screen.getByTestId('fallback-ui')).toBeInTheDocument();
    expect(screen.getByText('Synthetic WebGL failure')).toBeInTheDocument();
    
    spy.mockRestore();
  });

  it('re-renders cleanly when error boundary reset function is called', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <WebGLErrorBoundary FallbackComponent={Fallback}>
        <FaultyComponent shouldThrow={true} />
      </WebGLErrorBoundary>
    );
    
    // Switch the prop so it does not throw on reset
    rerender(
      <WebGLErrorBoundary FallbackComponent={Fallback}>
        <FaultyComponent shouldThrow={false} />
      </WebGLErrorBoundary>
    );
    
    fireEvent.click(screen.getByText('Retry'));
    expect(screen.getByTestId('valid-content')).toBeInTheDocument();
    
    spy.mockRestore();
  });

  it('auto-recovers and resets error state when activeFileId changes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    let triggerStateChange: () => void;
    subscribeMock.mockImplementation((selector: any, callback: () => void) => {
      triggerStateChange = callback;
      return vi.fn(); // unsubscribe mock
    });

    const { rerender } = render(
      <WebGLErrorBoundary FallbackComponent={Fallback}>
        <FaultyComponent shouldThrow={true} />
      </WebGLErrorBoundary>
    );
    
    expect(screen.getByTestId('fallback-ui')).toBeInTheDocument();
    
    // Rerender with valid component so it can mount successfully after reset
    rerender(
      <WebGLErrorBoundary FallbackComponent={Fallback}>
        <FaultyComponent shouldThrow={false} />
      </WebGLErrorBoundary>
    );
    
    // Simulate store's activeFileId changing
    // Simulate store's activeFileId changing
    act(() => {
      triggerStateChange!();
    });
    
    expect(screen.getByTestId('valid-content')).toBeInTheDocument();
    
    spy.mockRestore();
  });

  it('unsubscribes from engine store on unmount to prevent context-leaks', () => {
    const unsubscribeMock = vi.fn();
    subscribeMock.mockReturnValue(unsubscribeMock);

    const { unmount } = render(
      <WebGLErrorBoundary FallbackComponent={Fallback}>
        <div />
      </WebGLErrorBoundary>
    );

    expect(subscribeMock).toHaveBeenCalled();
    unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
  });
});
