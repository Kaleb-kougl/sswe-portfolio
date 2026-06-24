'use client';

import { useEffect, useRef, useState, useDeferredValue } from 'react';
import { useEngineStore } from '@/store/useEngineStore';
import { BOOT_LOGS } from '@/data/consoleLogs';

// Format timestamp as HH:MM:SS
function getTimestamp(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

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
      <div className="flex h-[var(--toolbar-height)] items-center border-t-[3px] border-border bg-ink px-3">
        <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-dark-ink">
          Console
        </span>
        <span className="ml-2 border-2 border-dark-ink bg-lime px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink">
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
            {deferredLogs.map((log) => (
              <li key={log.id} className="border-b-2 border-border/20 pb-1 font-mono text-xs font-bold leading-relaxed last:border-b-0">
                <LogLine text={log.msg} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}

function LogLine({ text }: { text: string }) {
  const [timestamp] = useState(() => getTimestamp());

  // Color-code log prefixes
  let prefixColor = 'text-text-muted';

  if (text.includes('[SYSTEM]')) prefixColor = 'text-cobalt';
  else if (text.includes('[WEBPACK')) prefixColor = 'text-tangerine';
  else if (text.includes('[PERF]')) prefixColor = 'text-tangerine';
  else if (text.includes('[NETWORK]')) prefixColor = 'text-cobalt';
  else if (text.includes('[SLO]')) prefixColor = 'text-cobalt';
  else if (text.includes('[SERVER]')) prefixColor = 'text-tangerine';
  else if (text.includes('[GRAPHQL]')) prefixColor = 'text-cobalt';
  else if (text.includes('[MOBILE]')) prefixColor = 'text-tangerine';
  else if (text.includes('[EXTENSION]')) prefixColor = 'text-tangerine';
  else if (text.includes('[ERROR]')) prefixColor = 'text-tangerine';

  // Split at the first ']' to color the prefix
  const bracketEnd = text.indexOf(']');
  if (bracketEnd !== -1) {
    const prefix = text.slice(0, bracketEnd + 1);
    const rest = text.slice(bracketEnd + 1);
    return (
      <>
        <span className="text-text-muted/50">{timestamp}</span>
        <span className="text-text-muted/50">{' '}</span>
        <span className={prefixColor}>{prefix}</span>
        <span className="text-text-primary">{rest}</span>
      </>
    );
  }

  return (
    <>
      <span className="text-text-muted/50">{timestamp} </span>
      <span className="text-text-primary">{text}</span>
    </>
  );
}
