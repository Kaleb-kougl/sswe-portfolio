'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Mesh, type MeshStandardMaterial } from 'three';
import { useEngineStore } from '@/store/useEngineStore';
import { useSceneGroup } from '../scene-orchestrator';

// --- Reusable color objects (module scope — never allocate in useFrame) ---
const COLOR_PATROL = new Color('#a6e3a1');
const COLOR_AGGRO = new Color('#f38ba8');
const COLOR_FLEE = new Color('#f9e2af');
const COLOR_DEFAULT_FLOOR = new Color('#313244');

const AI_COLORS: Record<string, Color> = {
  Patrol: COLOR_PATROL,
  Aggro: COLOR_AGGRO,
  Flee: COLOR_FLEE,
};

/**
 * HammerBall Flex Scene — Floor plane + 2 AI orb spheres
 *
 * AI orbs change color and movement pattern based on forceAiState.
 * NavMesh wireframe grid toggled by showNavMesh.
 * All state reads are imperative via useEngineStore.getState().
 */
export function HammerBallFlex() {
  const groupRef = useSceneGroup('hammerball');

  // Mesh refs for AI orbs
  const orb1Ref = useRef<Mesh>(null);
  const orb2Ref = useRef<Mesh>(null);
  const mat1Ref = useRef<MeshStandardMaterial>(null);
  const mat2Ref = useRef<MeshStandardMaterial>(null);
  const navMeshRef = useRef<Mesh>(null);

  // Animation time accumulator (module-level would be shared across instances)
  const timeRef = useRef(0);

  // Reusable temp color for lerping
  const tempColor = useMemo(() => new Color(), []);

  useFrame((_, delta) => {
    const { forceAiState, showNavMesh } = useEngineStore.getState();

    timeRef.current += delta;
    const t = timeRef.current;

    // --- Update orb colors (lerp for smooth transition) ---
    const targetColor = AI_COLORS[forceAiState] ?? COLOR_PATROL;
    if (mat1Ref.current) {
      tempColor.copy(mat1Ref.current.color);
      tempColor.lerp(targetColor, 1 - Math.pow(0.001, delta));
      mat1Ref.current.color.copy(tempColor);
    }
    if (mat2Ref.current) {
      tempColor.copy(mat2Ref.current.color);
      tempColor.lerp(targetColor, 1 - Math.pow(0.001, delta));
      mat2Ref.current.color.copy(tempColor);
    }

    // --- Animate orb positions based on AI state ---
    if (orb1Ref.current && orb2Ref.current) {
      switch (forceAiState) {
        case 'Patrol': {
          // Slow circular orbit around center
          const speed = 0.6;
          const radius = 1.8;
          orb1Ref.current.position.x = Math.cos(t * speed) * radius;
          orb1Ref.current.position.z = Math.sin(t * speed) * radius;
          orb1Ref.current.position.y = 0;

          orb2Ref.current.position.x = Math.cos(t * speed + Math.PI) * radius;
          orb2Ref.current.position.z = Math.sin(t * speed + Math.PI) * radius;
          orb2Ref.current.position.y = 0;
          break;
        }
        case 'Aggro': {
          // Quick back-and-forth lunging toward center
          const lungeSpeed = 3.0;
          const lungeRange = 2.0;
          const lunge = Math.sin(t * lungeSpeed) * lungeRange;

          orb1Ref.current.position.x = -1.5 + Math.abs(lunge) * 0.6;
          orb1Ref.current.position.z = Math.sin(t * 2) * 0.3;
          orb1Ref.current.position.y = Math.abs(Math.sin(t * lungeSpeed * 2)) * 0.3;

          orb2Ref.current.position.x = 1.5 - Math.abs(lunge) * 0.6;
          orb2Ref.current.position.z = Math.cos(t * 2) * 0.3;
          orb2Ref.current.position.y = Math.abs(Math.cos(t * lungeSpeed * 2)) * 0.3;
          break;
        }
        case 'Flee': {
          // Rapid movement away, bouncing at edges
          const fleeSpeed = 2.5;
          const bounds = 3.0;
          const flee1 = Math.sin(t * fleeSpeed) * bounds;
          const flee2 = Math.cos(t * fleeSpeed * 1.3) * bounds;

          orb1Ref.current.position.x = flee1;
          orb1Ref.current.position.z = Math.cos(t * fleeSpeed * 0.7) * bounds;
          orb1Ref.current.position.y = Math.abs(Math.sin(t * 4)) * 0.4;

          orb2Ref.current.position.x = -flee2;
          orb2Ref.current.position.z = Math.sin(t * fleeSpeed * 0.9) * bounds;
          orb2Ref.current.position.y = Math.abs(Math.cos(t * 4.5)) * 0.4;
          break;
        }
      }
    }

    // --- Toggle NavMesh visibility ---
    if (navMeshRef.current) {
      navMeshRef.current.visible = showNavMesh;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1} />

      {/* Floor plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color={COLOR_DEFAULT_FLOOR} />
      </mesh>

      {/* NavMesh wireframe overlay (initially hidden) */}
      <mesh
        ref={navMeshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.49, 0]}
        visible={false}
      >
        <planeGeometry args={[8, 8, 16, 16]} />
        <meshBasicMaterial wireframe color="#89b4fa" transparent opacity={0.3} />
      </mesh>

      {/* AI Orb 1 */}
      <mesh ref={orb1Ref} position={[-1.5, 0, 0]}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshStandardMaterial
          ref={mat1Ref}
          color={COLOR_PATROL}
          emissive={COLOR_PATROL}
          emissiveIntensity={0.3}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>

      {/* AI Orb 2 */}
      <mesh ref={orb2Ref} position={[1.5, 0, 0]}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshStandardMaterial
          ref={mat2Ref}
          color={COLOR_PATROL}
          emissive={COLOR_PATROL}
          emissiveIntensity={0.3}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}
