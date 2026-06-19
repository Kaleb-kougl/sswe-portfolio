import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useActiveFile, useTransientState, useImperativeSubscription } from '../src/store/hooks';
import { useEngineStore } from '../src/store/useEngineStore';
import { RESUME_DATA } from '../src/data/resumeData';

// Mock the dependencies
vi.mock('../src/store/useEngineStore', () => ({
  useEngineStore: vi.fn(),
}));

vi.mock('../src/data/resumeData', () => ({
  RESUME_DATA: {
    'file-1': { id: 'file-1', title: 'File 1' },
  }
}));

describe('hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useActiveFile', () => {
    it('reads the ID and successfully maps it against RESUME_DATA', () => {
      vi.mocked(useEngineStore).mockReturnValue('file-1');
      const { result } = renderHook(() => useActiveFile());
      expect(result.current).toEqual({ id: 'file-1', title: 'File 1' });
    });

    it('returns null if activeFileId points to an unknown key', () => {
      vi.mocked(useEngineStore).mockReturnValue('unknown-file');
      const { result } = renderHook(() => useActiveFile());
      expect(result.current).toBeNull();
    });

    it('returns null if activeFileId is null', () => {
      vi.mocked(useEngineStore).mockReturnValue(null);
      const { result } = renderHook(() => useActiveFile());
      expect(result.current).toBeNull();
    });
  });

  describe('useTransientState', () => {
    it('safely returns state tuple comparable to React useState', () => {
      const mockSetTransientState = vi.fn();
      vi.mocked(useEngineStore).mockImplementation((selector: any) => {
        const state = {
          targetBundleSize: 100,
          setTransientState: mockSetTransientState
        };
        return selector(state);
      });

      const { result } = renderHook(() => useTransientState('targetBundleSize'));
      expect(result.current[0]).toBe(100);
      
      act(() => {
        result.current[1](200);
      });
      
      expect(mockSetTransientState).toHaveBeenCalledWith({ targetBundleSize: 200 });
    });
  });

  describe('useImperativeSubscription', () => {
    it('fires callbacks immediately and on subsequent changes', () => {
      const mockUnsub = vi.fn();
      const mockSubscribe = vi.fn().mockReturnValue(mockUnsub);
      (useEngineStore as any).subscribe = mockSubscribe;
      
      const selector = (state: any) => state.someValue;
      const callback = vi.fn();

      const { unmount } = renderHook(() => useImperativeSubscription(selector, callback));

      expect(mockSubscribe).toHaveBeenCalledWith(selector, callback, { fireImmediately: true });

      // Hook usage outside valid context cleanly unsubscribes
      unmount();
      expect(mockUnsub).toHaveBeenCalled();
    });
  });
});
