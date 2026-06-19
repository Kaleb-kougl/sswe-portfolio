'use client';
'use no memo';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Object3D,
  Color,
  Vector3,
  DynamicDrawUsage,
  type InstancedMesh as InstancedMeshType,
} from 'three';
import { useEngineStore } from '@/store/useEngineStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { PATTERN_REGISTRY, releaseSpawnData } from './combat-system-patterns';
import type { CombatSystemPattern } from './combat-system-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const activeBulletCount = { current: 0 };
const ROTATION_SPEED = 0.3; // radians/sec for source position orbit
const BOUNDS_LIMIT = 25; // must match fog far plane
const SPAWN_CENTER_Y = 3; // bullets spawn from center at this height
const REDUCED_MOTION_MAX = 200; // bullet cap under reduced motion

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

interface BulletManagerProps {
  maxBullets?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function BulletManager({ maxBullets = 2000 }: BulletManagerProps) {
  const meshRef = useRef<InstancedMeshType | null>(null);
  const bulletsRef = useRef<BulletState[]>([]);
  const timeAccum = useRef(0);
  const sourceRotation = useRef(0);
  const reducedMotionSpawned = useRef(false);

  // Accessibility: called at component top level (never inside useFrame)
  const prefersReduced = useReducedMotion();

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
    if (maxBullets <= 0 || isNaN(maxBullets)) return;
    
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
    mesh.instanceColor!.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxBullets]);

  // --- Internal spawn function (zero-allocation) ---------------------------
  const spawnBullets = useMemo(() => {
    return (
      mesh: InstancedMeshType,
      bullets: BulletState[],
      sourcePos: Vector3,
      spawnData: ReturnType<(typeof PATTERN_REGISTRY)[CombatSystemPattern]>,
      zeroVelocity: boolean,
      cap?: number,
    ) => {
      let spawned = 0;
      for (let d = 0; d < spawnData.length; d++) {
        if (cap !== undefined && spawned >= cap) break;

        // Find an inactive slot
        let slotIdx = -1;
        for (let i = 0; i < bullets.length; i++) {
          if (!bullets[i].active) {
            slotIdx = i;
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
        _tempColor.set(data.color ?? 0xff3333);
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

  // --- Frame loop ----------------------------------------------------------
  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dt = Math.min(delta, 0.1); // clamp to prevent spiral-of-death
    const bullets = bulletsRef.current;

    // Imperative Zustand read — no reactive subscription inside useFrame
    const { combatSystemPattern, combatSystemFireRate } = useEngineStore.getState();

    // ---- Reduced motion: spawn once, skip timer & rotation ----
    if (prefersReduced) {
      if (!reducedMotionSpawned.current) {
        reducedMotionSpawned.current = true;
        _sourcePos.set(0, SPAWN_CENTER_Y, 0);
        const patternFactory = PATTERN_REGISTRY[combatSystemPattern as keyof typeof PATTERN_REGISTRY];
        if (!patternFactory) return;
        const spawnData = patternFactory();
        spawnBullets(mesh, bullets, _sourcePos, spawnData, true, REDUCED_MOTION_MAX);
        releaseSpawnData(spawnData);

        // Flush the one-time update
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      return; // no animation under reduced motion
    }

    // Reset flag if user toggles reduced motion off
    reducedMotionSpawned.current = false;

    // ---- Auto-fire timer ----
    timeAccum.current += dt;
    const fireInterval = 1 / combatSystemFireRate;

    if (timeAccum.current >= fireInterval) {
      timeAccum.current -= fireInterval;

      // Orbit source position around Y axis
      sourceRotation.current += ROTATION_SPEED * fireInterval;
      const rot = sourceRotation.current;
      _sourcePos.set(
        Math.cos(rot) * 2,
        SPAWN_CENTER_Y,
        Math.sin(rot) * 2,
      );

      const patternFactory = PATTERN_REGISTRY[combatSystemPattern as keyof typeof PATTERN_REGISTRY];
      if (!patternFactory) return;
      const spawnData = patternFactory();
      spawnBullets(mesh, bullets, _sourcePos, spawnData, false);
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
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, maxBullets]}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.12, 6, 6]} />
      <meshBasicMaterial fog={false} />
    </instancedMesh>
  );
}
