'use client';

import { CONTACT_INFO } from '@/data/resumeData';

/**
 * MobileContactCard — the last stop of the mobile scroll.
 *
 * The desktop hides contact details inside the Inspector's Contact_Info file.
 * On a phone the page is read top to bottom and then closed, so the scroll has
 * to end with a way to get in touch instead of a way to find the way.
 *
 * COLOR_ROLES: every control here is a LINK, and `interactive` owns links —
 * `action` is spent on the single primary CTA in the top bar and is not
 * duplicated down here.
 */

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive';

const ROW =
  `flex min-h-[44px] items-center justify-between gap-3 border-b-2 border-border/20 px-3 py-2 last:border-b-0 ${FOCUS_RING}`;

const ROW_LABEL =
  'shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-text-muted';

const ROW_VALUE =
  'truncate text-right font-mono text-[12px] font-bold text-interactive underline decoration-[2px] underline-offset-4';

export function MobileContactCard() {
  return (
    <section
      aria-labelledby="mobile-contact-heading"
      className="border-[3px] border-border bg-bg-panel shadow-[6px_6px_0_#161310]"
    >
      <div className="border-b-[3px] border-header-ink bg-header-bg px-3 py-2">
        <h2
          id="mobile-contact-heading"
          className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-header-ink"
        >
          Contact
        </h2>
      </div>

      <div className="p-3">
        <p className="font-display text-2xl font-black uppercase leading-[1.05] tracking-[-0.02em] text-text-primary">
          {CONTACT_INFO.name}
        </p>
        <p className="mt-1 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">
          {CONTACT_INFO.title}
          <span aria-hidden="true"> · </span>
          {CONTACT_INFO.location}
        </p>

        <a
          href={`mailto:${CONTACT_INFO.email}`}
          className={`mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 border-[3px] border-border bg-interactive px-4 font-mono text-xs font-bold uppercase tracking-[0.1em] text-interactive-ink shadow-[5px_5px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[3px_3px_0_#161310] ${FOCUS_RING}`}
        >
          <span aria-hidden="true">✉</span>
          Email {CONTACT_INFO.name.split(' ')[0]}
        </a>

        <a
          href="/KalebK_Resume.pdf"
          download
          className={`mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 border-[3px] border-border bg-header-bg px-4 font-mono text-xs font-bold uppercase tracking-[0.1em] text-header-ink shadow-[3px_3px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_#161310] ${FOCUS_RING}`}
        >
          <span aria-hidden="true">↓</span>
          Download resume PDF
        </a>

        <ul className="mt-4 border-2 border-border bg-bg-editor">
          <li>
            <a href={`mailto:${CONTACT_INFO.email}`} className={ROW}>
              <span className={ROW_LABEL}>Email</span>
              <span className={ROW_VALUE}>{CONTACT_INFO.email}</span>
            </a>
          </li>
          <li>
            <a href={`tel:${CONTACT_INFO.phone.replace(/[^0-9+]/g, '')}`} className={ROW}>
              <span className={ROW_LABEL}>Phone</span>
              <span className={ROW_VALUE}>{CONTACT_INFO.phone}</span>
            </a>
          </li>
          <li>
            <a
              href={`https://${CONTACT_INFO.linkedin}`}
              target="_blank"
              rel="noopener noreferrer"
              className={ROW}
            >
              <span className={ROW_LABEL}>LinkedIn</span>
              <span className={ROW_VALUE}>in/kaleb-kougl</span>
            </a>
          </li>
          <li>
            <a
              href={CONTACT_INFO.github}
              target="_blank"
              rel="noopener noreferrer"
              className={ROW}
            >
              <span className={ROW_LABEL}>GitHub</span>
              <span className={ROW_VALUE}>
                {CONTACT_INFO.github.replace('https://github.com/', '')}
              </span>
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
