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
 * Degradation, in order:
 *   no WebGL2  -> renders nothing at all (it is decoration; failure is silent)
 *   touch      -> a still hero arrangement, `frameloop="demand"`, no listeners
 *   reduced    -> same still arrangement
 *   tab hidden -> `frameloop="never"`, the render loop stops entirely
 */

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Vertical FOV and fixed camera distance used to frame the mockup artboard. */
const CAMERA_FOV = 35;
const CAMERA_Z = 80;
/** Never pay for more than 1.5x device pixels — this is background decoration. */
const MAX_DPR = 1.5;
/** Exponential approach rate of rendered progress toward scroll progress. */
const MORPH_SMOOTHING = 5.5;
/** Below this delta the instance buffers are left untouched for the frame. */
const MORPH_EPSILON = 0.0002;
/** Phone still: how much of the viewport the lone glyph is allowed to take. */
const STILL_WIDTH_FRACTION = 0.55;
const STILL_HEIGHT_FRACTION = 0.3;
/** Phone still: alpha multiplier, so the watermark never fights body copy. */
const STILL_DIM = 0.3;
/** Amplitude/speed of the idle sway that keeps the backdrop from feeling dead. */
const SWAY_AMPLITUDE = 0.035;
const SWAY_SPEED = 0.16;

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
 * `compact` is the phone case. There the page is a single column, so a
 * full-strength backdrop would sit directly behind body copy; the glyph is
 * framed on its own, centered, and dimmed to a watermark instead.
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

/** The live arrangement: scroll-driven, imperative, zero re-renders. */
const MorphingBlocks = memo(function MorphingBlocks() {
  const block = useBlockMesh();
  const groupRef = useRef<Group>(null);
  const progress = useMemo<ScrollProgress>(() => ({ target: 0 }), []);
  const rendered = useRef(-1);
  const adoptHeroGeometry = useCallback(
    (geometry: BufferGeometry) => {
      adoptGeometry(block, geometry);
    },
    [block],
  );

  useEffect(() => startScrollTracking(progress), [progress]);

  useLayoutEffect(() => {
    writeBlocks(block, SCRATCH, 0, 0, 0);
  }, [block]);

  useFrame((state, delta) => {
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
      writeBlocks(block, SCRATCH, a, a + 1, f * f * (3 - 2 * f));
      rendered.current = next;
    }

    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * SWAY_SPEED) * SWAY_AMPLITUDE;
    }
  });

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
  const isMobile = useIsMobile();
  const animated = !prefersReducedMotion && !isMobile;
  const active = useRenderActive(hostRef, animated);

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
            dpr={[1, MAX_DPR]}
            frameloop={animated ? (active ? 'always' : 'never') : 'demand'}
            // react-use-measure re-measures on scroll by default; this backdrop
            // is fixed, so that is pure overhead on the hottest event we have.
            resize={{ scroll: false }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
            camera={{ fov: CAMERA_FOV, near: 1, far: 400, position: [0, 0, CAMERA_Z] }}
          >
            {animated ? (
              <FitGroup>
                <MorphingBlocks />
              </FitGroup>
            ) : (
              <StaticBlocks compact={isMobile} />
            )}
          </Canvas>
        </WebGLErrorBoundary>
      ) : null}
    </div>
  );
}
