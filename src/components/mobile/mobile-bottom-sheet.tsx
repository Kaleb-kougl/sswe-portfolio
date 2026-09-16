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
 * - hidden: fully dismissed; a small "▲ Inspector" button is left behind so the
 *   panel can be brought back
 * - peek: DOCKED. Handle + tab bar sit above the bottom edge for the whole
 *   session — this is the resting state on the scrolling mobile layout, and
 *   the reason MobileLayout pads the bottom of its scroll column.
 * - expanded: ~75% of screen with full scrollable content, opened by tapping
 *   the dock or by picking a file in the Hierarchy dropdown
 *
 * Uses m.* elements (parent provides LazyMotion context).
 * Focus trapped when expanded, restored on dismiss.
 *
 * Drag is restricted to the handle via useDragControls so that
 * touch scrolling works normally inside the content area.
 */

type SheetTab = 'inspector' | 'console';

const SHEET_TRIGGER_ID = 'mobile-sheet-peek';

/** `interactive` owns focus rings (see COLOR_ROLES in globals.css). */
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive';

// translateY as percentage of the sheet's own height (75dvh).
const Y_POSITIONS: Record<ViewState, string> = {
  hidden: '100%',
  // 76% of 75dvh leaves ~18dvh on screen — enough for the 44px handle AND the
  // 44px tab bar to clear the bottom safe area on a 667px-tall phone. The old
  // 80% assumed 36px controls and clipped the tabs once they grew.
  peek: '76%',
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
  const reopenRef = useRef<HTMLButtonElement>(null);
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

  const handleReopen = useCallback(() => {
    setSheetState('peek');
  }, [setSheetState]);

  const handleExitComplete = useCallback(() => {
    // The handle is gone once the sheet unmounts — hand focus to whatever is
    // left on screen that can bring the sheet back.
    (triggerRef.current ?? reopenRef.current)?.focus();
  }, []);

  return (
    <>
      {/*
        The sheet is dockable, not disposable: swiping it away must not strip
        the Inspector and the Console out of the page with no way back.
      */}
      {sheetState === 'hidden' && (
        <button
          ref={reopenRef}
          type="button"
          onClick={handleReopen}
          className={`mobile-safe-bottom fixed bottom-3 right-3 z-50 flex min-h-[44px] min-w-[44px] items-center gap-2 border-[3px] border-border bg-header-bg px-3 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-header-ink shadow-[4px_4px_0_#161310] ${FOCUS_RING}`}
        >
          <span aria-hidden="true">▲</span>
          Inspector
        </button>
      )}

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
          className="mobile-safe-bottom fixed inset-x-0 z-50 flex flex-col border-t-[3px] border-border bg-bg-panel shadow-[0_-9px_0_#161310]"
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
            className={`flex min-h-[44px] w-full shrink-0 cursor-grab flex-col items-center justify-center pt-2 pb-3 active:cursor-grabbing ${FOCUS_RING}`}
            style={{ touchAction: 'none' }}
            aria-label={sheetState === 'peek' ? 'Expand panel' : 'Drag to resize'}
          >
            <div className="sheet-handle" />
          </button>

          {/* Row 2: Tab bar — left-aligned to prevent accidental taps */}
          <div className="shrink-0 px-3 pb-2">
            <div
              className="inline-flex gap-1 border-[3px] border-border bg-bg-editor p-1 shadow-[4px_4px_0_#161310]"
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
    </>
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
      className={`flex min-h-[44px] items-center border-2 border-border px-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${FOCUS_RING} ${
        isActive
          ? 'bg-interactive text-interactive-ink'
          : 'bg-bg-panel text-text-muted hover:bg-status hover:text-status-ink'
      }`}
    >
      {label}
    </button>
  );
}
