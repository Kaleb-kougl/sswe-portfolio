'use client';

import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { FILE_TREE, type FileNode } from '@/data/fileTree';
import { FILE_LOG_MAP } from '@/data/consoleLogs';
import { useEngineStore } from '@/store/useEngineStore';

interface TreeNodeProps {
  node: FileNode;
  level: number;
  activeFileId: string | null;
  onFileSelect: (id: string) => void;
}

function TreeNode({ node, level, activeFileId, onFileSelect }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleClick = useCallback(() => {
    if (node.isFolder) {
      setIsExpanded((prev) => !prev);
    } else {
      onFileSelect(node.id);
    }
  }, [node.id, node.isFolder, onFileSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  const Icon = node.icon;
  const isActive = node.id === activeFileId;

  return (
    <li
      role="treeitem"
      aria-expanded={node.isFolder ? isExpanded : undefined}
      aria-selected={!node.isFolder ? isActive : undefined}
    >
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-left font-mono text-[13px] transition-colors ${
          isActive
            ? 'bg-bg-active text-text-accent'
            : 'text-text-primary hover:bg-bg-hover'
        }`}
        style={{ paddingLeft: `${level * 12 + 4}px` }}
      >
        {node.isFolder ? (
          isExpanded ? (
            <ChevronDown size={14} strokeWidth={1.5} className="shrink-0 text-text-muted" />
          ) : (
            <ChevronRight size={14} strokeWidth={1.5} className="shrink-0 text-text-muted" />
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
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              activeFileId={activeFileId}
              onFileSelect={onFileSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function HierarchyTree() {
  const activeFileId = useEngineStore((s) => s.activeFileId);
  const setActiveFile = useEngineStore((s) => s.setActiveFile);

  const handleFileSelect = useCallback(
    (id: string) => {
      const logMsg = FILE_LOG_MAP[id];
      setActiveFile(id, logMsg);
    },
    [setActiveFile]
  );

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
      <div className="flex-1 overflow-y-auto p-1">
        <ul role="tree" className="space-y-0.5">
          {FILE_TREE.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              level={0}
              activeFileId={activeFileId}
              onFileSelect={handleFileSelect}
            />
          ))}
        </ul>
      </div>
    </nav>
  );
}
