'use client';

import {
  useState,
  useCallback,
  useRef,
  useMemo,
  startTransition,
} from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { FILE_TREE, type FileNode } from '@/data/fileTree';
import { FILE_LOG_MAP } from '@/data/consoleLogs';
import { useEngineStore } from '@/store/useEngineStore';

// Stagger delay per node (matches the old 0.04s staggerChildren)
const STAGGER_DELAY_S = 0.04;

// --- Flatten tree into ordered list for keyboard navigation ---
function flattenVisible(
  nodes: FileNode[],
  expandedSet: Set<string>
): FileNode[] {
  const result: FileNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.isFolder && expandedSet.has(node.id) && node.children) {
      result.push(...flattenVisible(node.children, expandedSet));
    }
  }
  return result;
}

// Count visible descendants (for stagger delay offset calculation)
function countVisible(nodes: FileNode[], expandedSet: Set<string>): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.isFolder && expandedSet.has(node.id) && node.children) {
      count += countVisible(node.children, expandedSet);
    }
  }
  return count;
}

function findParent(
  nodes: FileNode[],
  targetId: string,
  parent: FileNode | null = null
): FileNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return parent;
    if (node.children) {
      const found = findParent(node.children, targetId, node);
      if (found !== undefined && found !== null) return found;
      // Check if target is a direct child
      if (node.children.some((c) => c.id === targetId)) return node;
    }
  }
  return null;
}

