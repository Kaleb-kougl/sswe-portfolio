'use client';

import { useState } from 'react';

import type { FitReport } from '@/lib/fit/contract';
import { reportToMarkdown } from '@/lib/fit/markdown';

/**
 * `/?reason=role#contact` opens the homepage's contact form with "Full-time
 * role" selected and a short message started (contact-section.tsx reads the
 * parameter on the client). Deliberately carries nothing from the report:
 * the role title comes from the JD, and a URL ends up in server logs.
 */
export const CONTACT_ABOUT_ROLE_HREF = '/?reason=role#contact';

const BUTTON = 'button button--pill button--secondary button--md justify-center';

/**
 * "Copy as Markdown" and "Email me about this role". The copy button follows
 * `scroll/copy-button.tsx` (status in a polite live region, the button's name
 * unchanged) but builds its text on press, since the report can be long. It is
 * a separate file so the homepage's copy button doesn't grow.
 */
export function MarkdownActions({ report, label }: { report: FitReport; label?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(reportToMarkdown(report));
      setStatus('copied');
      window.setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button type="button" onClick={copy} className={BUTTON} data-testid="copy-markdown">
        {status === 'copied' ? 'Copied' : (label ?? 'Copy as Markdown')}
      </button>
      {/* A full navigation, not <Link>: the homepage reads the parameter on
          load, and its contact section is far down a long page. */}
      <a href={CONTACT_ABOUT_ROLE_HREF} className={BUTTON}>
        Email me about this role
      </a>
      <span aria-live="polite" className="font-ui text-sm text-muted">
        {status === 'copied' ? 'Report copied to the clipboard as Markdown.' : ''}
        {status === 'failed' ? 'Couldn’t reach the clipboard. Select the report and copy it instead.' : ''}
      </span>
    </div>
  );
}
