'use client';


import { useMemo, useEffect, useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimationMixer, MathUtils, Group } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

useGLTF.preload('/models/kbMii.glb');

/**
 * Sync constants — measured from the actual animation data in kbMii.glb
 * using scripts/measure-stride.mjs (headless Three.js bone sampling).
 *
 * From the GLB (standard Mixamo rig, 25 bones, cm-scale):
 *   Walking clip duration  = 1.1333 s
 *   LeftFoot world-space Z range per cycle = 3.3756 cm  (full forward-to-back sweep)
 *   Root motion (Hips Z)   ≈ 0  (in-place Mixamo animation)
 *
 * Derivation:
 *   scaledStride = 3.3756 × 0.15 = 0.50634 units
 *   walkSpeed    = 0.50634 / 1.1333 = 0.44677 units/s
 *   ω            = walkSpeed / R = 0.44677 / 1.2 ≈ 0.3723 rad/s
 *
 * This value is exported so about-me-flex.tsx uses the same rotation speed.
 */
export const SPHERE_ROTATION_SPEED = 0.5;

interface AboutMeWalkerProps {
  sphereRadius: number;
  animationName?: string;
}

export const AboutMeWalker = memo(function AboutMeWalker({ sphereRadius, animationName = 'Walking' }: AboutMeWalkerProps) {
  const { scene: modelScene, animations } = useGLTF('/models/kbMii.glb');

  // Clone with SkeletonUtils to properly re-bind SkinnedMesh skeleton
  const clonedScene = useMemo(() => {
    const c = SkeletonUtils.clone(modelScene);
    // Scale down: Mixamo rigs are ~180 cm; at 0.15 the character is ~27 cm
    c.scale.setScalar(0.15);
    return c;
  }, [modelScene]);

  // Animation mixer — Walking clip at natural speed (timeScale 1.0)
  // The sphere rotation speed is derived to match this, so no timeScale
  // adjustment is needed.
  const mixer = useMemo(() => new AnimationMixer(clonedScene), [clonedScene]);

  useEffect(() => {
    const clip = animations.find(c => c.name === animationName);
    if (!clip) return;

    const action = mixer.clipAction(clip);
    action.reset().fadeIn(0.25).play();

    return () => {
      action.fadeOut(0.25);
    };
  }, [animationName, mixer, animations]);

  const groupRef = useRef<Group>(null!);

  useFrame((_, delta) => {
    mixer.update(Math.min(delta, 0.05));
    if (groupRef.current) {
      const targetY = animationName === 'Waving' ? 0 : -Math.PI / 2;
      groupRef.current.rotation.y = MathUtils.lerp(groupRef.current.rotation.y, targetY, 5 * delta);
    }
  });

  // Position at top of sphere, group handles smoothed rotation to face camera or sideways
  return (
    <group ref={groupRef} position={[0, sphereRadius, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
});
