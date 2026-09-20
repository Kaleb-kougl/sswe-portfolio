'use client';
'use no memo';

import {
  Component,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  BoxGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  type BufferGeometry,
  type Group,
  type Mesh,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import { useIsMobile } from '@/hooks/useIsMobile';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useSaveData } from '@/hooks/useSaveData';

import {
  backdropNeverSuspendedOnServer,
  isBackdropSuspended,
  subscribeBackdropPower,
} from './backdrop-power';
import { createFrameWatchdog, sampleFrame } from './frame-watchdog';
import { detectWebGL2 } from './viewport-fallback';
import { WebGLErrorBoundary } from './error-boundary';
import {
  ARTBOARD_WORLD_H,
  ARTBOARD_WORLD_W,
  BLOCK_COUNT,
  BLOCK_DEPTH,
  BLOCK_SIZE,
  HERO_GLB_URL,
  LAYOUTS,
  STAGE_BOUNDS,
  STAGE_COUNT,
  STAGE_KEYS,
  heroBlockName,
  heroGeometryScale,
} from './morph-layouts';

/**
 * morph-canvas — the fixed 3D backdrop the whole page scrolls over.
 *
 * One `InstancedMesh`, one block geometry, one `MeshBasicMaterial`, 112
 * instances, ONE draw call. Scrolling advances a continuous progress value in
 * `[0, STAGE_COUNT - 1]`; every frame each block is lerped between the two
 * adjacent baked layouts (see `morph-layouts.ts`) and written straight into the
 * instance buffers. Nothing here allocates per frame and nothing here re-renders
 * React while scrolling.
 *
 * WHERE THE BLOCK COMES FROM
 * --------------------------
 * The block itself is the real asset: `public/models/hero.glb`, built in
 * Blender by `scripts/build_hero_glb.py` (see `docs/hero-pipeline.md`). Its 112
 * nodes share ONE mesh and ONE material precisely so the sculpture can be drawn
 * as a single `InstancedMesh`, so the runtime takes that one shared geometry and
 * instances it 112 times. The node *positions* in the file are the rest pose
 * only; all five arrangements still come from the baked layout arrays.
 *
 * The file is 8.7 KB and preloaded, but it is still a fetch, so the mesh is
 * built with a procedural box of identical dimensions and the asset geometry is
 * swapped in underneath the live instance buffers once it lands. The backdrop
 * therefore paints on the first frame and the swap is invisible — the asset's
 * block *is* that box, scaled onto the artboard grid. Either way it is one
 * geometry on one mesh: one draw call, before and after.
 *
 * WHO GETS THE ANIMATION
 * ----------------------
 * Everyone whose device does not demonstrate that it cannot cope. This used to
 * be a width test — `(max-width: 767px)` meant "still" — which was wrong in
 * both directions: 112 instances in one draw call is nothing to a modern phone,
 * and a narrow desktop window was being downgraded for a reason (viewport
 * width) that says nothing whatsoever about GPU throughput.
 *
 * It is deliberately NOT a capability sniff either. `navigator.deviceMemory`
 * does not exist on iOS Safari, so any rule that requires it silently excludes
 * every iPhone — the single largest group of phones this change is for — and
 * `hardwareConcurrency` counts CPU cores, which is not what draws frames. So
 * the backdrop animates by default and *measures*: the watchdog in
 * `frame-watchdog.ts` times how long each frame's own work takes — not how
 * often frames happen, which is the compositor's business — and downgrades
 * once, permanently, if the device is sustainably too slow. Guessing is
 * replaced by evidence, after the fact.
 *
 * Degradation, in order:
 *   no WebGL2  -> renders nothing at all (it is decoration; failure is silent)
 *   reduced    -> a still hero arrangement, `frameloop="demand"`, no listeners,
 *                 no measurement: an accessibility guarantee, never adaptive
 *   save-data  -> same still arrangement (the visitor asked for less)
 *   too slow   -> same still arrangement, latched for the session, once the
 *                 work-time watchdog has proved the device cannot keep up
 *   tab hidden -> `frameloop="never"`, the render loop stops entirely
 *   demo open  -> `frameloop="never"`, same lever, pulled by `backdrop-power.ts`
 *                 so the projectiles demo's WebGL context is the only live one
 */

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Vertical FOV and fixed camera distance used to frame the mockup artboard. */
const CAMERA_FOV = 35;
const CAMERA_Z = 80;
/** Never pay for more than 1.5x device pixels — this is background decoration. */
const MAX_DPR = 1.5;
/**
 * Small viewports get a lower cap still.
 *
 * The canvas is the full viewport, so what it costs is fill rate, and fill rate
 * is the one axis where phones really are outclassed: a phone at its native
 * DPR 3 asks for more pixels than a 1280x720 desktop does at DPR 1.5.
 *
 * Measured, on the Pixel 5 emulation (375x812 CSS, DPR 2.75), as sustained
 * frames over a 2s idle window — one draw call per frame, so draws are frames:
 *
 *   cap 2.75  1031x2233 = 2.30 MP   91 frames   ~46fps
 *   cap 1.50   562x1218 = 0.69 MP  240 frames  ~120fps
 *   cap 1.25   468x1015 = 0.48 MP  224 frames  ~112fps
 *
 * That is the whole argument. Uncapped, this scene is fill-rate bound badly
 * enough to halve its frame rate on a desktop GPU, which is the ceiling a
 * phone's will never reach. Past the cap it is not bound by fill rate at all:
 * 1.25 and 1.5 are the same number twice, inside the noise of the harness.
 * So the choice between them is free here and pure headroom on a real phone
 * GPU, and it is spent on headroom — 30% fewer pixels for flat untextured
 * color, already MSAA-antialiased, sitting behind body copy as decoration.
 */
