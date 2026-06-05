'use client';

import { useCallback, useState, Activity } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { X } from 'lucide-react';
import { useEngineStore } from '@/store/useEngineStore';
import { useShallow } from 'zustand/react/shallow';
import { FILE_TREE, type FileNode } from '@/data/fileTree';
import { FILE_LOG_MAP } from '@/data/consoleLogs';
import { MOBILE_MENU_TRIGGER_ID } from './mobile-top-bar';

/**
 * MobileDrawer — off-canvas hierarchy that slides from the left.
 * Uses LazyMotion m.* elements (parent provides LazyMotion context).
 *
 * AnimatePresence critical rules (TDD §5):
 * - AnimatePresence stays mounted; conditionals go INSIDE it
 * - Every direct child has a stable unique key
 * - onExitComplete restores focus to the hamburger trigger
 *
 * React 19 <Activity mode='hidden'>:
 * The file tree content is wrapped in <Activity> to preserve scroll position
 * and component expand/collapse state when the drawer is closed, instead of
 * fully unmounting. The animated shell (m.aside) handles the visual slide.
 */
export function MobileDrawer() {
  const { isOpen, setDrawerOpen, setActiveFile, setSheetState, activeFileId } = useEngineStore(
    useShallow((s) => ({
      isOpen: s.isMobileDrawerOpen,
      setDrawerOpen: s.setMobileDrawerOpen,
      setActiveFile: s.setActiveFile,
      setSheetState: s.setMobileSheetState,
      activeFileId: s.activeFileId,
    }))
  );

  const handleFileSelect = useCallback(
    (id: string) => {
      const logMsg = FILE_LOG_MAP[id];
      setActiveFile(id, logMsg);
      setDrawerOpen(false);
      setSheetState('peek');
    },
    [setActiveFile, setDrawerOpen, setSheetState]
  );

  const handleClose = useCallback(() => {
    setDrawerOpen(false);
  }, [setDrawerOpen]);

  const handleExitComplete = useCallback(() => {
    const trigger = document.getElementById(MOBILE_MENU_TRIGGER_ID);
    trigger?.focus();
  }, []);

  return (
    <>
      {/* AnimatePresence handles the visual slide animation */}
      <AnimatePresence onExitComplete={handleExitComplete}>
        {isOpen && (
          <>
            {/* Backdrop */}
            <m.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="fixed inset-0 z-40 bg-black"
              aria-hidden="true"
            />

            {/* Drawer panel — animated shell */}
            <m.aside
              key="drawer-panel"
              role="dialog"
              aria-label="Project hierarchy"
              aria-modal="true"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="fixed left-0 top-0 z-50 flex h-dvh w-72 flex-col bg-bg-sidebar shadow-2xl"
            >
              {/* Header */}
              <div className="flex h-[var(--toolbar-height)] items-center justify-between border-b border-border px-3">
                <span className="font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
                  Hierarchy
                </span>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-lg transition-colors hover:bg-bg-hover"
                  aria-label="Close hierarchy drawer"
                >
                  <X size={18} strokeWidth={1.5} className="text-text-muted" />
                </button>
              </div>

              {/* File list — Activity preserves scroll + expand state */}
              <div className="flex-1 overflow-y-auto p-1">
                <Activity mode={isOpen ? 'visible' : 'hidden'}>
                  <DrawerFileTree activeFileId={activeFileId} onSelect={handleFileSelect} />
                </Activity>
              </div>
            </m.aside>
          </>
        )}
      </AnimatePresence>
    </>
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
        className={`flex w-full items-center gap-2 rounded-md px-2 text-left font-mono text-sm transition-colors min-h-[48px] ${
          isActive
            ? 'bg-bg-active text-text-accent'
            : 'text-text-primary hover:bg-bg-hover active:bg-bg-active'
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        <Icon
          size={18}
          strokeWidth={1.5}
          className={`shrink-0 ${isActive ? 'text-text-accent' : 'text-text-muted'}`}
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

