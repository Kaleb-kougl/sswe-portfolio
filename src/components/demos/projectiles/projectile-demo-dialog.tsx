'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { suspendBackdrop } from '@/components/3d/backdrop-power';

import { ProjectileDemo } from './projectile-demo';

/**
 * projectile-demo-dialog — the modal the r3f-projectiles card opens.
 *
 * This module is the whole payload of the demo: the dialog chrome AND, through
 * a static import, the canvas, three, R3F and the pattern code. It is only ever
 * reached through the `next/dynamic` call in
 * `src/components/scroll/projectile-demo-launcher.tsx`, which renders it only
 * after the button is clicked, so none of it is in the initial payload for `/`.
 *
 * MOUNTED == OPEN
 * ---------------
 * There is no `open` prop. The launcher mounts this component to open the
 * dialog and unmounts it to close, which makes every side effect below a plain
 * mount/unmount pair: the scroll lock, the backdrop suspension and the WebGL
 * context all begin and end with the component, and none of them can be left
 * switched on by a missed state transition.
 *
 * FOCUS RETURN lives in the launcher, not here — by the time this component's
 * cleanup runs it is being removed from the DOM, and focusing the button from
 * inside a dying tree races the browser's own "focus fell off the page, reset
 * to body" behaviour. The launcher still owns the button, so it does it after
 * the commit.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const focusableWithin = (root: HTMLElement): HTMLElement[] =>
  // `getClientRects()` rather than `offsetParent`, which is null for anything
  // fixed-positioned and would silently empty the list.
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );

export function ProjectileDemoDialog({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // --- The background canvas stops for as long as this is mounted ----------
  useEffect(() => suspendBackdrop(), []);

  // --- Background scroll lock ----------------------------------------------
  useEffect(() => {
    // `globals.css` makes the document element the scroll container, so this is
    // the element that has to stop scrolling — `body` would not do it.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    const previousPadding = root.style.paddingRight;
    // Desktop only: on a platform with a classic scrollbar, taking it away
    // would shift the whole page sideways behind the overlay.
    const gutter = window.innerWidth - root.clientWidth;

    root.style.overflow = 'hidden';
    if (gutter > 0) root.style.paddingRight = `${gutter}px`;

    return () => {
      root.style.overflow = previousOverflow;
      root.style.paddingRight = previousPadding;
    };
  }, []);

  // --- Move focus in --------------------------------------------------------
  useEffect(() => {
    // `preventScroll`, because the panel is taller than a phone viewport and a
    // plain `focus()` would scroll the document to reveal it — behind the
    // overlay, losing the visitor's place on the page for good.
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  // --- ...and keep it in ----------------------------------------------------
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusableWithin(panel);
      if (items.length === 0) {
        // Nothing to move to — keep Tab from walking out onto the page behind.
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    // Captured on the document so Escape works even if something inside the
    // canvas has managed to take focus off the panel's own subtree.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const onOverlayMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Only a press that both starts and lands on the overlay itself — a drag
      // that began on the fire-rate slider must not dismiss the dialog.
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  return createPortal(
    <div
      onMouseDown={onOverlayMouseDown}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/70 p-4 sm:p-6"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-3xl rounded-lg border border-hairline bg-surface p-5 shadow-raised outline-none sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Live demo</p>
            <h2
              id={titleId}
              className="mt-2 font-display text-2xl tracking-display text-ink"
            >
              r3f-projectiles
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-sm border border-control bg-surface text-sm font-bold text-ink hover:bg-panel"
          >
            Close
          </button>
        </div>

        <ProjectileDemo />

        <p className="mt-4 border-t border-hairline pt-4 text-sm leading-relaxed text-body">
          Every projectile above is one instance of a single mesh, so the whole
          field is one draw call however many are in flight. The patterns are
          composed the same way the published package composes them — a
          generator, then modifiers — and the site&rsquo;s own background canvas
          is paused while this one is open.
        </p>
      </div>
    </div>,
    document.body,
  );
}

export default ProjectileDemoDialog;
