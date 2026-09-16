/**
 * backdrop-power — a one-number signal that lets anything on the page stop the
 * fixed 3D backdrop's render loop for as long as it needs to.
 *
 * WHY THIS EXISTS
 * ---------------
 * `morph-canvas.tsx` holds a WebGL context and, on the desktop/pointer path,
 * runs it at one draw call per frame forever. Opening the r3f-projectiles demo
 * creates a SECOND context on the same page, drawing thousands of instances.
 * Two live contexts compete for the same GPU, and the one nobody is looking at
 * should lose. So the demo dialog takes a suspension for as long as it is
 * mounted and the backdrop's frame loop stops dead.
 *
 * WHY A MODULE-LEVEL SIGNAL
 * -------------------------
 * This is the whole state-management story for the site, and it stays that way:
 * a counter, a `Set` of callbacks, and `useSyncExternalStore` on the reading
 * end. Zustand was removed on purpose and nothing here is worth reinstalling it
 * for. It is a counter rather than a boolean so that two overlapping suspenders
 * cannot resume the backdrop out from under each other, and `suspendBackdrop`
 * returns its own release function so a caller can only ever release its own.
 *
 * Both sides of this — the backdrop and the demo dialog — live in browser-only
 * chunks, so this module is never evaluated on the server and costs the initial
 * payload nothing.
 */

let suspensions = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Stop the backdrop. Returns the matching release; calling it more than once is
 * a no-op, so it is safe as a `useEffect` cleanup under StrictMode.
 */
export function suspendBackdrop(): () => void {
  suspensions += 1;
  emit();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    suspensions -= 1;
    emit();
  };
}

/** `useSyncExternalStore` subscribe. */
export function subscribeBackdropPower(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** `useSyncExternalStore` client snapshot. */
export function isBackdropSuspended(): boolean {
  return suspensions > 0;
}

/** `useSyncExternalStore` server snapshot — nothing suspends during SSR. */
export function backdropNeverSuspendedOnServer(): boolean {
  return false;
}
