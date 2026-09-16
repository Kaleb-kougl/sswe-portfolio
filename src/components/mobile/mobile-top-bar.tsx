'use client';

import { useCallback, useRef } from 'react';
import { Download, Mail, Menu, Terminal } from 'lucide-react';
import { FILE_LOG_MAP } from '@/data/consoleLogs';
import { useEngineStore } from '@/store/useEngineStore';

/** Shared focus treatment — `interactive` owns focus rings. */
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive';

/**
 * MobileTopBar — floating neo-brutalist toolbar at z-50.
 *
 * Mirrors the desktop TopBar's color roles: the bar is the panel-header
 * recipe (paper bg, ink text, 3px ink border), "Get in touch" is the single
 * `action` CTA, the resume link is the quieter outlined secondary, and `status`
 * appears only as the small availability chip.
 *
 * Contains hamburger menu (opens drawer), app title, status chip, resume link
 * and the primary contact CTA.
 */
export function MobileTopBar() {
  const isMobileDrawerOpen = useEngineStore((s) => s.isMobileDrawerOpen);
  const setMobileDrawerOpen = useEngineStore((s) => s.setMobileDrawerOpen);
  const setSheetState = useEngineStore((s) => s.setMobileSheetState);
  const setActiveFile = useEngineStore((s) => s.setActiveFile);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const handleToggleDrawer = () => {
    const willOpen = !isMobileDrawerOpen;
    setMobileDrawerOpen(willOpen);
    // Dismiss the bottom sheet when opening the hierarchy drawer
    if (willOpen) {
      setSheetState('hidden');
    }
  };

  // Primary CTA: select Contact_Info.grpc and surface it in the bottom sheet
  // (the mobile Inspector), closing the drawer if it happens to be open.
  const handleGetInTouch = useCallback(() => {
    setActiveFile('contact-info', FILE_LOG_MAP['contact-info']);
    setMobileDrawerOpen(false);
    setSheetState('expanded');
  }, [setActiveFile, setMobileDrawerOpen, setSheetState]);

  return (
    <header
      className="fixed left-3 right-3 z-50 flex h-14 items-center justify-between gap-1 border-[3px] border-header-ink bg-header-bg px-1.5 shadow-[6px_6px_0_#161310]"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      aria-label="Application toolbar"
    >
      {/* Left: Hamburger — toggles drawer open/closed */}
      <button
        ref={hamburgerRef}
        id="mobile-menu-trigger"
        type="button"
        onClick={handleToggleDrawer}
        className={`flex h-11 w-11 shrink-0 items-center justify-center border-2 border-transparent transition-colors hover:border-border hover:bg-status hover:text-status-ink active:bg-status active:text-status-ink ${FOCUS_RING}`}
        aria-label={isMobileDrawerOpen ? 'Close project hierarchy' : 'Open project hierarchy'}
        aria-haspopup="dialog"
        aria-expanded={isMobileDrawerOpen}
      >
        <Menu size={18} strokeWidth={2} className="text-header-ink" />
      </button>

      {/* Center: App title */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
        <Terminal size={14} strokeWidth={2} className="shrink-0 text-header-ink" />
        <span className="truncate font-mono text-[11px] font-bold uppercase tracking-[0.03em] text-header-ink">
          portfolio.kaleb.kougl
        </span>
      </div>

      {/* Right: status chip → secondary (resume) → primary CTA (get in touch) */}
      {/*
        Live availability signal. DELETE THIS CHIP once an offer is accepted —
        `status` is for live state only, and a stale chip is a lie.
      */}
      <span className="inline-flex shrink-0 items-center border-2 border-border bg-status px-1 py-0.5 font-mono text-[8px] font-bold uppercase leading-tight tracking-[0.08em] text-status-ink">
        Open to roles
      </span>

      {/* Secondary: outlined ink-on-paper, deliberately quieter than the CTA. */}
      <a
        href="/KalebK_Resume.pdf"
        download
        className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center border-2 border-border bg-header-bg text-header-ink shadow-[2px_2px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0_#161310] ${FOCUS_RING}`}
        aria-label="Download resume"
      >
        <Download size={14} strokeWidth={2.5} className="text-header-ink" />
        <span className="font-mono text-[8px] font-bold uppercase leading-tight text-header-ink">
          Resume
        </span>
      </a>

      {/* Primary CTA — the only `action` surface in the app. */}
      <button
        type="button"
        onClick={handleGetInTouch}
        className={`mr-0.5 flex h-11 w-11 shrink-0 flex-col items-center justify-center border-2 border-border bg-action text-action-ink shadow-[3px_3px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_#161310] ${FOCUS_RING}`}
        aria-label="Get in touch"
      >
        <Mail size={14} strokeWidth={2.5} className="text-action-ink" />
        <span className="font-mono text-[8px] font-bold uppercase leading-tight text-action-ink">
          Contact
        </span>
      </button>
    </header>
  );
}

/** Ref accessor for focus restoration from drawer */
export const MOBILE_MENU_TRIGGER_ID = 'mobile-menu-trigger';
