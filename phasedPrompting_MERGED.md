# Phased Prompting Strategy

Use the phases below in sequence, each in a separate chat session. Paste the entire `TDD_MERGED.md` document at the start of **every** session so the agent always has the full context. The TDD validates against 8 core skills: Next.js App Router, Zustand state management, react-resizable-panels v4, Motion for React, Lucide icons, R3F/Three.js, Tailwind CSS v4, and WCAG accessibility.

---

## Phase 1: Foundation & DOM Skeleton

Start a new chat. Paste the entire TDD, then append:

**Prompt:**

> I have provided a Technical Design Document (TDD) above for a 3D IDE-themed portfolio. For this first prompt, we are **only** focusing on the Foundation & DOM Layout.
>
> 1. Give me the CLI commands to initialize a **Next.js 16** (App Router) project with TypeScript and Tailwind CSS v4. Install these exact dependencies: `zustand@^5`, `react-resizable-panels@^4`, `lucide-react@latest`, and `motion@latest` (the package formerly known as `framer-motion` — imports come from `motion/react`).
>
> 2. Set up the design token system in `globals.css` using the exact CSS custom properties from TDD §4 (the `@theme` block with Catppuccin Mocha colors, `--font-mono`, `--font-ui`, etc.). Load `Inter` and `JetBrains Mono` via `next/font/google` in `layout.tsx` with `display: 'swap'` and CSS variable approach (`variable: '--font-ui'` and `variable: '--font-mono'`). Apply both variables to the `<html>` tag: `className={\`${inter.variable} ${jetbrainsMono.variable}\`}`.
>
> 3. In `layout.tsx`, export a `metadata` constant per TDD §4 (SEO Metadata section). Include `title`, `description`, `openGraph` with OG image, and `metadataBase`. Create a placeholder `public/og-image.png` (1200×630) — I will replace it with a real screenshot before deployment.
>
> 4. Create the `FILE_TREE` constant in `src/data/fileTree.ts` using the exact structure and IDs from TDD §2.2. The `icon` field uses the `LucideIcon` type (not `string`), and each icon value is a Lucide component reference (`Folder`, `User`, `Globe`, `Building2`, `Building`, `Truck`, `Hammer`, `Puzzle`, `Settings`, `BarChart3`). Import the type as `import { type LucideIcon } from 'lucide-react'`. Expand/collapse chevrons (`ChevronRight`/`ChevronDown`) are rendered by the `HierarchyTree` component, not stored in data.
>
> 5. Create the `RESUME_DATA`, `CONTACT_INFO`, `SUMMARY`, `EDUCATION`, `SKILLS` constants in `src/data/resumeData.ts` using the **exact** content from TDD §8. Do not modify, paraphrase, or embellish any resume text.
>
> 6. Create the `FILE_LOG_MAP` and `BOOT_LOGS` constants in `src/data/consoleLogs.ts` using the exact content from TDD §9.
>
> 7. Build the `useEngineStore` Zustand store in `src/store/useEngineStore.ts` using the **complete** `create()` implementation from TDD §3, including all defaults, reactive actions, transient actions, and the `resetStore` action. You **must** use the TypeScript curried form: `create<EngineState>()(...)` — never the non-curried `create(...)`. Wrap with `devtools` (outermost) and `subscribeWithSelector` exactly as shown in the TDD. When selecting multiple values from the store, use `useShallow` from `zustand/react/shallow` to prevent unnecessary re-renders (e.g., `const { activeFileId, isAssetLoading } = useEngineStore(useShallow((s) => ({ activeFileId: s.activeFileId, isAssetLoading: s.isAssetLoading })))`).
>
> 8. Build the static 4-pane IDE layout (TopBar, Hierarchy, Viewport, Inspector, Console) in `page.tsx` using `react-resizable-panels` v4 with nested vertical/horizontal Groups matching the component tree in TDD §4. **V4 API changes:** `PanelGroup` → `Group`, `PanelResizeHandle` → `Separator`, `direction` → `orientation`. Numeric sizes become strings: `defaultSize={20}` → `defaultSize="20%"`. The root vertical `Group` should have `className="h-dvh"`. The Hierarchy panel should be `collapsible` with `collapsedSize={0}` and use `usePanelRef` for programmatic collapse. Use `useDefaultLayout` for persistent panel layout (saves/restores sizes via localStorage). **Important:** `react-resizable-panels` uses browser APIs for DOM measurement. Wrap the entire panel layout in a dynamically imported `<IDELayout>` component loaded via `next/dynamic` with `ssr: false`. The `<MemoizedCanvasWrapper>` (Phase 3) also needs `ssr: false` but is not implemented yet.
>
> 9. Use the dark-mode IDE theme tokens — monospace font for the file tree and console, `Inter` for UI text.
>
> 10. Wrap the IDE layout root in `<LucideProvider size={16} strokeWidth={1.5}>` for consistent icon sizing across all file tree and toolbar icons. Import from `lucide-react`.
>
> 11. The TopBar's "Download Resume" button should be an `<a href="/KalebK_Resume.pdf" download>` anchor styled as a prominent button. Create an empty placeholder file at `public/KalebK_Resume.pdf` for now — I will replace it with the real PDF before deployment. No runtime PDF libraries needed.
>
> 12. Add a visually-hidden skip link as the first focusable element in the page: "Skip to main content" → jumps to the Inspector panel. Use ARIA landmarks as specified in TDD §10 (`<header>` for TopBar, `<nav>` for Hierarchy, `<main>` for Viewport+Inspector, `<footer>` for Console).
>
> 13. Create these Next.js App Router file conventions:
>     - `loading.tsx` — branded loading skeleton with the IDE background color.
>     - `error.tsx` — Client Component with typed `{ error, reset }` props (`error: Error & { digest?: string }`, `reset: () => void`) and `role="alert"`. Include a resume download link as fallback.
>     - `not-found.tsx` — themed 404 page matching the IDE aesthetic.
>     - `global-error.tsx` — Client Component as root-level error boundary with its own `<html>`/`<body>` tags.
>
> **CRITICAL:** Do NOT install or implement Three.js, R3F, or any 3D libraries yet. Leave the Center Viewport as an empty `<div id="viewport">` with the `--color-bg-editor` background. Give me the code to get this responsive HTML/CSS shell working first.