const MAX_DPR_SMALL = 1.25;
/** Exponential approach rate of rendered progress toward scroll progress. */
const MORPH_SMOOTHING = 5.5;
/** Below this delta the instance buffers are left untouched for the frame. */
const MORPH_EPSILON = 0.0002;
/** Phone still: how much of the viewport the lone glyph is allowed to take. */
const STILL_WIDTH_FRACTION = 0.55;
const STILL_HEIGHT_FRACTION = 0.3;
/** Phone still: alpha multiplier, so the watermark never fights body copy. */
const STILL_DIM = 0.3;
/**
 * Narrow viewports: alpha multiplier for the LIVE morph.
 *
 * Same problem the still solves with `compact`, and the same signal (viewport
 * width), because it is the same cause: below the breakpoint the page is one
 * column of running text and the "contain" fit drops the whole artboard on top
 * of it. Screenshotted at 375px before this existed, the KK glyph landed square
 * on the hero paragraph, black blocks over black type.
 *
 * It is a multiplier passed to `writeBlocks`, which already had the parameter
 * for the still — so it is one extra multiply per instance per frame, no second
 * material and no second pass. The morph itself is untouched: all five stages,
 * the scroll coupling and the sway are exactly what a desktop gets. Only the
 * ink is turned down, and only where the text is on top of it.
 */
const MORPH_DIM_SMALL = 0.4;
/** Amplitude/speed of the idle sway that keeps the backdrop from feeling dead. */
const SWAY_AMPLITUDE = 0.035;
const SWAY_SPEED = 0.16;

/**
 * Any non-zero `useFrame` priority takes rendering out of R3F's hands:
 * `update()` in the loop only calls `gl.render` itself when `internal.priority`
 * is 0 (`@react-three/fiber` 9.6.1). `MorphingBlocks` wants that, because a
 * draw it issues itself is a draw it can time — see `frame-watchdog.ts`.
 *
 * It is scoped to the live path alone. `StaticBlocks` registers no `useFrame`,
 * so when the watchdog swaps it in the priority count drops back to 0, R3F
 * resumes rendering on its own, and `frameloop="demand"` keeps working exactly
 * as it did — which is what makes this one draw call for the rest of the
 * session rather than none at all.
 */
const RENDER_PRIORITY = 1;

