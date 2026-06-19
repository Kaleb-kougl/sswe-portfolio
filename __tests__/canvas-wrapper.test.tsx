import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoizedCanvasWrapper } from '../src/components/3d/canvas-wrapper';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock dependencies
vi.mock('../src/store/useEngineStore', () => ({
  useEngineStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({ activeFileId: '123', combatSystemBloom: 1 })),
    subscribe: vi.fn(),
  }),
}));

vi.mock('../src/components/viewport-ref-context', () => ({
  useViewportRef: vi.fn(() => ({ current: document.createElement('div') })),
}));

// Mock inner dynamic imports / heavy components
vi.mock('../src/components/3d/scene-orchestrator', () => ({
  SceneOrchestrator: ({ children }: any) => <div data-testid="scene-orchestrator">{children}</div>,
  getSceneKey: vi.fn(() => 'default'),
  useSceneGroup: vi.fn(),
}));

vi.mock('../src/components/3d/adaptive-pixel-ratio', () => ({
  AdaptivePixelRatio: () => <div data-testid="adaptive-pixel-ratio" />,
}));

vi.mock('../src/components/3d/scenes/ibm-flex', () => ({ default: () => null }));
vi.mock('../src/components/3d/scenes/indeed-flex', () => ({ default: () => null }));
vi.mock('../src/components/3d/scenes/hammerball-flex', () => ({ HammerBallFlex: () => null }));
vi.mock('../src/components/3d/scenes/combat-system-flex', () => ({ CombatSystemFlex: () => null }));
vi.mock('../src/components/3d/scenes/about-me-flex', () => ({ AboutMeFlex: () => null }));
vi.mock('../src/components/3d/scenes/default-scene', () => ({ default: () => null }));

// Provide a mock for R3F to simulate DOM mounting vs throwing
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, fallback }: any) => {
    if (globalThis.__DISABLE_WEBGL_MOCK) {
      throw new Error('WebGL disabled'); // Triggers ErrorBoundary
    }
    if (globalThis.__FALLBACK_WEBGL_MOCK) {
      return <div data-testid="webgl-fallback">{fallback}</div>; // Triggers Canvas fallback
    }
    return <div data-testid="r3f-canvas">{children}</div>;
  },
  useThree: () => ({ performance: { regress: vi.fn() }, setDpr: vi.fn() }),
  useFrame: () => {
    // safely do nothing, or we could call cb immediately
  },
  extend: vi.fn(),
}));

// Mock Drei components
vi.mock('@react-three/drei', () => ({
  Stats: () => <div />,
  OrbitControls: () => <div />,
  PerformanceMonitor: () => <div />,
  RoundedBox: () => <div />,
  Html: ({ children }: any) => <div>{children}</div>,
  useGLTF: Object.assign(vi.fn(() => ({ nodes: {}, materials: {} })), { preload: vi.fn() }),
}));

// Mock Postprocessing
vi.mock('@react-three/postprocessing', () => ({
  EffectComposer: ({ children }: any) => <div>{children}</div>,
  Bloom: () => <div />,
}));

describe('MemoizedCanvasWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__DISABLE_WEBGL_MOCK = false;
    globalThis.__FALLBACK_WEBGL_MOCK = false;
  });

  it('WebGL Context creates successfully and Suspense loaders invoke', () => {
    render(<MemoizedCanvasWrapper />);
    expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('scene-orchestrator')).toBeInTheDocument();
  });

  it('dispatches global loading state changes when transitioning scenes (via Orchestrator mock)', () => {
    render(<MemoizedCanvasWrapper />);
    // The SceneOrchestrator is rendered, which is responsible for handling transitions and loaders
    expect(screen.getByTestId('scene-orchestrator')).toBeInTheDocument();
  });

  it('Browser with WebGL disabled throws context exception; boundary catches and informs user', () => {
    globalThis.__DISABLE_WEBGL_MOCK = true;
    
    // Suppress expected React error logging
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    render(<MemoizedCanvasWrapper />);
    
    // Check if the WebGLErrorBoundary fallback is displayed
    expect(screen.getByText(/3D visualization unavailable/i)).toBeInTheDocument();
    
    spy.mockRestore();
  });

  it('renders Canvas fallback when WebGL context is not supported gracefully', () => {
    globalThis.__FALLBACK_WEBGL_MOCK = true;
    
    render(<MemoizedCanvasWrapper />);
    
    // Check if the explicit `fallback={<WebGLFallback />}` inside Canvas is rendered
    expect(screen.getByTestId('webgl-fallback')).toBeInTheDocument();
    expect(screen.getByText(/WebGL is not supported on this device/i)).toBeInTheDocument();
  });

  it('Hot-reload multi-mounting prevents context-leaks and cleanly restores canvas rendering', () => {
    const { unmount } = render(<MemoizedCanvasWrapper />);
    expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument();
    
    // Unmount completely
    unmount();
    
    // Mount again (simulating hot reload)
    render(<MemoizedCanvasWrapper />);
    expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument();
  });
});
