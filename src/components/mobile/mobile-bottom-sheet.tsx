'use client';

import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, useDragControls } from 'motion/react';
import * as m from 'motion/react-m';
import type { PanInfo } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useEngineStore, type ViewState } from '@/store/useEngineStore';
import { FocusTrap } from './focus-trap';
import { InspectorPanelContent } from '../inspector-panel';
import { MobileConsoleContent } from './mobile-console-content';

/**
 * MobileBottomSheet — draggable inspector/console sheet with three states.
 *
 * Tab bar (top-left): "Inspector" | "Console" — positioned left to avoid
 * accidental taps near the drag handle center.
 *
 * Positioning strategy:
 * The sheet is anchored with `top: 25dvh; bottom: 0`, giving it a natural
 * height of 75dvh that is always flush with the viewport bottom.
 * translateY percentages are relative to this 75dvh height:
 * - expanded: 0%   → top at 25dvh, bottom at viewport bottom (75dvh visible)
 * - peek:     80%  → shifted down 60dvh, only ~15dvh visible
 * - hidden:   100% → shifted fully off-screen
 *
 * States (from mobileSheetState in Zustand):
 * - hidden: fully dismissed, full canvas visible
 * - peek: handle + tab bar visible at bottom
 * - expanded: ~75% of screen with full scrollable content
 *
 * Uses m.* elements (parent provides LazyMotion context).
 * Focus trapped when expanded, restored on dismiss.
 *
 * Drag is restricted to the handle via useDragControls so that
 * touch scrolling works normally inside the content area.
 */

type SheetTab = 'inspector' | 'console';

const SHEET_TRIGGER_ID = 'mobile-sheet-peek';

// translateY as percentage of the sheet's own height (75dvh).
const Y_POSITIONS: Record<ViewState, string> = {
  hidden: '100%',
  peek: '80%',
  expanded: '0%',
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

  const [activeTab, setActiveTab] = useState<SheetTab>('inspector');
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
          setCameraTarget({ x: 0, y: 0, z: 0 });
        } else {
          setSheetState('hidden');
          setCameraTarget({ x: 0, y: 0, z: 0 });
        }
      } else if (info.offset.y < -50 && sheetState === 'peek') {
        // Swiped up from peek — expand
        setSheetState('expanded');
        setCameraTarget({ x: 0, y: 1.5, z: 0 });
      }
    },
    [sheetState, setSheetState, setGestureDragging, setCameraTarget]
  );

  const handlePeekTap = useCallback(() => {
    if (sheetState === 'expanded') {
      setSheetState('peek');
      setCameraTarget({ x: 0, y: 0, z: 0 });
    } else {
      setSheetState('expanded');
      setCameraTarget({ x: 0, y: 1.5, z: 0 });
    }
  }, [sheetState, setSheetState, setCameraTarget]);

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
          className="mobile-safe-bottom fixed inset-x-0 z-50 flex flex-col rounded-t-2xl bg-bg-panel shadow-[0_-4px_30px_rgba(0,0,0,0.3)]"
          style={{ top: '25dvh', bottom: 0 }}
          role="dialog"
          aria-label={activeTab === 'inspector' ? 'Inspector panel' : 'Console output'}
          aria-modal={sheetState === 'expanded'}
        >
          {/* Row 1: Drag handle */}
          <button
            ref={triggerRef}
            id={SHEET_TRIGGER_ID}
            type="button"
            onClick={handlePeekTap}
            onPointerDown={(e) => dragControls.start(e)}
            className="flex w-full shrink-0 cursor-grab flex-col items-center pt-2 pb-3 active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            aria-label={sheetState === 'peek' ? 'Expand panel' : 'Drag to resize'}
          >
            <div className="sheet-handle" />
          </button>

          {/* Row 2: Tab bar — left-aligned to prevent accidental taps */}
          <div className="shrink-0 px-3 pb-2">
            <div
              className="inline-flex gap-0.5 rounded-lg bg-bg-editor/60 p-0.5"
              role="tablist"
              aria-label="Sheet tabs"
            >
              <TabButton
                id="sheet-tab-inspector"
                label="Inspector"
                isActive={activeTab === 'inspector'}
                onClick={() => setActiveTab('inspector')}
                controls="sheet-tabpanel"
              />
              <TabButton
                id="sheet-tab-console"
                label="Console"
                isActive={activeTab === 'console'}
                onClick={() => setActiveTab('console')}
                controls="sheet-tabpanel"
              />
            </div>
          </div>

          {/* Content — scrolls independently, drag does NOT intercept here */}
          <FocusTrap active={sheetState === 'expanded'}>
            <div
              id="sheet-tabpanel"
              role="tabpanel"
              aria-labelledby={`sheet-tab-${activeTab}`}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8"
            >
              {activeTab === 'inspector' ? (
                <InspectorPanelContent />
              ) : (
                <MobileConsoleContent />
              )}
            </div>
          </FocusTrap>
        </m.div>
      )}
    </AnimatePresence>
  );
}

// --- Tab Button ---

function TabButton({
  id,
  label,
  isActive,
  onClick,
  controls,
}: {
  id: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  controls: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={controls}
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium tracking-wide transition-all ${
        isActive
          ? 'bg-bg-panel text-text-accent shadow-sm'
          : 'text-text-muted hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );
}
