# 🏗️ Technical Design Document (TDD): The IDE Portfolio Architecture

## 1. Executive Summary & Metaphor

Because your professional focus is Developer Experience (DX), CI/CD pipelines, and high-level architecture, presenting your work inside a tool designed for developers (an IDE/Engine Editor) is the ultimate metaphor. We map your specific resume data directly into an IDE interface architecture to create a bespoke, undeniable portfolio that doubles as a live technical assessment.

---

## 2. Interface Architecture & Data Mapping

Using `react-resizable-panels`, we construct a dense, professional IDE layout comprising four core DOM areas that surround the WebGL canvas.

### 🛠️ 2.1 The Global Toolbar (Top)

* **The "Compile Build" Button:** This is your primary Call-to-Action for HR recruiters who just want your standard resume. Make it a prominent, unmissable button in the top right that simply says `[ 📄 Download Resume.pdf ]`. Implementation: place a pre-converted PDF of your resume at `public/KalebK_Resume.pdf` and render a simple `<a href="/KalebK_Resume.pdf" download>` anchor styled as a button. No runtime PDF generation libraries are needed — the site itself is the fancy version; the PDF is for ATS systems.
* **Performance Stats Monitor:** Because your resume heavily emphasizes Frontend SLOs and Core Web Vitals, having a live `<Stats />` component showing a locked 120fps with 0 memory leaks is a silent, undeniable proof of your competence.

### 🗂️ 2.2 The Left Panel: "The Hierarchy" (Your Scene Graph)

We translate your resume into an engine-like file directory. This keeps the navigation intuitive but stays entirely in character. Notice how the file extensions reflect the actual technology you used.

The file tree must use the following data structure to ensure consistent IDs across all components:

```typescript
// src/data/fileTree.ts

import { type LucideIcon } from 'lucide-react';
import { Folder, User, Globe, Building2, Building, Truck, Hammer, Puzzle, Settings, BarChart3, ChevronRight, ChevronDown } from 'lucide-react';

export interface FileNode {
  id: string;
  label: string;
  icon: LucideIcon;
  isFolder?: boolean;
  children?: FileNode[];
}

export const FILE_TREE: FileNode[] = [
  {
    id: 'about-me',
    label: '01_About_Me',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'profile', label: 'Kaleb_Kougl_Summary.json', icon: User },
      { id: 'contact-info', label: 'Network_Config.grpc', icon: Globe },
    ],
  },
  {
    id: 'experience',
    label: '02_Platform_Architecture',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'indeed-sr-swe', label: 'Level_4_Indeed_OneHost.config', icon: Building2 },
      { id: 'ibm-staff-swe', label: 'Level_3_IBM_Modernization.tsx', icon: Building },
      { id: 'ibm-swe', label: 'Level_2_IBM_GolfTV.gql', icon: Building },
      { id: 'jbhunt-intern', label: 'Level_1_JBHunt_Mobile.jsx', icon: Truck },
    ],
  },
  {
    id: 'projects',
    label: '03_Game_Logic',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'hammerball', label: 'HammerBall_LiveOps.exe', icon: Hammer },
      { id: 'analytics-extension', label: 'Indeed_Analytics_ManifestV3.crx', icon: Puzzle },
    ],
  },
  {
    id: 'skills',
    label: '04_Core_Dependencies',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'webpack-federation', label: 'Webpack5_Federation.ts', icon: Settings },
      { id: 'cwv-profiler', label: 'Core_Web_Vitals_Profiler.ts', icon: BarChart3 },
    ],
  },
];

> Icons inherit `aria-hidden="true"` by default (Lucide default). Color alone must not convey meaning — each file type uses a distinct icon shape. Expand/collapse chevrons (`ChevronRight`/`ChevronDown`) are rendered by the `HierarchyTree` component, not stored in data. All icons use named imports for tree-shaking — never use `import *` or `DynamicIcon`.

```tsx
// HierarchyTree uses Motion variants for staggered fade-in
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0 },
}

<motion.ul variants={containerVariants} initial="hidden" animate="visible" role="tree">
  {nodes.map((node) => (
    <motion.li key={node.id} variants={itemVariants} role="treeitem">
      ...
    </motion.li>
  ))}
</motion.ul>
```

### 👁️‍🗨️ 2.3 The Viewport & Inspector Synergy (The Core Flex)

The magic of this portfolio is the bridge between the **Right Panel** (where recruiters read your resume) and the **Center Canvas** (where you visualize the engineering concepts). You don't need complex 3D character models—you need beautiful, glowing data visualizations of your architectural achievements.

#### 🟢 IBM Modernization Flex (`ibm-staff-swe`)

* **The Right Panel (Inspector Text):** Resume bullets for IBM Staff SWE role.
* **The Center Canvas (Viewport):** A 3D particle system representing a software bundle. It starts as a massive, sluggish, chaotic red sphere of 6,000 polygons.
* **The Interactive Flex:** In the Inspector below your text, add a slider: `Target Bundle Size: [ 6.0 MB =======|=== 300 KB ]`. When the user drags the slider down, they watch the 3D particles in the center viewport dynamically compress in real-time into a tiny, hyper-fast, glowing green diamond. You are letting them physically play with your 29x optimization metric.

#### 🟡 Indeed OneHost Flex (`indeed-sr-swe`)

* **The Right Panel (Inspector Text):** Resume bullets for Indeed Senior SWE role.
* **The Center Canvas (Viewport):** 3D wireframe blocks floating randomly in space.
* **The Interactive Flex:** Add a toggle in the Inspector: `[x] Enable Module Federation`. When checked, the floating blocks fly together and physically snap into a unified "UI Dashboard" shape, perfectly visualizing how Webpack stitches disparate microfrontends together at runtime. Add another toggle for `[x] Simulate SLO Incident` that turns the 3D lighting red.

#### 🔨 HammerBall Flex (`hammerball`)

* **The Right Panel (Inspector Text):** Project description for HammerBall.
* **The Center Canvas (Viewport):** An isometric 3D diorama. Two low-poly "AI" orbs are dynamically pathfinding around obstacles.
* **The Interactive Flex:** Add radio buttons in the Inspector: `Force AI State: ( ) Patrol ( ) Aggro ( ) Flee`. Clicking these overrides the bot's state machine, changing their behavior and color instantly in the 3D canvas. Include a toggle for `[x] Show NavMesh` which draws the pathfinding grid on the floor.

#### Controls Specification Table

Every interactive control maps to a specific Zustand field. Agents must use this table when wiring controls to state:

| File ID | Control Label | Control Type | Zustand Field | Range / Options | Default |
|---|---|---|---|---|---|
| `ibm-staff-swe` | Target Bundle Size | Slider | `targetBundleSize` | min: 0.3, max: 6.0, step: 0.1 | `6.0` |
| `indeed-sr-swe` | Enable Module Federation | Toggle (checkbox) | `isModuleFederationEnabled` | `true` / `false` | `false` |
| `indeed-sr-swe` | Simulate SLO Incident | Toggle (checkbox) | `isSloIncidentSimulated` | `true` / `false` | `false` |
| `hammerball` | Force AI State | Radio group | `forceAiState` | `'Patrol'` / `'Aggro'` / `'Flee'` | `'Patrol'` |
| `hammerball` | Show NavMesh | Toggle (checkbox) | `showNavMesh` | `true` / `false` | `false` |

### 💻 2.4 The Bottom Panel: "The Console"

Since you are a Platform/Build systems expert, the terminal is your playground. Program standard events on your website to log out to this console as if Webpack is building the site in real-time. Use this to drop your specific tech keywords passively:

* *(On initial site load)*: `> [SYSTEM] Bootstrapping React 19 & Zustand state... Location: [San Francisco, CA].`
* *(On initial site load)*: `> [WEBPACK 5] Compiling Module Federation... Done in 142ms.`
* *(When user clicks Indeed)*: `> [NETWORK] Opening gRPC channels for third-party integration... OK`
* *(When user clicks IBM)*: `> [PERF] Legacy bundle detected. Tree-shaking applied. Reduced to 300KB.`
* *(When user clicks HammerBall)*: `> [SERVER] Authoritative match started. Syncing live-ops economy...`
* *(Passive background check)*: `> [SLO] Core Web Vitals check: TTI < 100ms. FCP < 50ms. [PASS]`

---

## 3. State Management Architecture (The Bridge)

**Core Architectural Rule:** The DOM must never force the `<Canvas>` to re-render, and the WebGL loop must never trigger DOM layout recalculations.

We will use **Zustand** (which operates very similarly to the Reflex/Redux pattern you used in HammerBall) as a decoupled message broker using the `subscribeWithSelector` middleware. We bifurcate our state into **Reactive State** (which DOM components subscribe to) and **Transient State** (which the 3D scene polls imperatively within the `useFrame` loop).

### TypeScript State Schema & Implementation

```typescript
// src/store/useEngineStore.ts

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import * as THREE from 'three';

