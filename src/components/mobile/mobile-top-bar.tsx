'use client';

import { useRef } from 'react';
import { Download, Menu, Terminal } from 'lucide-react';
import { useEngineStore } from '@/store/useEngineStore';

/**
 * MobileTopBar — floating glassmorphic pill at z-50.
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
      className="glass-surface mobile-safe-top fixed top-3 left-3 right-3 z-50 flex h-12 items-center justify-between rounded-2xl border border-border/30 px-1.5"
      aria-label="Application toolbar"
    >
      {/* Left: Hamburger — toggles drawer open/closed */}
      <button
        ref={hamburgerRef}
        id="mobile-menu-trigger"
        type="button"
        onClick={handleToggleDrawer}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-bg-hover active:bg-bg-active"
        aria-label={isMobileDrawerOpen ? 'Close project hierarchy' : 'Open project hierarchy'}
        aria-haspopup="dialog"
        aria-expanded={isMobileDrawerOpen}
      >
        <Menu size={18} strokeWidth={1.5} className="text-text-primary" />
      </button>

      {/* Center: App title */}
      <div className="flex items-center gap-1.5">
        <Terminal size={14} strokeWidth={1.5} className="text-text-accent" />
        <span className="font-mono text-[13px] font-medium text-text-primary">
          portfolio.engine.kaleb.kougl
        </span>
      </div>

      {/* Right: Download Resume */}
      <a
        href="/KalebK_Resume.pdf"
        download
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-text-accent transition-all hover:brightness-110 active:scale-[0.97]"
        aria-label="Download resume"
      >
        <Download size={16} strokeWidth={2} className="text-bg-editor" />
      </a>
    </header>
  );
}

/** Ref accessor for focus restoration from drawer */
export const MOBILE_MENU_TRIGGER_ID = 'mobile-menu-trigger';
