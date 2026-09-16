'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LazyMotion, domAnimation, AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { CONTACT_INFO, SUMMARY } from '@/data/resumeData';
import { FILE_LOG_MAP } from '@/data/consoleLogs';
import { useEngineStore } from '@/store/useEngineStore';
import { useViewportRef } from './viewport-ref-context';
import { SceneTiles } from './scene-tiles';

/** The file the primary CTA loads — the flashiest live scene in the viewport. */
const DEMO_FILE_ID = 'combat_system';
/** The file the secondary CTA loads — most recent role. */
const EXPERIENCE_FILE_ID = 'indeed-sr-swe';

/** `interactive` owns focus rings (see COLOR_ROLES in globals.css). */
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive';

/**
 * First sentence of the real SUMMARY — derived, never re-typed, so the card
 * can never drift from src/data/resumeData.ts (e.g. the "8+ years" figure).
 */
function leadSentence(summary: string): string {
  const end = summary.indexOf('. ');
  return end === -1 ? summary : summary.slice(0, end + 1);
}

/**
 * ViewportThesis — the HTML title card that answers "who is this?" in the
 * first ten seconds, plus the project tiles underneath it.
 *
 * Deliberately an HTML overlay and NOT drawn in WebGL: this is the only
 * copy on the page a screen reader or a crawler can actually read.
 *
 * Dismissal is local component state only — no store fields were added.
 * The component stays mounted for the session, so `dismissed` survives every
 * file change and the card never reappears once the visitor has moved on.
 */
export function ViewportThesis() {
  const activeFileId = useEngineStore((s) => s.activeFileId);
  const setActiveFile = useEngineStore((s) => s.setActiveFile);
  const viewportRef = useViewportRef();

  const [dismissed, setDismissed] = useState(false);

  // Visible only on the overview state, and only until the visitor engages.
  const isVisible = activeFileId === 'overview' && !dismissed;

  // Clicking into the scene dismisses it. The wrapper is pointer-events-none,
  // so the listener lives on the viewport panel itself. Presses that land on
  // the overlay's own controls are ignored here — those dismiss explicitly in
  // their click handlers, after the click has had a chance to fire.
  useEffect(() => {
    if (!isVisible) return;
    const el = viewportRef.current;
    if (!el) return;

    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-thesis-overlay]')) {
        return;
      }
      setDismissed(true);
    };
    el.addEventListener('pointerdown', dismiss);
    return () => el.removeEventListener('pointerdown', dismiss);
  }, [isVisible, viewportRef]);

  const handlePlayDemo = useCallback(() => {
    setDismissed(true);
    setActiveFile(DEMO_FILE_ID, FILE_LOG_MAP[DEMO_FILE_ID]);
  }, [setActiveFile]);

  const handleViewExperience = useCallback(() => {
    setDismissed(true);
    setActiveFile(EXPERIENCE_FILE_ID, FILE_LOG_MAP[EXPERIENCE_FILE_ID]);
  }, [setActiveFile]);

  const lead = useMemo(() => leadSentence(SUMMARY), []);

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {isVisible && (
          <m.div
            key="viewport-thesis"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            /*
              pointer-events-none: orbit/drag on the canvas around the card
              keeps working. Only the card and the tiles opt back in.
              Wheel events still bubble from the card, so this column scrolls
              when the panel is short.
            */
            className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center overflow-y-auto p-5"
          >
            {/*
              `my-auto` rather than `justify-center`: a centered flex column
              clips its own overflow at the top once the panel gets short.
            */}
            <div className="my-auto flex w-full max-w-[540px] flex-col items-center gap-4">
              <m.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.35 }}
                aria-labelledby="viewport-thesis-headline"
                data-thesis-overlay
                className="pointer-events-auto w-full max-w-[540px] shrink-0 border-[3px] border-border bg-bg-panel p-5 shadow-[8px_8px_0_#161310]"
              >
                {/* Eyebrow: title · location, straight from CONTACT_INFO */}
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                  {CONTACT_INFO.title}
                  <span aria-hidden="true"> · </span>
                  {CONTACT_INFO.location}
                </p>

                {/* Headline — one line, with the key phrase highlighted in lime.
                  Lime is a fill with ink on top, never lime text on paper. */}
                <h1
                  id="viewport-thesis-headline"
                  className="mt-2 font-display text-[clamp(1.35rem,3.2vw,2rem)] font-extrabold uppercase leading-[1.12] tracking-[-0.01em] text-text-primary"
                >
                  {CONTACT_INFO.name} builds{' '}
                  <span className="box-decoration-clone bg-status px-1.5 text-status-ink">
                    front-end platforms
                  </span>
                </h1>

                {/* Supporting sentence — derived from the real SUMMARY. */}
                <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-text-primary">
                  {lead}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {/* Primary CTA — `action`. The top bar owns the only other one. */}
                  <button
                    type="button"
                    onClick={handlePlayDemo}
                    className={`inline-flex min-h-[44px] items-center gap-2 border-[3px] border-border bg-action px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.08em] text-action-ink shadow-[5px_5px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[3px_3px_0_#161310] ${FOCUS_RING}`}
                  >
                    <span aria-hidden="true">▶</span>
                    Play a demo
                  </button>

                  {/* Secondary — outlined ink-on-paper, deliberately quieter. */}
                  <button
                    type="button"
                    onClick={handleViewExperience}
                    className={`inline-flex min-h-[44px] items-center border-[3px] border-border bg-header-bg px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.08em] text-header-ink shadow-[3px_3px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_#161310] ${FOCUS_RING}`}
                  >
                    View experience
                  </button>
                </div>
              </m.section>

              <m.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.35, delay: 0.08 }}
                data-thesis-overlay
                className="pointer-events-auto w-full max-w-[540px] shrink-0"
              >
                <SceneTiles />
              </m.div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
