'use client';

import dynamic from 'next/dynamic';

/**
 * MorphScene — the fixed 3D background every section scrolls over.
 *
 * WHY THIS FILE IS A WRAPPER
 * --------------------------
 * `page.tsx` is a Server Component on purpose: server-rendering the sections is
 * the whole point of the scroll rebuild, so the page cannot be the one to call
 * `dynamic(..., { ssr: false })`. Per
 * `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`:
 *
 *   > `ssr: false` option is not supported in Server Components. You will see an
 *   > error if you try to use it in Server Components. … Please move it into a
 *   > Client Component.
 *
 * So the client boundary lives HERE. `page.tsx` imports `MorphScene` statically;
 * this module marks itself `'use client'` and defers the WebGL bundle — three,
 * R3F and the scene itself — to a browser-only chunk. Nothing 3D is ever
 * server-rendered, and nothing 3D is in the initial HTML payload.
 *
 * (Same pattern as `src/components/ide-layout-wrapper.tsx`.)
 *
 * The backdrop is decoration: `aria-hidden`, `pointer-events: none`, and no
 * loading state — a placeholder would flash a box over the page for one chunk
 * fetch and add nothing, so the page simply renders without it until it lands.
 */
const MorphCanvas = dynamic(() => import('./morph-canvas'), {
  ssr: false,
  loading: () => null,
});

export function MorphScene() {
  return <MorphCanvas />;
}

export default MorphScene;