/**
 * Each stage is named after the section it belongs to, and `page.tsx` already
 * gives those sections matching ids (`#hero`, `#work`, ...). When all five are
 * present the morph is anchored to their real geometry — stage N is reached
 * exactly when section N is centered in the viewport. When they are not (a
 * different page, a test harness), progress falls back to the raw document
 * scroll fraction, so the backdrop needs no coordination to work.
 */
const stageElements = (): HTMLElement[] => {
  const found: HTMLElement[] = [];
  for (const key of STAGE_KEYS) {
    const el = document.getElementById(key);
    if (!el) return [];
    found.push(el);
  }
  return found;
};

const HOST_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
};

const CANVAS_STYLE: React.CSSProperties = { pointerEvents: 'none' };

// ---------------------------------------------------------------------------
// The mesh
// ---------------------------------------------------------------------------

/**
 * Shared scratch transform. One per module, never per frame — `writeBlocks` is
 * synchronous and single-threaded, so there is nothing to contend with.
 */
const SCRATCH = new Object3D();

interface BlockMesh {
  mesh: InstancedMesh;
  colors: InstancedBufferAttribute;
  alphas: InstancedBufferAttribute;
}

/**
 * Adds a per-instance alpha to the stock basic-material program.
 *
 * `instanceColor` gives per-instance RGB for free, but three has no
 * per-instance alpha, and the layouts need it (the sphere's depth fade, the
 * exploded view's back layer, the floor fading into the distance). A separate
 * material per opacity would mean a draw call per opacity, so instead one
 * `instanceAlpha` attribute rides along and multiplies the final alpha.
 *
 * Both anchors are checked before replacing: if a future three release renames
 * a chunk, the backdrop renders fully opaque instead of failing to compile.
 */
function patchInstanceAlpha(shader: WebGLProgramParametersWithUniforms): void {
  // three hands us the shader with its `#include` directives still unresolved,
  // so both anchors are the literal source text of ShaderLib.basic.
  const MAIN = 'void main() {';
  const ALPHA_ANCHOR = '#include <dithering_fragment>';
  if (!shader.vertexShader.includes(MAIN)) return;
  if (!shader.fragmentShader.includes(ALPHA_ANCHOR)) return;

  shader.vertexShader = shader.vertexShader.replace(
    MAIN,
    [
      'attribute float instanceAlpha;',
      'varying float vInstanceAlpha;',
      MAIN,
      '\tvInstanceAlpha = instanceAlpha;',
    ].join('\n'),
  );
  shader.fragmentShader = shader.fragmentShader
    .replace(MAIN, ['varying float vInstanceAlpha;', MAIN].join('\n'))
    .replace(ALPHA_ANCHOR, [ALPHA_ANCHOR, '\tgl_FragColor.a *= vInstanceAlpha;'].join('\n'));
}

/**
 * Start the 8.7 KB fetch as soon as this browser-only chunk evaluates, which is
 * before the `Canvas` has mounted — the sooner it resolves, the shorter the
 * window in which the placeholder box is what is on screen.
 *
 * Draco and meshopt are off: the asset is exported uncompressed, and leaving
 * them on would construct a `DRACOLoader` pointed at a Google CDN for a file
 * that will never ask for one.
 */
useGLTF.preload(HERO_GLB_URL, false, false);

