import { useSyncExternalStore } from 'react';
const QUERY = '(prefers-reduced-motion: reduce)';
function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}
function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}
function getServerSnapshot(): boolean {
  return false;
}
/**
 * Reactive hook for prefers-reduced-motion.
 * Uses useSyncExternalStore to react to live OS setting changes.
 *
 * Use this in WebGL/R3F components where Motion for React's
 * useReducedMotion() is not available or appropriate.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
