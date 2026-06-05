'use client';

import { useEffect, useRef, useDeferredValue } from 'react';
import { useEngineStore } from '@/store/useEngineStore';
import { BOOT_LOGS } from '@/data/consoleLogs';

export function TerminalConsole() {
  const consoleLogs = useEngineStore((s) => s.consoleLogs);
  const deferredLogs = useDeferredValue(consoleLogs);
  const pushLog = useEngineStore((s) => s.pushLog);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasBootedRef = useRef(false);

  // Fire boot logs on mount
  useEffect(() => {
    if (hasBootedRef.current) return;
    hasBootedRef.current = true;

    BOOT_LOGS.forEach((log, i) => {
      setTimeout(() => pushLog(log), i * 300);
    });
  }, [pushLog]);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [deferredLogs]);

  return (
    <footer
      className="flex h-full flex-col overflow-hidden bg-bg-panel"
      aria-label="Console output"
    >
      <div className="flex h-[var(--toolbar-height)] items-center border-t border-border px-3">
        <span className="font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
          Console
        </span>
        <span className="ml-2 rounded-full bg-bg-hover px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
          {deferredLogs.length}
        </span>
      </div>
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        className="flex-1 overflow-y-auto px-3 py-2"
      >
        {deferredLogs.length === 0 ? (
          <p className="font-mono text-xs text-text-muted italic">
            Awaiting system output...
          </p>
        ) : (
          <ul className="space-y-0.5">
            {deferredLogs.map((log, i) => (
              <li key={`log-${i}`} className="font-mono text-xs leading-relaxed">
                <LogLine text={log} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}

function LogLine({ text }: { text: string }) {
  // Color-code log prefixes
  let prefixColor = 'text-text-muted';

  if (text.includes('[SYSTEM]')) prefixColor = 'text-text-accent';
  else if (text.includes('[WEBPACK')) prefixColor = 'text-text-yellow';
  else if (text.includes('[PERF]')) prefixColor = 'text-text-peach';
  else if (text.includes('[NETWORK]')) prefixColor = 'text-text-green';
  else if (text.includes('[SLO]')) prefixColor = 'text-text-green';
  else if (text.includes('[SERVER]')) prefixColor = 'text-text-red';
  else if (text.includes('[GRAPHQL]')) prefixColor = 'text-text-accent';
  else if (text.includes('[MOBILE]')) prefixColor = 'text-text-peach';
  else if (text.includes('[EXTENSION]')) prefixColor = 'text-text-yellow';
  else if (text.includes('[ERROR]')) prefixColor = 'text-text-red';

  // Split at the first ']' to color the prefix
  const bracketEnd = text.indexOf(']');
  if (bracketEnd !== -1) {
    const prefix = text.slice(0, bracketEnd + 1);
    const rest = text.slice(bracketEnd + 1);
    return (
      <>
        <span className={prefixColor}>{prefix}</span>
        <span className="text-text-primary">{rest}</span>
      </>
    );
  }

  return <span className="text-text-primary">{text}</span>;
}