function createBlockMesh(): BlockMesh {
  // Placeholder only — `HeroGeometry` replaces this with the asset's own
  // vertices, at the same dimensions, as soon as the GLB resolves.
  const geometry = new BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_DEPTH);
  // The material is NOT taken from the GLB, deliberately. Blender exports a
  // `MeshStandardMaterial` (neutral grey, metallic 0.1) and this scene has no
  // lights and renders `flat`, so mounting it would draw 112 black boxes;
  // per-instance alpha also needs the patch below, and every visible color
  // comes from `instanceColor` rather than from the asset. So the asset
  // contributes the one thing it actually carries — the geometry — and the
  // grey placeholder material it ships with stays unused.
  const material = new MeshBasicMaterial({
    transparent: true,
    // Unsorted instances + depth writes would punch holes in each other; the
    // blocks are flat token colors, so blending them back-to-front is fine.
    depthWrite: false,
    toneMapped: false,
  });
  material.onBeforeCompile = patchInstanceAlpha;

  const mesh = new InstancedMesh(geometry, material, BLOCK_COUNT);
  mesh.count = BLOCK_COUNT;
  // The instance cloud moves every frame; recomputing its bounds to cull a
  // single always-on-screen mesh would cost more than the cull saves.
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);

  const colors = new InstancedBufferAttribute(new Float32Array(BLOCK_COUNT * 3), 3);
  colors.setUsage(DynamicDrawUsage);
  mesh.instanceColor = colors;

  const alphas = new InstancedBufferAttribute(new Float32Array(BLOCK_COUNT), 1);
  alphas.setUsage(DynamicDrawUsage);
  geometry.setAttribute('instanceAlpha', alphas);

  return { mesh, colors, alphas };
}

/**
 * Writes every block as a blend of stages `a` and `b` at mix `f`, with every
 * alpha scaled by `dim`.
 * Allocation-free: the only object touched is the caller's scratch `Object3D`.
 */
function writeBlocks(
  target: BlockMesh,
  scratch: Object3D,
  a: number,
  b: number,
  f: number,
  dim = 1,
): void {
  const { position, scale, alpha, color } = LAYOUTS;
  const colorArray = target.colors.array as Float32Array;
  const alphaArray = target.alphas.array as Float32Array;
  const baseA = a * BLOCK_COUNT;
  const baseB = b * BLOCK_COUNT;

  for (let i = 0; i < BLOCK_COUNT; i++) {
    const ia = (baseA + i) * 3;
    const ib = (baseB + i) * 3;

    scratch.position.set(
      position[ia] + (position[ib] - position[ia]) * f,
      position[ia + 1] + (position[ib + 1] - position[ia + 1]) * f,
      position[ia + 2] + (position[ib + 2] - position[ia + 2]) * f,
    );
    const sa = scale[baseA + i];
    scratch.scale.setScalar(sa + (scale[baseB + i] - sa) * f);
    scratch.updateMatrix();
    target.mesh.setMatrixAt(i, scratch.matrix);

    const aa = alpha[baseA + i];
    alphaArray[i] = (aa + (alpha[baseB + i] - aa) * f) * dim;

    colorArray[i * 3] = color[ia] + (color[ib] - color[ia]) * f;
    colorArray[i * 3 + 1] = color[ia + 1] + (color[ib + 1] - color[ia + 1]) * f;
    colorArray[i * 3 + 2] = color[ia + 2] + (color[ib + 2] - color[ia + 2]) * f;
  }

  target.mesh.instanceMatrix.needsUpdate = true;
  target.colors.needsUpdate = true;
  target.alphas.needsUpdate = true;
}

function useBlockMesh(): BlockMesh {
  const block = useMemo(() => createBlockMesh(), []);
  useEffect(() => {
    const { mesh } = block;
    return () => {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
      mesh.dispose();
    };
  }, [block]);
  return block;
}

// ---------------------------------------------------------------------------
// The asset
// ---------------------------------------------------------------------------

/**
 * The one geometry every block in `hero.glb` shares, scaled onto the artboard's
 * unit system and ready to instance.
 *
 * Cloned, because the loader cache is shared for the session and the clone gets
 * mutated (scaled, given the `instanceAlpha` attribute) and disposed with the
 * mesh. The lookup is by name first — `block_000` is the contract in
 * `docs/hero-pipeline.md` — with a traversal as a fallback so a re-export that
 * renamed its parts degrades to "still renders" rather than "renders nothing".
 */
