'use client';

import { Download, Terminal } from 'lucide-react';

export function TopBar() {
  return (
    <header
      className="flex h-[var(--toolbar-height)] items-center justify-between border-b-[3px] border-border bg-tangerine px-4 text-white"
      aria-label="Application toolbar"
    >
      {/* Left: App title */}
      <div className="flex items-center gap-2">
        <Terminal size={16} strokeWidth={2} className="text-white" />
        <span className="font-mono text-sm font-bold uppercase tracking-[0.08em] text-white">
          portfolio.engine.kaleb.kougl
        </span>
        <span className="border-2 border-white px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white">
          v1.0.0
        </span>
      </div>

      {/* Right: Download Resume CTA */}
      <a
        href="/KalebK_Resume.pdf"
        download
        className="inline-flex items-center gap-2 border-[3px] border-white bg-cobalt px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.08em] text-white shadow-[5px_5px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[3px_3px_0_#161310]"
      >
        <Download size={14} strokeWidth={2.5} />
        Download Resume
      </a>
    </header>
  );
}
