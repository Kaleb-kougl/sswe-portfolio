'use client';
'use no memo';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, Html } from '@react-three/drei';
import { Color, Vector3, MathUtils, type Mesh, type MeshStandardMaterial, type AmbientLight, type DirectionalLight } from 'three';
import { useEngineStore } from '@/store/useEngineStore';
import { useSceneGroup } from '../scene-orchestrator';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Neo-brutalist accent palette — one per block */
const BLOCK_COLORS = [
  '#1F3BE0',
  '#BFF03A',
  '#FF5E1A',
  '#1F3BE0',
  '#BFF03A',
  '#FF5E1A',
  '#1F3BE0',
  '#BFF03A',
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
const RED = new Color('#ff5e1a');

/** Damp speed constants */
const POSITION_LAMBDA = 3;
const LIGHT_LAMBDA = 4;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function IndeedFlexScene() {
  const groupRef = useSceneGroup('indeed-sr-swe');

  /* ---- Refs for meshes & lights ---- */
  const meshRefs = useRef<(Mesh | null)[]>([]);
  const matRefs = useRef<(MeshStandardMaterial | null)[]>([]);
  const ambientRef = useRef<AmbientLight>(null);
  const dirRef = useRef<DirectionalLight>(null);

  /* ---- Host Shell & UI Refs ---- */
  const shellRef = useRef<Mesh>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const htmlOpacityRef = useRef(0);

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
    const { isModuleFederationEnabled, isSloIncidentSimulated, activeFileId } =
      useEngineStore.getState();

    const isCurrentScene = activeFileId === 'indeed-sr-swe' || activeFileId === 'webpack-federation';

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

    // --- Host Shell & UI Animation ---
    const shellScaleTarget = isModuleFederationEnabled ? 1 : 0.001;
    const opacityTarget = (isModuleFederationEnabled && isCurrentScene) ? 1 : 0;

    if (shellRef.current) {
      shellRef.current.scale.setScalar(
        MathUtils.damp(
          shellRef.current.scale.x,
          shellScaleTarget,
          POSITION_LAMBDA,
          delta
        )
      );
    }

    if (pillRef.current) {
      htmlOpacityRef.current = MathUtils.damp(
        htmlOpacityRef.current,
        opacityTarget,
        POSITION_LAMBDA,
        delta
      );
      pillRef.current.style.opacity = htmlOpacityRef.current.toFixed(3);
      pillRef.current.style.transform = `translateY(${(1 - htmlOpacityRef.current) * 10}px)`;
      
      // Fully hide when dismissed to prevent any stray interactions
      pillRef.current.style.visibility = htmlOpacityRef.current < 0.01 ? 'hidden' : 'visible';
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

      {/* Host Shell */}
      <mesh ref={shellRef} position={[0, 0, -0.2]} scale={0.001}>
        <RoundedBox args={[3.4, 1.6, 0.1]} radius={0.05} smoothness={4}>
          <meshPhysicalMaterial
            transmission={0.9}
            roughness={0.2}
            thickness={0.5}
            color="#ffffff"
            transparent
          />
        </RoundedBox>
        <Html position={[0, 1.1, 0]} center zIndexRange={[100, 0]}>
          <div className="-translate-y-16 md:translate-y-0">
            <div
              ref={pillRef}
              className="pointer-events-none max-w-[90vw] select-none border-[3px] border-[#161310] bg-[#1F3BE0] px-4 py-2 text-center font-mono text-xs font-bold uppercase tracking-[0.08em] text-white shadow-[6px_6px_0_#161310] md:max-w-none md:whitespace-nowrap"
              style={{ opacity: 0 }}
            >
              Remotes dynamically plug into the Host Shell at runtime.
            </div>
          </div>
        </Html>
      </mesh>

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
