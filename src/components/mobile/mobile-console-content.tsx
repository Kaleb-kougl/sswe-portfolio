'use client';

import { useEffect, useRef, useState, useDeferredValue } from 'react';
import { useEngineStore } from '@/store/useEngineStore';

/**
 * MobileConsoleContent — scrollable console log list for the mobile bottom sheet.
 * Mirrors the desktop TerminalConsole log rendering but without the header chrome
 * (the tab bar in MobileBottomSheet handles the label).
 *
 * Auto-scrolls to the latest entry. Tone-codes log prefixes identically
 * to the desktop TerminalConsole (see classifyLog below).
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
        <ul className="space-y-1">
          {deferredLogs.map((log) => (
            <li key={log.id} className="border-b-2 border-border/20 pb-1 font-mono text-xs font-bold leading-relaxed last:border-b-0">
              <MobileLogLine text={log.msg} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Log line renderer (in sync with desktop TerminalConsole) ---
//
// The prefix used to be colored by TAG (cobalt for [SYSTEM]/[NETWORK]…,
// tangerine for [PERF]/[SERVER]…), which handed `interactive` and `action`
// a second job each and said nothing about whether the line was good news.
// Desktop now classifies by TONE instead, per COLOR_ROLES: `status` (lime)
// for succeeded work — as a small chip behind the prefix, never lime text —
// `action` for failures, ink for everything else. Kept deliberately identical
// to terminal-console.tsx so the two consoles cannot drift.

type LogTone = 'success' | 'error' | 'neutral';

function classifyLog(text: string): LogTone {
  const upper = text.toUpperCase();
  if (upper.includes('[ERROR]') || upper.includes('FAIL')) return 'error';
  if (
    upper.includes('[PASS]') ||
    upper.includes('SUCCESS') ||
    upper.includes('DONE IN') ||
    /\bOK\b/.test(upper)
  ) {
    return 'success';
  }
  return 'neutral';
}

const TONE_CLASS: Record<LogTone, string> = {
  success: 'bg-status px-1 text-status-ink',
  error: 'text-action',
  neutral: 'text-text-primary',
};

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
  const [timestamp] = useState(() => getTimestamp());

  const prefixColor = TONE_CLASS[classifyLog(text)];

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
