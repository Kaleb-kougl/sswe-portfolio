'use client';

import { useCallback, useEffect, useRef, useState, Activity } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { ChevronDown, X } from 'lucide-react';
import { useEngineStore } from '@/store/useEngineStore';
import { useShallow } from 'zustand/react/shallow';
import { FILE_TREE, type FileNode } from '@/data/fileTree';
import { FILE_LOG_MAP } from '@/data/consoleLogs';
import { FocusTrap } from './focus-trap';
import { MOBILE_MENU_TRIGGER_ID } from './mobile-top-bar';

/**
 * MobileHierarchyDropdown — the Hierarchy on phones.
 *
 * Replaces the old full-height slide-out drawer. Below 768px the page is one
 * honest single-column scroll (see MobileLayout), and an off-canvas drawer that
 * covered the whole screen was the wrong metaphor for it: a visitor only needs
 * a way to jump to a file, not a second navigation surface.
 *
 * So this is a STICKY BAR that rides along at the top of the scroll (parked
 * directly under the fixed top bar — see `stickyTop`, which MobileLayout
 * measures from the real top bar element rather than assuming its height) with
 * a single trigger. Tapping it drops the same file tree down over the content
 * as a short popover.
 *
 * Contracts that are deliberately preserved from the drawer:
 * - the popover is `role="dialog" aria-label="Project hierarchy"` (e2e selects it)
 * - it is toggled by the top bar hamburger through `isMobileDrawerOpen`, so the
 *   MOBILE_MENU_TRIGGER_ID handshake still works in both directions
 * - the tree is still `role="tree"` / `role="treeitem"` with one button per node
 * - focus returns to whichever control opened the popover when it closes
 *
 * Colors follow COLOR_ROLES: the bar and the popover header are the paper/ink
 * panel-header recipe (they used to be a full `bg-lime` fill, which broke both
 * "status is never a large fill" and "headers are never a colored fill"), and
 * the selected file is `interactive`.
 */

const PANEL_ID = 'mobile-hierarchy-panel';
const DROPDOWN_TRIGGER_ID = 'mobile-hierarchy-trigger';

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive';

