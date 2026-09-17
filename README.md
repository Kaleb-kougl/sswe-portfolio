# Kaleb Kougl — Senior Software Engineer Portfolio

A single scrolling portfolio page built with the Next.js App Router, React 19 and React Three Fiber. Five sections — intro, work, experience, process, contact — scroll over one fixed 3D background whose 112 blocks rearrange into a different arrangement for each section: the letters **KK**, a fibonacci sphere, a career bar chart, an exploded wireframe, and a receding floor.

## Live deployment

[https://kalebkougl-portfolio.vercel.app/](https://kalebkougl-portfolio.vercel.app/)

## Key features

- **Server-rendered.** Every section is a React Server Component, so the whole page — headings, résumé copy, contact details, JSON-LD — is in the HTML before any JavaScript runs. Only the scrollspy, the contact form and the WebGL background are client components.
- **One instanced draw call.** The background's 112 blocks share a single geometry and material and render through one `InstancedMesh`. Measured at **1.00 draw call per frame**, idle and mid-scroll.
- **A real asset pipeline.** The blocks come from `scripts/hero.blend`. A Python script run through Blender generates them and exports `public/models/hero.glb` (8,672 bytes), which CI checks against a 500 KB budget on every run. See [`docs/hero-pipeline.md`](docs/hero-pipeline.md).
- **Capability is measured, not guessed.** Phones run the live background too — this is one draw call, and a modern phone renders it trivially. Rather than infer capability from viewport width (or from `deviceMemory`, which iOS Safari does not expose), it animates by default and a frame-time watchdog downgrades once, permanently, if a device demonstrably cannot keep up. `prefers-reduced-motion` and Save-Data are honoured unconditionally and never adaptive; without WebGL the background renders nothing and the page stands on its own.
- **A live demo, loaded on demand.** The r3f-projectiles card opens the real bullet-pattern engine in a focus-trapped dialog — six patterns, adjustable fire rate, live instance count. None of it is in the initial payload; it loads on click, and the page's own background suspends while it runs so only one WebGL context is ever busy.
- **A contact form that cannot lie.** It posts to a route handler that validates server-side, carries a honeypot, and delivers through Formspree with no SDK and no DNS. reCAPTCHA v3 rides along, with Google's script loaded only once someone touches the form. With no provider configured it returns 503; with no captcha token, 400; if the provider rejects the message, 502 — and each says so plainly with the direct email address. No code path reports success for a message that went nowhere. Setup: [`docs/contact-delivery.md`](docs/contact-delivery.md).
- **Zero third-party scripts until you need one.** Fonts are self-hosted, nothing analytics-shaped loads on the hero, and the only external script on the page is reCAPTCHA — gated behind first interaction with the contact form.

## Tech stack

- **Framework**: Next.js 16.2.7 (App Router, Turbopack), React 19.2.4 with the React Compiler
- **3D / WebGL**: `three` v0.174, `@react-three/fiber` v9, `@react-three/drei` (`useGLTF`)
- **Styling**: Tailwind CSS v4 (CSS-first `@theme`, no config file), `lucide-react`
- **Asset pipeline**: Blender 5.2 LTS headless + a Python generator script
- **Testing**: Vitest, Playwright

Nine runtime dependencies. The site loads no state-management library, no animation library and no postprocessing stack.

Production browser source maps are enabled. Next disables them by default to avoid leaking source, but this repo is public — so there is nothing to leak, and a portfolio whose argument is its implementation is better off readable.

## Accessibility

Content is in the server HTML before any JavaScript runs, so it does not depend on hydration. Beyond that: a skip link as the first focusable element, a shared 3px focus ring on every interactive control, 44px minimum touch targets, `role="alert"` field errors tied to their inputs, and a decorative backdrop that is `aria-hidden`, takes no pointer events and contributes no heading or landmark.

Pinch-zoom is deliberately **not** capped. `maximum-scale=1` fails WCAG 2.1 SC 1.4.4, and the usual reason to add it — iOS Safari zooming a focused input — belongs on the inputs instead, which are 16px for exactly that reason. Both halves are guarded by tests so the cap cannot come back to fix a problem that is already solved elsewhere.

## Architecture

### The morphing background

`src/components/3d/morph-layouts.ts` bakes all five arrangements into flat typed arrays at module load (`position`, `scale`, `alpha`, `color`, stage-major). Per frame the morph is a lerp over contiguous memory — no objects, no property lookups, no allocation. Scroll position is written into a plain mutable object by a passive listener and read inside `useFrame`, so scrolling never triggers a React render.

Per-instance opacity does not exist in three.js, and the layouts need it (the sphere's depth fade, the back exploded layer, the receding floor). Rather than a material per opacity — which would mean a draw call per opacity — there is one `instanceAlpha` attribute and a small `onBeforeCompile` patch on the basic material, with both replacement anchors checked first so a future three.js release degrades to opaque instead of failing to compile.

`ssr: false` lives **inside** `morph-scene.tsx`, not in `page.tsx`: Next 16 does not allow it in a Server Component, and `page.tsx` has to stay one.

### Deciding whether to animate

Viewport width says nothing about GPU capability, so it is not used for that decision. Nor is CPU capability, which measuring showed to be the wrong resource entirely: a **20× CPU handicap still clears 58fps**, because 112 instances into two buffers is almost no CPU work. What actually costs is fill rate — uncapped at DPR 2.75 the scene renders a 2.3-megapixel backing store and drops to ~46fps *on a desktop GPU*, so small viewports cap device pixel ratio at 1.25.

The watchdog therefore measures frame time rather than reading a spec sheet. It trips when the rolling average holds under 40fps for two continuous seconds after a warm-up, and latches at module scope as well as in state, so a remount cannot undo it and the scene cannot oscillate between animated and still. 40fps sits in an empty band of the measured curve — performance falls off a cliff between a 20× and 50× handicap, skipping 30–50fps entirely — so there is nothing there to misjudge.

Small viewports also dim instance alpha to 0.4. That is a layout fix, not a capability one: at 390px the glyph lands behind the hero paragraph, and black blocks under black type is unreadable. It is one extra multiply per instance — no second material, no second pass, no extra draw call.

### The hero asset

`scripts/build_hero_glb.py` derives the block set from a 5×7 `K` glyph mask stamped twice, each lit cell subdivided 2×2 — 14 × 2 × 4 = 112 — and exports them as individually named parts (`block_000` … `block_111`) sharing one mesh and one material. The count is derived from the mask, not hardcoded; two runs produce a byte-identical GLB.

`__tests__/morph-layouts.test.ts` parses the committed GLB and checks every block's position against the layout arrays, so a re-export in a different order fails the suite instead of silently addressing the wrong blocks.

### Content

All résumé copy is derived from `src/data/resumeData.ts` at runtime rather than retyped into components — the years-of-experience figure, the company list, the career rows and the education line included. Editing the data updates the page.

## Testing

- **Unit (Vitest)** — 50 tests across 5 spec files, covering the layout math, the GLB contract, the projectile pattern generators and pool, and the capability/motion hooks. If `r3f-projectiles/` is cloned alongside (see below) its own 203 tests run too, bringing the local total to 253; CI sees only the portfolio's 50.
- **End-to-end (Playwright)** — 137 passing across 10 spec files on desktop and mobile projects, with 17 skipped by breakpoint gating. Coverage includes server-rendered HTML with JavaScript disabled, scrollspy, the collapsed mobile menu, the contact form's 503/400/honeypot paths, the projectiles dialog and its focus trap, the backdrop watchdog, pinch-zoom not being blocked, keyboard and focus behaviour, and reduced motion.
- **Visual regression** — five section snapshots plus the open mobile menu, captured with reduced motion forced and the canvas hidden so the animated background cannot make them flaky.
- **Asset budget** — `npm run hero:check` validates the GLB container, its size against the 500 KB budget, the part naming and contiguity, and that the parts are instanceable. It reports the minimum draw calls the asset *permits* and states plainly that it cannot verify what the renderer actually does.
- **Published claims** — every number on the Work cards is one a reader could go and check, and two things enforce that. `npm run roblox-css:check` re-derives the coverage figure for `@k9kbdev/roblox-css` from a clone and fails if it drifts, counting *distinct* assertions: at v0.1.1 eight of that package's spec files are byte-identical duplicates, so a naive count reports 1,926 across 17 files where only 1,298 across 9 are real. That check needs a sibling clone and so cannot run in CI, so `e2e/work-cards.spec.ts` covers the other half — it asserts the figures reach the DOM, imports them from the data module rather than retyping them, and asserts that superseded numbers stay gone.
- **CI** — GitHub Actions runs lint, unit, build and e2e, with the asset budget as a parallel job.

### Reduced motion is verified by counting draw calls

Screenshot diffing a WebGL surface through the compositor is not stable enough to prove "does not animate" — the first attempt failed for that reason rather than a real one. The specs instead wrap the WebGL2 draw entry points and count them, which works because the backdrop is deliberately one draw call per frame, making the counter a direct frame counter.

Reduced motion measures 1 draw at load and **0** over a 2s idle window. With motion allowed it is ~192 per 2s on desktop and ~224 on a phone viewport — and a control test asserts the live loop really does run, so the reduced-motion assertion is not vacuous. The projectiles dialog needs a per-canvas tally, since with it open there are two WebGL2 contexts and one global count would be swamped by the busy one; that is how "the backdrop pauses while the demo is open" is proved rather than asserted (177 draws before, 0 while open, 179 after).

Google is stubbed in every contact-form test, so the suite stays offline-safe and cannot flake on a third party.

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
