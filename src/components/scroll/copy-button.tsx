'use client';

import { useState } from 'react';

/**
 * The one interactive piece of the "Use with your AI" block: a small client
 * island inside an otherwise server-rendered block, kept free of imports
 * beyond React so it stays a few hundred bytes of the homepage JS.
 *
 * `label` finishes the visible "Copy" for screen readers ("Copy server URL"),
 * and the status is announced through a polite live region rather than by
 * changing the button's name. With no Clipboard API (an insecure origin, a
 * denied permission) nothing is claimed: the text beside it is `select-all`,
 * so one click still selects it for a manual copy.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-[44px] shrink-0 items-center rounded-pill border border-control bg-surface px-4 py-2 font-ui text-sm font-semibold text-ink shadow-hairline transition-colors hover:border-ink"
      >
        {copied ? 'Copied' : 'Copy'}
        <span className="sr-only"> {label}</span>
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? `${label} copied to clipboard` : ''}
      </span>
    </>
  );
}
