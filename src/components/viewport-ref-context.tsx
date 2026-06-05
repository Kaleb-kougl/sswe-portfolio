'use client';

import { createContext, useContext, type RefObject } from 'react';

/**
 * Shares the viewport panel's DOM ref between IDELayout (provider)
 * and MemoizedCanvasWrapper (consumer) without passing it as a prop
 * — preserving React.memo() on the Canvas wrapper.
 */
const ViewportRefContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export const ViewportRefProvider = ViewportRefContext.Provider;

export function useViewportRef() {
  const ref = useContext(ViewportRefContext);
  if (!ref) {
    throw new Error('useViewportRef must be used within a ViewportRefProvider');
  }
  return ref;
}
