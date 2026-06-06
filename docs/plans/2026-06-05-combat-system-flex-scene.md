# Combat System Flex Scene — Implementation Plan

> **Skills used:** `writing-plans`, `concise-planning`
> **Reviewed by:** 4 skill-based subagents (`react-three-fiber`, `react-patterns`, `threejs-skills`, `framer-motion`)

**Goal:** Port CombatSystem's composable bullet-pattern visualizer into the portfolio as a native R3F flex scene — visitors click a file, the viewport shows an auto-firing pattern gallery with bloom, and the inspector panel provides controls to switch patterns and tune visuals.

**Architecture:** Auto-demo mode (no player input needed). The `Patterns.js` generator/modifier pipeline and `BulletManager.js` InstancedMesh renderer port from vanilla Three.js → R3F `useFrame` + `<instancedMesh>`. A timer auto-fires patterns on an interval. Inspector controls let visitors pick patterns and adjust speed/bloom. No pointer lock, no combat — pure visual showcase of the math and rendering systems.

**Tech Stack:** React 19, R3F (`@react-three/fiber`), `@react-three/drei`, `@react-three/postprocessing` + `postprocessing`, Zustand, TypeScript

> **New dependency:** `@react-three/postprocessing` is not in the original TDD tech stack table (§4). Verify Three.js peer-dependency compatibility with `postprocessing` (the underlying library) before installing. Pin to a version compatible with `three@^0.174`.

---

## Scope

**In:**
- Data layer: file tree entry, resume data entry, console log
- Store: 3 new transient fields (typed with union for pattern)
- Three.js setup: extend `Fog` class for tree-shaking
- Scene orchestrator: register `'combat_system'` as a flex scene key
- Pattern engine: port `Patterns.js` generators + modifiers → TypeScript module
- Bullet manager: port `BulletManager.js` → R3F InstancedMesh component
- Flex scene: `combat-system-flex.tsx` (arena + bullet manager)
- Bloom: conditional `<EffectComposer>` at canvas level (not inside scene group)
- Inspector controls: pattern selector radio, auto-fire speed slider, bloom intensity slider
- Canvas wrapper: mount `<CombatSystemFlex />` + conditional bloom
- Accessibility: reduced motion support, aria-live announcements, native inputs
- Automated tests: store unit tests, E2E additions, reduced-motion E2E, visual regression baselines

**Out:**
- Player/combat system (no WASD, no pointer lock)
- Spider/Centipede IK (stretch goal for a future session)
- Enemy AI, sword trail, combo system
- Mobile-specific gameplay controls

---

## Types

Define a shared union type used across the store, pattern engine, inspector, and registry:

```ts
// src/components/3d/scenes/combat-system-types.ts
export type CombatSystemPattern = 'fibonacciSphere' | 'torusKnot' | 'galaxy' | 'helix' | 'rose3D' | 'ring';

export const COMBAT_SYSTEM_PATTERN_LABELS: Record<CombatSystemPattern, string> = {
  fibonacciSphere: 'Fibonacci Sphere',
  torusKnot: 'Torus Knot',
  galaxy: 'Galaxy',
  helix: 'Helix',
  rose3D: 'Rose 3D',
  ring: 'Ring',
} as const;
```

---

## Controls Specification Table

Per TDD §2.3, every interactive control maps to a specific Zustand field:

| File ID | Control Label | Control Type | Zustand Field | Range / Options | Default |
|---|---|---|---|---|---|
| `combat_system` | Bullet Pattern | Radio group | `combatSystemPattern` | `'Fibonacci Sphere'` / `'Torus Knot'` / `'Galaxy'` / `'Helix'` / `'Rose 3D'` / `'Ring'` | `'Fibonacci Sphere'` (`fibonacciSphere`) |
| `combat_system` | Auto-fire Rate | Slider | `combatSystemFireRate` | min: 0.3, max: 3.0, step: 0.1 | `1.5` |
| `combat_system` | Bloom Intensity | Slider | `combatSystemBloom` | min: 0.0, max: 3.0, step: 0.1 | `1.2` |

---

## Action Items

### Task 1: Data layer — file tree, resume entry, console log

**Files:**
- Modify: `src/data/fileTree.ts`
- Modify: `src/data/resumeData.ts`
- Modify: `src/data/consoleLogs.ts`

