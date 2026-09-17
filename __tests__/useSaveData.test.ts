import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { useSaveData } from '../src/hooks/useSaveData';

/**
 * The behaviour under test is mostly about ABSENCE.
 *
 * `navigator.connection` is Chromium-only: it does not exist on iOS Safari or
 * on Firefox. The 3D backdrop reads this hook to decide whether to animate, so
 * "the API is missing" must resolve to "no preference expressed" — if it ever
 * resolved to "save data", every iPhone would silently lose the animation,
 * which is exactly the failure mode this whole change exists to remove.
 */

type Listener = () => void;

/** Installs a fake `navigator.connection`, and returns a way to fire `change`. */
function stubConnection(saveData: boolean | undefined) {
  const listeners: Listener[] = [];
  const connection = {
    saveData,
    addEventListener: vi.fn((_event: string, callback: Listener) => {
      listeners.push(callback);
    }),
    removeEventListener: vi.fn((_event: string, callback: Listener) => {
      const at = listeners.indexOf(callback);
      if (at >= 0) listeners.splice(at, 1);
    }),
  };
  vi.stubGlobal('navigator', { ...navigator, connection });
  return {
    connection,
    listeners,
    set(next: boolean) {
      connection.saveData = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSaveData', () => {
  it('is false when the browser has no Network Information API at all', () => {
    vi.stubGlobal('navigator', {});

    const { result } = renderHook(() => useSaveData());

    expect(result.current).toBe(false);
  });

  it('is false when the API exists but expresses no preference', () => {
    stubConnection(undefined);

    const { result } = renderHook(() => useSaveData());

    expect(result.current).toBe(false);
  });

  it('is true only when Data Saver is explicitly on', () => {
    stubConnection(true);

    const { result } = renderHook(() => useSaveData());

    expect(result.current).toBe(true);
  });

  it('follows the preference being turned on mid-session', () => {
    const link = stubConnection(false);
    const { result } = renderHook(() => useSaveData());
    expect(result.current).toBe(false);

    act(() => link.set(true));

    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const link = stubConnection(false);
    const { unmount } = renderHook(() => useSaveData());
    expect(link.listeners).toHaveLength(1);

    unmount();

    expect(link.listeners).toHaveLength(0);
  });
});
