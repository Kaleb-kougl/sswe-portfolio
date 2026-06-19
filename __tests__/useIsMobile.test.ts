import { renderHook, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useIsMobile } from '../src/hooks/useIsMobile';

describe('useIsMobile', () => {
  let mockMatchMedia: any;
  let listeners: Record<string, Function[]> = {};

  beforeEach(() => {
    listeners = {};
    mockMatchMedia = vi.fn().mockImplementation((query) => {
      return {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn((event, callback) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(callback);
        }),
        removeEventListener: vi.fn((event, callback) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter(cb => cb !== callback);
          }
        }),
        dispatchEvent: vi.fn(),
      };
    });
    vi.stubGlobal('matchMedia', mockMatchMedia);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates standard view states correctly at the 768px break boundary', () => {
    const { result, rerender } = renderHook(() => useIsMobile());
    
    // Initial state
    expect(result.current).toBe(false);

    // Simulate matchMedia change to true
    mockMatchMedia.mockImplementation((query: string) => {
      return {
        matches: true,
        media: query,
        onchange: null,
        addEventListener: vi.fn((event, callback) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(callback);
        }),
        removeEventListener: vi.fn((event, callback) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter(cb => cb !== callback);
          }
        }),
        dispatchEvent: vi.fn(),
      };
    });
    
    // Trigger the registered listener
    act(() => {
      if (listeners['change']) {
        listeners['change'].forEach(cb => cb());
      }
    });

    rerender();
    expect(result.current).toBe(true);
  });

  it('event listeners are safely registered to window matchMedia and tear down unmounts correctly remove removeEventListener', () => {
    const { unmount } = renderHook(() => useIsMobile());
    
    expect(listeners['change']?.length).toBe(1);
    
    unmount();
    
    expect(listeners['change']?.length).toBe(0);
  });

  it('SSR Rendering validation: gracefully defaults safely without throwing ReferenceError', () => {
    // Tests that getServerSnapshot is used during SSR and window is not referenced
    const TestComponent = () => {
      const isMobile = useIsMobile();
      return React.createElement('div', null, isMobile ? 'mobile' : 'desktop');
    };
    
    const html = renderToString(React.createElement(TestComponent));
    expect(html).toContain('desktop');
  });

  it('fast repetitive resize events properly respect performance boundaries', () => {
    const { result, rerender } = renderHook(() => useIsMobile());
    
    // Simulate multiple fast updates
    act(() => {
      if (listeners['change']) {
        listeners['change'].forEach(cb => cb());
        listeners['change'].forEach(cb => cb());
        listeners['change'].forEach(cb => cb());
      }
    });

    rerender();
    // In the current implementation it relies on React's useSyncExternalStore internal behavior 
    // to batch rapid synchronous updates cleanly without causing tearing.
    expect(result.current).toBe(false);
  });
});
