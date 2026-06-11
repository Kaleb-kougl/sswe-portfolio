'use client';

import { useEffect, useRef } from 'react';
import { LazyMotion, domMax, MotionConfig } from 'motion/react';
import dynamic from 'next/dynamic';
import { LucideProvider } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEngineStore } from '@/store/useEngineStore';
import { FILE_LOG_MAP } from '@/data/consoleLogs';
import { ViewportRefProvider } from '../viewport-ref-context';
import { CanvasLoadingHUD } from '../3d/canvas-loading-hud';
import { ModelControlsHUD } from '../3d/model-controls-hud';
import { MobileTopBar } from './mobile-top-bar';
import { MobileDrawer } from './mobile-drawer';
import { MobileBottomSheet } from './mobile-bottom-sheet';
import { MobileConsoleOverlay } from './mobile-console-overlay';

// Dynamic import of MemoizedCanvasWrapper (ssr: false — R3F requires browser APIs)
const MemoizedCanvasWrapper = dynamic(
  () => import('../3d/canvas-wrapper').then((mod) => mod.MemoizedCanvasWrapper),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-bg-editor">
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1">
            <div
              className="h-1.5 w-1.5 rounded-full bg-text-accent animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <div
              className="h-1.5 w-1.5 rounded-full bg-text-accent animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <div
              className="h-1.5 w-1.5 rounded-full bg-text-accent animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
          <p className="font-mono text-[10px] text-text-muted">
            Initializing 3D engine...
          </p>
        </div>
      </div>
    ),
  }
);

/**
 * MobileLayout — the z-layer architecture for viewports < 768px.
 *
 * Z-0: Canvas (absolute inset-0, full screen background)
 * Z-10: Console overlay (fading log entries)
 * Z-50: Floating top bar pill
 * Z-40/50: Hierarchy drawer (AnimatePresence off-canvas)
 * Z-50: Inspector bottom sheet (draggable)
 *
 * Wrapped in LazyMotion + domMax for bundle optimization (~4.6kb vs ~34kb).
 * Uses m.* elements (not motion.*) inside LazyMotion boundary.
 * MotionConfig provides global spring defaults and reducedMotion="user".
 */
export default function MobileLayout() {
  const viewportRef = useRef<HTMLDivElement>(null);
  
  const { activeFileId, setActiveFile, setSheetState } = useEngineStore(
    useShallow((s) => ({
      activeFileId: s.activeFileId,
      setActiveFile: s.setActiveFile,
      setSheetState: s.setMobileSheetState,
    }))
  );

  useEffect(() => {
    if (!activeFileId) {
      setActiveFile('overview', FILE_LOG_MAP['overview']);
      setSheetState('expanded');
    }
  }, [activeFileId, setActiveFile, setSheetState]);

  return (
    <LucideProvider size={16} strokeWidth={1.5}>
      <LazyMotion features={domMax} strict>
        <MotionConfig
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          reducedMotion="user"
        >
          <div className="relative h-dvh w-screen overflow-hidden bg-bg-editor">
            {/* Z-0: Full-screen 3D Canvas */}
            <ViewportRefProvider value={viewportRef}>
              <div
                ref={viewportRef}
                className="absolute inset-0 z-0 h-dvh w-screen"
                role="img"
                aria-label="3D Viewport"
              >
                <CanvasLoadingHUD />
                <ModelControlsHUD />
                <MemoizedCanvasWrapper />
              </div>
            </ViewportRefProvider>

            {/* Z-10: Console overlay */}
            <MobileConsoleOverlay />

            {/* Z-50: Floating top bar */}
            <MobileTopBar />

            {/* Z-40/50: Hierarchy drawer */}
            <MobileDrawer />

            {/* Z-50: Inspector bottom sheet */}
            <MobileBottomSheet />
          </div>
        </MotionConfig>
      </LazyMotion>
    </LucideProvider>
  );
}
