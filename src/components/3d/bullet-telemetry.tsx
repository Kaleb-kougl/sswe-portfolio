import { Html } from '@react-three/drei';
import { ProjectileTelemetry } from '@k9kbdev/r3f-projectiles';
import { activeBulletCount } from './scenes/combat-system-bullets';
import { useEngineStore } from '@/store/useEngineStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { PALETTE } from './colors';

export function BulletTelemetry() {
  const activeFileId = useEngineStore((s) => s.activeFileId);
  const isMobile = useIsMobile();
  const isVisible = activeFileId === 'combat_system' || activeFileId === 'r3f-projectiles';
  const telemetryInset = isMobile ? '4.5rem .75rem auto .75rem' : '4px 4px auto auto';

  if (!isVisible) return null;

  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <ProjectileTelemetry
        getCount={() => activeBulletCount.current ?? 0}
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          inset: telemetryInset,
          color: PALETTE.paper,
          backgroundColor: PALETTE.cobalt,
          right: 'auto',
          border: `3px solid ${PALETTE.ink}`,
          boxShadow: `rgb(22, 19, 16) 5px 5px 0px`,
          opacity: .85,
        }}
        foregroundColor={PALETTE.paper}
        backgroundColor={PALETTE.cobalt}
        color={PALETTE.cobalt}
      />
    </Html>
  );
}
