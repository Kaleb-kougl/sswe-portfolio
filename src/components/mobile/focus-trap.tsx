'use client';

import { useEffect, useRef, useCallback, type ReactNode, type KeyboardEvent } from 'react';

/**
 * Inline focus trap component — traps Tab/Shift+Tab inside its children.
 * No external dependency required. Used by MobileBottomSheet when expanded.
 */
export function FocusTrap({ children, active }: { children: ReactNode; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!active || e.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [active]
  );

  // Auto-focus the first focusable element when trap activates
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const focusable = containerRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
  }, [active]);

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown}>
      {children}
    </div>
  );
}