**Steps:**
1. Add `Gamepad2` **named import** to `fileTree.ts` (from `lucide-react`) — per TDD §4, never use `import *` or `DynamicIcon` for tree-shaking.
2. Add `{ id: 'combat_system', label: 'Combat_System.three', icon: Gamepad2 }` as 3rd child of `03_Game_Logic` folder
3. Add `combat_system` entry to `RESUME_DATA` in `resumeData.ts`:
   - `type: 'project'`, `company: 'Personal Project'`
   - **Note (TDD §8):** These are new project descriptions authored for this portfolio entry, not sourced from an existing resume document. Per TDD §8 rules, do not embellish existing resume content — but new project entries are authored fresh.
   - Bullets:
     - `'Composable bullet-pattern system with 15 generators, 9 modifiers, and functional composition — each pattern is a pure function returning spawn data.'`
     - `'GPU-instanced bullet renderer using InstancedMesh with a 5,000-bullet pool, zero-allocation physics loop, and per-instance color via setColorAt.'`
     - `'Procedural IK spider/centipede enemies and multi-phase boss AI with state-machine-driven attack patterns.'`
   - `controls: ['combatSystemPattern', 'combatSystemFireRate', 'combatSystemBloom']`
4. Add exact log message to `FILE_LOG_MAP` in `consoleLogs.ts`:
   ```ts
   'combat_system': '> [GAME] CombatSystem combat engine initialized. Pattern pipeline active.',
   ```

**Verify:** `npm run build` passes — no missing imports or type errors

---

### Task 2: Shared types + Engine store — union type + 3 new transient fields

**Files:**
- Create: `src/components/3d/scenes/combat-system-types.ts`
- Modify: `src/store/useEngineStore.ts`

**Steps:**
1. Create `combat-system-types.ts` with `CombatSystemPattern` union type and `COMBAT_SYSTEM_PATTERN_LABELS` map (see Types section above).
2. Import `CombatSystemPattern` in `useEngineStore.ts`.
3. Add to `TransientUpdates` interface:
   ```ts
   combatSystemPattern?: CombatSystemPattern;
   combatSystemFireRate?: number;
   combatSystemBloom?: number;
   ```
4. Add corresponding fields to `EngineState` interface:
   ```ts
   // Combat System Flex
   combatSystemPattern: CombatSystemPattern;
   combatSystemFireRate: number;
   combatSystemBloom: number;
   ```
5. Add defaults to store initializer:
   ```ts
   combatSystemPattern: 'fibonacciSphere',
   combatSystemFireRate: 1.5,
   combatSystemBloom: 1.2,
   ```

> **Why union type?** The existing store uses union types for constrained fields (e.g., `forceAiState: 'Patrol' | 'Aggro' | 'Flee'`). Using `string` would break this convention and lose compile-time exhaustiveness checking. The `PATTERN_REGISTRY` key type also benefits from `as const satisfies Record<CombatSystemPattern, ...>`.

**Verify:** TypeScript compiles. DevTools shows new fields in initial state.

---

### Task 3: Scene orchestrator — register `'combat_system'`

**Files:**
- Modify: `src/components/3d/scene-orchestrator.tsx`

**Steps:**
1. Add `'combat_system'` to `FLEX_SCENE_IDS` set
2. Add `'combat_system'` to `SceneKey` union type:
   ```ts
   export type SceneKey = 'ibm-staff-swe' | 'indeed-sr-swe' | 'hammerball' | 'combat_system' | 'default';
   ```

**Verify:** No type errors. Clicking combat_system file in hierarchy triggers `getSceneKey('combat_system') === 'combat_system'`.

---

### Task 4: Three.js setup — extend `Fog`

**Files:**
- Modify: `src/components/3d/three-setup.ts`

**Steps:**
1. Add `Fog` to the import from `three`:
   ```ts
   import { ..., Fog } from 'three';
   ```
2. Add `Fog` to the `extend()` call:
   ```ts
   extend({ ..., Fog });
   ```

**Why:** The CombatSystem scene uses `<fog attach="fog" ...>` in JSX. Per TDD §6 Tree-Shaking, all Three.js classes used in JSX must be explicitly extended.

**Verify:** `npm run build` passes. No "fog is not a known element" type error.

