'use client';

import { useEffect, useState, useDeferredValue } from 'react';
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
  const [prevLogId, setPrevLogId] = useState<number | null>(null);
  const currentLogId = deferredLogs[deferredLogs.length - 1]?.id || null;

  if (currentLogId !== prevLogId) {
    setPrevLogId(currentLogId);
    setVisible(true);
  }

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [visible, currentLogId]);

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
          className="pointer-events-none fixed bottom-2 left-2 right-2 z-10 border-[3px] border-border bg-bg-panel px-3 py-2 shadow-[5px_5px_0_#161310]"
          role="log"
          aria-live="polite"
        >
          {lastTwo.map((log) => (
            <p key={log.id} className="truncate font-mono text-[10px] font-bold uppercase leading-relaxed tracking-[0.04em] text-text-muted">
              {log.msg}
            </p>
          ))}
        </m.div>
      )}
    </AnimatePresence>
  );
}
