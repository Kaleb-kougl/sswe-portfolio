'use client';

import { AnimatePresence, LazyMotion, domAnimation } from 'motion/react';
import * as m from 'motion/react-m';
import { useEngineStore } from '@/store/useEngineStore';

/**
 * CanvasLoadingHUD — overlaid on the viewport panel (CSS positioned, NOT inside Canvas).
 * Reads isAssetLoading from Zustand and shows a minimal loading indicator.
 *
 * Uses m.* with its own LazyMotion boundary so it works correctly whether
 * rendered inside the mobile layout's LazyMotion or the desktop layout (no LazyMotion).
 * Nested LazyMotion is safe — inner providers override outer ones.
 */
export function CanvasLoadingHUD() {
  const isLoading = useEngineStore((s) => s.isAssetLoading);

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {isLoading && (
          <m.div
            key="loading-hud"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          >
            <div className="flex items-center gap-2 border-[3px] border-border bg-bg-panel px-3 py-2 shadow-[6px_6px_0_#161310]">
              <div className="flex gap-1">
                <div
                  className="h-2 w-2 border-2 border-border bg-cobalt animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="h-2 w-2 border-2 border-border bg-tangerine animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="h-2 w-2 border-2 border-border bg-lime animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
                Loading scene...
              </span>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
