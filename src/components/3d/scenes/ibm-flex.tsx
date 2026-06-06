'use client';
'use no memo';

import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Vector3, Matrix4, MathUtils, type InstancedMesh, type MeshStandardMaterial } from 'three';
import { useEngineStore } from '@/store/useEngineStore';
import { useSceneGroup } from '../scene-orchestrator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PARTICLE_COUNT = 500;
const CHAOS_RADIUS = 4;
const DIAMOND_RADIUS = 0.8;
const BUNDLE_MIN = 0.3;
const BUNDLE_MAX = 6.0;
const BUNDLE_RANGE = BUNDLE_MAX - BUNDLE_MIN;
const DAMP_FACTOR = 3; // speed of the damp interpolation

// ---------------------------------------------------------------------------
// Module-scope reusable objects — NEVER allocate inside useFrame
// ---------------------------------------------------------------------------
const _color = new Color();
const _colorStart = new Color('#f38ba8'); // red  (6.0 MB)
const _colorEnd = new Color('#a6e3a1');   // green (0.3 MB)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a random point inside a sphere of given radius. */
function randomSpherePoint(radius: number, out: Vector3): Vector3 {
  // Use rejection sampling for uniform distribution inside a sphere
  let x: number, y: number, z: number, lenSq: number;
  do {
    x = (Math.random() * 2 - 1);
    y = (Math.random() * 2 - 1);
    z = (Math.random() * 2 - 1);
    lenSq = x * x + y * y + z * z;
  } while (lenSq > 1 || lenSq === 0);

  return out.set(x * radius, y * radius, z * radius);
}

/**
 * Build target positions for a diamond / octahedron shape.
 * Distributes `count` points roughly evenly across the 8 faces of a regular
 * octahedron, then scales them to `radius`.
 */
function buildDiamondTargets(count: number, radius: number): Float32Array {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Pick a random face (uniformly distributed on the octahedron surface)
    // An octahedron face has vertices at ±axis endpoints.
    // Use barycentric coords on a random face.
    const faceIdx = Math.floor(Math.random() * 8);
    const sx = faceIdx & 1 ? 1 : -1;
    const sy = faceIdx & 2 ? 1 : -1;
    const sz = faceIdx & 4 ? 1 : -1;

    // Random barycentric coordinates on a triangle
    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;

    // The three vertices of each octahedron face are axis-aligned unit vectors
    // scaled by the sign. Map barycentric coords to cartesian.
    const x = sx * u;
    const y = sy * v;
    const z = sz * w;

    positions[i * 3] = x * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = z * radius;
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IbmFlexScene() {
  const groupRef = useSceneGroup('ibm-staff-swe');
  const meshRef = useRef<InstancedMesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);

  // Reusable per-frame temporaries (stable references via useMemo)
  const tempMatrix = useMemo(() => new Matrix4(), []);
  const tempPosition = useMemo(() => new Vector3(), []);

  // Store initial chaotic positions so they persist across frames
  const chaoticPositions = useRef<Float32Array | null>(null);

  // Pre-computed diamond target positions
  const diamondTargets = useMemo(
    () => buildDiamondTargets(PARTICLE_COUNT, DIAMOND_RADIUS),
    []
  );

  // Current interpolated positions — written every frame via damp
  const currentPositions = useRef<Float32Array>(
    new Float32Array(PARTICLE_COUNT * 3)
  );

  // Track the smoothed t value for framerate-independent damping
  const smoothedT = useRef(0);

  // --- Initialise chaotic positions + instancedMesh matrices ---
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const chaos = new Float32Array(PARTICLE_COUNT * 3);
    const pos = new Vector3();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      randomSpherePoint(CHAOS_RADIUS, pos);

      chaos[i * 3] = pos.x;
      chaos[i * 3 + 1] = pos.y;
      chaos[i * 3 + 2] = pos.z;

      // Also seed current positions at chaotic start
      currentPositions.current[i * 3] = pos.x;
      currentPositions.current[i * 3 + 1] = pos.y;
      currentPositions.current[i * 3 + 2] = pos.z;

      // Set initial instance matrices
      const mat = new Matrix4();
      mat.setPosition(pos.x, pos.y, pos.z);
      mesh.setMatrixAt(i, mat);
    }

    chaoticPositions.current = chaos;
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // --- Per-frame animation ---
  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    const chaos = chaoticPositions.current;
    if (!mesh || !chaos) return;

    // Read transient state imperatively (zero re-renders)
    const bundleSize = useEngineStore.getState().targetBundleSize;

    // Normalised progress: 0 at 6.0 MB → 1 at 0.3 MB
    const rawT = Math.max(0, Math.min(1, 1 - (bundleSize - BUNDLE_MIN) / BUNDLE_RANGE));

    // Damp the transition value for smooth interpolation
    smoothedT.current = MathUtils.damp(
      smoothedT.current,
      rawT,
      DAMP_FACTOR,
      delta
    );
    const t = smoothedT.current;

    const cur = currentPositions.current;
    const targets = diamondTargets;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // Lerp from chaotic → diamond based on smoothed t
      const tx = chaos[i3] + (targets[i3] - chaos[i3]) * t;
      const ty = chaos[i3 + 1] + (targets[i3 + 1] - chaos[i3 + 1]) * t;
      const tz = chaos[i3 + 2] + (targets[i3 + 2] - chaos[i3 + 2]) * t;

      // Damp current position toward the lerped target for extra smoothness
      cur[i3] = MathUtils.damp(cur[i3], tx, DAMP_FACTOR * 2, delta);
      cur[i3 + 1] = MathUtils.damp(cur[i3 + 1], ty, DAMP_FACTOR * 2, delta);
      cur[i3 + 2] = MathUtils.damp(cur[i3 + 2], tz, DAMP_FACTOR * 2, delta);

      tempPosition.set(cur[i3], cur[i3 + 1], cur[i3 + 2]);
      tempMatrix.makeTranslation(tempPosition.x, tempPosition.y, tempPosition.z);
      mesh.setMatrixAt(i, tempMatrix);
    }

    mesh.instanceMatrix.needsUpdate = true;

    // --- Color lerp ---
    if (materialRef.current) {
      _color.copy(_colorStart).lerp(_colorEnd, t);
      materialRef.current.color.copy(_color);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Default lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1} />

      <instancedMesh ref={meshRef} args={[null!, null!, PARTICLE_COUNT]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial ref={materialRef} />
      </instancedMesh>
    </group>
  );
}
