'use client';

import { useRef } from 'react';
import { Download, Menu, Terminal } from 'lucide-react';
import { useEngineStore } from '@/store/useEngineStore';

/**
 * MobileTopBar — floating neo-brutalist toolbar at z-50.
 * Contains hamburger menu (opens drawer), app title, and download resume CTA.
 */
export function MobileTopBar() {
  const isMobileDrawerOpen = useEngineStore((s) => s.isMobileDrawerOpen);
  const setMobileDrawerOpen = useEngineStore((s) => s.setMobileDrawerOpen);
  const setSheetState = useEngineStore((s) => s.setMobileSheetState);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const handleToggleDrawer = () => {
    const willOpen = !isMobileDrawerOpen;
    setMobileDrawerOpen(willOpen);
    // Dismiss the bottom sheet when opening the hierarchy drawer
    if (willOpen) {
      setSheetState('hidden');
    }
  };

  return (
    <header
      className="glass-surface mobile-safe-top fixed top-3 left-3 right-3 z-50 flex h-12 items-center justify-between px-1.5"
      aria-label="Application toolbar"
    >
      {/* Left: Hamburger — toggles drawer open/closed */}
      <button
        ref={hamburgerRef}
        id="mobile-menu-trigger"
        type="button"
        onClick={handleToggleDrawer}
        className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-transparent transition-colors hover:border-border hover:bg-lime active:bg-cobalt"
        aria-label={isMobileDrawerOpen ? 'Close project hierarchy' : 'Open project hierarchy'}
        aria-haspopup="dialog"
        aria-expanded={isMobileDrawerOpen}
      >
        <Menu size={18} strokeWidth={2} className="text-text-primary" />
      </button>

      {/* Center: App title */}
      <div className="flex flex-1 items-center justify-center gap-1.5 px-2">
        <Terminal size={14} strokeWidth={2} className="text-text-accent shrink-0" />
        <span className="truncate font-mono text-[13px] font-bold uppercase tracking-[0.06em] text-text-primary">
          portfolio.kaleb.kougl
        </span>
      </div>

      {/* Right: Download Resume */}
      <a
        href="/KalebK_Resume.pdf"
        download
        className="flex h-10 w-10 shrink-0 flex-col items-center justify-center border-2 border-border bg-cobalt text-white shadow-[3px_3px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_#161310]"
        aria-label="Download resume"
      >
        <Download size={14} strokeWidth={2.5} className="text-white" />
        <span className="font-mono text-[8px] font-bold uppercase leading-tight text-white">Resume</span>
      </a>
    </header>
  );
}

/** Ref accessor for focus restoration from drawer */
export const MOBILE_MENU_TRIGGER_ID = 'mobile-menu-trigger';
