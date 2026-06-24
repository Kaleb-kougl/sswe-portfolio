'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
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
import { ViewportRefProvider } from './viewport-ref-context';
import { CanvasLoadingHUD } from './3d/canvas-loading-hud';
import { ModelControlsHUD } from './3d/model-controls-hud';
import { useIsMobile } from '@/hooks/useIsMobile';

// Dynamic import of MemoizedCanvasWrapper (ssr: false — R3F requires browser APIs)
const MemoizedCanvasWrapper = dynamic(
  () => import('./3d/canvas-wrapper').then((mod) => mod.MemoizedCanvasWrapper),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-bg-editor">
        <div className="flex flex-col items-center gap-2">
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
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
            Initializing 3D engine...
          </p>
        </div>
      </div>
    ),
  }
);

// Dynamic import of MobileLayout — code-split so desktop users don't pay for mobile bundle
const MobileLayout = dynamic(() => import('./mobile/mobile-layout'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full items-center justify-center bg-bg-editor">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-text-muted animate-pulse">
        Loading mobile layout...
      </p>
    </div>
  ),
});

export default function IDELayout() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileLayout />;
  }

  return <DesktopLayout />;
}

/**
 * DesktopLayout — the original 4-pane IDE layout using react-resizable-panels.
 * Rendered when viewport >= 768px.
 */
function DesktopLayout() {
  const hierarchyRef = usePanelRef();
  const viewportRef = useRef<HTMLDivElement>(null);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'ide-layout',
    storage: typeof window !== 'undefined' ? localStorage : undefined,
  });

  return (
    <LucideProvider size={16} strokeWidth={1.5}>
      <div id="main-content" tabIndex={-1} className="h-dvh w-full overflow-hidden bg-bg-editor">
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
                  className="contain-content"
                >
                  <HierarchyTree />
                </Panel>

                <Separator
                  className="w-[3px] bg-border transition-colors data-[state=hover]:bg-tangerine data-[state=drag]:bg-cobalt"
                  aria-label="Resize hierarchy panel"
                />

                {/* Center Panel: Viewport (3D Canvas) */}
                <Panel id="viewport" defaultSize="45%" className="relative contain-content">
                  <ViewportRefProvider value={viewportRef}>
                    <main
                      ref={viewportRef}
                      className="relative h-full w-full bg-bg-editor"
                      aria-label="3D Viewport"
                    >
                      <CanvasLoadingHUD />
                      <ModelControlsHUD />
                      <MemoizedCanvasWrapper />
                    </main>
                  </ViewportRefProvider>
                </Panel>

                <Separator
                  className="w-[3px] bg-border transition-colors data-[state=hover]:bg-tangerine data-[state=drag]:bg-cobalt"
                  aria-label="Resize inspector panel"
                />

                {/* Right Panel: Inspector */}
                <Panel id="inspector-panel" defaultSize="35%" minSize="20%" className="contain-content">
                  <InspectorPanel />
                </Panel>
              </Group>
            </div>
          </Panel>

          <Separator
            className="h-[3px] bg-border transition-colors data-[state=hover]:bg-tangerine data-[state=drag]:bg-cobalt"
            aria-label="Resize console panel"
          />

          {/* Bottom Panel: Console */}
          <Panel id="console" defaultSize="20%" minSize="10%" className="contain-content">
            <TerminalConsole />
          </Panel>
        </Group>
      </div>
    </LucideProvider>
  );
}