---

## Phase 2: Data Layer & State Bridge

Once Phase 1 is rendering a beautiful, resizable dark-mode IDE layout in the browser, start a new chat. Paste the full TDD, then:

**Prompt:**

> The Phase 1 DOM shell is working. Now let's implement the Data Layer and State Bridging.
>
> 1. Wire up the `<HierarchyTree />` (Left Panel) to render the `FILE_TREE` from `src/data/fileTree.ts`. Clicking a non-folder file node must call `setActiveFile(fileId, logMsg)` using the matching message from `FILE_LOG_MAP` in `src/data/consoleLogs.ts`. Folders should expand/collapse with `ChevronRight`/`ChevronDown` from `lucide-react`. Each node renders its `icon` field (a Lucide component reference like `Folder`, `User`, `Globe`, etc. — not emoji strings). Add staggered entrance animation using Motion variants: `containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }` and `itemVariants = { hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0 } }`. Render the tree with `<motion.ul variants={containerVariants} initial="hidden" animate="visible" role="tree">`.
>
> 2. Wire up the `<InspectorPanel />` (Right Panel) to read `activeFileId` from Zustand and display the **exact** resume content from `RESUME_DATA` in `src/data/resumeData.ts`. Display: title, company, dates, and all bullets verbatim. **Do not modify any resume text.**
>
> 3. Below the resume text in the Inspector, render the interactive controls that match the active file's `controls` array, using the Controls Specification Table from TDD §2.3. Each control must update its corresponding Zustand transient state field. If the active file has no `controls` array, render no controls. Use `startTransition(() => setActiveFile(...))` for non-urgent state updates in file selection handlers (safe because the Canvas reads imperatively via Zustand subscription, not reactively). When selecting multiple values from the store in the Inspector, use `useShallow` from `zustand/react/shallow`.
>
> 4. Wire up the `<TerminalConsole />` (Bottom Panel) to:
>    - Display `BOOT_LOGS` on initial mount.
>    - Push new log entries from `consoleLogs` in Zustand whenever `setActiveFile` is called.
>    - Auto-scroll to the bottom on new entries.
>    - Style like a real terminal: monospace font, green/cyan text on dark background, timestamp prefix.
>    - Use `useDeferredValue(consoleLogs)` so log rendering doesn't block critical UI updates.
>
> 5. **Accessibility (TDD §10):**
>    - The file tree must use `role="tree"` and `role="treeitem"` with `aria-expanded` on folders. Arrow keys navigate nodes; `Enter`/`Space` selects.
>    - All interactive controls (slider, toggles, radio buttons) must be native `<input>` elements, not `<div onClick>` shims.
>    - The console must use `role="log"` with `aria-live="polite"`.
>    - When a file is selected, programmatically move focus to the Inspector panel heading.
>    - `react-resizable-panels` v4 `Separator` automatically renders WAI-ARIA `role='separator'` with all required properties. Custom `aria-label` is optional but recommended for clarity.
>    - All interactive icons (file tree nodes, toolbar buttons) must meet 44×44px minimum touch target (WCAG 2.1 AA).
>
> 6. Make sure the UI reacts perfectly to these state changes without any errors. Verify: clicking IBM shows the bundle slider, clicking Indeed shows the toggles, clicking HammerBall shows the radio buttons and NavMesh toggle.

