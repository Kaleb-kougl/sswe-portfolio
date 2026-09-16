'use client';
'use no memo';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  DynamicDrawUsage,
  Object3D,
  Vector3,
  type InstancedMesh as InstancedMeshType,
} from 'three';

import { DEMO_PALETTE } from './palette';
import { PATTERN_REGISTRY, releaseSpawnData, type BulletSpawnData } from './patterns';
import type { ProjectilePattern } from './types';

/**
 * bullets — every projectile on screen, as ONE `InstancedMesh`: one geometry,
 * one material, one draw call, however many thousand are in flight.
 *
 * RECOVERED, NOT REWRITTEN
 * ------------------------
 * This is `src/components/3d/scenes/combat-system-bullets.tsx` from the
 * `ats-remix-ideas` branch. The simulation — the pool, the delay/life/fade
 * bookkeeping, the single batched buffer flush at the end of the loop — is the
 * original. What changed is where it reads its settings from, and one hot loop:
 *
 *   1. CONTROLS. The original called `useEngineStore.getState()` inside
 *      `useFrame` to read `combatSystemPattern` and `combatSystemFireRate`.
 *      Zustand is gone and is not coming back, so the same values now arrive
 *      through `controls`, a plain mutable object owned by the demo's React
 *      controls. The imperative discipline is the point and it is unchanged:
 *      `useFrame` reads `controls.current`, never React state, so moving the
 *      fire-rate slider re-renders exactly one `<input>` and nothing inside the
 *      canvas.
 *
 *   2. REDUCED MOTION. The original read `useReducedMotion()` itself and, when
 *      set, spawned one still arrangement and returned forever. That decision
 *      now belongs to the wrapper (which also has to label a Start button), so
 *      it arrives as `running: false` plus `stillWhenIdle`. The behaviour a
 *      reduced-motion visitor sees is the same: a frozen arrangement, no
 *      animation, until they ask for one.
 *
 *   3. SLOT SEARCH. The original restarted its free-slot scan at index 0 for
 *      every projectile in a burst — O(burst x pool), which is 300 x 4000
 *      iterations on a full pool, every burst. A rolling cursor makes that one
 *      pass. Same slots, same order, no allocation; just not quadratic.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Live count, read by the telemetry readout outside the canvas. */
export const activeBulletCount = { current: 0 };
const ROTATION_SPEED = 0.3; // radians/sec for source position orbit
const BOUNDS_LIMIT = 25; // must match fog far plane
const SPAWN_CENTER_Y = 3; // bullets spawn from center at this height

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulletState {
  active: boolean;
  position: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
  delay: number;
  life: number;
}

/**
 * The mutable control surface. Written by React event handlers, read inside
 * `useFrame`. Never a dependency, never state — that is the whole contract.
 */
export interface ProjectileControls {
  pattern: ProjectilePattern;
  /** Bursts per second. */
  fireRate: number;
  running: boolean;
}

interface BulletManagerProps {
  controls: RefObject<ProjectileControls>;
  /** Size of the CPU-side state array and the instance buffers. */
  maxBullets?: number;
  /** Hard cap on how many projectiles a single burst may place. */
  burstCap?: number;
  /**
   * When paused and nothing has ever run, draw one frozen arrangement of the
   * selected pattern instead of an empty arena. This is the reduced-motion
   * path: something to look at, with no motion in it.
   */
  stillWhenIdle?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulletManager({
  controls,
  maxBullets = 2000,
  burstCap,
  stillWhenIdle = false,
}: BulletManagerProps) {
  const meshRef = useRef<InstancedMeshType | null>(null);
  const bulletsRef = useRef<BulletState[]>([]);
  const timeAccum = useRef(0);
  const sourceRotation = useRef(0);
  const nextSlot = useRef(0);
  /** Which pattern the frozen arrangement currently shows, if any. */
  const stillPattern = useRef<ProjectilePattern | null>(null);
  /** Once the simulation has actually run, "paused" means freeze, not respawn. */
  const hasRun = useRef(false);

  // --- Scratch objects (allocated ONCE, reused every frame) ----------------
  const { _dummy, _tempColor, _sourcePos } = useMemo(
    () => ({
      _dummy: new Object3D(),
      _tempColor: new Color(),
      _sourcePos: new Vector3(),
    }),
    [],
  );

  // --- Pool initialization (mount only) ------------------------------------
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    activeBulletCount.current = 0;
    nextSlot.current = 0;
    stillPattern.current = null;
    hasRun.current = false;
    if (maxBullets <= 0 || Number.isNaN(maxBullets)) return;

    // Allocate the CPU-side bullet state array ONCE
    const pool: BulletState[] = new Array(maxBullets);
    for (let i = 0; i < maxBullets; i++) {
      pool[i] = {
        active: false,
        position: new Vector3(),
        velocity: new Vector3(),
        acceleration: new Vector3(),
        delay: 0,
        life: 0,
      };
    }
    bulletsRef.current = pool;

    // GPU buffer hint — tells the driver we'll update every frame
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);

