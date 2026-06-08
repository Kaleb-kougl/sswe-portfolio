'use client';
'use no memo';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Mesh } from 'three';
import { useSceneGroup } from '../scene-orchestrator';
import { AboutMeWalker, SPHERE_ROTATION_SPEED } from './about-me-walker';
import { useEngineStore } from '@/store/useEngineStore';

export function AboutMeFlex() {
  const groupRef = useSceneGroup('about-me');
  const sphereRef = useRef<Mesh>(null!);
  const activeFileId = useEngineStore((s) => s.activeFileId);
  const isOverview = activeFileId === 'overview';

  useFrame((_, delta) => {
    if (sphereRef.current && !isOverview) {
      sphereRef.current.rotation.z -= SPHERE_ROTATION_SPEED * delta;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={sphereRef}>
        <icosahedronGeometry args={[1.2, 1]} />
        <meshBasicMaterial wireframe color="#89b4fa" />
      </mesh>
      
      <AboutMeWalker sphereRadius={1.2} animationName={isOverview ? 'Waving' : 'Walking'} />
      
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 5, 2]} intensity={0.6} />
    </group>
  );
}
