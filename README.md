# Kaleb Kougl — Senior Software Engineer Portfolio

A single scrolling portfolio page built with the Next.js App Router, React 19 and React Three Fiber. Five sections — intro, work, experience, process, contact — scroll over one fixed 3D background whose 112 blocks rearrange into a different arrangement for each section: the letters **KK**, a fibonacci sphere, a career bar chart, an exploded wireframe, and a receding floor.

## Live deployment

[https://kalebkougl-portfolio.vercel.app/](https://kalebkougl-portfolio.vercel.app/)

## Key features

- **Server-rendered.** Every section is a React Server Component, so the whole page — headings, résumé copy, contact details, JSON-LD — is in the HTML before any JavaScript runs. Only the scrollspy, the contact form and the WebGL background are client components.
- **One instanced draw call.** The background's 112 blocks share a single geometry and material and render through one `InstancedMesh`. Measured at **1.00 draw call per frame**, idle and mid-scroll.
- **A real asset pipeline.** The blocks come from `scripts/hero.blend`. A Python script run through Blender generates them and exports `public/models/hero.glb` (8,672 bytes), which CI checks against a 500 KB budget on every run. See [`docs/hero-pipeline.md`](docs/hero-pipeline.md).
- **Degrades deliberately.** `prefers-reduced-motion` and touch devices get a static arrangement with no scroll listener and no frame loop; without WebGL the background renders nothing at all and the page stands on its own.
- **A contact form that cannot lie.** It posts to a route handler that validates server-side and carries a honeypot, and delivers through Formspree with no SDK and no DNS. With no provider configured it returns HTTP 503 and says so; if the provider rejects the message it returns 502 and says that — no code path reports success for a message that went nowhere. Setup: [`docs/contact-delivery.md`](docs/contact-delivery.md).

## Tech stack

- **Framework**: Next.js 16.2.7 (App Router, Turbopack), React 19.2.4 with the React Compiler
- **3D / WebGL**: `three` v0.174, `@react-three/fiber` v9, `@react-three/drei` (`useGLTF`)
- **Styling**: Tailwind CSS v4 (CSS-first `@theme`, no config file), `lucide-react`
- **Asset pipeline**: Blender 5.2 LTS headless + a Python generator script
- **Testing**: Vitest, Playwright

Nine runtime dependencies. The site loads no state-management library, no animation library and no postprocessing stack.

## Architecture

### The morphing background

`src/components/3d/morph-layouts.ts` bakes all five arrangements into flat typed arrays at module load (`position`, `scale`, `alpha`, `color`, stage-major). Per frame the morph is a lerp over contiguous memory — no objects, no property lookups, no allocation. Scroll position is written into a plain mutable object by a passive listener and read inside `useFrame`, so scrolling never triggers a React render.

Per-instance opacity does not exist in three.js, and the layouts need it (the sphere's depth fade, the back exploded layer, the receding floor). Rather than a material per opacity — which would mean a draw call per opacity — there is one `instanceAlpha` attribute and a small `onBeforeCompile` patch on the basic material, with both replacement anchors checked first so a future three.js release degrades to opaque instead of failing to compile.

`ssr: false` lives **inside** `morph-scene.tsx`, not in `page.tsx`: Next 16 does not allow it in a Server Component, and `page.tsx` has to stay one.

### The hero asset

`scripts/build_hero_glb.py` derives the block set from a 5×7 `K` glyph mask stamped twice, each lit cell subdivided 2×2 — 14 × 2 × 4 = 112 — and exports them as individually named parts (`block_000` … `block_111`) sharing one mesh and one material. The count is derived from the mask, not hardcoded; two runs produce a byte-identical GLB.

`__tests__/morph-layouts.test.ts` parses the committed GLB and checks every block's position against the layout arrays, so a re-export in a different order fails the suite instead of silently addressing the wrong blocks.

### Content

All résumé copy is derived from `src/data/resumeData.ts` at runtime rather than retyped into components — the years-of-experience figure, the company list, the career rows and the education line included. Editing the data updates the page.

## Testing

- **Unit (Vitest)** — 45 tests across 4 spec files, covering the layout math, the GLB contract, the projectile pattern generators and pool, and the responsive/motion hooks. If `r3f-projectiles/` is cloned alongside (see below) its own 203 tests run too, bringing the local total to 248; CI sees only the portfolio's 45.
- **End-to-end (Playwright)** — 81 passing across 6 spec files on desktop and mobile projects, with 15 skipped by breakpoint gating. Coverage includes server-rendered HTML with JavaScript disabled, scrollspy, the collapsed mobile menu, the contact form's 503 and honeypot paths, keyboard and focus behaviour, and reduced motion.
- **Visual regression** — five section snapshots plus the open mobile menu, captured with reduced motion forced and the canvas hidden so the animated background cannot make them flaky.
- **Asset budget** — `npm run hero:check` validates the GLB container, its size against the 500 KB budget, the part naming and contiguity, and that the parts are instanceable. It reports the minimum draw calls the asset *permits* and states plainly that it cannot verify what the renderer actually does.
- **Published claims** — `npm run roblox-css:check` re-derives the coverage figure the Work section states for `@k9kbdev/roblox-css` and fails if it drifts. It counts *distinct* assertions: at v0.1.1 eight of that package's spec files are byte-identical duplicates, so a naive count reports 1,926 across 17 files where only 1,298 across 9 are real.
- **CI** — GitHub Actions runs lint, unit, build and e2e, with the asset budget as a parallel job.

### Reduced motion is verified by counting draw calls

Screenshot diffing a WebGL surface through the compositor is not stable enough to prove "does not animate". The reduced-motion spec instead wraps the WebGL2 draw entry points and counts them: reduced motion measures 1 draw at load and 0 over a 2s idle window, against roughly 190 per 2s with motion allowed. A control test asserts the live loop really does run, so the assertion is not vacuous.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000

npm run lint
npm run test:unit
npm run test:e2e

npm run hero:check   # validate the committed hero.glb against its budgets
npm run hero:build   # regenerate it (requires Blender; see docs/hero-pipeline.md)
```

### Sibling packages

Two of the projects on this page are published packages with their own repos. They are gitignored here rather than vendored, so clone them alongside if you want their claims re-derivable locally:

```bash
git clone https://github.com/Kaleb-kougl/r3f-projectiles.git r3f-projectiles
git clone https://github.com/Kaleb-kougl/roblox-css.git roblox-css

npm run roblox-css:check   # skips cleanly when the clone is absent
```

The r3f-projectiles demo on the Work card does **not** depend on either clone — it is a self-contained implementation in `src/components/demos/projectiles/`.

## Contact

kalebkougl@gmail.com
