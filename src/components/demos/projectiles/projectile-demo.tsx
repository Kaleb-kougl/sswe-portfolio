'use client';
'use no memo';

import { memo, useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';

import { useReducedMotion } from '@/hooks/useReducedMotion';

import { BulletManager, activeBulletCount, type ProjectileControls } from './bullets';
import { DEMO_PALETTE } from './palette';
import { PROJECTILE_PATTERNS, PROJECTILE_PATTERN_LABELS, type ProjectilePattern } from './types';

/**
 * projectile-demo — the live bullet-pattern demo, canvas and controls.
 *
 * This replaces `combat-system-flex.tsx`, which could not be recovered as-is:
 * it rendered into the retired IDE's `scene-orchestrator` (one shared Canvas,
 * with `useSceneGroup` toggling scene visibility) and read its pool size from
 * the retired Zustand store. The arena inside — fog, the two lights, the dark
 * floor and the lime wireframe grid — is that file's, unchanged; what is new is
 * that it owns its own `<Canvas>` and its own three pieces of state.
 *
 * HOW THE CONTROLS ARE DECOUPLED
 * ------------------------------
 * `controlsRef` is a plain mutable object. Every handler writes to it FIRST and
 * then mirrors the value into React state, which exists only so the `<select>`,
 * the `<input type="range">` and the button label re-render. `useFrame` reads
 * `controlsRef.current` and nothing else, so dragging the fire-rate slider
 * never re-renders anything inside the canvas — the exact discipline the
 * original had with `useEngineStore.getState()`, minus the store.
 *
 * `<Stage>` is `memo`'d over that stable ref for the same reason: a keystroke in
 * the controls must not reconcile the `<Canvas>`.
 *
 * REDUCED MOTION
 * --------------
 * The original capped itself at 200 instances and spawned one frozen
 * arrangement, forever. Same cap and same frozen arrangement here, with one
 * addition the original could not have: a Start button, so a visitor who
 * prefers less motion can still choose to watch it run.
 */

/** Instance pool, and the hard cap on a single burst. */
const FULL_MOTION_POOL = 4000;
const REDUCED_MOTION_MAX = 200; // the original's cap, kept

const DEFAULT_FIRE_RATE = 4;
const MIN_FIRE_RATE = 1;
const MAX_FIRE_RATE = 10;

const CANVAS_STYLE: React.CSSProperties = { width: '100%', height: '100%' };

// ---------------------------------------------------------------------------
// The canvas
// ---------------------------------------------------------------------------

/**
 * Asks for a couple of frames whenever the thing on screen should change while
 * the loop is on `"demand"`.
 *
 * A paused demo runs `frameloop="demand"`, so `useFrame` is not called at all
 * unless something asks — which is the point, but it also means the one frozen
 * arrangement a reduced-motion visitor is meant to see would never be drawn.
 * `token` changes when the pattern or the run state does; the second, deferred
 * pump covers the case where the instance pool was still being allocated on the
 * first one.
 */
function DemandPump({ token }: { token: string }) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    invalidate(2);
    const id = requestAnimationFrame(() => invalidate(2));
    return () => cancelAnimationFrame(id);
  }, [token, invalidate]);

  return null;
}

interface StageProps {
  controls: RefObject<ProjectileControls>;
  maxBullets: number;
  burstCap?: number;
  stillWhenIdle: boolean;
  /**
   * `"always"` while it runs, `"demand"` while it is paused. A paused demo has
   * nothing to redraw, and leaving the loop running would burn a frame's worth
   * of GPU 60 times a second to show the same picture — the same reasoning that
   * stops the page backdrop while this dialog is open.
   */
  frameloop: 'always' | 'demand';
  /** Changes whenever the paused picture should be redrawn. */
  stillToken: string;
}

const Stage = memo(function Stage({
  controls,
  maxBullets,
  burstCap,
  stillWhenIdle,
  frameloop,
  stillToken,
}: StageProps) {
  return (
    <Canvas
      style={CANVAS_STYLE}
      frameloop={frameloop}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 50, near: 0.1, far: 100, position: [0, 4, 12] }}
    >
      <color attach="background" args={[DEMO_PALETTE.ink]} />
      {/* Far plane matches BOUNDS_LIMIT in bullets.tsx, so projectiles are
          fully fogged out by the time they are culled. */}
      <fog attach="fog" args={[DEMO_PALETTE.ink, 5, 25]} />

      <ambientLight args={[0x404040, 0.5]} />
      {/* Intensity is raised from the original's 1: three dropped legacy
          lighting units in r155 and the floor was black at the old value. */}
      <pointLight position={[0, 5, 0]} args={[DEMO_PALETTE.lime, 40, 20]} />

      {/* Floor plane — static, disable auto matrix updates */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        ref={(m) => {
          if (m) {
            m.matrixAutoUpdate = false;
            m.updateMatrix();
          }
        }}
      >
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color={DEMO_PALETTE.ink} />
      </mesh>

      {/* Grid overlay — static wireframe */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        ref={(m) => {
          if (m) {
            m.matrixAutoUpdate = false;
            m.updateMatrix();
          }
        }}
      >
        <planeGeometry args={[20, 20, 20, 20]} />
        <meshBasicMaterial wireframe color={DEMO_PALETTE.lime} transparent opacity={0.15} />
      </mesh>

      <BulletManager
        controls={controls}
        maxBullets={maxBullets}
        burstCap={burstCap}
        stillWhenIdle={stillWhenIdle}
      />
      <DemandPump token={stillToken} />
    </Canvas>
  );
});

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

