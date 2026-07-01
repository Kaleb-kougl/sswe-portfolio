# Kaleb Kougl - Senior Frontend Architect Portfolio

An interactive, IDE-themed portfolio built with Next.js App Router, React 19, and React Three Fiber. This project maps my resume data into a simulated Integrated Development Environment (IDE) interface, showcasing technical experience and engineering concepts through live 3D visualizations. The architecture bridges traditional reactive DOM state with computationally heavy WebGL rendering, maintaining high-fidelity 3D interactions without dropping frames or triggering garbage collection spikes.

## Live Deployment

This project is deployed on Vercel and can be viewed at:
[https://kalebkougl-portfolio.vercel.app/](https://kalebkougl-portfolio.vercel.app/)

## Key Features

- **IDE Architecture**: 4-pane layout containing a File Hierarchy, Inspector Panel, Terminal Console, and a central WebGL Canvas.
- **Interactive 3D Visualizations**: 
  - **IBM**: Visualizes bundle optimization by compressing a chaotic 3D sphere into a diamond.
  - **Indeed**: Demonstrates Webpack Module Federation as 3D blocks snap together.
  - **HammerBall**: Visualizes Finite State Machine (FSM) AI pathfinding in 3D.
  - **Combat System**: Uses my custom GPU-instanced library for rendering complex bullet patterns.
- **Strict Performance Architecture**: Zero DOM props passed into the canvas; zero-allocation `useFrame` loops to prevent garbage collection spikes.
- **Responsive "Spatial Map"**: Mobile fallback drops the IDE panes into sliding drawers and bottom sheets, covering the background in the 3D canvas.
- **Accessibility (A11y)**: Supports `prefers-reduced-motion`, ARIA tree keyboard navigation, and screen-reader announcements.

![Speed Metrics](/Resume/Screenshot%202026-07-01%20at%208.59.45 AM.png)

## Tech Stack

- **Framework**: Next.js 16.2.7 (App Router), React 19.2.4 (React Compiler)
- **3D / WebGL**: `three` (v0.174), `@react-three/fiber` (v9.6), `@react-three/drei`, `@react-three/postprocessing`
- **Styling**: Tailwind CSS v4, `lucide-react`
- **State Management**: `zustand` (v5) utilizing `subscribeWithSelector`
- **Layout & Animations**: `react-resizable-panels`, Framer Motion v12
- **Testing**: Vitest, Playwright
- **Custom Packages**: `@k9kbdev/r3f-projectiles` (A custom zero-allocation GPU-instanced bullet engine authored by me)



## Architecture Highlights

- **Modern React (v19)**: Built with the React Compiler to automatically handle component memoization, improving rendering performance.
- **Server Components & Suspense**: Uses the Next.js App Router RSC architecture, dynamically lazy-loading heavy 3D assets inside `<Suspense>` boundaries without blocking the main thread.
- **State Bifurcation**: The `useEngineStore` separates "Reactive" state (DOM renders) from "Transient" state (bypasses React, polled imperatively in WebGL).
- **GPU Instancing**: The included `r3f-projectiles` library (which I authored) powers a custom 3D projectile engine capable of rendering 20,000 entities at 120 FPS.
- **Scene Orchestration**: Scenes are mounted once to prevent expensive GPU recompilations, controlled imperatively via `scene-orchestrator.tsx`.

## Data Structures & Algorithms in Practice

This portfolio was built to demonstrate deep engineering fundamentals applied to modern web environments:

- **Pre-allocated Object Pools (Memory Management):** The `r3f-projectiles` engine avoids Garbage Collection (GC) stutters by instantiating a fixed-size pool of 20,000 `BulletSpawnData` objects on mount. It uses an `acquire()` / `release()` algorithm to recycle instances, maintaining a strictly zero-allocation `useFrame` physics loop.
- **Recursive Tree Flattening (A11y Traversal):** The IDE File Explorer uses a recursive algorithm to flatten the deep `FileNode` tree structure into a 1D array on the fly. This enables WAI-ARIA compliant up/down keyboard navigation that logically skips over collapsed directories.
- **Ring Buffers (Queue Management):** The Terminal Console manages its data via a sliding-window ring buffer (`.slice(-100)`). This bounds the `ConsoleLogEntry` array, preventing DOM bloat and memory leaks during long, heavily logged 3D sessions.
- **Euler Integration (Physics):** The particle system calculates movement using frame-rate independent Euler integration (`addScaledVector(v, dt)`). By clamping the delta-time, it guarantees deterministic speeds and prevents spiral-of-death lag spikes across both 60Hz and 144Hz monitors.
- **Algorithmic Pattern Generators (Math):** Complex projectile emissions are calculated using mathematically driven algorithms rather than hardcoded paths - including Golden Angle distributions (Fibonacci Spheres), parametric Torus Knots, and logarithmic squared distributions for spiral galaxies.
- **Heuristic LLM Discovery (Web Crawling):** The `r3f-scraper` script uses an opportunistic fallback algorithm. It first attempts to resolve standard `/llms.txt` endpoints to gather context, falling back to a full Breadth-First Search DOM traversal if the heuristic fails.

## Testing & QA Highlights

The project has a strict unit testing strategy (100% pass rate across 143 tests in 22 suites), built using Test-Driven Development (TDD):

- **State Management**: The Zustand store (`useEngineStore`) is tested to verify FIFO console queues (capped at 100 entries) and ensure high-frequency transient state updates (like 3D camera coordinates) do not trigger unnecessary DOM renders.
- **3D Context Resilience**: `error-boundary` and `canvas-wrapper` tests verify that if WebGL is disabled or crashes, the application falls back to a 2D UI. It also tests auto-recovery mechanisms that reset the context upon file navigation.
- **WebGL Testing**: Uses `@react-three/test-renderer` to unit test 3D scenes by advancing frames (`renderer.advanceFrames`). This verifies `InstancedMesh` re-allocations, frustum culling, and zero-value handling during computational sequences.
- **Accessibility Fallbacks**: Tests explicitly mock the `useReducedMotion` hook to ensure 3D animations, camera panning, and intensive physics systems immediately fall back to simplified states.
- **Recursive Data Structures**: Deeply nested mock data tests ensure the `HierarchyTree` file explorer correctly flattens data and updates WAI-ARIA attributes (`aria-expanded`) without hitting call stack limits.
- **Continuous Integration**: GitHub Actions workflow featuring dependency caching and artifact retention. The pipeline requires 100% passing unit (Vitest) and E2E (Playwright) test suites, ESLint static analysis, and successful Next.js production builds before continuous deployment to Vercel.

## Contact

kalebkougl@gmail.com