---

### Task 5: Pattern engine — port `Patterns.js` → TypeScript

**Files:**
- Create: `src/components/3d/scenes/combat-system-patterns.ts`

**Source:** `../meatSaber/src/Patterns.js` (501 lines)

**Steps:**
1. Import `CombatSystemPattern` from `combat-system-types.ts`.
2. Create typed interfaces:
   ```ts
   interface BulletSpawnData {
     offset: Vector3;
     velocity: Vector3;
     acceleration: Vector3;
     delay: number;
     color: number | null;
     life: number;
   }
   ```
3. Port the object pool (`acquire` / `release`) with **module-scope** scratch vectors `_v1`, `_v2`, `_q1` — per TDD §6 anti-pattern table, never allocate `new THREE.Vector3()` inside functions called per-frame.
4. Port **6 key generators** (the most visually impressive ones for a portfolio):
   - `fibonacciSphere` — golden angle distribution (math showcase)
   - `torusKnot` — parametric torus knot curve
   - `galaxy` — logarithmic spiral arms
   - `helix` — DNA-style double helix
   - `rose3D` — 3D rose curve (cosine modulation)
   - `ring` — classic ring burst (simple baseline)
5. Port **4 key modifiers**: `color`, `accelerate`, `sequence`, `rotate`
   > **⚠️ `accelerate` modifier fix:** The original `Patterns.js` L476 has `s.velocity.clone().normalize()` — this allocates a new Vector3 per bullet. Rewrite to use scratch vector: `_v1.copy(s.velocity).normalize()`.
6. Port `compose()` helper
7. Export a `PATTERN_REGISTRY` map with exhaustive type checking:
   ```ts
   export const PATTERN_REGISTRY = {
     fibonacciSphere: () => compose(gen.fibonacciSphere(200, 2), mod.color(0x39FF14)),
     torusKnot: () => compose(gen.torusKnot(300), mod.color(0xFF3333)),
     galaxy: () => compose(gen.galaxy(250), mod.color(0x6666FF)),
     helix: () => compose(gen.helix(200), mod.color(0xFF66FF)),
     rose3D: () => compose(gen.rose3D(200), mod.color(0xFFFF33)),
     ring: () => compose(gen.ring(100), mod.color(0x33FFFF)),
   } as const satisfies Record<CombatSystemPattern, () => BulletSpawnData[]>;
   ```
8. After spawning, the caller must call `Patterns.release(spawnData)` to return objects to the pool. Without this, the pool never recovers and eventually all calls allocate fresh objects.

**Verify:** Import in a scratch file and call `Patterns.compose(Patterns.gen.fibonacciSphere(200, 2), ...)` — returns 200-element array with valid `Vector3` fields. Build passes.

---

### Task 6: Bullet manager — R3F InstancedMesh component

**Files:**
- Create: `src/components/3d/scenes/combat-system-bullets.tsx`

**Source:** `../meatSaber/src/BulletManager.js` (160 lines)

**Allocation rules (TDD §6):**
```ts
// Module-scope or useMemo — NEVER inside useFrame
const _dummy = new Object3D();        // useMemo(() => new Object3D(), [])
const _tempColor = new Color();       // useMemo(() => new Color(), [])
const _tempMatrix = new Matrix4();    // useMemo(() => new Matrix4(), [])
```

**Steps:**
1. Create `<BulletManager>` R3F component:
   - `<instancedMesh frustumCulled={false}>` with `SphereGeometry(0.12, 6, 6)` and `MeshBasicMaterial({ fog: false })`
   - Pool of 2000 bullets on desktop. Accept an optional `maxBullets` prop (default 2000) so the canvas wrapper can pass a lower value on mobile (see Task 9).
   - `useFrame` loop: read `useEngineStore.getState()` for `combatSystemPattern` and `combatSystemFireRate`

   > **`frustumCulled={false}` (review finding):** The bounding sphere is computed from the single geometry at origin, not from instance positions. Without this, the entire InstancedMesh gets culled when the camera looks away from origin.

   > **`fog: false` on material (review finding):** `MeshBasicMaterial.fog` defaults to `true`. The scene fog far plane is 25 but bounds check is at 25 (matched). However, bullets are self-luminous neon particles rendered with bloom — fog dimming would fight the bloom glow effect. Explicitly disable fog on the bullet material.

