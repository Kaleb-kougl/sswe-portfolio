'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { LazyMotion, domMax, MotionConfig } from 'motion/react';
import dynamic from 'next/dynamic';
import { LucideProvider } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEngineStore } from '@/store/useEngineStore';
import { FILE_LOG_MAP } from '@/data/consoleLogs';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ViewportRefProvider } from '../viewport-ref-context';
import { CanvasLoadingHUD } from '../3d/canvas-loading-hud';
import { ModelControlsHUD } from '../3d/model-controls-hud';
import { ViewportThesis } from '../viewport-thesis';
import { SceneTiles } from '../scene-tiles';
import { LevelTimeline } from '../level-timeline';
import { MobileTopBar } from './mobile-top-bar';
import { MobileHierarchyDropdown } from './mobile-drawer';
import { MobileBottomSheet } from './mobile-bottom-sheet';
import { MobileConsoleOverlay } from './mobile-console-overlay';
import { MobileContactCard } from './mobile-contact-card';
import { useTopBarOffset } from './use-top-bar-offset';

// Dynamic import of MemoizedCanvasWrapper (ssr: false — R3F requires browser APIs).
// NOTE: this is ViewportGate, not a raw <Canvas>. It decides Live / Still / Text
// by itself using useIsMobile() + useReducedMotion(), so on a phone it already
// paints the static preview with the "▶ TAP TO LOAD 3D" button and only mounts
// WebGL after the tap. Do not wrap it in a second ViewportStill — that would
// cost the viewer two taps for one decision.
const MemoizedCanvasWrapper = dynamic(
  () => import('../3d/canvas-wrapper').then((mod) => mod.MemoizedCanvasWrapper),
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

/**
 * MobileLayout — the layout for viewports < 768px.
 *
 * The desktop is four resizable panels. Three editor panels do not fit a 390px
 * screen, and the old mobile layout admitted as much by hiding two of them
 * behind a drawer and a sheet: everything was one tap away, so nothing was
 * read. This is the same content as ONE honest single-column scroll:
 *
 *   1. Title card      <ViewportThesis/>  — who this is, and two CTAs
 *   2. Demo            the live 3D in a SHORT viewport (not hidden: the demos
 *                      are the main attraction on a phone too)
 *   3. Projects        <SceneTiles/>
 *   4. Timeline        <LevelTimeline/>
 *   5. Contact         <MobileContactCard/>
 *
 * The chrome around that scroll:
 * - MobileTopBar, fixed (owned by another module — read, never assumed: the
 *   offset everything else hangs off is MEASURED from it by useTopBarOffset).
 * - MobileHierarchyDropdown, a sticky bar parked under the top bar, so any file
 *   is still one tap away without a full-screen drawer.
 * - MobileBottomSheet, docked at `peek`, holding the Inspector and the Console.
 *
 * Wrapped in LazyMotion + domMax for bundle optimization (~4.6kb vs ~34kb).
 * Uses m.* elements (not motion.*) inside the LazyMotion boundary.
 * MotionConfig provides global spring defaults and reducedMotion="user", which
 * is what makes every animation below honour prefers-reduced-motion.
 */
export default function MobileLayout() {
  const viewportRef = useRef<HTMLDivElement>(null);
  /*
    ViewportThesis dismisses itself on `pointerdown` anywhere in the element it
    gets from ViewportRefContext. On the desktop that element is the viewport
    panel and the gesture means "I want the scene, not the card". In a scrolling
    column the same listener would fire on an ordinary scroll-start and yank the
    title card out from under the reader's thumb, so the card is handed a ref
    that is deliberately never attached: no element, no listener. It still goes
    away the moment the visitor picks anything (it only renders on `overview`).
  */
  const detachedRef = useRef<HTMLDivElement>(null);

  const topBarOffset = useTopBarOffset();
  const prefersReducedMotion = useReducedMotion();

  const { activeFileId, setActiveFile, setSheetState } = useEngineStore(
    useShallow((s) => ({
      activeFileId: s.activeFileId,
      setActiveFile: s.setActiveFile,
      setSheetState: s.setMobileSheetState,
    }))
  );
  const sheetState = useEngineStore((s) => s.mobileSheetState);

  useEffect(() => {
    if (!activeFileId) {
      setActiveFile('overview', FILE_LOG_MAP['overview']);
    }
    // The store's default is `expanded`, which was right when the sheet WAS the
    // mobile layout. Now the page is the layout, so the sheet starts docked.
    setSheetState('peek');
    // Mount only — a later `expanded` (file picked in the Hierarchy) must stick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    SceneTiles, LevelTimeline and the thesis CTAs all call setActiveFile
    directly — they cannot know about the mobile layout. Their tap changes the
    scene in a viewport that may be off screen, which reads as "nothing
    happened". Scroll that viewport back into view instead of hijacking the
    screen with the sheet.
  */
  const isFirstFile = useRef(true);
  useEffect(() => {
    if (isFirstFile.current) {
      isFirstFile.current = false;
      return;
    }
    viewportRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [activeFileId, prefersReducedMotion]);

  const isOverview = activeFileId === 'overview';

  return (
    <LucideProvider size={16} strokeWidth={1.5}>
      <LazyMotion features={domMax} strict>
        <MotionConfig
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          reducedMotion="user"
        >
          <div className="relative min-h-dvh w-full bg-bg-editor">
            {/* Fixed toolbar — everything below is offset around it, by measurement */}
            <MobileTopBar />
            <div aria-hidden="true" style={{ height: topBarOffset }} />

            {/* Sticky Hierarchy — parks itself flush under the fixed top bar */}
            <MobileHierarchyDropdown stickyTop={topBarOffset} />

            <main
              id="main-content"
              tabIndex={-1}
              // pb clears the docked bottom sheet (~18dvh) plus its safe area.
              className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-3 pb-[24dvh] pt-2"
            >
              {/*
                1. TITLE CARD.
                ViewportThesis is an `absolute inset-0` overlay by construction,
                so it needs a positioned box with a real height — it cannot size
                itself. It only renders on `overview`, and the box goes with it
                rather than leaving a hole in the scroll.
                Known overlap: the card renders its own <SceneTiles/> underneath
                itself, so the overview screen shows the project grid twice (once
                inside this box, once as section 3). Section 3 is the canonical
                one — it survives after the card is gone.
              */}
              {isOverview && (
                <section
                  aria-label="Introduction"
                  className="relative h-[min(78dvh,620px)] w-full overflow-hidden border-[3px] border-border bg-bg-panel shadow-[6px_6px_0_#161310]"
                >
                  <ViewportRefProvider value={detachedRef}>
                    <ViewportThesis />
                  </ViewportRefProvider>
                </section>
              )}

              {/* 2. DEMO — short viewport, live 3D, never hidden on phones */}
              <SectionShell label="Live demo" caption="Tap to load · drag to orbit">
                <ViewportRefProvider value={viewportRef}>
                  <div
                    ref={viewportRef}
                    aria-label="3D Viewport"
                    // `group`, not `region`: this box already sits inside the
                    // named "Live demo" section, and a second landmark there
                    // would be noise. `group` still carries the accessible
                    // name the e2e suite selects on, and unlike the old
                    // role="img" it does not hide the gate's own
                    // "TAP TO LOAD 3D" button from assistive tech.
                    role="group"
                    className="relative h-[min(58dvh,440px)] w-full overflow-hidden bg-bg-editor"
                  >
                    <CanvasLoadingHUD />
                    <ModelControlsHUD />
                    <MemoizedCanvasWrapper />
                  </div>
                </ViewportRefProvider>
              </SectionShell>

              {/* 3. PROJECTS */}
              <SectionShell label="Projects" caption="Tap to load a scene">
                <div className="p-3">
                  <SceneTiles />
                </div>
              </SectionShell>

              {/* 4. TIMELINE — LevelTimeline draws its own bordered panel */}
              <LevelTimeline />

              {/* 5. CONTACT */}
              <MobileContactCard />
            </main>

            {/* Docked Inspector / Console sheet */}
            <MobileBottomSheet />

            {/*
              Ambient log toast. Only while the sheet is fully dismissed —
              otherwise it would sit behind the dock and repeat what the dock's
              Console tab is already showing.
            */}
            {sheetState === 'hidden' && <MobileConsoleOverlay />}
          </div>
        </MotionConfig>
      </LazyMotion>
    </LucideProvider>
  );
}

/**
 * SectionShell — the panel-header recipe (paper fill, ink text, 3px ink bottom
 * border) around a section of the scroll, so every block reads as the same kind
 * of object as a desktop panel.
 */
function SectionShell({
  label,
  caption,
  children,
}: {
  label: string;
  caption?: string;
  children: ReactNode;
}) {
  const headingId = `mobile-section-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <section
      aria-labelledby={headingId}
      className="border-[3px] border-border bg-bg-panel shadow-[6px_6px_0_#161310]"
    >
      <div className="flex items-center justify-between gap-2 border-b-[3px] border-header-ink bg-header-bg px-3 py-2">
        <h2
          id={headingId}
          className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-header-ink"
        >
          {label}
        </h2>
        {caption && (
          <span className="truncate font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-text-muted">
            {caption}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
