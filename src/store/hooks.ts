import { useEffect } from 'react';
import { useEngineStore, type TransientUpdates } from './useEngineStore';
import { RESUME_DATA } from '@/data/resumeData';

// Re-export the store type for external consumers
type EngineState = Parameters<Parameters<typeof useEngineStore.subscribe>[0]>[0];

/**
 * Reads activeFileId from Zustand and returns the corresponding ProjectEntry.
 * Used by: InspectorPanel, mobile Inspector sheet, TopBar breadcrumb.
 */
export function useActiveFile() {
  const activeFileId = useEngineStore((s) => s.activeFileId);
  return activeFileId ? RESUME_DATA[activeFileId] ?? null : null;
}

/**
 * Type-safe read/write hook for transient WebGL state.
 * Usage: const [bundleSize, setBundleSize] = useTransientState('targetBundleSize')
 */
export function useTransientState<K extends keyof TransientUpdates>(key: K) {
  const value = useEngineStore((s) => s[key]);
  const set = useEngineStore((s) => s.setTransientState);
  return [value, (v: NonNullable<TransientUpdates[K]>) => set({ [key]: v } as TransientUpdates)] as const;
}

/**
 * Generic imperative Zustand subscription with cleanup.
 * Used by R3F components for discrete event subscriptions (e.g., activeFileId changes).
 * Uses fireImmediately to handle the initial state without a separate getState() call.
 */
export function useImperativeSubscription<T>(
  selector: (state: EngineState) => T,
  callback: (value: T, previousValue: T) => void
) {
  useEffect(() => {
    const unsub = useEngineStore.subscribe(selector, callback, { fireImmediately: true });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