function useHeroBlockGeometry(): BufferGeometry | null {
  const { scene, meshes } = useGLTF(HERO_GLB_URL, false, false);

  return useMemo(() => {
    let source: Mesh | undefined = meshes[heroBlockName(0)];
    if (!source) {
      const found: Mesh[] = [];
      scene.traverse((object) => {
        if ((object as Mesh).isMesh) found.push(object as Mesh);
      });
      source = found[0];
    }
    if (!source) return null;

    const geometry = source.geometry.clone();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const [sx, sy, sz] = box
      ? heroGeometryScale(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z)
      : ([1, 1, 1] as const);
    geometry.scale(sx, sy, sz);
    return geometry;
  }, [scene, meshes]);
}

/**
 * Puts `geometry` on the block mesh in place of whatever it is drawing now, and
 * reports whether anything changed.
 *
 * The instance buffers survive untouched: `instanceMatrix` and `instanceColor`
 * live on the mesh, and `instanceAlpha` rides on the geometry, so it is
 * re-attached here. The outgoing placeholder is disposed on the spot; the mesh
 * disposes whatever it ends up owning when it unmounts.
 */
function adoptGeometry(target: BlockMesh, geometry: BufferGeometry): boolean {
  const previous = target.mesh.geometry;
  if (previous === geometry) return false;
  geometry.setAttribute('instanceAlpha', target.alphas);
  target.mesh.geometry = geometry;
  previous.dispose();
  return true;
}

/**
 * Contains a failed asset load to the asset.
 *
 * `hero.glb` is decoration inside decoration. Without this, a missing or
 * corrupt file would throw straight past the `Canvas` to the boundary around
 * it and take the entire backdrop down; with it, the mesh keeps drawing its
 * placeholder box and the page never notices — the same "a broken backdrop
 * breaks nothing" contract as the no-WebGL path, and just as silent.
 */
class AssetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Loads the asset and hands its geometry to `onLoad`. Renders nothing.
 *
 * This suspends (that is what `useGLTF` does), so it is mounted inside its own
 * `<Suspense fallback={null}>`. The boundary wraps this component alone, which
 * is what lets the `InstancedMesh` beside it go on painting the placeholder
 * instead of the whole backdrop waiting on a fetch.
 */
const HeroGeometry = memo(function HeroGeometry({
  onLoad,
}: {
  onLoad: (geometry: BufferGeometry) => void;
}) {
  const geometry = useHeroBlockGeometry();

  useLayoutEffect(() => {
    if (geometry) onLoad(geometry);
  }, [geometry, onLoad]);

  return null;
});

// ---------------------------------------------------------------------------
// Scroll -> progress, without React
// ---------------------------------------------------------------------------