---

## Phase 3: WebGL Integration & Procedural Placeholders

Once the state is perfectly bridging the Left, Right, and Bottom panels, start a new chat. Paste the full TDD, then:

**Prompt:**

> Phase 2 state bridging is complete. Now we implement Phase 3: The 3D layer.
>
> 1. Install `@react-three/fiber@^9`, `@react-three/drei@^9`, and `three@^0.174` with `@types/three`. **Version compatibility:** Ensure `three`, `@react-three/fiber`, and `@react-three/drei` all resolve to compatible Three.js versions. Check Drei's peer dependency range before upgrading Three.js independently — version mismatches cause subtle rendering bugs.
>
> 2. **Tree-shaking setup (R3F v8+ requirement):** R3F no longer auto-imports the THREE namespace. Call `extend()` with only the specific three.js classes we use (Mesh, BoxGeometry, SphereGeometry, MeshStandardMaterial, InstancedMesh, PlaneGeometry, IcosahedronGeometry, etc.) at the top of the 3D entry file. This enables tree-shaking so unused three.js classes are removed from the bundle.
>
> 3. Implement the `<Canvas>` inside the Viewport panel wrapped in `<MemoizedCanvasWrapper>` (loaded via `next/dynamic` with `ssr: false`, zero props, wrapped in `React.memo()`). Attach `eventSource` to the viewport container via a `useRef<HTMLDivElement>` — do **not** use `document.getElementById()` as it evaluates before the DOM mounts and silently falls back to `window`. **Important:** The `eventSource` ref must point to the viewport Panel's DOM container. Since `MemoizedCanvasWrapper` uses `React.memo()`, the ref cannot be passed as a prop (defeats memo). Use a Zustand atom or React context to share the ref between the Panel container and the Canvas wrapper. Set `dpr={[1, 1.5]}` and `gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}` on the Canvas props.
>
> **`React.memo()` is the correct choice** for the Canvas wrapper — React Compiler cannot safely optimize R3F's Canvas boundary because R3F hooks rely on imperative mutations that bypass the Compiler's model. `React.memo()` is intentional here, not a fallback.
>
> 4. **Error handling:** Provide a `fallback` prop on `<Canvas>` for WebGL-unsupported systems. Wrap the Canvas in a React error boundary to catch GPU context crashes. The error boundary should use the render function pattern: `fallback={(error, reset) => ...}` with a retry button and a resume download link:
>    ```tsx
>    <ErrorBoundary
>      fallback={(error, reset) => (
>        <div role="alert">
>          <p>3D visualization unavailable: {error.message}</p>
>          <button onClick={reset}>Retry</button>
>          <a href="/KalebK_Resume.pdf" download>Download Resume Instead</a>
>        </div>
>      )}
>    >
>    ```
>
> 5. Implement `<SceneOrchestrator />` inside the Canvas that subscribes to `activeFileId` imperatively using `useEngineStore.subscribe()` with `{ fireImmediately: true }` (instead of a manual `getState()` initial check) as shown in TDD §3 (the bridging strategy). It manages which flex scene is **visible** — not which is mounted. All flex scenes are mounted once; the orchestrator toggles `visible={true/false}` on their `<group>` wrappers. This avoids GPU recompilation of geometries and materials on every file click.
>
> 6. **Build procedural flex scenes (always mounted, visibility-toggled):**
>
>    - **IBM Flex (`ibm-staff-swe`):** Create an `<instancedMesh args={[null, null, 500]}>` particle system. In `useEffect`, set initial positions as a large chaotic sphere. In `useFrame`, read `targetBundleSize` imperatively via `useEngineStore.getState()` and interpolate instance positions toward a tight diamond shape as the value decreases. Use a shared `tempMatrix = useMemo(() => new THREE.Matrix4(), [])` for InstancedMesh matrix updates. **Critical `useFrame` rules:**
>      - **Never call `setState`** — mutate the `instancedMesh` ref directly.
>      - **Never allocate objects** (`new Vector3()`) inside the loop — create reusable objects outside (module scope or component scope).
>      - **Framerate-independent interpolation:** Use `delta` from `useFrame` and `THREE.MathUtils.damp()` instead of manual lerp. This ensures consistent animation speed across 60Hz and 144Hz displays.
>      - Color: lerp from red (#f38ba8) at 6.0 MB to green (#a6e3a1) at 0.3 MB.
>      - After updating matrices, flag `instanceMatrix.needsUpdate = true`.
>
>    - **Indeed Flex (`indeed-sr-swe`):** Create 6-8 `<mesh>` components (box geometries) with randomized initial positions. In `useFrame`, lerp positions toward a unified grid when `isModuleFederationEnabled` is true, or back to scattered positions when false. When `isSloIncidentSimulated` is true, change the scene ambient/point light color/intensity to red — NOT the material color. Use `MeshStandardMaterial` (not `MeshBasicMaterial`, which ignores lights entirely). Add default lighting: `<ambientLight intensity={0.4} />` and `<directionalLight position={[5, 5, 5]} intensity={1} />`.
>
>    - **HammerBall Flex (`hammerball`):** Create a `<mesh>` floor plane and two `<mesh>` sphere primitives ("AI orbs") that change color based on `forceAiState` (Green=#a6e3a1 for Patrol, Red=#f38ba8 for Aggro, Yellow=#f9e2af for Flee). When `showNavMesh` is true, render a wireframe grid on the floor plane. Read `forceAiState` and `showNavMesh` imperatively in `useFrame` or via `useEngineStore.subscribe()`. Add default lighting: `<ambientLight intensity={0.4} />` and `<directionalLight position={[5, 5, 5]} intensity={1} />`.
>
> 7. For all other file IDs without a 3D flex, show a default scene: a slowly rotating wireframe icosahedron (color `#89b4fa` / `--color-text-accent`) centered in the viewport with ~50 ambient floating particles drifting outward. This default scene should also be always-mounted with visibility toggling.
>
> 8. Implement `<CanvasLoadingHUD />` overlaid on the viewport. It reads `isAssetLoading` from Zustand and shows a minimal loading indicator (spinner or progress bar) while assets swap. Hide it when loading completes (`setAssetLoading(false)`).
>
> 9. Add a `<Stats />` component from `@react-three/drei` to display live FPS. Since `<Stats />` must render inside an R3F `<Canvas>`, use CSS absolute positioning or a portal to visually place the readout in the TopBar area.
>
> 10. **Two patterns for reading Zustand inside the Canvas — use the right one:**
>     - **Discrete events** (scene visibility swaps when `activeFileId` changes): Use `useEngineStore.subscribe()` inside a `useEffect` with a cleanup return (`return unsubscribe`). This fires once per state change.
>     - **Continuous reads** (slider values, camera targets): Use `useEngineStore.getState()` inside `useFrame`. This polls every frame with zero React re-renders.
>     - **Never** pass transient state as React props to Canvas children.
>
> 11. **`useFrame` guardrails (enforce these in all 3D components):**
>     - ❌ `setState()` → ✅ Mutate refs directly
>     - ❌ `new THREE.Vector3()` inside loop → ✅ Reuse objects declared outside the loop
>     - ❌ `position.x += 0.1` → ✅ `position.x += speed * delta`
>     - ❌ Reactive Zustand hooks → ✅ `useEngineStore.getState()` for per-frame reads
>     - ❌ `new TextureLoader()` in `useEffect` → ✅ `useLoader(TextureLoader, url)` for automatic caching
>     - ❌ Creating new `uniforms` object → ✅ Mutate via `ref.current.uniforms` (R3F merges, not replaces)
>     - ❌ Multiple `useGLTF` loads of same URL then disposing → ✅ `dispose={null}` on shared primitives
>     - ⚠️ `<primitive>` objects are NOT auto-disposed by R3F — the developer is responsible for their lifecycle. If using `<primitive object={gltf.scene}>`, manually dispose via `useEffect` cleanup or `useGLTF.clear(url)`.
>
> 12. **Asset pipeline (TDD §6):**
>     - Pre-load critical assets in module scope: `useLoader.preload(GLTFLoader, '/model.glb')` to start fetching before components mount.
>     - All `.glb` files should be Draco-compressed via `gltf-pipeline` (up to 80% size reduction).
>     - The HTML/CSS UI loads instantly; 3D models lazy-load strictly on-demand within `<Suspense>` boundaries.
>     - **Draco loader configuration:** Use the `useLoader` 3rd callback pattern:
>       ```tsx
>       const gltf = useLoader(GLTFLoader, '/model.glb', (loader) => {
>         const dracoLoader = new DRACOLoader()
>         dracoLoader.setDecoderPath('/draco/')
>         loader.setDRACOLoader(dracoLoader)
>       })
>       ```
>
> 13. **Draco WASM hosting (TDD §7):** R3F's `useGLTF` uses a web worker. You must explicitly host the Draco decoder WASM files in Next.js `public/draco-gltf/` and point the loader to them, or Draco-compressed assets will silently fail in production.
>
> 14. **TypeScript type safety for `extend()`:** After calling `extend()`, register the extended elements for JSX type checking:
>     ```tsx
>     declare module '@react-three/fiber' {
>       interface ThreeElements {
>         // All extended classes are now available as JSX elements
>       }
>     }
>     ```
>
> 15. **Texture guidelines:** Use power-of-two dimensions (256, 512, 1024, 2048) for proper mipmapping. Set `texture.colorSpace = THREE.SRGBColorSpace` on color/albedo textures only (NOT on normal maps, AO maps, or data textures). Memory budget: a 2048×2048 RGBA texture uses ~16MB GPU memory. Use `useLoader(TextureLoader, url)` or `useTexture()` from Drei for auto-caching. Disposing a material does NOT dispose its textures — textures must be disposed separately.

---

## Phase 4: Mobile Hardening & Polish

Once the 3D scene is smoothly interacting with the DOM controls, start a new chat. Paste the full TDD, then:

**Prompt:**

> Phase 3 WebGL is working. Finally, let's implement Mobile UX and Performance optimizations from TDD §5 and §6.
>
> 1. Create a `useIsMobile` hook (or use Tailwind's responsive breakpoint at `md: 768px`) to detect mobile viewports.
>
> 2. **Mobile Layout (Z-Layer strategy from TDD §5):**
>    - Break the `<Canvas>` out to `absolute inset-0 z-0` occupying `100dvh` × `100vw`.
>    - Convert the TopBar into a floating glassmorphic pill (`backdrop-blur`, semi-transparent bg) at `z-50`.
>    - Convert the Left Panel (Hierarchy) into a **Motion for React off-canvas drawer** (imports from `motion/react`) that slides in from the left. Selecting a file auto-dismisses the drawer. Use `AnimatePresence` + `motion.aside` with spring animation:
>      ```tsx
>      import { motion, AnimatePresence } from "motion/react"
>      // MobileDrawer: AnimatePresence wrapping conditional motion.aside
>      // initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
>      // transition={{ type: "spring", damping: 25, stiffness: 200 }}
>      ```
>    - Convert the Right Panel (Inspector) into a **draggable Motion for React bottom sheet** (imports from `motion/react`) with three states matching `mobileSheetState` in Zustand: `hidden`, `peek` (title + swipe handle visible), `expanded` (50-60% of screen). Use `drag="y"`, `dragConstraints`, and `PanInfo` type:
>      ```tsx
>      import type { PanInfo } from "motion/react"
>      // BottomSheet: drag="y", dragConstraints={{ top: 0 }}, dragElastic={0.2}
>      // onDragEnd={(_: PointerEvent, info: PanInfo) => { ... }}
>      ```
>    - **AnimatePresence critical rules:** `AnimatePresence` must remain mounted — place conditionals *inside* it, never wrap it in a conditional. Every direct child must have a stable, unique `key`. Use `onExitComplete` for focus restoration: `onExitComplete={() => triggerRef.current?.focus()}`.
>    - When the bottom sheet expands, update `cameraTarget` in Zustand so the 3D camera pans upward to frame the visualization in the top 40%.
>    - Consider React 19's `<Activity mode='hidden'>` for the mobile drawer content to preserve scroll position and component state when hidden, instead of unmounting.
>    - The Console becomes a fading overlay at the bottom of the screen (z-10).
>
> 3. **Gesture Conflicts:** Disable Three.js `OrbitControls` touch events when the mobile drawer or bottom sheet is actively being dragged to prevent gesture fighting.
>
> 4. **Disposal strategy — follow R3F's built-in lifecycle:**
>    - R3F **automatically calls `object.dispose()`** on all unmounted objects. Do NOT write a manual traverse-and-dispose hook for procedural geometries.
>    - **Exception:** `<primitive>` objects are NOT auto-disposed by R3F. If using `<primitive object={gltf.scene}>`, manually dispose via `useEffect` cleanup or `useGLTF.clear(url)`.
>    - For procedural scenes that stay mounted (visibility-toggled), nothing needs to be disposed — they persist for the app lifetime.
>    - If/when `.glb` files are loaded via `useGLTF` and cached: set `dispose={null}` on their `<primitive>` to prevent R3F from disposing shared cached assets. Only call `useGLTF.clear(assetUrl)` if you need to fully purge an asset from memory (rare — prefer visibility toggling).
>
> 5. **Performance scaling:**
>    - Ensure the Canvas uses `dpr={[1, 1.5]}` (array form, not a single number).
>    - Use `100dvh` everywhere instead of `100vh`.
>    - Wrap scenes in Drei's `<PerformanceMonitor>` to auto-adapt pixel ratio:
>      ```tsx
>      <PerformanceMonitor
>        onIncline={() => setDpr(1.5)}
>        onDecline={() => setDpr(1)}
>        onChange={({ factor }) => setDpr(0.5 + 1.5 * factor)}
>        flipflops={3}
>        onFallback={() => setDpr(1)}
>      >
>      ```
>    - Implement movement regression: call `state.performance.regress()` during OrbitControls `change` events. Create an `<AdaptivePixelRatio>` component that reads `performance.current` via `useThree` and scales `dpr` accordingly.
>    - Programmatically disable heavy post-processing passes (Bloom, SSAO) on mobile devices.
>    - **Material/geometry sharing:** Share materials and geometries in module scope or `useMemo`, not per-render. Set `matrixAutoUpdate={false}` on static objects (ground planes, backgrounds) to avoid unnecessary matrix computations.
>    - Use `startTransition` to wrap any expensive geometry creation that could cause jank. Note: This is safe because Canvas reads imperatively via Zustand subscription, not reactively.
>    - Use nested `<Suspense>` boundaries to load low-quality models as fallback while high-quality loads.
>
> 6. **Mobile Accessibility:** When the bottom sheet expands on mobile, trap focus inside it until dismissed. Use Motion for React's `AnimatePresence` (from `motion/react`) exit to restore focus to the trigger button. Add `useReducedMotion` or `<MotionConfig reducedMotion="user">` for accessibility — replace slide/scale animations with simple opacity fades when the user has reduced-motion enabled.
>
> 7. **Motion bundle optimization:** Use `LazyMotion` + `domMax` to reduce the motion bundle from ~34kb to ~4.6kb. Use `m.div`, `m.aside` (not `motion.div`) inside `LazyMotion`. Note: `domMax` is required (not `domAnimation`) because the bottom sheet uses `drag` and `layout`.
>    ```tsx
>    import { LazyMotion, domMax } from "motion/react"
>    import * as m from "motion/react-m"
>    <LazyMotion features={domMax} strict>
>      {/* Use m.div, m.aside — NOT motion.div inside LazyMotion */}
>    </LazyMotion>
>    ```
>
> 8. **Global animation defaults:** Use `<MotionConfig>` to set global spring defaults and avoid repeating transition config:
>    ```tsx
>    <MotionConfig transition={{ type: "spring", damping: 25, stiffness: 200 }} reducedMotion="user">
>      <App />
>    </MotionConfig>
>    ```
>
> 9. Test the mobile layout by resizing the browser to < 768px width. Verify the drawer, bottom sheet, and canvas all work together without layout thrashing or gesture conflicts.

---

## Phase 5: Verification & Testing

Once all features are implemented, start a new chat. Paste the full TDD, then:

**Prompt:**

> All 4 phases are complete. Now let's add verification and testing per TDD §11.
>
> **CRITICAL — Test Isolation:** Zustand stores are singletons and state persists across tests. In your test setup, add:
> ```typescript
> beforeEach(() => {
>   useEngineStore.setState(useEngineStore.getInitialState(), true);
> });
> ```
> This prevents state from leaking between tests.
>
> **Pure store tests:** For testing Zustand store behavior directly, use `getState()` — no `renderHook` needed:
> ```typescript
> test('setActiveFile updates activeFileId and pushes log', () => {
>   useEngineStore.getState().setActiveFile('ibm-staff-swe', '> [PERF] ...')
>   expect(useEngineStore.getState().activeFileId).toBe('ibm-staff-swe')
>   expect(useEngineStore.getState().consoleLogs).toContain('> [PERF] ...')
> })
> ```
>
> 1. Install `@playwright/test` as a dev dependency. Run `npx playwright install` to set up browsers.
>
> 2. **Animation performance audit:** Add a CI-gated motionscore check:
>    ```bash
>    npx motionscore https://your-domain.com --threshold B
>    ```
>    This gates deployment on B-tier or above animation performance (compositor-friendly).
>
> 3. Create `e2e/portfolio.spec.ts` with the following tests:
>    - `renders IDE layout`: All 4 panels visible, TopBar contains download button.
>    - `file tree → inspector wiring`: Click `Level_3_IBM_Modernization.tsx` → Inspector shows "Staff Software Engineer" and "IBM".
>    - `file tree → console wiring`: Click `Level_4_Indeed_OneHost.config` → Console shows `> [NETWORK] Opening gRPC channels...`.
>    - `controls render per file`: Click IBM → slider visible. Click Indeed → toggles visible. Click HammerBall → radio buttons visible.
>    - `3D canvas mounts`: Viewport contains a `<canvas>` element.
>    - `mobile layout`: At viewport < 768px: drawer trigger visible, bottom sheet visible, no panel layout.
>    - `download link works`: Download button `href` points to `/KalebK_Resume.pdf`.
>    - `keyboard navigation`: Tab through file tree → inspector → controls without getting trapped.
>
> 4. Add visual regression screenshots:
>    - Capture `desktop-layout.png` at default viewport.
>    - Capture `mobile-layout.png` at 375×812.
>    - Use `maxDiffPixelRatio: 0.01`.
>
> 5. Run `npm run build` and verify it completes without errors.
>
> 6. Run the Playwright test suite and fix any failures.
>
> 7. **Manual verification (TDD §11):** Open the site in Chrome and confirm zero console errors in DevTools. Open the Performance tab, resize panels, and verify no layout thrashing occurs during drag operations.
>
> 8. Run Chrome Lighthouse in the browser and verify Accessibility score ≥ 90.
>
> 9. Verify animation performance meets the B-tier threshold from the motionscore audit.
>
> 10. Check the `npm run build` output for any routes exceeding 200KB. The three.js bundle is the largest risk — verify that `extend()` tree-shaking (Phase 3) keeps it under control. If a route is too large, install `@next/bundle-analyzer` and identify the culprit.
>
> 11. **Console log keying:** Ensure console log entries have stable unique keys, not array index. Use an incrementing counter at push time: `{ id: logCounter++, msg }`. Since logs are append-only and capped, array index is an acceptable pragmatic alternative.