2. **Initialization (on mount via ref callback or useEffect):**
   ```ts
   // GPU buffer hint — critical for 2000 instances updated per frame
   meshRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

   // Initialize all instances to hidden position to prevent first-frame flash
   for (let i = 0; i < maxBullets; i++) {
     _dummy.position.set(0, -999, 0);
     _dummy.updateMatrix();
     meshRef.current.setMatrixAt(i, _dummy.matrix);
     _tempColor.set(0x000000);
     meshRef.current.setColorAt(i, _tempColor);
   }
   meshRef.current.instanceMatrix.needsUpdate = true;
   meshRef.current.instanceColor!.needsUpdate = true;
   ```

   > **`DynamicDrawUsage` (review finding):** The original BulletManager.js L15 sets this. Without it, the default `StaticDrawUsage` causes the GPU driver to place the buffer in slow-access memory. Measurable perf hit with 2000 instances.

   > **Pool init at `(0, -999, 0)` (review finding):** Without this, all 2000 instances briefly flash at the origin on the first frame before `useFrame` runs.

   > **`instanceColor` init (review finding):** `InstancedMesh` doesn't create the `instanceColor` buffer until the first `setColorAt` call. Initializing in the mount loop creates the buffer upfront, avoiding null checks at runtime.

3. Auto-fire timer inside `useFrame`:
   - Accumulate `dt` until `1 / fireRate` seconds elapsed
   - On fire: call `PATTERN_REGISTRY[currentPattern]()` → get spawn data → `spawn()` from center `(0, 3, 0)` → **call `Patterns.release(spawnData)` to return objects to pool**
   - Rotate source position around Y axis using **frame-rate-independent** delta:
     ```ts
     // ✅ TDD §6 — framerate-independent rotation
     sourceRotation += delta * ROTATION_SPEED;
     // ❌ Never: sourceRotation += 0.01;
     ```

4. Port `spawn()` and `update()` from BulletManager.js:
   - **`spawn()` — use `_tempColor` for per-bullet color** (not `new Color(data.color)`):
     ```ts
     // ✅ Zero-alloc spawn
     _tempColor.set(data.color ?? 0xff3333);
     mesh.setColorAt(bulletIndex, _tempColor);
     // ❌ Original bug: const color = new THREE.Color(data.color) — allocates per spawn
     ```
   - Zero-allocation physics: `velocity.addScaledVector(acceleration, dt)`, `position.addScaledVector(velocity, dt)`
   - Life/bounds deactivation — **bounds set to 25** (matched to fog far plane)
   - `_dummy.updateMatrix()` → `mesh.setMatrixAt(i, _dummy.matrix)`
   - **After full update loop, set needsUpdate flags ONCE (batched, not per-bullet):**
     ```ts
     mesh.instanceMatrix.needsUpdate = true;
     if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
     ```

5. Expose `activeCount` via a ref for optional HUD display

6. **Reduced motion support** — read `prefersReduced` from the shared `useReducedMotion()` hook (Task 10):
   ```ts
   const prefersReduced = useReducedMotion();
   // In useFrame: if prefersReduced, spawn once with zero velocity (static snapshot),
   // disable auto-rotation, reduce maxBullets to 200
   ```

**Verify:** Component renders. Bullets spawn from center, fly outward, fade, and deactivate. No GC spikes in performance tab. Chrome DevTools Performance tab shows zero `new Vector3` / `new Color` allocations inside the frame loop.

---

### Task 7: Flex scene — `combat-system-flex.tsx`

**Files:**
- Create: `src/components/3d/scenes/combat-system-flex.tsx`

**Steps:**
1. Create `<CombatSystemFlex>` component following the same pattern as `hammerball-flex.tsx`:
   - Register with `useSceneGroup('combat_system')`
   - `<group ref={groupRef}>`
