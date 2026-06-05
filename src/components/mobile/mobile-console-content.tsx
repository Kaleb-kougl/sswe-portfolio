'use client';

import { useEffect, useRef, useDeferredValue } from 'react';
import { useEngineStore } from '@/store/useEngineStore';

/**
 * MobileConsoleContent — scrollable console log list for the mobile bottom sheet.
 * Mirrors the desktop TerminalConsole log rendering but without the header chrome
 * (the tab bar in MobileBottomSheet handles the label).
 *
 * Auto-scrolls to the latest entry. Color-codes log prefixes identically
 * to the desktop TerminalConsole.
 */
export function MobileConsoleContent() {
  const consoleLogs = useEngineStore((s) => s.consoleLogs);
  const deferredLogs = useDeferredValue(consoleLogs);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [deferredLogs]);

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-label="Console output"
      className="h-full overflow-y-auto"
    >
      {deferredLogs.length === 0 ? (
        <p className="py-8 text-center font-mono text-xs text-text-muted italic">
          Awaiting system output…
        </p>
      ) : (
        <ul className="space-y-0.5">
          {deferredLogs.map((log) => (
            <li key={log.id} className="font-mono text-xs leading-relaxed">
              <MobileLogLine text={log.msg} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Log line renderer (matches desktop color-coding) ---

function getTimestamp(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function MobileLogLine({ text }: { text: string }) {
  const timestamp = useRef(getTimestamp()).current;

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

  const bracketEnd = text.indexOf(']');
  if (bracketEnd !== -1) {
    const prefix = text.slice(0, bracketEnd + 1);
    const rest = text.slice(bracketEnd + 1);
    return (
      <>
        <span className="text-text-muted/50">{timestamp} </span>
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
