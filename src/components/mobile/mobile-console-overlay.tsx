'use client';

import { useEffect, useRef, useState, useDeferredValue } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { useEngineStore } from '@/store/useEngineStore';

/**
 * MobileConsoleOverlay — fading log overlay at z-10.
 * Shows the last 2 console entries, fades out after 3 seconds of inactivity.
 * pointer-events-none so it doesn't block canvas interaction.
 *
 * Uses m.* (not motion.*) because this renders inside LazyMotion strict boundary.
 */
export function MobileConsoleOverlay() {
  const consoleLogs = useEngineStore((s) => s.consoleLogs);
  const deferredLogs = useDeferredValue(consoleLogs);
  const [visible, setVisible] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show overlay when new logs arrive, auto-fade after 3s
  useEffect(() => {
    if (deferredLogs.length === 0) return;

    setVisible(true);

    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => setVisible(false), 3000);

    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [deferredLogs]);

  const lastTwo = deferredLogs.slice(-2);

  return (
    <AnimatePresence>
      {visible && lastTwo.length > 0 && (
        <m.div
          key="console-overlay"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.3 }}
          className="pointer-events-none fixed bottom-2 left-2 right-2 z-10 rounded-lg bg-bg-panel/50 px-3 py-2 backdrop-blur-sm"
          role="log"
          aria-live="polite"
        >
          {lastTwo.map((log) => (
            <p key={log.id} className="truncate font-mono text-[10px] leading-relaxed text-text-muted">
              {log.msg}
            </p>
          ))}
        </m.div>
      )}
    </AnimatePresence>
  );
}