2. Arena sub-elements:
   - Floor plane: `planeGeometry(20, 20)`, dark material `#050505`, rotation `[-π/2, 0, 0]`, **`matrixAutoUpdate={false}`**
   - Grid overlay: wireframe `planeGeometry(20, 20, 20, 20)`, neon green `#39FF14`, `opacity: 0.15`, **`matrixAutoUpdate={false}`**
   - Fog: `<fog attach="fog" args={['#050505', 5, 25]}>`  (requires `Fog` extended in Task 4)

   > **`matrixAutoUpdate={false}` (review finding):** Floor and grid are static meshes that never move. Disabling auto matrix updates saves one `updateMatrix()` call per mesh per frame. Set via ref callback: `ref={(m) => { m?.updateMatrix(); }}`.

3. Mount `<BulletManager />` (from Task 6)
4. Lighting: dim ambient `(0x404040, 0.5)` + point light at center `(0, 5, 0)` with cyan tint

> **IMPORTANT — Bloom is NOT mounted here.** Per the TDD compliance audit, `<EffectComposer>` operates at the Canvas render-pass level, not per scene group. Even with `visible={false}`, the bloom pass would still run on every frame. Bloom is conditionally mounted in Task 9 at the canvas-wrapper level.

**Verify:** Click "Combat_System.three" in hierarchy → viewport shows dark arena with neon grid, bullets auto-firing in patterns. Other flex scenes still work when switching files.

---

### Task 8: Inspector controls — pattern radio, fire rate slider, bloom slider

**Files:**
- Modify: `src/components/inspector-panel.tsx`

**Steps:**
1. Import `COMBAT_SYSTEM_PATTERN_LABELS` from `combat-system-types.ts`.
2. Add 3 entries to `CONTROL_SPECS`:
   ```ts
   combatSystemPattern: {
     type: 'radio',
     label: 'Bullet Pattern',
     field: 'combatSystemPattern',
     options: Object.keys(COMBAT_SYSTEM_PATTERN_LABELS),
     formatLabel: (key: string) => COMBAT_SYSTEM_PATTERN_LABELS[key as CombatSystemPattern],
   },
   combatSystemFireRate: {
     type: 'slider',
     label: 'Auto-fire Rate',
     field: 'combatSystemFireRate',
     min: 0.3, max: 3.0, step: 0.1,
     formatValue: (v) => `${v.toFixed(1)}/s`,
   },
   combatSystemBloom: {
     type: 'slider',
     label: 'Bloom Intensity',
     field: 'combatSystemBloom',
     min: 0.0, max: 3.0, step: 0.1,
     formatValue: (v) => v.toFixed(1),
   },
   ```

   > **Human-readable radio labels (review finding):** The existing HammerBall radio uses readable labels (`'Patrol'`, `'Aggro'`, `'Flee'`). Using raw camelCase identifiers like `'fibonacciSphere'` as radio button text is inaccessible. `formatLabel` maps internal keys → display names: `'Fibonacci Sphere'`, `'Torus Knot'`, etc. If `RadioGroupControl` doesn't currently support `formatLabel`, extend it to accept one.

3. `TransientUpdates` type already extended in Task 2 — verify type compatibility.

**Accessibility (TDD §10):** All controls use the existing `SliderControl` and `RadioGroupControl` components, which render native `<input>` elements with proper `<label>` associations, `aria-value*` attributes, `<fieldset>`/`<legend>`, 44×44px touch targets, and unique `useId()`-generated IDs. No additional a11y work needed for controls.

**Verify:** Click combat_system file → inspector shows "Bullet Pattern" radio with 6 human-readable options, two sliders. Switching pattern radio changes the spawned pattern in real-time. Adjusting bloom slider changes glow intensity.

---

### Task 9: Canvas wrapper — mount `<CombatSystemFlex />` + conditional bloom

**Files:**
- Modify: `src/components/3d/canvas-wrapper.tsx`
- Modify: `src/components/3d/three-setup.ts` (if not already done in Task 4)

**Dependencies:**
- Install: `npm install @react-three/postprocessing postprocessing`
- Verify peer-dependency compatibility: `@react-three/postprocessing` must support `three@^0.174` and `@react-three/fiber@^9`. Check `package.json` peer deps after install.

**Steps:**
1. Add import for `CombatSystemFlex`:
   ```tsx
   import { CombatSystemFlex } from './scenes/combat-system-flex';
   ```
