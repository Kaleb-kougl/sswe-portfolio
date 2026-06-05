'use client';

import { Download, Terminal } from 'lucide-react';

export function TopBar() {
  return (
    <header
      className="flex h-[var(--toolbar-height)] items-center justify-between border-b border-border bg-bg-toolbar px-4"
      aria-label="Application toolbar"
    >
      {/* Left: App title */}
      <div className="flex items-center gap-2">
        <Terminal size={16} strokeWidth={1.5} className="text-text-accent" />
        <span className="font-mono text-sm font-medium text-text-primary">
          portfolio.engine
        </span>
        <span className="font-mono text-xs text-text-muted">v1.0.0</span>
      </div>

      {/* Right: Download Resume CTA */}
      <a
        href="/KalebK_Resume.pdf"
        download
        className="inline-flex items-center gap-2 rounded-md bg-text-accent px-3 py-1.5 text-sm font-medium text-bg-editor transition-all hover:brightness-110 active:scale-[0.97]"
      >
        <Download size={14} strokeWidth={2} />
        Download Resume
      </a>
    </header>
  );
}
