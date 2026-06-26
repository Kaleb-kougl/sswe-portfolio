'use client';
'use no memo';

import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Mesh, Vector3, Quaternion } from 'three';
import { useSceneGroup } from '../scene-orchestrator';
import { AboutMeWalker, SPHERE_ROTATION_SPEED } from './about-me-walker';
import { useEngineStore } from '@/store/useEngineStore';
import { PALETTE } from '../colors';

function useCharacterMovement(activeFileId: string | null) {
  const [prevActiveFileId, setPrevActiveFileId] = useState(activeFileId);
  const [movement, setMovement] = useState({ dx: 0, dz: 0, isMoving: false, angle: 0, hasInteracted: false });

  if (activeFileId !== prevActiveFileId) {
    setPrevActiveFileId(activeFileId);
    setMovement(prev => ({ ...prev, hasInteracted: false }));
  }

  useEffect(() => {
    const keys = { 
      w: false, a: false, s: false, d: false, 
      ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false,
    };
    const updateMovement = () => {
      let dx = 0;
      let dz = 0;
      if (keys.w || keys.ArrowUp) dz -= 1;
      if (keys.s || keys.ArrowDown) dz += 1;
      if (keys.a || keys.ArrowLeft) dx += 1;
      if (keys.d || keys.ArrowRight) dx -= 1;

      if (dx !== 0 && dz !== 0) {
        const length = Math.sqrt(dx * dx + dz * dz);
        dx /= length;
        dz /= length;
      }

      setMovement(prev => {
        const isMoving = dx !== 0 || dz !== 0;
        const angle = isMoving ? -Math.atan2(dx, dz) : prev.angle;
        const hasInteracted = prev.hasInteracted || isMoving;
        
        if (prev.dx === dx && prev.dz === dz && prev.isMoving === isMoving && prev.angle === angle && prev.hasInteracted === hasInteracted) {
          return prev;
        }
        return { dx, dz, isMoving, angle, hasInteracted };
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key in keys) {
        keys[e.key as keyof typeof keys] = true;
        updateMovement();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key in keys) {
        keys[e.key as keyof typeof keys] = false;
        updateMovement();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setMovement(prev => ({ ...prev, hasInteracted: false }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return movement;
}

// Pre-allocate to avoid GC overhead in useFrame
const _axis = new Vector3();
const _q = new Quaternion();

export function AboutMeFlex() {
  const groupRef = useSceneGroup('about-me');
  const sphereRef = useRef<Mesh>(null!);
  const activeFileId = useEngineStore((s) => s.activeFileId);
  const isOverview = activeFileId === 'overview';
  
  const { dx, dz, isMoving, angle, hasInteracted } = useCharacterMovement(activeFileId);

  const movementRef = useRef({ dx, dz, isMoving, hasInteracted });
  useEffect(() => {
    movementRef.current = { dx, dz, isMoving, hasInteracted };
  }, [dx, dz, isMoving, hasInteracted]);

  useFrame((_, delta) => {
    if (sphereRef.current) {
      const m = movementRef.current;
      let currentDx = m.dx;
      let currentDz = m.dz;
      let currentIsMoving = m.isMoving;

      if (!m.hasInteracted) {
        if (activeFileId === 'contact-info') {
          currentDx = -1;
          currentDz = 0;
          currentIsMoving = true;
        } else if (activeFileId === 'profile') {
          currentDx = 1;
          currentDz = 0;
          currentIsMoving = true;
        } else {
          currentIsMoving = false;
        }
      }

      if (currentIsMoving) {
        _axis.set(-currentDz, 0, -currentDx).normalize();
        _q.setFromAxisAngle(_axis, SPHERE_ROTATION_SPEED * delta);
        sphereRef.current.quaternion.premultiply(_q);
      }
    }
  });

  let currentIsMoving = isMoving;
  let currentAngle = angle;
  
  if (!hasInteracted) {
    if (activeFileId === 'contact-info') {
      currentIsMoving = true;
      currentAngle = Math.PI / 2;
    } else if (activeFileId === 'profile') {
      currentIsMoving = true;
      currentAngle = -Math.PI / 2;
    } else {
      currentIsMoving = false;
      currentAngle = 0;
    }
  }

  let animationName = 'Happy Idle';
  if (!hasInteracted && isOverview) {
    animationName = 'Waving';
  } else if (currentIsMoving) {
    animationName = 'Walking';
  }

  const targetYRotation = currentAngle;

  return (
    <group ref={groupRef}>
      <mesh ref={sphereRef}>
        <icosahedronGeometry args={[1.2, 1]} />
        <meshBasicMaterial wireframe color={PALETTE.ink} />
      </mesh>
      
      <AboutMeWalker sphereRadius={1.2} animationName={animationName} targetYRotation={targetYRotation} />
      
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 5, 2]} intensity={0.6} />
    </group>
  );
}
