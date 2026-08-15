'use client';

import dynamic from 'next/dynamic';

import { CONTACT_INFO, SUMMARY } from '@/data/resumeData';

/**
 * Server-rendered fallback for the `ssr: false` IDE bundle.
 *
 * This markup is the ENTIRE page for anything that doesn't execute JS — ATS
 * scrapers, plain-text crawlers, enterprise link scanners, no-JS visitors.
 * Before, it was just a spinner, so those clients saw no name, no summary, no
 * contact details. Keep real content here; React swaps it out on hydration.
 */
const StaticHero = () => (
  <div
    id="main-content"
    tabIndex={-1}
    className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 bg-bg-editor px-6 py-12"
  >
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-1">
        <div
          className="h-2 w-2 border-2 border-border bg-cobalt animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <div
          className="h-2 w-2 border-2 border-border bg-tangerine animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <div
          className="h-2 w-2 border-2 border-border bg-lime animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
      <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-text-muted animate-pulse">
        Initializing workspace...
      </p>
    </div>

    <div className="flex max-w-xl flex-col items-center gap-4 text-center">
      <h1 className="font-display text-3xl font-black uppercase tracking-[-0.025em] text-text-primary">
        {CONTACT_INFO.name}
      </h1>
      <p className="border-[3px] border-border bg-lime px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.1em] text-ink shadow-[4px_4px_0_#161310]">
        {CONTACT_INFO.title}
      </p>
      <p className="border-[3px] border-border bg-surface p-3 font-ui text-[15px] font-medium leading-relaxed text-text-primary shadow-[6px_6px_0_#161310]">
        {SUMMARY}
      </p>
      <div className="space-y-1 font-mono text-xs text-text-muted">
        <p>{CONTACT_INFO.location}</p>
        <p>
          <a
            href={`mailto:${CONTACT_INFO.email}`}
            className="text-text-accent underline decoration-[3px] underline-offset-4"
          >
            {CONTACT_INFO.email}
          </a>
        </p>
        <p>
          <a
            href={`https://${CONTACT_INFO.linkedin}`}
            rel="noopener noreferrer"
            className="text-text-accent underline decoration-[3px] underline-offset-4"
          >
            {CONTACT_INFO.linkedin}
          </a>
        </p>
        <p>
          <a
            href={CONTACT_INFO.github}
            rel="noopener noreferrer"
            className="text-text-accent underline decoration-[3px] underline-offset-4"
          >
            {CONTACT_INFO.github.replace('https://', '')}
          </a>
        </p>
      </div>
      <a
        href="/KalebK_Resume.pdf"
        className="border-[3px] border-border bg-tangerine px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-ink shadow-[4px_4px_0_#161310]"
      >
        Download Resume
      </a>
    </div>
  </div>
);

const IDELayout = dynamic(() => import('./ide-layout'), {
  ssr: false,
  loading: () => <StaticHero />,
});

export function IDELayoutWrapper() {
  return <IDELayout />;
}
