import React from 'react';
import { Html } from '@react-three/drei';
import { ProjectileTelemetry } from '@k9kbdev/r3f-projectiles';
import { activeBulletCount } from './scenes/combat-system-bullets';
import { useEngineStore } from '@/store/useEngineStore';

export function BulletTelemetry() {
  const activeFileId = useEngineStore((s) => s.activeFileId);
  const isVisible = activeFileId === 'combat_system' || activeFileId === 'r3f-projectiles';

  if (!isVisible) return null;

  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <ProjectileTelemetry
        getCount={() => activeBulletCount.current ?? 0}
        style={{
          position: 'absolute',
          top: '4px',
          left: '4px',
          pointerEvents: 'none',
        }}
      />
    </Html>
  );
}