export type ViewState = 'hidden' | 'peek' | 'expanded';

/** Narrow type for transient state updates — prevents accidentally overwriting reactive state. */
interface TransientUpdates {
  targetBundleSize?: number;
  isModuleFederationEnabled?: boolean;
  isSloIncidentSimulated?: boolean;
  forceAiState?: 'Patrol' | 'Aggro' | 'Flee';
  showNavMesh?: boolean;
}

interface EngineState {
  // --- REACTIVE STATE (DOM Re-renders Expected) ---
  activeFileId: string | null;
  consoleLogs: string[];
  mobileSheetState: ViewState;
  isAssetLoading: boolean;

  setActiveFile: (id: string, logMsg?: string) => void;
  pushLog: (msg: string) => void;
  setMobileSheetState: (state: ViewState) => void;
  setAssetLoading: (status: boolean) => void;

  // --- TRANSIENT STATE (WebGL reads imperatively; bypasses React renders) ---
  // IBM Flex
  targetBundleSize: number;
  // Indeed Flex
  isModuleFederationEnabled: boolean;
  isSloIncidentSimulated: boolean;
  // HammerBall Flex
  forceAiState: 'Patrol' | 'Aggro' | 'Flee';
  showNavMesh: boolean;
  // Camera
  cameraTarget: THREE.Vector3;

  setTransientState: (updates: TransientUpdates) => void;
  setCameraTarget: (target: THREE.Vector3) => void;
  resetStore: () => void;
}

