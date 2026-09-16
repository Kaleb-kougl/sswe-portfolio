'use client';

import { useCallback } from 'react';
import { Download, Mail, Terminal } from 'lucide-react';
import { FILE_LOG_MAP } from '@/data/consoleLogs';
import { useEngineStore } from '@/store/useEngineStore';

/** Shared focus treatment — `interactive` owns focus rings. */
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive';

/**
 * TopBar — panel-header recipe (paper bg, ink text, 3px ink bottom border).
 *
 * Color roles, one job each:
 *   action      → "Get in touch", the single primary CTA (rightmost).
 *   header      → the bar itself, the title and the version badge.
 *   status      → the "open to roles" chip only.
 *   interactive → focus rings.
 */
export function TopBar() {
  const setActiveFile = useEngineStore((s) => s.setActiveFile);

  // Primary CTA: select Contact_Info.grpc so the Inspector opens that entry.
  const handleGetInTouch = useCallback(() => {
    setActiveFile('contact-info', FILE_LOG_MAP['contact-info']);
  }, [setActiveFile]);

  return (
    <header
      className="flex h-[var(--toolbar-height)] items-center justify-between border-b-[3px] border-header-ink bg-header-bg px-4 text-header-ink"
      aria-label="Application toolbar"
    >
      {/* Left: App title */}
      <div className="flex items-center gap-2">
        <Terminal size={16} strokeWidth={2} className="text-header-ink" />
        <span className="font-mono text-sm font-bold uppercase tracking-[0.08em] text-header-ink">
          portfolio.engine.kaleb.kougl
        </span>
        <span className="border-2 border-header-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-header-ink">
          v1.0.0
        </span>
      </div>

      {/* Right: status chip → secondary (resume) → primary CTA (get in touch) */}
      <div className="flex items-center gap-3">
        {/*
          Live availability signal. DELETE THIS CHIP once an offer is accepted —
          `status` is for live state only, and a stale chip is a lie.
        */}
        <span className="inline-flex shrink-0 items-center border-2 border-border bg-status px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-status-ink">
          Open to roles
        </span>

        {/* Secondary: outlined ink-on-paper, deliberately quieter than the CTA. */}
        <a
          href="/KalebK_Resume.pdf"
          download
          className={`inline-flex min-h-[44px] items-center gap-2 border-[3px] border-border bg-header-bg px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.08em] text-header-ink shadow-[3px_3px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_#161310] ${FOCUS_RING}`}
        >
          <Download size={14} strokeWidth={2.5} />
          Download Resume
        </a>

        {/* Primary CTA — the only `action` surface in the app. */}
        <button
          type="button"
          onClick={handleGetInTouch}
          className={`inline-flex min-h-[44px] items-center gap-2 border-[3px] border-border bg-action px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.08em] text-action-ink shadow-[5px_5px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[3px_3px_0_#161310] ${FOCUS_RING}`}
        >
          <Mail size={14} strokeWidth={2.5} />
          Get in touch
        </button>
      </div>
    </header>
  );
}