interface ScrollProgress {
  /** Latest scroll-derived progress, in [0, STAGE_COUNT - 1]. */
  target: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Tracks scroll position in a plain mutable object — deliberately NOT React
 * state. A passive `scroll` listener writes one number; `useFrame` reads it.
 * No component re-renders while the page scrolls.
 *
 * `html` has `scroll-behavior: smooth`, so `scrollY` arrives mid-animation in
 * steps of varying size. That is exactly why the frame loop damps toward this
 * value rather than using it directly.
 */
function startScrollTracking(progress: ScrollProgress): () => void {
  let sections: HTMLElement[] = [];
  // Reused across calls so the scroll handler allocates nothing.
  const centers: number[] = new Array(STAGE_COUNT).fill(0);

  const update = () => {
    const mid = window.innerHeight * 0.5;

    if (sections.length === STAGE_COUNT) {
      for (let i = 0; i < STAGE_COUNT; i++) {
        const rect = sections[i].getBoundingClientRect();
        centers[i] = rect.top + rect.height * 0.5;
      }
      let stage = 0;
      while (stage < STAGE_COUNT - 1 && centers[stage + 1] <= mid) stage++;
      const from = centers[stage];
      const to = centers[stage + 1];
      const span = to - from;
      progress.target =
        stage >= STAGE_COUNT - 1 || span <= 0 ? stage : stage + clamp01((mid - from) / span);
      return;
    }

    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    progress.target = (max > 0 ? clamp01(window.scrollY / max) : 0) * (STAGE_COUNT - 1);
  };

  const remeasure = () => {
    sections = stageElements();
    update();
  };

  remeasure();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', remeasure, { passive: true });

  return () => {
    window.removeEventListener('scroll', update);
    window.removeEventListener('resize', remeasure);
  };
}

// ---------------------------------------------------------------------------
// Scene contents
// ---------------------------------------------------------------------------

/**
 * Frames the mockup's 1440x900 artboard.
 *
 * The camera never moves — the content is scaled to fit instead, which keeps
 * the projection (and therefore the depth cues in the sphere, the exploded
 * layers and the floor) identical at every window size. `viewport` is R3F's
 * world-unit size of the frustum at z = 0, so the fit is a single min().
 *
 * The result is "contain": at any aspect ratio the whole artboard is visible,
 * so every stage keeps the on-screen placement it was composed with (KK to the
 * right of the copy, the exploded view to the left, and so on).
 */
const FitGroup = memo(function FitGroup({ children }: { children: React.ReactNode }) {
  const viewport = useThree((s) => s.viewport);
  const invalidate = useThree((s) => s.invalidate);
  const ref = useRef<Group>(null);

  useLayoutEffect(() => {
    const group = ref.current;
    if (!group || !viewport.width || !viewport.height) return;
    group.scale.setScalar(
      Math.min(viewport.width / ARTBOARD_WORLD_W, viewport.height / ARTBOARD_WORLD_H),
    );
    invalidate();
  }, [viewport, invalidate]);

  return <group ref={ref}>{children}</group>;
});

/**
 * The still arrangement: stage 0 (KK), written once and then never touched
 * again — no `useFrame`, no scroll listener, one draw call for the session.
 *
 * `compact` is the narrow-viewport case, and it stays keyed to viewport width
 * (`useIsMobile`) even though the animation decision no longer is. The two
 * questions are simply different questions: "can this device draw 112 instances
 * at 60fps" is about the GPU, while "is this layout a single column of body copy
 * with nothing beside it" is about the width of the window and nothing else. At
 * 390px the full artboard would sit directly behind the running text, so the
 * glyph is framed on its own, centered, and dimmed to a watermark instead — the
 * same framing a 600px-wide desktop window gets, and correctly so.
 */
const StaticBlocks = memo(function StaticBlocks({ compact }: { compact: boolean }) {
  const block = useBlockMesh();
  const viewport = useThree((s) => s.viewport);
  const invalidate = useThree((s) => s.invalidate);
  const ref = useRef<Group>(null);
  const adoptHeroGeometry = useCallback(
    // `frameloop="demand"` here, so an arriving geometry has to ask for a frame.
    (geometry: BufferGeometry) => {
      if (adoptGeometry(block, geometry)) invalidate();
    },
    [block, invalidate],
  );

  useLayoutEffect(() => {
    const group = ref.current;
    if (!group || !viewport.width || !viewport.height) return;

    if (compact) {
      const hero = STAGE_BOUNDS[0];
      const fit = Math.min(
        (viewport.width * STILL_WIDTH_FRACTION) / hero.width,
        (viewport.height * STILL_HEIGHT_FRACTION) / hero.height,
      );
      group.scale.setScalar(fit);
      group.position.set(-hero.centerX * fit, -hero.centerY * fit, 0);
    } else {
      group.scale.setScalar(
        Math.min(viewport.width / ARTBOARD_WORLD_W, viewport.height / ARTBOARD_WORLD_H),
      );
      group.position.set(0, 0, 0);
    }

    writeBlocks(block, SCRATCH, 0, 0, 0, compact ? STILL_DIM : 1);
    invalidate();
  }, [block, compact, viewport, invalidate]);

  return (
    <group ref={ref}>
      <primitive object={block.mesh} />
      <AssetBoundary>
        <Suspense fallback={null}>
          <HeroGeometry onLoad={adoptHeroGeometry} />
        </Suspense>
      </AssetBoundary>
    </group>
  );
});

// ---------------------------------------------------------------------------
// Session downgrade latch
// ---------------------------------------------------------------------------

/**
 * Whether this session has already proved itself too slow to animate.
 *
 * Module-level rather than component state so the downgrade is a property of
 * the session, not of a mounted tree: whatever unmounts and remounts the
 * backdrop (a media-query flip, an error boundary reset, Fast Refresh), the
 * scene comes back still and is never re-litigated. React state is seeded from
 * this and set exactly once, when it flips — the watchdog runs inside
 * `useFrame` and must never render React per frame.
 */
let sessionDowngraded = false;

/** `useState` initialiser: has some earlier mount already downgraded? */
const readSessionDowngrade = (): boolean => sessionDowngraded;

/** The live arrangement: scroll-driven, imperative, zero re-renders. */
const MorphingBlocks = memo(function MorphingBlocks({
  dim,
  onTooSlow,
}: {
  /** Alpha multiplier for every block. See `MORPH_DIM_SMALL`. */
  dim: number;
  /** Called once, from the frame loop, when this device cannot keep up. */
  onTooSlow: () => void;
}) {
  const block = useBlockMesh();
  const groupRef = useRef<Group>(null);
  const progress = useMemo<ScrollProgress>(() => ({ target: 0 }), []);
  const watchdog = useMemo(() => createFrameWatchdog(), []);
  const rendered = useRef(-1);
  const adoptHeroGeometry = useCallback(
    (geometry: BufferGeometry) => {
      adoptGeometry(block, geometry);
    },
    [block],
  );

  useEffect(() => startScrollTracking(progress), [progress]);

  useLayoutEffect(() => {
    writeBlocks(block, SCRATCH, 0, 0, 0, dim);
    // A new `dim` has to reach the buffers even if scroll has not moved, and
    // the epsilon test below would otherwise skip the write for as long as the
    // page sits still. Forcing the next frame to write is one frame of work on
    // a breakpoint crossing, which happens when a window is resized and never
    // while scrolling.
    rendered.current = -1;
  }, [block, dim]);

  useFrame((state, delta) => {
    // Everything the frame costs this device happens between here and the
    // `gl.render` below, so this is where the span opens.
    const startedAt = performance.now();

    // Clamp delta so a backgrounded tab resuming does not teleport the morph.
    const step = delta > 0.1 ? 0.1 : delta;
    const current = rendered.current < 0 ? progress.target : rendered.current;
    const next = current + (progress.target - current) * (1 - Math.exp(-step * MORPH_SMOOTHING));

    if (rendered.current < 0 || Math.abs(next - rendered.current) > MORPH_EPSILON) {
      const p = next < 0 ? 0 : next > STAGE_COUNT - 1 ? STAGE_COUNT - 1 : next;
      const a = Math.min(STAGE_COUNT - 2, Math.floor(p));
      const f = p - a;
      // Smoothstep the crossfade so blocks ease in and out of each stage
      // instead of changing direction abruptly at a section boundary.
      writeBlocks(block, SCRATCH, a, a + 1, f * f * (3 - 2 * f), dim);
      rendered.current = next;
    }

    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * SWAY_SPEED) * SWAY_AMPLITUDE;
    }

    // R3F skipped its own render because of `RENDER_PRIORITY`, so the draw is
    // ours to issue. It is the same call on the same scene and camera R3F
    // would have made; issuing it here is what brings it inside the span.
    state.gl.render(state.scene, state.camera);

    // `delta` says only how long ago the previous frame was, which the
    // compositor decides. `performance.now() - startedAt` says what this frame
    // cost, which the device decides. The watchdog judges the second one.
    sampleFrame(watchdog, delta, performance.now() - startedAt, onTooSlow);
  }, RENDER_PRIORITY);

