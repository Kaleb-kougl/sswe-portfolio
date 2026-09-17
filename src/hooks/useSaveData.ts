'use client';

import { useSyncExternalStore } from 'react';

/**
 * The slice of the Network Information API this hook needs.
 *
 * Typed locally because it is not in lib.dom: `navigator.connection` ships in
 * Chromium only, so every read has to survive it being `undefined` anyway.
 */
interface SaveDataConnection extends EventTarget {
  saveData?: boolean;
}

function connection(): SaveDataConnection | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: SaveDataConnection }).connection;
}

function subscribe(callback: () => void): () => void {
  const link = connection();
  // `change` fires when the visitor flips Data Saver, or when the effective
  // connection type changes. Absent the API there is nothing to subscribe to
  // and the snapshot is a constant `false`, so an empty unsubscribe is correct.
  link?.addEventListener('change', callback);
  return () => link?.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  // Strict `=== true`: the property is absent on Safari and Firefox, and
  // "absent" must read as "no preference expressed", never as "save data".
  return connection()?.saveData === true;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * True when the visitor has asked the browser to conserve data (Chrome's Data
 * Saver / Android's Data Saver mode).
 *
 * This is the one capability signal on the backdrop's path that is a stated
 * *preference* rather than a guess about hardware, which is why it is read and
 * honoured directly instead of being fed to the frame-time watchdog: somebody
 * conserving data has already told us to do less.
 */
export function useSaveData(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
