import type { Metadata } from 'next';
import Link from 'next/link';

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
      </main>
    </>
  );
}
