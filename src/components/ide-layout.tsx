'use client';

import {
  Group,
  Panel,
  Separator,
  usePanelRef,
  useDefaultLayout,
} from 'react-resizable-panels';
import { LucideProvider } from 'lucide-react';
import { TopBar } from './top-bar';
import { HierarchyTree } from './hierarchy-tree';
import { InspectorPanel } from './inspector-panel';
import { TerminalConsole } from './terminal-console';

export default function IDELayout() {
  const hierarchyRef = usePanelRef();

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'ide-layout',
    storage: typeof window !== 'undefined' ? localStorage : undefined,
  });

  return (
    <LucideProvider size={16} strokeWidth={1.5}>
      <div className="h-dvh w-full overflow-hidden bg-bg-editor">
        {/* Root vertical group: [TopBar + Main area] / [Console] */}
        <Group
          orientation="vertical"
          className="h-dvh"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          {/* Main area: horizontal split */}
          <Panel id="main-area" defaultSize="80%" minSize="50%">
            <div className="flex h-full flex-col">
              <TopBar />

              {/* Horizontal split: Hierarchy | Viewport | Inspector */}
              <Group orientation="horizontal" className="flex-1">
                {/* Left Panel: Hierarchy */}
                <Panel
                  id="hierarchy"
                  panelRef={hierarchyRef}
                  collapsible
                  collapsedSize="0%"
                  defaultSize="20%"
                  minSize="15%"
                >
                  <HierarchyTree />
                </Panel>

                <Separator
                  className="w-px bg-border transition-colors data-[state=hover]:bg-resize-handle data-[state=drag]:bg-text-accent"
                  aria-label="Resize hierarchy panel"
                />

                {/* Center Panel: Viewport */}
                <Panel id="viewport" defaultSize="45%" className="relative">
                  <main
                    aria-label="Viewport"
                    className="flex h-full items-center justify-center bg-bg-editor"
                  >
                    <div
                      id="viewport"
                      className="flex flex-col items-center gap-3 text-center"
                    >
                      <div className="h-16 w-16 rounded-lg border border-border/50 bg-bg-hover/30" />
                      <p className="font-mono text-xs text-text-muted">
                        3D Viewport — Phase 3
                      </p>
                    </div>
                  </main>
                </Panel>

                <Separator
                  className="w-px bg-border transition-colors data-[state=hover]:bg-resize-handle data-[state=drag]:bg-text-accent"
                  aria-label="Resize inspector panel"
                />

                {/* Right Panel: Inspector */}
                <Panel id="inspector-panel" defaultSize="35%" minSize="20%">
                  <InspectorPanel />
                </Panel>
              </Group>
            </div>
          </Panel>

          <Separator
            className="h-px bg-border transition-colors data-[state=hover]:bg-resize-handle data-[state=drag]:bg-text-accent"
            aria-label="Resize console panel"
          />

          {/* Bottom Panel: Console */}
          <Panel id="console" defaultSize="20%" minSize="10%">
            <TerminalConsole />
          </Panel>
        </Group>
      </div>
    </LucideProvider>
  );
}