2. Add `<CombatSystemFlex />` inside `<SceneOrchestrator>` `<Suspense>` block, alongside `IBMFlex`, `IndeedFlex`, `HammerBallFlex`, `DefaultScene`
3. **Conditional bloom** — mount `<EffectComposer>` + `<Bloom>` at the canvas level, conditionally based on active scene:
   ```tsx
   import { EffectComposer, Bloom } from '@react-three/postprocessing';

   function ConditionalBloom() {
     // NOTE: useState is required here to mount/unmount <EffectComposer>.
     // Unlike scene groups (which toggle `visible`), the EffectComposer render
     // pass must be fully unmounted to stop the GPU bloom pass.
     // setState frequency = user file clicks (~0.5/sec max), not per-frame. Acceptable.
     const [active, setActive] = useState(false);
     const bloomRef = useRef<any>(null);
     const prefersReduced = useReducedMotion(); // from shared hook (Task 10)

     useEffect(() => {
       const unsub = useEngineStore.subscribe(
         (s) => s.activeFileId,
         (id) => setActive(id === 'combat_system'),
         { fireImmediately: true }
       );
       return unsub;
     }, []);

     // Imperatively update bloom intensity — avoids React re-renders on slider drag
     useFrame(() => {
       if (bloomRef.current) {
         bloomRef.current.intensity = useEngineStore.getState().combatSystemBloom;
       }
     });

     const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
     if (!active || isMobile || prefersReduced) return null;

     return (
       <EffectComposer>
         <Bloom
           ref={bloomRef}
           luminanceThreshold={0}
           intensity={1.2}
           radius={0.5}
         />
       </EffectComposer>
     );
   }
   ```

   > **Bloom intensity fix (3/4 reviewers):** The original plan read `bloomIntensityRef.current` as a React prop — this is stale after the first render. The fix uses a ref to the `<Bloom>` effect and imperatively mutates `effect.intensity` in `useFrame`. The `intensity={1.2}` prop sets the initial value; `useFrame` keeps it in sync with the slider.

   > **`useState` justification (3/4 reviewers):** `useState` inside `<Canvas>` normally violates TDD §6 ("no setState inside WebGL context"). This is an explicit exception: `<EffectComposer>` must be React-mounted/unmounted (not visibility-toggled), so a state change is required. The frequency is user-click-rate, not per-frame.

   Mount `<ConditionalBloom />` inside `<Canvas>` but outside `<SceneOrchestrator>`, so it doesn't interfere with scene visibility toggling.

4. **Mobile performance fallback:** Pass `maxBullets={500}` to `<BulletManager>` on mobile (via a simple width check or `useMediaQuery`).

5. **PerformanceMonitor integration (review finding):** Wire bloom to the existing `<PerformanceMonitor>` — on performance decline, disable bloom in addition to reducing DPR:
   ```tsx
   <PerformanceMonitor
     onDecline={() => {
       setDpr(1);
       // Signal ConditionalBloom to disable (via a transient store field or ref)
     }}
   >
   ```

**Verify:** Full integration test:
- `npm run dev` → open browser
- Click "Combat_System.three" in hierarchy
- Viewport: dark arena, neon grid, bullets spawning in fibonacci sphere pattern with bloom
- Inspector: shows project description + 3 interactive controls
- Switch pattern → bullets change shape
- Adjust fire rate → spawn interval changes
- Adjust bloom → glow intensity changes visually (verify in DevTools: `Bloom.intensity` value matches slider)
- Click another file (e.g. "Indeed_OneHost") → scene switches cleanly, **bloom pass stops running** (verify in Chrome DevTools → Performance → no `EffectComposer` in flamechart)
- Click back to CombatSystem → scene + bloom restores
- Console log shows: `> [GAME] CombatSystem combat engine initialized. Pattern pipeline active.`
- Mobile viewport (375×812): bloom disabled, ≤500 bullets, 60fps maintained

---

### Task 10: Accessibility — reduced motion + screen reader support

**Files:**
- Create: `src/hooks/useReducedMotion.ts` (shared hook)
- Modify: `src/components/3d/scenes/combat-system-bullets.tsx`
- Modify: `src/components/3d/canvas-wrapper.tsx` (ConditionalBloom)
- Modify: `src/components/inspector-panel.tsx` (aria-live region)

**Steps (TDD §10):**