  return (
    <group ref={groupRef}>
      <primitive object={block.mesh} />
      <AssetBoundary>
        <Suspense fallback={null}>
          <HeroGeometry onLoad={adoptHeroGeometry} />
        </Suspense>
      </AssetBoundary>
    </group>
  );
});

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

/** Silent fallback: a decorative backdrop must never render an error card. */
const SilentFallback = () => null;

/**
 * True while the backdrop is worth rendering at all: the tab is visible AND the
 * host element is on screen. Flips at most a handful of times per session, so
 * holding it in React state costs nothing.
 *
 * A third condition — "nothing has suspended the backdrop" — is ANDed on at the
 * call site rather than folded in here, because it arrives from a module-level
 * signal (`backdrop-power.ts`) rather than from a DOM listener.
 */
function useRenderActive(hostRef: React.RefObject<HTMLDivElement | null>, enabled: boolean): boolean {
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    const host = hostRef.current;
    let visible = !document.hidden;
    let onScreen = true;
    const sync = () => setActive(visible && onScreen);

    const onVisibility = () => {
      visible = !document.hidden;
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let observer: IntersectionObserver | undefined;
    if (host && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        onScreen = entries[entries.length - 1].isIntersecting;
        sync();
      });
      observer.observe(host);
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    };
  }, [hostRef, enabled]);

  return active;
}