/**
 * The live instance count, written straight to the DOM node.
 *
 * `activeBulletCount` changes every frame; routing it through React state would
 * re-render this subtree 60 times a second to update one number. A 200ms
 * interval and one `textContent` write is the whole readout.
 *
 * BOTH HALVES OF THIS LINE ARE MEASURED, and the reason to say so is that one
 * of them is a string literal: "1 draw call" would go on reading "1 draw call"
 * after a regression that made it four thousand. `e2e/projectile-demo.spec.ts`
 * holds all three claims down:
 *
 *   - the count, read back out of this DOM node and required above zero;
 *   - the draw call, counted at the WebGL entry point on this canvas alone —
 *     `draw*Instanced` is the field and only the field, since the floor and
 *     the grid are ordinary meshes — and measured at exactly one per frame,
 *     out of three the canvas issues in total;
 *   - and the projectiles themselves, as pixels, by diffing a frame against
 *     the same frame with the field's draw call suppressed.
 *
 * That last one is not belt-and-braces. `mesh.count` is the POOL size and a
 * dead instance is parked off screen at scale zero rather than removed, so the
 * field issues its one draw identically whether it is full or empty: a draw
 * call is evidence the renderer ran, and no evidence at all that this number
 * describes anything a visitor can see.
 */
function InstanceReadout() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const write = () => {
      if (ref.current) ref.current.textContent = String(activeBulletCount.current);
    };
    write();
    const id = window.setInterval(write, 200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <p className="projectile-demo__readout" aria-live="off">
      <span ref={ref}>0</span> instances · 1 draw call
    </p>
  );
}

// ---------------------------------------------------------------------------
// The demo
// ---------------------------------------------------------------------------

export function ProjectileDemo() {
  const prefersReducedMotion = useReducedMotion();
  const patternId = useId();
  const rateId = useId();

  const controls = useRef<ProjectileControls>({
    pattern: 'fibonacciSphere',
    fireRate: DEFAULT_FIRE_RATE,
    running: !prefersReducedMotion,
  });

  // Mirrors of the above, for rendering the controls. Never read in `useFrame`.
  const [pattern, setPattern] = useState<ProjectilePattern>('fibonacciSphere');
  const [fireRate, setFireRate] = useState(DEFAULT_FIRE_RATE);

  /**
   * `null` means "the visitor has not pressed anything yet", so the default can
   * follow the motion preference — and go on following it if the OS setting
   * changes mid-session. Derived rather than stored, so there is no effect
   * writing state back into state.
   *
   * Once they HAVE pressed Start, that choice wins: an explicit request to see
   * the animation is exactly the escape hatch the preference is supposed to
   * leave room for.
   */
  const [startIntent, setStartIntent] = useState<boolean | null>(null);
  const running = prefersReducedMotion ? startIntent === true : startIntent !== false;

  // The control object is the external system this component synchronises with.
  useEffect(() => {
    controls.current.running = running;
  }, [running]);

  const onPattern = useCallback((next: ProjectilePattern) => {
    controls.current.pattern = next;
    setPattern(next);
  }, []);

  const onFireRate = useCallback((next: number) => {
    controls.current.fireRate = next;
    setFireRate(next);
  }, []);

  const onToggleRunning = useCallback(() => {
    // Written through immediately so the very next frame sees it; the effect
    // above is the backstop for a change that comes from the OS instead.
    const next = !controls.current.running;
    controls.current.running = next;
    setStartIntent(next);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="projectiles-stage"
        role="img"
        aria-label={`A dark arena with ${PROJECTILE_PATTERN_LABELS[pattern]} projectiles fired from its centre, drawn as one GPU-instanced mesh.`}
        className="projectile-demo__stage"
      >
        <Stage
          controls={controls}
          maxBullets={prefersReducedMotion ? REDUCED_MOTION_MAX : FULL_MOTION_POOL}
          burstCap={prefersReducedMotion ? REDUCED_MOTION_MAX : undefined}
          stillWhenIdle={prefersReducedMotion}
          frameloop={running ? 'always' : 'demand'}
          stillToken={`${pattern}:${running}`}
        />
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={patternId}
            className="label-mono"
          >
            Pattern
          </label>
          <select
            id={patternId}
            value={pattern}
            onChange={(event) => onPattern(event.target.value as ProjectilePattern)}
            className="projectile-demo__select"
          >
            {PROJECTILE_PATTERNS.map((key) => (
              <option key={key} value={key}>
                {PROJECTILE_PATTERN_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={rateId}
            className="label-mono"
          >
            Bursts / sec — {fireRate}
          </label>
          <input
            id={rateId}
            type="range"
            min={MIN_FIRE_RATE}
            max={MAX_FIRE_RATE}
            step={1}
            value={fireRate}
            onChange={(event) => onFireRate(Number(event.target.value))}
            className="projectile-demo__range"
          />
        </div>

        <button
          type="button"
          onClick={onToggleRunning}
          aria-pressed={running}
          className="button button--rounded button--primary button--sm px-5"
        >
          {running ? 'Pause' : 'Start'}
        </button>

        <div className="ml-auto flex flex-col items-end gap-1.5">
          <InstanceReadout />
          {prefersReducedMotion ? (
            <p className="projectile-demo__note">
              Paused because your system asks for reduced motion.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ProjectileDemo;
