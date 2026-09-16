'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * projectile-demo-launcher — the "Run the demo" button on the r3f-projectiles
 * card, and the only thing about the demo that is in the initial payload.
 *
 * WHY THE BOUNDARY IS HERE
 * ------------------------
 * `src/app/page.tsx` and `src/components/scroll/work-section.tsx` are Server
 * Components, and per
 * `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`:
 *
 *   > `ssr: false` option is not supported in Server Components. You will see an
 *   > error if you try to use it in Server Components. … Please move it into a
 *   > Client Component.
 *
 * So this file is the client boundary, the same way `morph-scene.tsx` is the
 * one for the backdrop. The work section stays a Server Component and still
 * ships its cards as HTML.
 *
 * WHY THE DIALOG IS ONLY RENDERED WHEN OPEN
 * -----------------------------------------
 * The same guide again: a `dynamic()` component behind a condition is "load on
 * demand, only when/if the condition is met". `{open && <Dialog />}` is what
 * keeps three, R3F and the pattern code out of the page until somebody actually
 * asks for them — which is the point, on a page whose selling point is nine
 * runtime dependencies and a static prerender.
 *
 * WHY IT IS A `<button>`
 * ----------------------
 * It opens an overlay on this page. It navigates nowhere, it has no href worth
 * copying, and it must not be openable in a new tab — so it is a button, and it
 * is styled as one (solid `cta`) rather than as another blue "Source →" link.
 */
const ProjectileDemoDialog = dynamic(
  () => import('@/components/demos/projectiles/projectile-demo-dialog'),
  { ssr: false, loading: () => null },
);

export function ProjectileDemoLauncher() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  const close = useCallback(() => setOpen(false), []);

  /**
   * Focus return. The dialog unmounts on close, so this runs after the commit
   * that removed it — at which point the button is the right place for focus
   * and nothing is going to move it again.
   */
  useEffect(() => {
    if (wasOpen.current && !open) buttonRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        /* min-h-11 = 44px, matching the link tap targets beside it. */
        className="inline-flex min-h-11 items-center gap-1.5 rounded-sm bg-cta px-4 text-sm font-bold text-cta-ink shadow-cta"
      >
        Run the demo
        <span className="sr-only">for r3f-projectiles (opens a dialog)</span>
      </button>

      {open ? <ProjectileDemoDialog onClose={close} /> : null}
    </>
  );
}

export default ProjectileDemoLauncher;
