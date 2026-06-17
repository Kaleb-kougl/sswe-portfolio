import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { activeBulletCount } from './scenes/combat-system-bullets';
import { useEngineStore } from '@/store/useEngineStore';

export function BulletTelemetry() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Zero-allocation buffer
  const historySize = 80;
  const history = useMemo(() => new Float32Array(historySize), []);
  const headRef = useRef(0);
  
  const activeFileId = useEngineStore((s) => s.activeFileId);
  const isVisible = activeFileId === 'combat_system' || activeFileId === 'r3f-projectiles';

  useFrame(() => {
    if (!isVisible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); // Disable alpha for better performance
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Update history
    const count = activeBulletCount.current || 0;
    const head = headRef.current;
    history[head] = count;
    headRef.current = (head + 1) % historySize;

    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // Find max for scaling
    let maxCount = 2000; // Expected max scaling
    for (let i = 0; i < historySize; i++) {
      if (history[i] > maxCount) {
        maxCount = history[i];
      }
    }

    // Colors mimicking mrdoob stats (Cyan theme)
    const bg = '#002';
    const fg = '#0ff';

    // Clear canvas
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Draw graph
    ctx.fillStyle = fg;
    for (let i = 0; i < historySize; i++) {
      const index = (head + i) % historySize;
      const val = history[index];
      
      const x = i;
      const barHeight = (val / maxCount) * 30;
      
      if (barHeight > 0) {
        ctx.fillRect(x, height - barHeight, 1, barHeight);
      }
    }

    // Draw text header
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, 15);
    ctx.fillStyle = fg;
    ctx.font = 'bold 9px Helvetica,Arial,sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`${count} ACTIVE`, 3, 2);
  });

  if (!isVisible) return null;

  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div style={{ 
        position: 'absolute', 
        top: '4px', 
        left: '4px', 
        zIndex: 20,
        opacity: 0.8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start'
      }}>
        <span style={{
          display: 'block',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '9px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          color: 'var(--color-text-muted, #8b949e)',
          textAlign: 'left',
          paddingLeft: '3px',
          marginBottom: '2px',
          lineHeight: '16px',
          whiteSpace: 'nowrap'
        }}>
          ACTIVE ENTITIES
        </span>
        <canvas 
          ref={canvasRef} 
          width={80} 
          height={48} 
          style={{
            display: 'block',
            width: '80px',
            height: '48px',
            backgroundColor: '#002', // match mrdoob stats cyan theme
          }}
        />
      </div>
    </Html>
  );
}
