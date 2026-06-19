import { renderHook, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useReducedMotion } from '../src/hooks/useReducedMotion';

describe('useReducedMotion', () => {
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

  it('updates state correctly based on prefers-reduced-motion media query', () => {
    const { result, rerender } = renderHook(() => useReducedMotion());
    
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
    
    act(() => {
      if (listeners['change']) {
        listeners['change'].forEach(cb => cb());
      }
    });

    rerender();
    expect(result.current).toBe(true);
  });

  it('event listeners are safely registered and cleaned up on unmount', () => {
    const { unmount } = renderHook(() => useReducedMotion());
    
    expect(listeners['change']?.length).toBe(1);
    
    unmount();
    
    expect(listeners['change']?.length).toBe(0);
  });

  it('SSR Rendering validation: gracefully defaults to false without throwing ReferenceError', () => {
    const TestComponent = () => {
      const reducedMotion = useReducedMotion();
      return React.createElement('div', null, reducedMotion ? 'reduce' : 'no-preference');
    };
    
    const html = renderToString(React.createElement(TestComponent));
    expect(html).toContain('no-preference');
  });
});
