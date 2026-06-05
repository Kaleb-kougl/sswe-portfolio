'use client';

import dynamic from 'next/dynamic';

const IDELayout = dynamic(() => import('./ide-layout'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full items-center justify-center bg-bg-editor">
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-1">
          <div
            className="h-1.5 w-1.5 rounded-full bg-text-accent animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="h-1.5 w-1.5 rounded-full bg-text-accent animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="h-1.5 w-1.5 rounded-full bg-text-accent animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
        <p className="font-mono text-xs text-text-muted animate-pulse">
          Initializing workspace...
        </p>
      </div>
    </div>
  ),
});

export function IDELayoutWrapper() {
  return <IDELayout />;
}
