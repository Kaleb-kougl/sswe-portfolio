import type { Metadata } from 'next';
import Link from 'next/link';

import { AskPanel } from '@/components/fit/ask-panel';
import { FitChecker } from '@/components/fit/fit-checker';
import { formatBytes, LOCAL_MODEL, PRIVATE_MODE_ENABLED } from '@/lib/fit/local/model';

/**
 * /fit — paste a job description, get requirement-by-requirement evidence
 * and honest gaps, computed on the visitor's device (plan v4, Phase 2e).
 *
 * A Server Component shell: the heading, the explanation and the "what stays
 * on your device" panel are static HTML. `FitChecker` is the one client
 * island. It is its own route so the homepage's JS is untouched; the homepage
 * only links here.
 */

const TITLE = 'Check your role against my work';
const DESCRIPTION =
  'Paste a job description and see, requirement by requirement, where Kaleb Kougl’s work has evidence and where it has gaps. It runs on your device; the job description never leaves it.';

export const metadata: Metadata = {
  title: `${TITLE} | Kaleb Kougl`,
  description: DESCRIPTION,
  alternates: { canonical: '/fit' },
  openGraph: {
    title: `${TITLE} | Kaleb Kougl`,
    description: DESCRIPTION,
    url: '/fit',
    type: 'website',
  },
};

const MODEL_SIZE = formatBytes(LOCAL_MODEL.downloadBytes);

export default function FitPage() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="nav-surface">
        <div className="mx-auto flex h-[var(--nav-height)] max-w-[880px] items-center px-5">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 font-ui text-[15px] font-semibold text-muted transition-colors hover:text-ink"
          >
            <span aria-hidden="true">←</span>
            <span>
              <span className="font-display text-[17px] tracking-[-0.03em] text-ink">Kaleb Kougl</span>
              <span className="sr-only">, back to the homepage</span>
            </span>
          </Link>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[880px] px-5 pb-24 pt-12 md:pt-16">
        <p className="eyebrow">Fit check</p>
        <h1 className="mt-4 text-balance font-display text-[36px] leading-[1] tracking-[-0.035em] text-ink md:text-[60px]">
          {TITLE}
        </h1>
        <p className="mt-5 max-w-[60ch] font-ui text-[17px] leading-relaxed text-body">
          Paste a job description. Each requirement comes back with a verdict and links to the work behind it, and the
          gaps are listed as gaps.
        </p>
        <p className="mt-3 font-ui text-[15px] text-muted">
          Just one question?{' '}
          <a href="#ask" className="font-semibold text-link underline decoration-1 underline-offset-2 hover:text-link-hover">
            Ask about my work
          </a>
          .
        </p>

        <section
          aria-labelledby="fit-privacy-heading"
          className="mt-8 rounded-xl border border-hairline bg-panel p-5 shadow-hairline sm:p-6"
        >
          <h2 id="fit-privacy-heading" className="font-display text-xl leading-tight text-ink">
            What stays on your device
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 font-ui text-sm leading-relaxed text-body">
            <li>The job description never leaves this device. The check runs in this page, with no server involved.</li>
            {PRIVATE_MODE_ENABLED ? (
              <li>
                The optional Private mode downloads a {MODEL_SIZE} model once, from Hugging Face. Hugging Face sees
                your IP address, but not the job description.
              </li>
            ) : (
              <li>No AI model is involved: the requirements are read and judged by plain code, the same on every device.</li>
            )}
            <li>Nothing you paste is stored or logged, here or anywhere else.</li>
          </ul>
        </section>

        <div className="mt-10">
          <FitChecker />
        </div>

        {/* Below the checker rather than a tab beside it: both stay visible and
            linkable (#ask), the checker's markup and tests are untouched, and a
            JD pasted into either one gets the same report. */}
        <section id="ask" aria-labelledby="ask-heading" className="mt-20 border-t border-hairline pt-12 md:mt-24 md:pt-16">
          <p className="eyebrow">Ask a question</p>
          <h2 id="ask-heading" className="mt-4 font-display text-[30px] leading-[1.05] tracking-[-0.03em] text-ink md:text-[44px]">
            Ask about my work
          </h2>
          <p className="mt-4 max-w-[60ch] font-ui text-[17px] leading-relaxed text-body">
            Have I used a skill, what did a project involve, am I available, how do I fit this role. Each answer
            quotes the records behind it, and says so when there are none.
          </p>
          <p data-testid="ask-privacy" className="mt-4 max-w-[64ch] rounded-md border border-hairline bg-panel px-4 py-3 font-ui text-sm leading-relaxed text-body">
            <strong className="font-semibold text-ink">No AI model.</strong>{' '}Answers come from plain code that looks your
            question up in my evidence records and fills in fixed sentences, so it can&rsquo;t make anything up. Your
            question stays on this page: it isn&rsquo;t sent anywhere, stored or logged.
          </p>
          <div className="mt-8">
            <AskPanel />
          </div>
        </section>
      </main>
    </>
  );
}