1. **Shared `useReducedMotion` hook — reactive to live OS changes:**

   The portfolio already wraps the app in `<MotionConfig reducedMotion="user">` for DOM animations. For WebGL, R3F components must check `prefers-reduced-motion` manually. Create a shared hook using `useSyncExternalStore` so it **reacts to live OS setting changes** (unlike a static `useMemo` check):

   ```tsx
   // src/hooks/useReducedMotion.ts
   import { useSyncExternalStore } from 'react';

   const query = '(prefers-reduced-motion: reduce)';

   function subscribe(callback: () => void): () => void {
     const mql = window.matchMedia(query);
     mql.addEventListener('change', callback);
     return () => mql.removeEventListener('change', callback);
   }

   function getSnapshot(): boolean {
     return window.matchMedia(query).matches;
   }

   function getServerSnapshot(): boolean {
     return false;
   }

   export function useReducedMotion(): boolean {
     return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
   }
   ```

   > **Why `useSyncExternalStore` over `useReducedMotion` from `motion/react`?** Both work. The `motion/react` hook would add a Motion import to pure R3F files that don't otherwise use Motion components. The custom hook keeps the dependency boundary clean. Both are reactive to live OS changes.

   > **Why not `useMemo` (2/4 reviewers)?** The original plan used `useMemo([], [])` which computes once on mount and never reacts to runtime OS preference changes. While unlikely in practice, this violates the `useSyncExternalStore` pattern for browser API subscriptions.

2. **Reduced motion in BulletManager (Task 6):**
   ```tsx
   const prefersReduced = useReducedMotion();
   // In useFrame:
   // - If prefersReduced: spawn ONE pattern with zero velocity (static geometric snapshot)
   // - Disable auto-rotation of source position
   // - Reduce maxBullets to 200
   // - Do NOT continue spawning new patterns on the timer
   ```

   > **Static snapshot approach (review finding):** Simply reducing particle count still leaves continuous movement of 200 objects, which can trigger vestibular disorders. The framer-motion skill recommends replacing complex motion with static/opacity changes. A frozen geometric pattern showcase is still visually impressive without the motion.

3. **Bloom + reduced motion:** (Already handled in ConditionalBloom — `if (!active || isMobile || prefersReduced) return null;`)

4. **`aria-live` region for pattern changes (review finding):**
   When the user switches bullet patterns via the radio group, the visual change happens entirely in the WebGL canvas — screen reader users get no feedback. Add a visually-hidden live region:
   ```tsx
   // In InspectorPanelContent, when activeFileId === 'combat_system':
   <div className="sr-only" role="status" aria-live="polite">
     {`Bullet pattern: ${COMBAT_SYSTEM_PATTERN_LABELS[currentPattern]}`}
   </div>
   ```

5. **Focus management:** The existing `InspectorPanelContent` already moves focus to `headingRef` when `activeFileId` changes (line 140-144). This handles CombatSystem scene transitions automatically — no additional work needed.

6. **Mobile gesture conflicts (TDD §7):** The existing `isGestureDragging` guard in `canvas-wrapper.tsx` (OrbitControlsWithGestureGuard) already handles touch conflicts between mobile sheets and OrbitControls. Confirm during manual testing.

7. **Supplementary visualization contract (TDD §10):** The CombatSystem 3D scene conveys no unique information beyond what the Inspector panel text provides. Screen reader users who cannot see the canvas miss no meaningful content — the resume data, project description, and control labels fully describe the project.

**Verify:**
- Set OS to "Reduce motion" → bullets display as static geometric pattern, no bloom, no source rotation
- Toggle OS setting back → full effect returns immediately (reactive)
- VoiceOver/screen reader: pattern radio and sliders announce labels and values
- Pattern switch → `aria-live` region announces "Bullet pattern: Galaxy"

---

### Task 11: Automated tests

**Files:**
- Modify: `__tests__/useEngineStore.test.ts`
- Modify: `e2e/portfolio.spec.ts`
- Modify: `e2e/visual-regression.spec.ts`

**Steps (TDD §11):**

1. **Store unit test — defaults:**
   ```ts
   test('combat_system transient state defaults', () => {
     const state = useEngineStore.getState();
     expect(state.combatSystemPattern).toBe('fibonacciSphere');
     expect(state.combatSystemFireRate).toBe(1.5);
     expect(state.combatSystemBloom).toBe(1.2);
   });
   ```