    // Prevent first-frame flash: park every instance off-screen + black
    for (let i = 0; i < maxBullets; i++) {
      _dummy.position.set(0, -999, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      mesh.setColorAt(i, _tempColor.set(0x000000));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [maxBullets, _dummy, _tempColor]);

  // --- Internal spawn function (zero-allocation) ---------------------------
  const spawnBullets = useMemo(() => {
    return (
      mesh: InstancedMeshType,
      bullets: BulletState[],
      sourcePos: Vector3,
      spawnData: BulletSpawnData[],
      zeroVelocity: boolean,
      cap?: number,
    ) => {
      let spawned = 0;
      for (let d = 0; d < spawnData.length; d++) {
        if (cap !== undefined && spawned >= cap) break;

        // Find an inactive slot, resuming where the last one left off.
        let slotIdx = -1;
        for (let step = 0; step < bullets.length; step++) {
          const i = (nextSlot.current + step) % bullets.length;
          if (!bullets[i].active) {
            slotIdx = i;
            nextSlot.current = (i + 1) % bullets.length;
            break;
          }
        }
        if (slotIdx === -1) break; // pool exhausted

        const data = spawnData[d];
        const bullet = bullets[slotIdx];

        bullet.active = true;
        bullet.position.copy(sourcePos).add(data.offset);
        bullet.delay = data.delay;
        bullet.life = data.life;

        if (zeroVelocity) {
          bullet.velocity.set(0, 0, 0);
          bullet.acceleration.set(0, 0, 0);
        } else {
          bullet.velocity.copy(data.velocity);
          bullet.acceleration.copy(data.acceleration);
        }

        // Zero-allocation color set — reuse _tempColor scratch object
        _tempColor.set(data.color ?? DEMO_PALETTE.orange);
        mesh.setColorAt(slotIdx, _tempColor);

        // If no delay, position immediately; otherwise hide at -999
        if (bullet.delay <= 0) {
          _dummy.position.copy(bullet.position);
          _dummy.scale.set(1, 1, 1);
          _dummy.updateMatrix();
          mesh.setMatrixAt(slotIdx, _dummy.matrix);
        } else {
          _dummy.position.set(0, -999, 0);
          _dummy.scale.set(0, 0, 0);
          _dummy.updateMatrix();
          mesh.setMatrixAt(slotIdx, _dummy.matrix);
        }

        spawned++;
      }
      activeBulletCount.current += spawned;
    };
  }, [_dummy, _tempColor]);

  /** Park every instance off screen and reset the CPU-side state. */
  const clearField = useMemo(() => {
    return (mesh: InstancedMeshType, bullets: BulletState[]) => {
      for (let i = 0; i < bullets.length; i++) {
        bullets[i].active = false;
        _dummy.position.set(0, -999, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      activeBulletCount.current = 0;
      nextSlot.current = 0;
    };
  }, [_dummy]);

  // --- Frame loop ----------------------------------------------------------
  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dt = Math.min(delta, 0.1); // clamp to prevent spiral-of-death
    const bullets = bulletsRef.current;
    if (bullets.length === 0) return;

    // Imperative read — no reactive subscription inside useFrame.
    const { pattern, fireRate, running } = controls.current;
    const patternFactory = PATTERN_REGISTRY[pattern];
    if (!patternFactory) return;

    // ---- Paused ----
    if (!running) {
      // Nothing has run yet: draw the pattern once, frozen, so a
      // reduced-motion visitor still sees the shape they picked.
      if (stillWhenIdle && !hasRun.current && stillPattern.current !== pattern) {
        stillPattern.current = pattern;
        clearField(mesh, bullets);
        _sourcePos.set(0, SPAWN_CENTER_Y, 0);
        const spawnData = patternFactory();
        spawnBullets(mesh, bullets, _sourcePos, spawnData, true, burstCap);
        releaseSpawnData(spawnData);

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      return; // frozen: no timer, no rotation, no physics
    }

    hasRun.current = true;
    stillPattern.current = null;

    // ---- Auto-fire timer ----
    timeAccum.current += dt;
    const fireInterval = 1 / fireRate;

    if (timeAccum.current >= fireInterval) {
      timeAccum.current -= fireInterval;

      // Orbit source position around Y axis
      sourceRotation.current += ROTATION_SPEED * fireInterval;
      const rot = sourceRotation.current;
      _sourcePos.set(Math.cos(rot) * 2, SPAWN_CENTER_Y, Math.sin(rot) * 2);

      const spawnData = patternFactory();
      spawnBullets(mesh, bullets, _sourcePos, spawnData, false, burstCap);
      releaseSpawnData(spawnData);
    }

    // ---- Update all active bullets ----
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (!b.active) continue;

      // Handle delay countdown
      if (b.delay > 0) {
        b.delay -= dt;
        if (b.delay > 0) {
          // Still waiting — keep hidden
          continue;
        }
        // Delay just ended — fall through to normal update
      }

      // Frame-rate independent physics
      b.velocity.addScaledVector(b.acceleration, dt);
      b.position.addScaledVector(b.velocity, dt);
      b.life -= dt;

      // Deactivate: lifetime expired or out of bounds
      if (
        b.life <= 0 ||
        Math.abs(b.position.x) > BOUNDS_LIMIT ||
        Math.abs(b.position.y) > BOUNDS_LIMIT ||
        Math.abs(b.position.z) > BOUNDS_LIMIT
      ) {
        b.active = false;
        activeBulletCount.current--;
        _dummy.position.set(0, -999, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      // Fade: scale down as life approaches 0
      const fade = Math.min(b.life, 1.0);
      _dummy.position.copy(b.position);
      _dummy.scale.set(fade, fade, fade);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }

    // ---- Batch GPU buffer updates (ONCE after full loop, never per-bullet) ----
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  // --- JSX -----------------------------------------------------------------
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, maxBullets]} frustumCulled={false}>
      <sphereGeometry args={[0.12, 6, 6]} />
      <meshBasicMaterial fog={false} />
    </instancedMesh>
  );
}