export default function MorphCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const saveData = useSaveData();
  /**
   * Viewport width, and nothing else. It no longer decides whether the scene
   * animates — it decides two things that really are about the viewport:
   * how many device pixels the full-screen canvas is worth (`dpr`), and how
   * the still is framed (`compact`, below).
   */
  const isSmallViewport = useIsMobile();
  /**
   * Flipped at most once per session, by the frame-time watchdog, from inside
   * the frame loop. This is the ONLY React state the loop can touch, and it
   * can only touch it once — `sampleFrame` latches before it calls back.
   */
  const [downgraded, setDowngraded] = useState(readSessionDowngrade);
  const onTooSlow = useCallback(() => {
    // `sampleFrame` latches before it calls this, so it arrives exactly once.
    sessionDowngraded = true;
    setDowngraded(true);
  }, []);

  // Animate by default; the three exits are a stated accessibility preference,
  // a stated data preference, and a measured failure to keep up.
  const animated = !prefersReducedMotion && !saveData && !downgraded;

  // A stable tuple, so R3F is not handed a new `dpr` array on every render.
  const dpr = useMemo<[number, number]>(
    () => [1, isSmallViewport ? MAX_DPR_SMALL : MAX_DPR],
    [isSmallViewport],
  );
  /**
   * Set while the projectiles demo (or anything else that opens a second WebGL
   * context) is on screen. On the `animated` path this drops `frameloop` to
   * `"never"` and the loop stops; on the still path `frameloop` is already
   * `"demand"`, which renders nothing at all unless something asks, so there is
   * no loop left to stop and the value is simply not consulted.
   */
  const suspended = useSyncExternalStore(
    subscribeBackdropPower,
    isBackdropSuspended,
    backdropNeverSuspendedOnServer,
  );
  const active = useRenderActive(hostRef, animated) && !suspended;

  // Memoized module-level probe; returns false only when WebGL2 definitively
  // failed. No WebGL means no backdrop, and the sections stand on their own.
  const supported = detectWebGL2();

  return (
    <div ref={hostRef} aria-hidden="true" style={HOST_STYLE}>
      {supported ? (
        <WebGLErrorBoundary FallbackComponent={SilentFallback}>
          <Canvas
            aria-hidden="true"
            style={CANVAS_STYLE}
            fallback={null}
            flat
            dpr={dpr}
            frameloop={animated ? (active ? 'always' : 'never') : 'demand'}
            // react-use-measure re-measures on scroll by default; this backdrop
            // is fixed, so that is pure overhead on the hottest event we have.
            resize={{ scroll: false }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
            camera={{ fov: CAMERA_FOV, near: 1, far: 400, position: [0, 0, CAMERA_Z] }}
          >
            {animated ? (
              <FitGroup>
                <MorphingBlocks
                  dim={isSmallViewport ? MORPH_DIM_SMALL : 1}
                  onTooSlow={onTooSlow}
                />
              </FitGroup>
            ) : (
              <StaticBlocks compact={isSmallViewport} />
            )}
          </Canvas>
        </WebGLErrorBoundary>
      ) : null}
    </div>
  );
}