function findParentInTree(
  nodes: FileNode[],
  targetId: string
): FileNode | null {
  for (const node of nodes) {
    if (node.children) {
      for (const child of node.children) {
        if (child.id === targetId) return node;
      }
      const found = findParentInTree(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

// --- TreeNode Component ---
interface TreeNodeProps {
  node: FileNode;
  level: number;
  staggerIndex: number;
  activeFileId: string | null;
  focusedNodeId: string | null;
  expandedSet: Set<string>;
  onFileSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onFocusNode: (id: string) => void;
  nodeRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}

function TreeNode({
  node,
  level,
  staggerIndex,
  activeFileId,
  focusedNodeId,
  expandedSet,
  onFileSelect,
  onToggleExpand,
  onFocusNode,
  nodeRefs,
}: TreeNodeProps) {
  const isExpanded = expandedSet.has(node.id);
  const isFocused = node.id === focusedNodeId;
  const isActive = node.id === activeFileId;

  const handleClick = useCallback(() => {
    onFocusNode(node.id);
    if (node.isFolder) {
      onToggleExpand(node.id);
    } else {
      onFileSelect(node.id);
    }
  }, [node.id, node.isFolder, onFileSelect, onToggleExpand, onFocusNode]);

  const Icon = node.icon;

  const setRef = useCallback(
    (el: HTMLButtonElement | null) => {
      if (el) {
        nodeRefs.current.set(node.id, el);
      } else {
        nodeRefs.current.delete(node.id);
      }
    },
    [node.id, nodeRefs]
  );

  // Count child nodes for stagger offset
  let childStaggerBase = staggerIndex + 1;

  return (
    <li
      className="tree-stagger-item"
      style={{ animationDelay: `${staggerIndex * STAGGER_DELAY_S}s` }}
      role="treeitem"
      aria-expanded={node.isFolder ? isExpanded : undefined}
      aria-selected={isActive}
    >
      <button
        ref={setRef}
        type="button"
        onClick={handleClick}
        tabIndex={isFocused ? 0 : -1}
        className={`flex w-full items-center gap-1.5 rounded-sm px-1 text-left font-mono text-[13px] transition-colors min-h-[44px] min-w-[44px] ${
          isActive
            ? 'bg-bg-active text-text-accent'
            : 'text-text-primary hover:bg-bg-hover'
        }`}
        style={{ paddingLeft: `${level * 12 + 4}px` }}
        aria-label={
          node.isFolder
            ? `${node.label} folder, ${isExpanded ? 'expanded' : 'collapsed'}`
            : node.label
        }
      >
        {node.isFolder ? (
          isExpanded ? (
            <ChevronDown
              size={14}
              strokeWidth={1.5}
              className="shrink-0 text-text-muted"
            />
          ) : (
            <ChevronRight
              size={14}
              strokeWidth={1.5}
              className="shrink-0 text-text-muted"
            />
          )
        ) : (
          <span className="w-[14px] shrink-0" />
        )}
        <Icon
          size={16}
          strokeWidth={1.5}
          className={`shrink-0 ${isActive ? 'text-text-accent' : 'text-text-muted'}`}
        />
        <span className="truncate">{node.label}</span>
      </button>

      {node.isFolder && isExpanded && node.children && (
        <ul role="group">
          {node.children.map((child) => {
            const idx = childStaggerBase;
            // Advance by 1 + count of child's visible descendants
            childStaggerBase += 1 + (child.isFolder && expandedSet.has(child.id) && child.children ? countVisible(child.children, expandedSet) : 0);
            return (
              <TreeNode
                key={child.id}
                node={child}
                level={level + 1}
                staggerIndex={idx}
                activeFileId={activeFileId}
                focusedNodeId={focusedNodeId}
                expandedSet={expandedSet}
                onFileSelect={onFileSelect}
                onToggleExpand={onToggleExpand}
                onFocusNode={onFocusNode}
                nodeRefs={nodeRefs}
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}

// --- HierarchyTree Root ---
export function HierarchyTree() {
  const activeFileId = useEngineStore((s) => s.activeFileId);
  const setActiveFile = useEngineStore((s) => s.setActiveFile);

  // Track expanded folders — all expanded by default
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const node of FILE_TREE) {
      if (node.isFolder) initial.add(node.id);
    }
    return initial;
  });

  // Track which node has keyboard focus (roving tabindex)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(
    FILE_TREE[0]?.id ?? null
  );

  // Refs for programmatic focus
  const nodeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Flat list of visible nodes for arrow key navigation
  const visibleNodes = useMemo(
    () => flattenVisible(FILE_TREE, expandedSet),
    [expandedSet]
  );

  const handleFileSelect = useCallback(
    (id: string) => {
      const logMsg = FILE_LOG_MAP[id];
      // Use startTransition for non-urgent state updates (TDD §6)
      startTransition(() => {
        setActiveFile(id, logMsg);
      });
    },
    [setActiveFile]
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleFocusNode = useCallback(
    (id: string) => {
      setFocusedNodeId(id);
      const el = nodeRefs.current.get(id);
      el?.focus();
    },
    []
  );

  // --- WAI-ARIA Tree keyboard navigation ---
  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = visibleNodes.findIndex(
        (n) => n.id === focusedNodeId
      );
      if (currentIndex === -1) return;

      const current = visibleNodes[currentIndex];
      let handled = true;

      switch (e.key) {
        case 'ArrowDown': {
          const next = visibleNodes[currentIndex + 1];
          if (next) handleFocusNode(next.id);
          break;
        }
        case 'ArrowUp': {
          const prev = visibleNodes[currentIndex - 1];
          if (prev) handleFocusNode(prev.id);
          break;
        }
        case 'ArrowRight': {
          if (current.isFolder) {
            if (!expandedSet.has(current.id)) {
              // Expand collapsed folder
              handleToggleExpand(current.id);
            } else if (current.children?.length) {
              // Move to first child
              handleFocusNode(current.children[0].id);
            }
          }
          break;
        }
        case 'ArrowLeft': {
          if (current.isFolder && expandedSet.has(current.id)) {
            // Collapse expanded folder
            handleToggleExpand(current.id);
          } else {
            // Move to parent
            const parent = findParentInTree(FILE_TREE, current.id);
            if (parent) handleFocusNode(parent.id);
          }
          break;
        }
        case 'Home': {
          handleFocusNode(visibleNodes[0].id);
          break;
        }
        case 'End': {
          handleFocusNode(visibleNodes[visibleNodes.length - 1].id);
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          if (current.isFolder) {
            handleToggleExpand(current.id);
          } else {
            handleFileSelect(current.id);
          }
          break;
        }
        default:
          handled = false;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [
      focusedNodeId,
      visibleNodes,
      expandedSet,
      handleFocusNode,
      handleToggleExpand,
      handleFileSelect,
    ]
  );

  // Build stagger indices for root-level nodes
  let rootStagger = 0;

  return (
    <nav
      className="flex h-full flex-col overflow-hidden bg-bg-sidebar"
      aria-label="Project hierarchy"
    >
      <div className="flex h-[var(--toolbar-height)] items-center border-b border-border px-3">
        <span className="font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
          Hierarchy
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-1" onKeyDown={handleTreeKeyDown}>
        <ul
          role="tree"
          className="space-y-0.5"
          aria-label="Project files"
        >
          {FILE_TREE.map((node) => {
            const idx = rootStagger;
            rootStagger += 1 + (node.isFolder && expandedSet.has(node.id) && node.children ? countVisible(node.children, expandedSet) : 0);
            return (
              <TreeNode
                key={node.id}
                node={node}
                level={0}
                staggerIndex={idx}
                activeFileId={activeFileId}
                focusedNodeId={focusedNodeId}
                expandedSet={expandedSet}
                onFileSelect={handleFileSelect}
                onToggleExpand={handleToggleExpand}
                onFocusNode={handleFocusNode}
                nodeRefs={nodeRefs}
              />
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
