'use client';
'use no memo';

import { useSceneGroup } from '../scene-orchestrator';
import { BulletManager } from './combat-system-bullets';

/**
 * CombatSystemFlex — The CombatSystem combat scene.
 *
 * Dark arena with fog, neon green wireframe grid, and a BulletManager
 * particle system. Bloom post-processing is mounted at the Canvas level
 * in canvas-wrapper.tsx (not here) because EffectComposer operates as a
 * render pass — nesting it inside a scene group would not properly
 * disable it when the group's visible is toggled.
 */
export function CombatSystemFlex() {
  const groupRef = useSceneGroup('combat_system');

  return (
    <group ref={groupRef}>
      {/* Fog — requires Fog extended in three-setup.ts */}
      <fog attach="fog" args={['#050505', 5, 25]} />

      {/* Lighting */}
      <ambientLight args={[0x404040, 0.5]} />
      <pointLight position={[0, 5, 0]} args={[0x00cccc, 1, 20]} />

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
        <meshStandardMaterial color="#050505" />
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
        <meshBasicMaterial wireframe color="#39FF14" transparent opacity={0.15} />
      </mesh>

      {/* Bullet system */}
      <BulletManager />
    </group>
  );
}
