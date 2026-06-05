'use client';

import { useCallback, useRef } from 'react';
import { AnimatePresence, useDragControls } from 'motion/react';
import * as m from 'motion/react-m';
import type { PanInfo } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useEngineStore, type ViewState } from '@/store/useEngineStore';
import { FocusTrap } from './focus-trap';
import { InspectorPanelContent } from '../inspector-panel';

/**
 * MobileBottomSheet — draggable inspector sheet with three states.
 *
 * States (from mobileSheetState in Zustand):
 * - hidden: fully dismissed, full canvas visible
 * - peek: title + swipe handle at bottom
 * - expanded: ~75% of screen with full inspector content
 *
 * Uses m.* elements (parent provides LazyMotion context).
 * Focus trapped when expanded, restored on dismiss.
 *
 * Drag is restricted to the handle via useDragControls so that
 * touch scrolling works normally inside the content area.
 */

const SHEET_TRIGGER_ID = 'mobile-sheet-peek';

// Y-position percentages for each state (CSS top positioning via translateY)
const Y_POSITIONS: Record<ViewState, string> = {
  hidden: '100%',
  peek: '85%',
  expanded: '25%',
};

export function MobileBottomSheet() {
  const { sheetState, setSheetState, setGestureDragging, setCameraTarget } = useEngineStore(
    useShallow((s) => ({
      sheetState: s.mobileSheetState,
      setSheetState: s.setMobileSheetState,
      setGestureDragging: s.setGestureDragging,
      setCameraTarget: s.setCameraTarget,
    }))
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dragControls = useDragControls();

  const handleDragStart = useCallback(() => {
    setGestureDragging(true);
  }, [setGestureDragging]);

  const handleDragEnd = useCallback(
    (_: PointerEvent, info: PanInfo) => {
      setGestureDragging(false);

      if (info.offset.y > 100) {
        // Swiped down — dismiss or reduce
        if (sheetState === 'expanded') {
          setSheetState('peek');
          // Reset camera when collapsing
          setCameraTarget({ x: 0, y: 0, z: 0 });
        } else {
          setSheetState('hidden');
          setCameraTarget({ x: 0, y: 0, z: 0 });
        }
      } else if (info.offset.y < -50 && sheetState === 'peek') {
        // Swiped up from peek — expand
        setSheetState('expanded');
        // Pan camera up so 3D frames in top 25%
        setCameraTarget({ x: 0, y: 1.5, z: 0 });
      }
    },
    [sheetState, setSheetState, setGestureDragging, setCameraTarget]
  );

  const handlePeekTap = useCallback(() => {
    setSheetState('expanded');
    setCameraTarget({ x: 0, y: 1.5, z: 0 });
  }, [setSheetState, setCameraTarget]);

  const handleExitComplete = useCallback(() => {
    triggerRef.current?.focus();
  }, []);

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {sheetState !== 'hidden' && (
        <m.div
          key="bottom-sheet"
          initial={{ y: '100%' }}
          animate={{ y: Y_POSITIONS[sheetState] }}
          exit={{ y: '100%' }}
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0 }}
          dragElastic={0.2}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          className="mobile-safe-bottom fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-bg-panel shadow-[0_-4px_30px_rgba(0,0,0,0.3)]"
          style={{ height: '75dvh' }}
          role="dialog"
          aria-label="Inspector panel"
          aria-modal={sheetState === 'expanded'}
        >
          {/* Drag handle — only this area triggers sheet drag */}
          <button
            ref={triggerRef}
            id={SHEET_TRIGGER_ID}
            type="button"
            onClick={handlePeekTap}
            onPointerDown={(e) => dragControls.start(e)}
            className="flex w-full shrink-0 flex-col items-center py-2 cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            aria-label={sheetState === 'peek' ? 'Expand inspector' : 'Drag to resize'}
          >
            <div className="sheet-handle" />
          </button>

          {/* Content — scrolls independently, drag does NOT intercept here */}
          <FocusTrap active={sheetState === 'expanded'}>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
              <InspectorPanelContent />
            </div>
          </FocusTrap>
        </m.div>
      )}
    </AnimatePresence>
  );
}
