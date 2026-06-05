'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Vector3, MathUtils, type Mesh, type MeshStandardMaterial, type AmbientLight, type DirectionalLight } from 'three';
import { useEngineStore } from '@/store/useEngineStore';
import { useSceneGroup } from '../scene-orchestrator';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Catppuccin accent palette — one per block */
const BLOCK_COLORS = [
  '#89b4fa', // Blue
  '#a6e3a1', // Green
  '#f9e2af', // Yellow
  '#fab387', // Peach
  '#f38ba8', // Red / Maroon
  '#cba6f7', // Mauve
  '#94e2d5', // Teal
  '#74c7ec', // Sapphire
] as const;

/** 2×4 grid centered at origin, spacing ~0.8 */
const GRID_POSITIONS: [number, number, number][] = [
  [-1.2, 0.4, 0],
  [-0.4, 0.4, 0],
  [0.4, 0.4, 0],
  [1.2, 0.4, 0],
  [-1.2, -0.4, 0],
  [-0.4, -0.4, 0],
  [0.4, -0.4, 0],
  [1.2, -0.4, 0],
];

/** Deterministic seed-style scattered positions (radius ~3) */
function makeScatteredPositions(): Vector3[] {
  const angles = [0.4, 1.2, 2.0, 2.8, 3.6, 4.4, 5.2, 6.0];
  return angles.map((a, i) => {
    const r = 2.2 + (i % 3) * 0.5;
    const y = ((i % 4) - 1.5) * 1.1;
    return new Vector3(
      Math.cos(a) * r,
      y,
      Math.sin(a) * r * 0.6 + (i % 2 === 0 ? 0.4 : -0.4)
    );
  });
}

/** Default light colour */
const WHITE = new Color('#ffffff');
/** SLO incident light colour */
const RED = new Color('#f38ba8');

/** Damp speed constants */
const POSITION_LAMBDA = 3;
const LIGHT_LAMBDA = 4;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function IndeedFlexScene() {
  const groupRef = useSceneGroup('indeed-onehost');

  /* ---- Refs for meshes & lights ---- */
  const meshRefs = useRef<(Mesh | null)[]>([]);
  const matRefs = useRef<(MeshStandardMaterial | null)[]>([]);
  const ambientRef = useRef<AmbientLight>(null);
  const dirRef = useRef<DirectionalLight>(null);

  /* ---- Pre-allocated reusable objects (outside useFrame) ---- */
  const scattered = useMemo(() => makeScatteredPositions(), []);
  const gridVecs = useMemo(
    () => GRID_POSITIONS.map(([x, y, z]) => new Vector3(x, y, z)),
    []
  );

  // Scratch color for interpolation — useRef (not useMemo) because we mutate it in useFrame
  const scratchColor = useRef(new Color());

  /* ---- useFrame: mutate refs only, zero allocations ---- */
  useFrame((_state, delta) => {
    const { isModuleFederationEnabled, isSloIncidentSimulated } =
      useEngineStore.getState();

    // --- Position interpolation ---
    for (let i = 0; i < 8; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;

      const target = isModuleFederationEnabled ? gridVecs[i] : scattered[i];

      mesh.position.x = MathUtils.damp(
        mesh.position.x,
        target.x,
        POSITION_LAMBDA,
        delta
      );
      mesh.position.y = MathUtils.damp(
        mesh.position.y,
        target.y,
        POSITION_LAMBDA,
        delta
      );
      mesh.position.z = MathUtils.damp(
        mesh.position.z,
        target.z,
        POSITION_LAMBDA,
        delta
      );
    }

    // --- Light colour / intensity for SLO incident ---
    const targetColor = isSloIncidentSimulated ? RED : WHITE;

    if (ambientRef.current) {
      scratchColor.current.copy(ambientRef.current.color);
      scratchColor.current.r = MathUtils.damp(scratchColor.current.r, targetColor.r, LIGHT_LAMBDA, delta);
      scratchColor.current.g = MathUtils.damp(scratchColor.current.g, targetColor.g, LIGHT_LAMBDA, delta);
      scratchColor.current.b = MathUtils.damp(scratchColor.current.b, targetColor.b, LIGHT_LAMBDA, delta);
      ambientRef.current.color.copy(scratchColor.current);

      ambientRef.current.intensity = MathUtils.damp(
        ambientRef.current.intensity,
        isSloIncidentSimulated ? 0.8 : 0.4,
        LIGHT_LAMBDA,
        delta
      );
    }

    if (dirRef.current) {
      scratchColor.current.copy(dirRef.current.color);
      scratchColor.current.r = MathUtils.damp(scratchColor.current.r, targetColor.r, LIGHT_LAMBDA, delta);
      scratchColor.current.g = MathUtils.damp(scratchColor.current.g, targetColor.g, LIGHT_LAMBDA, delta);
      scratchColor.current.b = MathUtils.damp(scratchColor.current.b, targetColor.b, LIGHT_LAMBDA, delta);
      dirRef.current.color.copy(scratchColor.current);

      dirRef.current.intensity = MathUtils.damp(
        dirRef.current.intensity,
        isSloIncidentSimulated ? 2.0 : 1.0,
        LIGHT_LAMBDA,
        delta
      );
    }
  });

  /* ---- Render ---- */
  return (
    <group ref={groupRef}>
      {/* Lighting */}
      <ambientLight ref={ambientRef} intensity={0.4} />
      <directionalLight ref={dirRef} position={[5, 5, 5]} intensity={1} />

      {/* 8 microfrontend blocks */}
      {BLOCK_COLORS.map((color, i) => (
        <mesh
          key={i}
          ref={(el: Mesh | null) => {
            meshRefs.current[i] = el;
          }}
          position={[scattered[i].x, scattered[i].y, scattered[i].z]}
        >
          <boxGeometry args={[0.6, 0.4, 0.3]} />
          <meshStandardMaterial
            ref={(el: MeshStandardMaterial | null) => {
              matRefs.current[i] = el;
            }}
            color={color}
          />
        </mesh>
      ))}
    </group>
  );
}
