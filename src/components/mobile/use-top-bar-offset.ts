'use client';

import { useLayoutEffect, useState } from 'react';
import { MOBILE_MENU_TRIGGER_ID } from './mobile-top-bar';

/**
 * useTopBarOffset — how many pixels of the screen the fixed mobile top bar
 * covers, measured from the bar itself.
 *
 * The top bar is `position: fixed` and offset by `env(safe-area-inset-top)`, so
 * its footprint is (safe area + its own height) — and its height has already
 * changed once (h-12 → h-14, when its touch targets were raised to 44px). A
 * constant here would silently go stale the next time, pushing the sticky
 * Hierarchy bar under the toolbar or leaving a gap.
 *
 * So nothing is assumed: the bar is found via the one stable contract it
 * exports (MOBILE_MENU_TRIGGER_ID, whose <header> ancestor is the bar) and its
 * `getBoundingClientRect().bottom` is read directly. Because the bar is fixed,
 * that bottom edge is viewport-relative and constant while scrolling — exactly
 * the number a `sticky` element underneath needs for its `top`.
 *
 * Re-measured on element resize (font loading, text reflow), window resize and
 * orientation change. `useLayoutEffect` so the first measurement lands before
 * paint and the sticky bar never flashes at the wrong offset.
 *
 * Returns 0 until the bar is measurable (SSR, or if the bar is absent), which
 * degrades to "stick to the top of the screen" rather than to a wrong guess.
 */
export function useTopBarOffset(): number {
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const trigger = document.getElementById(MOBILE_MENU_TRIGGER_ID);
    const bar = trigger?.closest('header') ?? null;
    if (!bar) return;

    const measure = () => {
      setOffset(Math.round(bar.getBoundingClientRect().bottom));
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  return offset;
}