/** Label of the active file, so the collapsed bar always says where you are. */
function findLabel(nodes: readonly FileNode[], id: string | null): string | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node.label;
    if (node.children) {
      const hit = findLabel(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

export function MobileHierarchyDropdown({ stickyTop = 0 }: { stickyTop?: number }) {
  const { isOpen, setDrawerOpen, setActiveFile, setSheetState, activeFileId } = useEngineStore(
    useShallow((s) => ({
      isOpen: s.isMobileDrawerOpen,
      setDrawerOpen: s.setMobileDrawerOpen,
      setActiveFile: s.setActiveFile,
      setSheetState: s.setMobileSheetState,
      activeFileId: s.activeFileId,
    }))
  );

  // Whichever control opened the popover gets focus back when it closes: the
  // hamburger in the top bar, or this bar's own trigger.
  const lastTriggerId = useRef<string>(DROPDOWN_TRIGGER_ID);

  const handleFileSelect = useCallback(
    (id: string) => {
      setActiveFile(id, FILE_LOG_MAP[id]);
      setDrawerOpen(false);
      // Opening the Inspector is the whole point of picking a file here, and
      // the sheet is docked at `peek` for the rest of the session — leaving it
      // at `peek` would make the tap look like it did nothing.
      setSheetState('expanded');
    },
    [setActiveFile, setDrawerOpen, setSheetState]
  );

  const handleClose = useCallback(() => {
    setDrawerOpen(false);
  }, [setDrawerOpen]);

  const handleToggle = useCallback(() => {
    lastTriggerId.current = DROPDOWN_TRIGGER_ID;
    setDrawerOpen(!isOpen);
  }, [isOpen, setDrawerOpen]);

  const handleExitComplete = useCallback(() => {
    const el =
      document.getElementById(lastTriggerId.current) ??
      document.getElementById(MOBILE_MENU_TRIGGER_ID);
    el?.focus();
    lastTriggerId.current = DROPDOWN_TRIGGER_ID;
  }, []);

  // Escape closes, like any other popover.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, setDrawerOpen]);

  // If the top bar hamburger did the opening, send focus back there on close.
  useEffect(() => {
    if (!isOpen) return;
    if (document.activeElement?.id === MOBILE_MENU_TRIGGER_ID) {
      lastTriggerId.current = MOBILE_MENU_TRIGGER_ID;
    }
  }, [isOpen]);

  const activeLabel = findLabel(FILE_TREE, activeFileId);

  return (
    // Opaque: a transparent sticky bar lets the scroll slide through its gutter.
    <div className="sticky z-40 bg-bg-editor px-3 pb-2 pt-1" style={{ top: stickyTop }}>
      <div className="relative mx-auto w-full max-w-[560px]">
        {/* Collapsed bar — panel-header recipe: paper fill, ink text, ink border */}
        <button
          id={DROPDOWN_TRIGGER_ID}
          type="button"
          onClick={handleToggle}
          aria-expanded={isOpen}
          aria-controls={PANEL_ID}
          aria-haspopup="dialog"
          className={`flex min-h-[44px] w-full items-center justify-between gap-2 border-[3px] border-header-ink bg-header-bg px-3 py-1.5 text-left shadow-[4px_4px_0_#161310] ${FOCUS_RING}`}
        >
          <span className="flex min-w-0 flex-col">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-text-muted">
              Hierarchy
            </span>
            <span className="truncate font-mono text-[12px] font-bold uppercase tracking-[0.04em] text-header-ink">
              {activeLabel ?? 'Jump to a file'}
            </span>
          </span>
          <ChevronDown
            size={18}
            strokeWidth={2.5}
            aria-hidden="true"
            className={`shrink-0 text-header-ink transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        <AnimatePresence onExitComplete={handleExitComplete}>
          {isOpen && (
            <>
              {/* Backdrop — dims the scroll behind the popover. */}
              <m.div
                key="hierarchy-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
                onClick={handleClose}
                className="fixed inset-0 z-30 bg-black"
                aria-hidden="true"
              />

              {/* Popover — anchored to the sticky bar, never full-screen. */}
              <m.div
                key="hierarchy-panel"
                id={PANEL_ID}
                role="dialog"
                aria-label="Project hierarchy"
                aria-modal="true"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute left-0 right-0 top-full z-50 mt-2 flex max-h-[58dvh] flex-col border-[3px] border-border bg-bg-sidebar shadow-[6px_6px_0_#161310]"
              >
                {/*
                  The trap wraps the header too, so the close button is the
                  first thing focus lands on and stays reachable by Tab.
                */}
                <FocusTrap active={isOpen}>
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b-[3px] border-header-ink bg-header-bg px-3 py-1.5">
                    <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-header-ink">
                      Hierarchy
                    </span>
                    <button
                      type="button"
                      onClick={handleClose}
                      className={`flex h-[44px] w-[44px] items-center justify-center border-2 border-border bg-header-bg text-header-ink transition-colors hover:bg-status hover:text-status-ink ${FOCUS_RING}`}
                      aria-label="Close hierarchy"
                    >
                      <X size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
                    {/*
                      Activity keeps the tree's own state (scroll offset,
                      expanded folders) out of the animation's way while the
                      popover mounts and unmounts around it.
                    */}
                    <Activity mode={isOpen ? 'visible' : 'hidden'}>
                      <DrawerFileTree activeFileId={activeFileId} onSelect={handleFileSelect} />
                    </Activity>
                  </div>
                </FocusTrap>
              </m.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * DrawerFileTree — extracted so Activity can preserve its state
 * (expanded folders, scroll position) across open/close cycles.
 */
function DrawerFileTree({
  activeFileId,
  onSelect,
}: {
  activeFileId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul role="tree" aria-label="Project files" className="space-y-0.5">
      {FILE_TREE.map((node) => (
        <MobileTreeNode
          key={node.id}
          node={node}
          level={0}
          activeFileId={activeFileId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

// --- Simplified tree node for mobile (no keyboard nav, touch-optimized) ---

function MobileTreeNode({
  node,
  level,
  activeFileId,
  onSelect,
  defaultExpanded = true,
}: {
  node: FileNode;
  level: number;
  activeFileId: string | null;
  onSelect: (id: string) => void;
  defaultExpanded?: boolean;
}) {
  const isActive = node.id === activeFileId;
  // Folders default expanded on mobile for discoverability
  const [isExpanded, setExpanded] = useState(defaultExpanded);

  const Icon = node.icon;

  const handleClick = useCallback(() => {
    if (node.isFolder) {
      setExpanded((prev) => !prev);
    } else {
      onSelect(node.id);
    }
  }, [node.id, node.isFolder, onSelect, setExpanded]);

  return (
    <li role="treeitem" aria-expanded={node.isFolder ? isExpanded : undefined} aria-selected={isActive}>
      <button
        type="button"
        onClick={handleClick}
        className={`flex w-full items-center gap-2 border-2 px-2 text-left font-mono text-sm font-bold uppercase tracking-[0.03em] transition-colors min-h-[48px] ${FOCUS_RING} ${
          isActive
            ? 'border-border bg-interactive text-interactive-ink shadow-[3px_3px_0_#161310]'
            : 'border-transparent text-text-primary hover:border-border hover:bg-status hover:text-status-ink active:bg-interactive active:text-interactive-ink'
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        <Icon
          size={18}
          strokeWidth={1.5}
          className={`shrink-0 ${isActive ? 'text-interactive-ink' : 'text-text-muted'}`}
        />
        <span className="truncate">{node.label}</span>
      </button>

      {node.isFolder && isExpanded && node.children && (
        <ul role="group">
          {node.children.map((child) => (
            <MobileTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              activeFileId={activeFileId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
