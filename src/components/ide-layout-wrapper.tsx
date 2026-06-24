'use client';

import dynamic from 'next/dynamic';

const IDELayout = dynamic(() => import('./ide-layout'), {
  ssr: false,
  loading: () => (
    <div id="main-content" tabIndex={-1} className="flex h-dvh w-full items-center justify-center bg-bg-editor">
      <div className="flex flex-col items-center gap-3">
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
        <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-text-muted animate-pulse">
          Initializing workspace...
        </p>
      </div>
    </div>
  ),
});

export function IDELayoutWrapper() {
  return <IDELayout />;
}
