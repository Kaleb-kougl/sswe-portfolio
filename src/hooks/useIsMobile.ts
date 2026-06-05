'use client';

import { useSyncExternalStore } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

/**
 * SSR-safe mobile detection hook.
 * Uses `useSyncExternalStore` for tear-free reads against `matchMedia`.
 * Breakpoint matches Tailwind `md: 768px` — below 768px is mobile.
 */
function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot(): boolean {
  // Default to desktop during SSR — mobile layout hydrates client-side
  return false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