export const useEngineStore = create<EngineState>()(
  devtools(
    subscribeWithSelector((set, get, store) => ({
    // --- Reactive defaults ---
    activeFileId: null,
    consoleLogs: [],
    mobileSheetState: 'hidden',
    isAssetLoading: false,

    // --- Reactive actions ---
    setActiveFile: (id, logMsg) =>
      set(
        (state) => ({
          activeFileId: id,
          isAssetLoading: true,
          consoleLogs: logMsg
            ? [...state.consoleLogs, logMsg].slice(-100)
            : state.consoleLogs,
        }),
        undefined,
        'reactive/setActiveFile'
      ),

    pushLog: (msg) =>
      set(
        (state) => ({
          consoleLogs: [...state.consoleLogs, msg].slice(-100),
        }),
        undefined,
        'reactive/pushLog'
      ),

    setMobileSheetState: (state) => set({ mobileSheetState: state }, undefined, 'reactive/setMobileSheetState'),
    setAssetLoading: (status) => set({ isAssetLoading: status }, undefined, 'reactive/setAssetLoading'),

    // --- Transient defaults ---
    targetBundleSize: 6.0,
    isModuleFederationEnabled: false,
    isSloIncidentSimulated: false,
    forceAiState: 'Patrol',
    showNavMesh: false,
    cameraTarget: new THREE.Vector3(0, 0, 0),

    // --- Transient actions ---
    setTransientState: (updates) => set(updates, undefined, 'transient/update'),
    setCameraTarget: (target) => set({ cameraTarget: target.clone() }, undefined, 'transient/setCameraTarget'),

    // --- Reset ---
    resetStore: () => set(store.getInitialState(), true, 'store/reset'),
    })),
    {
      name: 'EngineStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);
```

The monolithic `EngineState` store is acceptable for this portfolio's moderate complexity (~15 fields, 7 actions). For larger stores, consider splitting into `ReactiveSlice` (UI state) and `TransientSlice` (WebGL state) using Zustand's `StateCreator` pattern.

### The Bridging Strategy

The `<Canvas>` wrapper takes **zero props**. Instead, the WebGL components strictly subscribe to the transient state. The Inspector DOM panel subscribes normally: `const id = useEngineStore(s => s.activeFileId)`.

#### Selector Best Practices

```tsx
// Single-field selectors: no useShallow needed
const id = useEngineStore(s => s.activeFileId)

// Multi-value selectors: MUST use useShallow to prevent unnecessary re-renders
import { useShallow } from 'zustand/react/shallow'
const { activeFileId, isAssetLoading } = useEngineStore(
  useShallow((s) => ({ activeFileId: s.activeFileId, isAssetLoading: s.isAssetLoading }))
)

// ❌ NEVER destructure without a selector — re-renders on ANY state change
// const { activeFileId } = useEngineStore()
```

A `<SceneOrchestrator>` component *inside* the R3F context subscribes imperatively:

```tsx
// Inside WebGL Context — src/components/3d/SceneOrchestrator.tsx
useEffect(() => {
  const unsubscribe = useEngineStore.subscribe(
    (state) => state.activeFileId,
    (newId) => { initiateSceneTransition(newId); },
    { fireImmediately: true }
  );
  return unsubscribe;
}, []);
```

For high-frequency updates (like the bundle size slider), the WebGL loop reads imperatively:

```tsx
useFrame(() => {
  const size = useEngineStore.getState().targetBundleSize;
  // Lerp particles toward target — no React re-render
});
```

### §3.1 — Custom Hooks

Extract reusable patterns to reduce duplication and improve testability:

```tsx
// Reads activeFileId and looks up the corresponding ProjectEntry
function useActiveFile() {
  const activeFileId = useEngineStore(s => s.activeFileId);
  return activeFileId ? RESUME_DATA[activeFileId] : null;
}
// Used by: InspectorPanel, mobile Inspector sheet, TopBar breadcrumb

// Type-safe read/write for transient WebGL state
function useTransientState<K extends keyof TransientUpdates>(key: K) {
  const value = useEngineStore(s => s[key]);
  const set = useEngineStore(s => s.setTransientState);
  return [value, (v: TransientUpdates[K]) => set({ [key]: v })] as const;
}
// Usage: const [bundleSize, setBundleSize] = useTransientState('targetBundleSize')

// Generic imperative Zustand subscription with cleanup
function useImperativeSubscription<T>(
  selector: (state: EngineState) => T,
  callback: (value: T) => void
) {
  useEffect(() => {
    const unsub = useEngineStore.subscribe(selector, callback, { fireImmediately: true });
    return unsub;
  }, []);
}
```

Consider also using Zustand's `createSelectors` utility to auto-generate `useEngineStore.use.activeFileId()` syntax, eliminating raw selector boilerplate across the codebase.

---

## 4. Component Tree & Execution Strategy

**The Execution Thesis:** If I am an Engineering Manager hiring a Senior Frontend Architect, and you hand me a resume claiming you can "shrink bundles to 300kb," I am going to immediately inspect your portfolio site's network tab. If you build this highly complex 3D interface, and it loads instantly and runs flawlessly without layout thrashing, you will instantly bypass the standard technical screening.

### Technology Stack & Versions

| Dependency | Version | Purpose |
|---|---|---|
| `next` | `^16` | App Router, SSR for instant TTI |
| `react` / `react-dom` | `^19` | UI framework |
| `zustand` | `^5` | Decoupled state management |
| `react-resizable-panels` | `^4` | IDE panel layout |
| `motion` | `latest` | Mobile drawer/sheet animations (Motion for React) |
| `lucide-react` | `^0.460` | File tree and toolbar icons |
| `@react-three/fiber` | `^9` | React renderer for Three.js |
| `@react-three/drei` | `^9` | R3F helpers (OrbitControls, etc.) |
| `three` | `^0.174` | 3D engine |

> **Version pairing:** `@react-three/fiber@9` pairs with `react@19`. Using fiber@8 with react@18 is a downgrade. This project uses fiber@9 + react@19 exclusively.

#### Icon Defaults

Wrap the IDE layout root in `<LucideProvider>` for consistent icon sizing:

```tsx
import { LucideProvider } from 'lucide-react';

<LucideProvider size={16} strokeWidth={1.5}>
  {/* All file tree and toolbar icons inherit size=16, strokeWidth=1.5 */}
</LucideProvider>
```

- Import Lucide icons by name for tree-shaking. Never use `import *` or `DynamicIcon` for the static file tree.
- Lucide icons inherit `currentColor`. Set icon color via CSS custom properties (`text-text-muted` for inactive, `text-text-accent` for active). Do NOT hardcode `color` props on icons.

#### Version Compatibility

Ensure `three`, `@react-three/fiber`, and `@react-three/drei` all resolve to compatible Three.js versions. Check Drei's peer dependency range before upgrading Three.js independently.

### Styling Strategy: Tailwind CSS + Custom IDE Theme

Use **Tailwind CSS v4** for utility classes. Define a custom dark IDE theme using CSS custom properties so all components share consistent tokens:

```css
/* src/app/globals.css — loaded via Tailwind's @theme */

@theme {
  /* --- Surface Colors (Catppuccin Mocha inspired) --- */
  --color-bg-editor: #1e1e2e;
  --color-bg-sidebar: #181825;
  --color-bg-panel: #11111b;
  --color-bg-toolbar: #1e1e2e;
  --color-bg-hover: #313244;
  --color-bg-active: #45475a;

  /* --- Text --- */
  --color-text-primary: #cdd6f4;
  --color-text-muted: #6c7086;
  --color-text-accent: #89b4fa;
  --color-text-green: #a6e3a1;
  --color-text-red: #f38ba8;
  --color-text-yellow: #f9e2af;
  --color-text-peach: #fab387;

  /* --- Borders & Dividers --- */
  --color-border: #313244;
  --color-resize-handle: #585b70;

  /* --- Typography --- */
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  --font-ui: 'Inter', system-ui, sans-serif;

  /* --- Spacing (panel defaults) --- */
  --panel-padding: 0.75rem;
  --toolbar-height: 2.75rem;
}
```

Load Google Fonts `Inter` and `JetBrains Mono` in `layout.tsx` via `next/font/google`.

```tsx
// app/layout.tsx
import { Inter, JetBrains_Mono } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-ui', display: 'swap' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

// Apply to <html>:
<html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
```

### SEO Metadata

Since this is a portfolio that will be shared on LinkedIn, Slack, and email, `layout.tsx` must export Next.js metadata with Open Graph tags:

```typescript
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kaleb Kougl | Senior Software Engineer',
  description:
    'Front-End Platform engineer with 8+ years building scalable TypeScript/React web applications. Interactive IDE-themed portfolio.',
  openGraph: {
    title: 'Kaleb Kougl — IDE Portfolio',
    description:
      'Explore my engineering career through an interactive IDE interface with live 3D visualizations.',
    url: 'https://your-domain.com', // Replace before deployment
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    type: 'website',
  },
  metadataBase: new URL('https://your-domain.com'), // Replace before deployment
};
```

Create a 1200×630 `og-image.png` in `public/` showing a screenshot of the IDE layout. This image appears in link previews on LinkedIn, Slack, Twitter, and iMessage.

### Component Tree

```
app/
 ├── layout.tsx        (Server Component: SEO Metadata, Fonts, Globals)
 ├── loading.tsx       (Server Component: Branded loading skeleton)
 ├── error.tsx         (Client Component: { error, reset } props, role="alert")
 ├── not-found.tsx     (Server Component: Themed 404 page)
 ├── global-error.tsx  (Client Component: Root error with own <html>/<body>)
 └── page.tsx          (Server Component: composes IDELayoutWrapper)
```

```tsx
// components/ide-layout-wrapper.tsx — Client Component
'use client'
import dynamic from 'next/dynamic'

const IDELayout = dynamic(() => import('./ide-layout'), {
  ssr: false,
  loading: () => <div className="h-screen bg-bg-editor animate-pulse" />,
})

export function IDELayoutWrapper() {
  return <IDELayout />
}
```

Note: `ssr: false` is NOT allowed in Server Components (Next.js throws). The `page.tsx` Server Component imports `IDELayoutWrapper`, which is a Client Component that does the dynamic import.

```tsx
const hierarchyRef = usePanelRef()
```

```tsx
      │
      ├── <TopBar />   (Absolute, z-50. Contains <Stats /> and Download PDF CTA)
      │
      └── <IDELayout>  {/* next/dynamic, ssr: false — react-resizable-panels uses browser APIs */}
           <Group orientation="vertical" className="h-dvh">
           ├── <Group orientation="horizontal">
           │    ├── <Panel
           │    │      id="hierarchy"
           │    │      panelRef={hierarchyRef}
           │    │      collapsible
           │    │      collapsedSize={0}
           │    │      defaultSize="20%"
           │    │      minSize="15%"
           │    │    >
           │    │    └── <HierarchyTree />       {/* Renders FILE_TREE, calls setActiveFile */}
           │    ├── <Separator className="w-px bg-border [&[data-separator='hover']]:bg-resize-handle" />
           │    ├── <Panel id="viewport" defaultSize="45%" className="relative">
           │    │    ├── <CanvasLoadingHUD />     {/* Listens to isAssetLoading */}
           │    │    │
           │    │    {/* THE STRICT ISOLATION BOUNDARY */}
           │    │    <MemoizedCanvasWrapper>  {/* next/dynamic, ssr: false */}
           │             <ErrorBoundary
           │               fallback={(error, reset) => (
           │                 <div role="alert">
           │                   <p>3D visualization unavailable: {error.message}</p>
           │                   <button onClick={reset}>Retry</button>
           │                   <a href="/KalebK_Resume.pdf" download>Download Resume Instead</a>
           │                 </div>
           │               )}
           │             >
           │    │          <Canvas
           │    │            eventSource={viewportRef}
           │    │            fallback={<div>WebGL not supported</div>}
           │    │            dpr={[1, 1.5]}
           │    │            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
           │    │          >
           │    │            <SceneOrchestrator />
           │    │            <Suspense fallback={null}>
           │    │               {/* ALL flex scenes are always mounted; use visible prop */}
           │    │               <IBMFlex />
           │    │               <IndeedFlex />
           │    │               <HammerBallFlex />
           │    │               <DefaultScene />
           │    │            </Suspense>
           │    │          </Canvas>
           │             </ErrorBoundary>
           │    │    </MemoizedCanvasWrapper>
           │    ├── <Separator className="w-px bg-border [&[data-separator='hover']]:bg-resize-handle" />
           │    └── <Panel id="inspector" defaultSize="35%" minSize="20%">
           │         └── <InspectorPanel />       {/* Reads activeFileId, renders RESUME_DATA + controls */}
           ├── <Separator className="h-px bg-border [&[data-separator='hover']]:bg-resize-handle" />
           └── <Panel id="console" defaultSize="20%" minSize="10%">
                └── <TerminalConsole />           {/* Reads consoleLogs from Zustand */}
```

```tsx
// Persistent layout — saves/restores panel sizes between page loads
const { defaultLayout, onLayoutChanged } = useDefaultLayout({
  id: 'ide-layout',
  storage: localStorage,
});

<Group defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged} ...>
```

**Key architectural detail:** The `eventSource` prop restricts R3F's raycasting to the viewport panel via a `useRef<HTMLDivElement>` — do **not** use `document.getElementById()` because the element may not exist during SSR or initial render, causing a silent fallback to `window`. By scoping events to the center panel, interactions in the DOM Inspector won't accidentally trigger expensive 3D raycasts or orbit rotations. Furthermore, as users drag the panels, R3F's native `ResizeObserver` recalculates the aspect ratio strictly on the GPU without triggering React state updates.

The `eventSource` ref must point to the viewport Panel's DOM container. Since `MemoizedCanvasWrapper` uses `React.memo()`, the ref cannot be passed as a prop (defeats memo). Use a Zustand atom or React context to share the ref between the Panel container and the Canvas wrapper.

**`MemoizedCanvasWrapper` contract:** This component must be wrapped with `React.memo()` **and accept zero props**. All data flows through Zustand subscriptions, never through props. Keep `React.memo()` on the Canvas wrapper. React Compiler cannot safely optimize R3F's Canvas boundary — R3F hooks rely on imperative mutations that bypass the Compiler's model. `React.memo()` is the correct choice here, not a fallback.

**Error boundary + fallback:** R3F's `<Canvas>` accepts a `fallback` prop for systems without WebGL support. Additionally, wrap the Canvas in an error boundary to catch GPU context crashes (disabled GPUs, faulty drivers). The error boundary should render a graceful DOM fallback that still shows resume content.

```tsx
// app/error.tsx
'use client'
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div role="alert">
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
      <a href="/KalebK_Resume.pdf" download>Download Resume PDF</a>
    </div>
  )
}
```

**Visibility-based scene swaps (not mount/unmount):** Per R3F performance best practices, creating objects (geometries, materials, shaders) is expensive because they must compile on the GPU. Instead of conditionally mounting/unmounting flex scenes per `activeFileId`, **mount all scenes once and toggle the `visible` prop**. The `<SceneOrchestrator>` sets `visible={true}` only on the active flex's `<group>` and `visible={false}` on all others. This avoids expensive GPU recompilation on every file click.

Crucially, wrap the 3D Viewport in `<Suspense>`. The HTML interface, the Inspector text, and the Hierarchy must achieve a **Time to Interactive (TTI) of < 100ms**. Let the Three.js assets lazy-load in the background so the recruiter can start reading your IBM and Indeed bullets instantly.

---

## 5. Mobile Responsive Strategy (The UX Trap)

A dense 4-pane IDE layout fundamentally fails on smartphones. If we stack the panels, the 3D canvas gets pushed entirely out of view. We will adopt a **"Spatial Map App" paradigm** (think Google Maps or Apple Maps).

1. **Z-Layer 0 (The Viewport):** The `<Canvas>` breaks out of the grid and becomes `absolute inset-0`, occupying `100vw` and `100dvh`. It is always visible and interactive in the background.
2. **Z-Layer 1 (The HUD):** The Top Bar becomes a floating glassmorphic pill. The Console acts as a fading overlay at the bottom.
3. **Z-Layer 2 (The Hierarchy):** Tapping a menu icon triggers a **Motion for React Off-Canvas Drawer** from the left. When a user selects a project, the drawer auto-dismisses to immediately reveal the 3D scene loading in the background.

```tsx
import { motion, AnimatePresence } from "motion/react"