2. **Store unit test — setTransientState:**
   ```ts
   test('setTransientState updates combat_system fields', () => {
     useEngineStore.getState().setTransientState({
       combatSystemPattern: 'galaxy',
       combatSystemFireRate: 2.5,
       combatSystemBloom: 0.5,
     });
     const state = useEngineStore.getState();
     expect(state.combatSystemPattern).toBe('galaxy');
     expect(state.combatSystemFireRate).toBe(2.5);
     expect(state.combatSystemBloom).toBe(0.5);
   });
   ```

3. **Store unit test — resetStore includes CombatSystem fields (review finding):**
   ```ts
   test('resetStore restores combat_system defaults', () => {
     useEngineStore.getState().setTransientState({
       combatSystemPattern: 'galaxy',
       combatSystemFireRate: 0.5,
       combatSystemBloom: 3.0,
     });
     useEngineStore.getState().resetStore();
     const state = useEngineStore.getState();
     expect(state.combatSystemPattern).toBe('fibonacciSphere');
     expect(state.combatSystemFireRate).toBe(1.5);
     expect(state.combatSystemBloom).toBe(1.2);
   });
   ```

4. **E2E: file tree → inspector wiring:**
   ```ts
   test('combat_system file → inspector shows controls', async ({ page }) => {
     await page.getByText('03_Game_Logic').click();
     await page.getByText('Combat_System.three').click();

     await expect(page.getByText('Personal Project')).toBeVisible();

     // Controls render with human-readable labels
     await expect(page.getByText('Bullet Pattern')).toBeVisible();
     await expect(page.getByText('Auto-fire Rate')).toBeVisible();
     await expect(page.getByText('Bloom Intensity')).toBeVisible();

     // 6 radio options with display names
     await expect(page.getByRole('radio')).toHaveCount(6);
     await expect(page.getByLabel('Fibonacci Sphere')).toBeVisible();
   });
   ```

5. **E2E: console wiring:**
   ```ts
   test('combat_system file → console log', async ({ page }) => {
     await page.getByText('03_Game_Logic').click();
     await page.getByText('Combat_System.three').click();
     await expect(
       page.getByText('> [GAME] CombatSystem combat engine initialized')
     ).toBeVisible();
   });
   ```

6. **E2E: reduced motion (review finding):**
   ```ts
   test('combat_system respects reduced motion', async ({ page }) => {
     await page.emulateMedia({ reducedMotion: 'reduce' });
     await page.getByText('03_Game_Logic').click();
     await page.getByText('Combat_System.three').click();
     // Canvas still mounts (graceful degradation)
     await expect(page.locator('canvas')).toBeVisible();
     // Controls still work
     await expect(page.getByText('Bullet Pattern')).toBeVisible();
   });
   ```

7. **Visual regression** — regenerate baselines after the new scene is added:
   ```bash
   npx playwright test --update-snapshots
   ```

**Verify:** `npm test` passes. `npx playwright test` passes. All new test cases green.

---

## Done When

- [ ] CombatSystem appears in hierarchy under `03_Game_Logic`
- [ ] Clicking it shows a live bullet-pattern auto-demo in the viewport
- [ ] Inspector shows project description with 3 interactive controls (human-readable labels)
- [ ] Controls affect the scene in real-time (pattern, fire rate, bloom)
- [ ] Bloom only runs when CombatSystem scene is active (verify via Performance tab)
- [ ] Bloom intensity slider updates visually via imperative ref (not stale React prop)
- [ ] Switching to/from other files works without WebGL errors
- [ ] `npm run build` passes with zero errors
- [ ] Performance: 60fps with ≤2000 active bullet instances (desktop), ≤500 (mobile)
- [ ] `DynamicDrawUsage` set on `instanceMatrix` (verify no GPU buffer warning)
- [ ] `frustumCulled={false}` on InstancedMesh (verify bullets visible at all camera angles)
- [ ] `prefers-reduced-motion` respected: static snapshot, no bloom, no rotation (reactive to live OS changes)
- [ ] `aria-live` region announces pattern changes for screen readers
- [ ] Store unit tests pass for defaults, setTransientState, and resetStore
- [ ] E2E tests pass for inspector wiring, console log, controls rendering, and reduced motion
- [ ] Visual regression baselines regenerated
