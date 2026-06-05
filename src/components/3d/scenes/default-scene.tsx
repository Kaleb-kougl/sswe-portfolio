'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Matrix4, Vector3 } from 'three';
import type { InstancedMesh, Mesh } from 'three';
import { useSceneGroup } from '../scene-orchestrator';

// ---------------------------------------------------------------------------
// Particles sub-component — 50 ambient floating spheres
// ---------------------------------------------------------------------------

const PARTICLE_COUNT = 50;
const SPAWN_RADIUS = 3;
const RESET_RADIUS = 4;
const RESPAWN_RADIUS = 0.5;
const DRIFT_SPEED = 0.15; // units / second outward multiplier

function Particles() {
  const meshRef = useRef<InstancedMesh>(null!);

  // Reusable math objects — allocated once, mutated in useFrame
  const tempMatrix = useMemo(() => new Matrix4(), []);
  const tempPosition = useMemo(() => new Vector3(), []);

  // Scatter particles randomly inside a sphere on mount
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.cbrt(Math.random()) * SPAWN_RADIUS;

      tempPosition.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );

      tempMatrix.makeTranslation(tempPosition.x, tempPosition.y, tempPosition.z);
      mesh.setMatrixAt(i, tempMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [tempMatrix, tempPosition]);

  // Drift particles outward each frame; reset when they escape the boundary
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const driftFactor = 1 + DRIFT_SPEED * delta;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      mesh.getMatrixAt(i, tempMatrix);
      tempPosition.setFromMatrixPosition(tempMatrix);

      // Drift outward from center
      tempPosition.multiplyScalar(driftFactor);

      // Reset if beyond boundary
      if (tempPosition.length() > RESET_RADIUS) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.cbrt(Math.random()) * RESPAWN_RADIUS;

        tempPosition.set(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi),
        );
      }

      tempMatrix.makeTranslation(tempPosition.x, tempPosition.y, tempPosition.z);
      mesh.setMatrixAt(i, tempMatrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]}>
      <sphereGeometry args={[0.02, 6, 6]} />
      <meshBasicMaterial color="#89b4fa" transparent opacity={0.6} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------
// Wireframe icosahedron — rotates slowly
// ---------------------------------------------------------------------------

function WireframeIcosahedron() {
  const meshRef = useRef<Mesh>(null!);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.y += 0.3 * delta;
    mesh.rotation.x += 0.1 * delta;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.2, 1]} />
      <meshBasicMaterial wireframe color="#89b4fa" />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// DefaultScene — the fallback scene for unrecognised file IDs
// ---------------------------------------------------------------------------

export default function DefaultScene() {
  const groupRef = useSceneGroup('default');

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.3} />
      <WireframeIcosahedron />
      <Particles />
    </group>
  );
}