function MobileDrawer({ isOpen, onClose }: DrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-40"
          />
          <motion.aside
            key="drawer"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 h-full w-72 bg-bg-sidebar z-50"
          >
            <HierarchyTree />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
```
4. **Z-Layer 3 (The Inspector):** Transforms into a **Draggable Bottom Sheet** with three states managed by `mobileSheetState` in Zustand:
   * **`hidden`:** Sheet is fully dismissed. Full 3D canvas visible.
   * **`peek`:** Shows just the active project title and a "Swipe Up" handle at the bottom of the screen.
   * **`expanded`:** Overlays the bottom 50-60% of the screen with case studies, resume bullets, and interactive controls.

```tsx
import { motion, AnimatePresence } from "motion/react"
import type { PanInfo } from "motion/react"

function BottomSheet({ state, onStateChange, children }: BottomSheetProps) {
  const yPositions = { hidden: "100%", peek: "85%", expanded: "40%" }

  return (
    <AnimatePresence>
      {state !== "hidden" && (
        <motion.div
          key="bottom-sheet"
          initial={{ y: "100%" }}
          animate={{ y: yPositions[state] }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          drag="y"
          dragConstraints={{ top: 0 }}
          dragElastic={0.2}
          onDragEnd={(_: PointerEvent, info: PanInfo) => {
            if (info.offset.y > 100) onStateChange("hidden")
            else if (info.offset.y < -50 && state === "peek") onStateChange("expanded")
          }}
          className="fixed inset-x-0 bottom-0 bg-bg-panel rounded-t-xl z-50"
        >
          <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-border" />
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

#### AnimatePresence Critical Rules

- `AnimatePresence` must remain mounted — place conditionals *inside* it, never wrap it in a conditional
- Every direct child must have a stable, unique `key`
- The `exit` prop must be set on the animated element for exit animations to play
- Use `onExitComplete` for focus restoration: `onExitComplete={() => triggerRef.current?.focus()}`

Consider using React 19's `<Activity mode='hidden'>` for the mobile drawer content to preserve scroll position and component state when hidden, instead of unmounting.
   * **The Magic Touch:** When expanded, Zustand updates the `cameraTarget`. Inside the `useFrame` loop, the 3D camera imperatively pans *upward* to keep the 3D model perfectly framed in the remaining top 40% of the viewport.

---

## 6. R3F Performance & Memory Rules

Because your resume heavily emphasizes Frontend SLOs, performance is non-negotiable. These rules come directly from the R3F documentation.

### R3F Anti-Pattern Guardrails

Agents **must** follow these rules when writing any code inside `<Canvas>`:

| ❌ Anti-pattern | ✅ Correct approach | Why |
|---|---|---|
| `setState` inside `useFrame` | Mutate refs directly | `useFrame` fires 60fps; `setState` triggers React reconciliation each time |
| `new THREE.Vector3()` inside `useFrame` | Allocate once outside the loop, reuse via `.set()` | Creating objects 60fps causes GC pressure |
| `position.x += 0.1` (fixed step) | `position.x += delta` (frame-rate independent) | Fixed steps run at different speeds on 60Hz vs 144Hz displays |
| Conditional mount/unmount of scenes | Toggle `visible` prop on a `<group>` | Geometries/materials recompile on the GPU each mount |
| Passing slider values as React props to Canvas children | Read via `useEngineStore.getState()` in `useFrame` | Props cause React re-renders inside the Canvas |
| `new TextureLoader()` in `useEffect` | `useLoader(TextureLoader, url)` | `useLoader` auto-caches; manual loading re-fetches per instance |
| Multiple `useGLTF` loads of same URL then disposing | Use `dispose={null}` on shared primitives | Disposing a cached asset corrupts all other consumers |

### Asset Pipeline

1. **Draco Compression:** All `.glb` files must be processed via `gltf-pipeline` for Draco Compression (up to 80% size reduction).
2. **Lazy Loading:** The HTML/CSS UI loads instantly. The 3D models lazy-load strictly on-demand within R3F `<Suspense>` boundaries.
3. **Pre-loading:** Use `useLoader.preload(GLTFLoader, '/model.glb')` in module scope to pre-fetch critical assets before components mount.

### Disposal Strategy

R3F **automatically calls `object.dispose()` on all unmounted objects**. You do not need manual traversal in most cases. The rules:

- **Procedural geometries/materials** created inside components: R3F disposes them on unmount. No action needed.
- **Globally shared resources** (e.g., a material reused across many meshes): Set `dispose={null}` on the component to prevent R3F from disposing shared resources.
- **GLTF models via `useGLTF`**: The loaded result is cached. If the scene truly needs to be purged from memory (not just hidden), call `useGLTF.clear(assetUrl)` to remove from Drei's cache. But prefer `visible={false}` over unmount.

> ⚠️ `<primitive>` objects are NOT auto-disposed by R3F. If using `<primitive object={gltf.scene}>`, you must manually dispose via `useEffect` cleanup or `useGLTF.clear(url)`.

### Performance Scaling

1. **Pixel ratio cap:** `dpr={[1, 1.5]}` — clamp DPR to prevent rendering at 3x on high-DPI mobile screens.
2. **PerformanceMonitor (Drei):** Wrap the scene in `<PerformanceMonitor>` to auto-adapt quality:
   ```tsx
   <PerformanceMonitor
     onIncline={() => setDpr(1.5)}
     onDecline={() => setDpr(1)}
     onChange={({ factor }) => setDpr(0.5 + 1.5 * factor)} // Smoother 0–1 scaling
     flipflops={3}
     onFallback={() => setDpr(1)} // Stop oscillating — lock to safe DPR
   >
   ```
3. **Movement regression:** Call `state.performance.regress()` during OrbitControls `change` events. Respond by scaling pixel ratio against `performance.current`:
   ```tsx
   const current = useThree((state) => state.performance.current);
   useEffect(() => setDpr(window.devicePixelRatio * current), [current]);
   ```
4. **Concurrency:** Use `startTransition` / `useTransition` to defer expensive operations like creating many geometries.
5. **Nested Suspense:** Load low-quality models as fallback while high-quality loads.

### Tree-Shaking (R3F v8+)

R3F no longer auto-imports the THREE namespace. For optimal bundle size, `extend()` only the specific three.js classes used:

```tsx
import { extend } from '@react-three/fiber';
import { Mesh, BoxGeometry, MeshStandardMaterial, InstancedMesh, SphereGeometry } from 'three';

extend({ Mesh, BoxGeometry, MeshStandardMaterial, InstancedMesh, SphereGeometry });
```

This enables tree-shaking — unused three.js classes are eliminated from the bundle.

```tsx
// TypeScript: register extended elements for JSX type checking
declare module '@react-three/fiber' {
  interface ThreeElements {
    // All extended classes are now available as JSX elements
  }
}
```

#### Motion Bundle Optimization

```tsx
// LazyMotion reduces motion bundle from ~34kb to ~4.6kb
import { LazyMotion, domMax } from "motion/react"
import * as m from "motion/react-m"

// Wrap the mobile layout root
<LazyMotion features={domMax} strict>
  {/* Use m.div, m.aside — NOT motion.div inside LazyMotion */}
</LazyMotion>
```

Note: `domMax` is required (not `domAnimation`) because the bottom sheet uses `drag` and `layout`.

```tsx
// Global animation defaults — avoids repeating transition config
<MotionConfig transition={{ type: "spring", damping: 25, stiffness: 200 }} reducedMotion="user">
  <App />
</MotionConfig>
```

#### React DOM Performance

- `useDeferredValue(consoleLogs)` in TerminalConsole — log rendering doesn't block critical UI updates
- `startTransition(() => setActiveFile(...))` in HierarchyTree click handlers — file selection is non-urgent (safe: Canvas reads imperatively via Zustand subscription, not reactively)

#### Framerate-Independent Interpolation

```tsx
// ❌ Framerate-dependent — runs faster on 120Hz than 60Hz
useFrame(() => {
  mesh.position.lerp(target, 0.1)
})

// ✅ Framerate-independent — consistent across all refresh rates
useFrame((_, delta) => {
  THREE.MathUtils.damp(mesh.position, 'x', target.x, 4, delta)
})
```

Use `delta` from `useFrame` for all interpolation. `THREE.MathUtils.damp()` is preferred over manual lerp.

#### Texture Guidelines

- Use power-of-two dimensions (256, 512, 1024, 2048) for proper mipmapping
- Set `texture.colorSpace = THREE.SRGBColorSpace` on color/albedo textures — do NOT set `SRGBColorSpace` on normal maps, AO maps, or data textures
- Memory budget: a 2048×2048 RGBA texture uses ~16MB GPU memory
- Use `useLoader(TextureLoader, url)` or `useTexture()` from Drei — both auto-cache
- Disposing a material does NOT dispose its textures — textures must be disposed separately

#### Lighting & Renderer Defaults

```tsx
// Canvas gl defaults (antialias=true, alpha=true are R3F defaults — keep them)
<Canvas gl={{ toneMapping: THREE.ACESFilmicToneMapping }}>

// Each flex scene should include appropriate lighting
<ambientLight intensity={0.4} />
<directionalLight position={[5, 5, 5]} intensity={1} />
```

- For the SLO incident toggle (Indeed flex): change light color/intensity, not material color, for physically accurate results
- `MeshBasicMaterial` ignores lights entirely — use `MeshStandardMaterial` for lit scenes

#### Instancing & Static Object Optimization

```tsx
// For IBM particle system (6000+ particles): use InstancedMesh with shared Matrix4
const tempMatrix = useMemo(() => new THREE.Matrix4(), [])

useFrame(() => {
  for (let i = 0; i < count; i++) {
    tempMatrix.setPosition(positions[i])
    instancedMesh.current.setMatrixAt(i, tempMatrix)
  }
  instancedMesh.current.instanceMatrix.needsUpdate = true
})

// For static scene elements (ground planes, backgrounds):
<mesh matrixAutoUpdate={false} ref={(mesh) => { mesh?.updateMatrix() }}>
```

| ❌ Anti-Pattern | ✅ Correct |
|---|---|
| Create new materials per component render | Share materials in module scope or `useMemo` |
| Use `visible={false}` without `matrixAutoUpdate={false}` on complex hidden groups | Set both to avoid unnecessary matrix computations |

---

## 7. Technical Gotchas

* **Hydration Mismatches:** `react-resizable-panels` v4 relies on browser APIs. Use `next/dynamic` with `ssr: false` in a **Client Component wrapper** (not directly in a Server Component). V4 API uses `Group` (not `PanelGroup`), `Separator` (not `PanelResizeHandle`), and an `orientation` prop (not `direction`).
* **Reactivity Tearing:** Do not pass the IBM bundle slider value as a React prop to the `<Canvas>`. It must update Zustand, and the WebGL loop must read it imperatively via `useEngineStore.getState()` in `useFrame` to maintain 120fps.
* **Draco WASM Worker:** R3F's `useGLTF` uses a web worker. You must explicitly host the Draco decoder WASM files in your Next.js `/public` folder and point the loader to them, or assets will fail in production.
* **Mobile Pixel Ratios:** Applying post-processing on a high-DPI mobile screen (like an iPhone 15 Pro, DPR: 3) will melt the battery and tank FPS. Cap the pixel ratio via Canvas `dpr={[1, 1.5]}` and use `100dvh` to prevent address bar layout thrashing.
* **Mobile Gesture Conflicts:** Map Three.js `OrbitControls` so they don't fight with Mobile DOM swipe gestures on the Hierarchy Drawer and Inspector Bottom Sheet. Disable OrbitControls touch events when a mobile sheet or drawer is active.
* **WebGL Fallback:** Always provide a `fallback` prop on `<Canvas>` for systems without WebGL. Wrap the Canvas in an error boundary to catch GPU context crashes.
* **Shader uniform stability:** R3F merges `uniforms` into existing target objects rather than replacing them. Mutate uniforms via `ref.current.uniforms`, never by creating a new uniforms object.
* **Three.js version compatibility:** Ensure `three`, `@react-three/fiber`, and `@react-three/drei` resolve to compatible versions. Drei pins a Three.js peer dependency range — version mismatches cause subtle rendering bugs.
* **Draco loader configuration:**
  ```tsx
  import { useLoader } from '@react-three/fiber'
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
  import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

  const gltf = useLoader(GLTFLoader, '/model.glb', (loader) => {
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/draco/')
    loader.setDRACOLoader(dracoLoader)
  })
  ```

---

## 8. Resume Data

All resume content below is sourced directly from your actual resume files. **Do not modify, embellish, or paraphrase this content.** Agents must render it exactly as provided.

```typescript
// src/data/resumeData.ts

export interface ContactInfo {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
}

export interface ProjectEntry {
  fileId: string;
  title: string;
  company: string;
  dates: string;
  type: 'work' | 'project' | 'profile' | 'contact' | 'skill';
  bullets: string[];
  controls?: string[]; // IDs from Controls Spec Table (§2.3)
}

export const CONTACT_INFO: ContactInfo = {
  name: 'Kaleb Kougl',
  title: 'Senior Software Engineer',
  email: 'KalebKougl@gmail.com',
  phone: '479-283-4454',
  location: 'San Francisco, CA',
  linkedin: 'linkedin.com/in/kaleb-kougl-7b3292151/',
};

export const SUMMARY =
  'Front‑End Platform engineer with 8+ years building scalable TypeScript/React web applications and reusable component libraries. Experienced with Webpack, CI/CD, Core Web Vitals, Frontend SLOs, and AI‑assisted code generation to accelerate delivery.';

export const EDUCATION = {
  school: 'University of Arkansas',
  graduationDate: 'Jul 2017',
  degree: 'Bachelor of Science Biological Sciences',
  gpa: '3.9',
};

export const SKILLS = [
  'TypeScript',
  'JavaScript',
  'CI/CD',
  'React',
  'HTML5',
  'CSS3',
  'Web Applications',
  'Component libraries',
  'Webpack',
  'Build Systems',
  'Performance optimization (Core Web Vitals)',
  'AI‑assisted development / model‑assisted workflows',
];

export const RESUME_DATA: Record<string, ProjectEntry> = {
  // --- Profile & Contact ---
  'profile': {
    fileId: 'profile',
    title: 'Kaleb Kougl',
    company: '',
    dates: '',
    type: 'profile',
    bullets: [SUMMARY],
  },
  'contact-info': {
    fileId: 'contact-info',
    title: 'Network Configuration',
    company: '',
    dates: '',
    type: 'contact',
    bullets: [
      `Email: ${CONTACT_INFO.email}`,
      `Phone: ${CONTACT_INFO.phone}`,
      `Location: ${CONTACT_INFO.location}`,
      `LinkedIn: ${CONTACT_INFO.linkedin}`,
    ],
  },

  // --- Work Experience ---
  'indeed-sr-swe': {
    fileId: 'indeed-sr-swe',
    title: 'Senior Software Engineer',
    company: 'Indeed.com',
    dates: 'Aug 2022 – Present',
    type: 'work',
    bullets: [
      'Migrated to OneHost microfrontend platform (Webpack 5 module federation) to enable reusable component library and scale consumer web experiences; automated CI/CD and mentored ~12 engineers to accelerate deployment cadence.',
      'Operationalized Frontend SLOs with SRE and Product, reducing customer‑facing incidents for consumer features.',
      'Applied AI‑assisted code generation and model‑assisted workflows to speed delivery.',
      'Architected a gRPC third‑party integration platform.',
      'Shipped a TypeScript/React Manifest V3 analytics troubleshooting extension.',
    ],
    controls: ['isModuleFederationEnabled', 'isSloIncidentSimulated'],
  },
  'ibm-staff-swe': {
    fileId: 'ibm-staff-swe',
    title: 'Staff Software Engineer',
    company: 'IBM',
    dates: 'Sep 2021 – Aug 2022',
    type: 'work',
    bullets: [
      'Modernized IBM Developer site with React and Webpack, improving SEO and Core Web Vitals (TTI/FCP) across devices.',
      'Optimized Webpack to halve build time, improve rebuild/hot‑reload 29x, and shrink bundle from 6 MB to 300 KB.',
      'Designed and launched a Watson Media video upload pipeline to streamline advocate video publishing.',
    ],
    controls: ['targetBundleSize'],
  },
  'ibm-swe': {
    fileId: 'ibm-swe',
    title: 'Software Engineer',
    company: 'IBM',
    dates: 'May 2019 – Sep 2021',
    type: 'work',
    bullets: [
      'Delivered a modernized customer service agent portal (API caching → ~30% faster avg response) and built the GolfTV Graph API with Apollo on AWS to improve data reliability for client integrations.',
    ],
  },
  'jbhunt-intern': {
    fileId: 'jbhunt-intern',
    title: 'Application Development Intern',
    company: 'J.B. Hunt',
    dates: 'Jun 2018 – Dec 2018',
    type: 'work',
    bullets: [
      'Built cross‑platform React Native features and added Jest/Appium test suites to raise release confidence.',
    ],
  },

  // --- Projects ---
  'hammerball': {
    fileId: 'hammerball',
    title: 'HammerBall LiveOps',
    company: 'Personal Project',
    dates: '',
    type: 'project',
    bullets: [
      'Shipped a full multiplayer game with a 5-state FSM-driven AI pipeline and authoritative client-server architecture.',
      'Built with TypeScript, Reflex/Redux state management, and real-time live-ops economy syncing.',
    ],
    controls: ['forceAiState', 'showNavMesh'],
  },
  'analytics-extension': {
    fileId: 'analytics-extension',
    title: 'Indeed Analytics Extension',
    company: 'Indeed.com',
    dates: '',
    type: 'project',
    bullets: [
      'End‑to‑end analytics troubleshooting browser extension in React (Manifest V3) to improve campaign management efficiency.',
    ],
  },

  // --- Skills / Dependencies ---
  'webpack-federation': {
    fileId: 'webpack-federation',
    title: 'Webpack 5 Module Federation',
    company: '',
    dates: '',
    type: 'skill',
    bullets: [
      'Webpack 5, Module Federation, Tree-shaking, Code Splitting, Build Systems, CI/CD Automation.',
    ],
  },
  'cwv-profiler': {
    fileId: 'cwv-profiler',
    title: 'Core Web Vitals Profiler',
    company: '',
    dates: '',
    type: 'skill',
    bullets: [
      'Performance optimization (Core Web Vitals), Frontend SLOs, TTI/FCP measurement, Lighthouse auditing.',
    ],
  },
};
```

---

## 9. Console Log Mapping

To ensure agents wire the console correctly, here is the exact mapping from file IDs to log messages:

```typescript
// src/data/consoleLogs.ts

export const FILE_LOG_MAP: Record<string, string> = {
  'profile':              '> [SYSTEM] Loading Player Entity... Kaleb Kougl | San Francisco, CA.',
  'contact-info':       '> [NETWORK] Establishing gRPC channels... LinkedIn, Email configured. OK',
  'indeed-sr-swe':       '> [NETWORK] Opening gRPC channels for third-party integration... OK',
  'ibm-staff-swe':    '> [PERF] Legacy bundle detected. Tree-shaking applied. Reduced to 300KB.',
  'ibm-swe':           '> [GRAPHQL] Initializing Apollo Client... GolfTV Graph API connected.',
  'jbhunt-intern':        '> [MOBILE] React Native bridge initialized. Jest/Appium suites loaded.',
  'hammerball':            '> [SERVER] Authoritative match started. Syncing live-ops economy...',
  'analytics-extension':  '> [EXTENSION] Manifest V3 service worker registered. Analytics pipeline active.',
  'webpack-federation':   '> [WEBPACK 5] Compiling Module Federation... Done in 142ms.',
  'cwv-profiler':         '> [SLO] Core Web Vitals check: TTI < 100ms. FCP < 50ms. [PASS]',
};

export const BOOT_LOGS: string[] = [
  '> [SYSTEM] Bootstrapping React 19 & Zustand state... Location: [San Francisco, CA].',
  '> [WEBPACK 5] Compiling Module Federation... Done in 142ms.',
  '> [SLO] Core Web Vitals check: TTI < 100ms. FCP < 50ms. [PASS]',
];
```

---

## 10. Accessibility

An IDE-themed portfolio leans heavily on mouse interaction by default. To ensure the site is usable by keyboard-only users, screen readers, and meets WCAG 2.1 AA standards, implement the following:

### Keyboard Navigation

| Area | Behavior |
|---|---|
| **File Tree (Hierarchy)** | Arrow keys to navigate nodes. `Enter` or `Space` to select a file / expand a folder. `Home`/`End` to jump to first/last node. Use `role="tree"`, `role="treeitem"`, `aria-expanded` on folders. |
| **Inspector Panel** | Tab through interactive controls (slider, toggles, radio buttons). All controls must be natively focusable `<input>` elements — not `<div onClick>` shims. |
| **Resize Handles** | `react-resizable-panels` v4 `Separator` renders WAI-ARIA `role='separator'` with all required properties automatically. Custom `aria-label` is optional but recommended for clarity. |
| **Top Bar** | Tab to the Download Resume button. `Enter` triggers download. |
| **Console** | Read-only. Mark as `role="log"` with `aria-live="polite"` so screen readers announce new entries without interrupting. |

### Focus Management

* When a file is selected in the Hierarchy, programmatically move focus to the Inspector panel heading so keyboard users don't have to tab through the entire viewport.
* On mobile, when the bottom sheet expands, trap focus inside it until dismissed. Use Motion for React's `AnimatePresence` (from `motion/react`) exit to restore focus to the trigger button.

```tsx
// Focus restoration on drawer/sheet dismiss:
<AnimatePresence onExitComplete={() => triggerRef.current?.focus()}>
  {isOpen && <BottomSheet key="sheet">
    <FocusTrap>{/* content */}</FocusTrap>
  </BottomSheet>}
</AnimatePresence>
```

* All interactive icons (file tree nodes, toolbar buttons) must meet 44×44px minimum touch target (WCAG 2.1 AA).

### Color & Contrast

* All text/background combinations in the design token palette (§4) meet WCAG AA contrast ratios (≥ 4.5:1 for body text, ≥ 3:1 for large text). Verify with a contrast checker after implementation.
* Interactive 3D visualizations are supplementary, not the sole means of conveying information — the Inspector text always provides the same data in readable form.

### ARIA Landmarks

```html
<header>         <!-- TopBar -->
<nav>            <!-- HierarchyTree -->
<main>           <!-- Viewport + Inspector -->
<aside>          <!-- Inspector Panel -->
<footer>         <!-- TerminalConsole -->
```

### Skip Link

Add a visually-hidden skip link as the first focusable element: `Skip to main content` → jumps to the Inspector panel, since that's where the readable resume content lives.

### Motion Accessibility

```tsx
import { useReducedMotion } from "motion/react"

// In any component with motion animations:
const shouldReduce = useReducedMotion()

// Fallback: replace slide/scale with simple opacity
<motion.aside
  animate={shouldReduce
    ? { opacity: isOpen ? 1 : 0 }
    : { x: isOpen ? 0 : "-100%" }
  }
/>
```

Alternatively, use `<MotionConfig reducedMotion="user">` globally to respect OS preferences for all descendant motion components.

---

## 11. Verification & Testing

This is a portfolio site, not a production SaaS — keep testing lean and focused on the two most likely failure modes: **hydration crashes** and **state wiring bugs**.

### Playwright E2E (1 test file)

Install `@playwright/test` as a dev dependency. Create `e2e/portfolio.spec.ts`:

| Test | What It Verifies |
|---|---|
| `renders IDE layout` | All 4 panels visible. TopBar contains download button. |
| `file tree → inspector wiring` | Click `Level_3_IBM_Modernization.tsx` → Inspector shows "Staff Software Engineer" and "IBM". |
| `file tree → console wiring` | Click `Level_4_Indeed_OneHost.config` → Console shows `> [NETWORK] Opening gRPC channels...`. |
| `controls render per file` | Click IBM → slider visible. Click Indeed → toggles visible. Click HammerBall → radio buttons visible. |
| `3D canvas mounts` | Viewport contains a `<canvas>` element (Phase 3+). |
| `mobile layout` | At viewport < 768px: drawer trigger visible, bottom sheet visible, no panel layout. |
| `download link works` | Download button `href` points to `/KalebK_Resume.pdf`. |
| `keyboard navigation` | Tab through file tree → inspector → controls without getting trapped. |

### Visual Regression

Use Playwright's built-in screenshot comparison:

```typescript
await expect(page).toHaveScreenshot('desktop-layout.png', {
  maxDiffPixelRatio: 0.01,
});
await page.setViewportSize({ width: 375, height: 812 });
await expect(page).toHaveScreenshot('mobile-layout.png', {
  maxDiffPixelRatio: 0.01,
});
```

Run after each phase to catch CSS regressions. Baseline screenshots are committed to the repo.

### Manual Verification

After each phase, manually verify:
1. `npm run build` completes without errors (catches hydration issues)
2. No console errors in browser DevTools
3. Chrome DevTools Performance tab: no layout thrashing during panel resize
4. Chrome Lighthouse: Accessibility score ≥ 90

### Animation Performance Audit

```bash
# CI-gated animation performance audit
npx motionscore https://your-domain.com --threshold B
```

Gates deployment on B-tier or above animation performance (compositor-friendly).

### Unit & Component Tests

```tsx
import { useEngineStore } from '@/store/engineStore'

// ⚠️ CRITICAL: Reset store before each test to prevent pollution
beforeEach(() => {
  useEngineStore.setState(useEngineStore.getInitialState(), true)
})

// Pure store tests — no renderHook needed
test('setActiveFile updates activeFileId and pushes log', () => {
  useEngineStore.getState().setActiveFile('ibm-staff-swe', '> [PERF] ...')
  expect(useEngineStore.getState().activeFileId).toBe('ibm-staff-swe')
  expect(useEngineStore.getState().consoleLogs).toContain('> [PERF] ...')
})

// Component behavior tests — test by behavior, not implementation
test('clicking file tree item shows inspector content', async () => {
  render(<App />)
  await userEvent.click(screen.getByText('Level_3_IBM_Modernization.tsx'))
  expect(screen.getByText('Staff Software Engineer')).toBeInTheDocument()
})
```

Console log entries should have stable unique keys (not array index). Use an incrementing counter at push time: `{ id: logCounter++, msg }`. Since logs are append-only and capped, array index is an acceptable pragmatic alternative.
