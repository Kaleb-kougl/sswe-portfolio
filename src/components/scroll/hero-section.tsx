import { CONTACT_INFO, RESUME_DATA, SUMMARY } from '@/data/resumeData';

/**
 * Every number and proper noun below is READ OUT OF `resumeData`, never
 * retyped. The résumé is the single source of truth; when it changes, the hero
 * changes with it and can never quietly contradict the PDF a recruiter has
 * open in the next tab.
 */

/** "7+" — pulled from SUMMARY so the figure can never drift from the résumé. */
const YEARS = /(\d+\+?)\s*years/i.exec(SUMMARY)?.[1] ?? '7+';

/** "San Francisco, CA" -> "San Francisco". */
const CITY = CONTACT_INFO.location.split(',')[0].trim();

const EYEBROW = `${CONTACT_INFO.title} · ${CITY}`.toUpperCase();

/** Employers, in résumé order, de-duplicated (IBM appears twice). */
const COMPANIES = Array.from(
  new Set(
    Object.values(RESUME_DATA)
      .filter((entry) => entry.type === 'work')
      .map((entry) => entry.company.replace(/\.com$/, ''))
  )
);

/** r3f-projectiles + roblox-css. */
const NPM_PACKAGES = Object.values(RESUME_DATA).filter(
  (entry) => entry.company === 'Published npm Package'
).length;

const STATS = [
  { term: 'Experience', detail: `${YEARS} years` },
  { term: 'Teams', detail: COMPANIES.join(' · ') },
  {
    term: 'Open source',
    detail: `${NPM_PACKAGES} package${NPM_PACKAGES === 1 ? '' : 's'} on npm`,
  },
];

export function HeroSection() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="relative flex flex-col justify-center px-6 pb-16 pt-[calc(var(--nav-height)+3rem)] min-[900px]:min-h-dvh min-[900px]:px-12 min-[900px]:pb-24"
    >
      <div className="w-full max-w-[660px]">
        <p className="eyebrow">{EYEBROW}</p>

        <h1
          id="hero-heading"
          className="mt-6 text-balance font-display text-[40px] leading-[0.95] tracking-[-0.035em] text-ink min-[900px]:text-[82px]"
        >
          I build the platform other frontend teams ship on.
        </h1>

        <p className="mt-7 max-w-[54ch] text-[17px] leading-relaxed text-body min-[900px]:text-[19px]">
          {YEARS} years of TypeScript and React: component libraries, module
          federation, Core Web Vitals and frontend SLOs. Lately, GenAI and
          agentic workflows.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a
            href="#work"
            className="inline-flex min-h-[44px] items-center rounded-pill bg-cta px-6 text-[15px] font-semibold text-cta-ink shadow-cta transition-transform hover:-translate-y-px"
          >
            See my work
          </a>
          <a
            href={CONTACT_INFO.github}
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center rounded-pill border border-control bg-surface px-6 text-[15px] font-semibold text-ink transition-colors hover:bg-panel"
          >
            GitHub
          </a>
        </div>

        <dl className="mt-14 grid grid-cols-1 border-t border-hairline min-[900px]:grid-cols-3">
          {STATS.map((stat, index) => (
            <div
              key={stat.term}
              className={[
                'border-b border-hairline py-4 min-[900px]:border-b-0 min-[900px]:py-5',
                index > 0
                  ? 'min-[900px]:border-l min-[900px]:border-hairline min-[900px]:pl-6'
                  : '',
                index < STATS.length - 1 ? 'min-[900px]:pr-6' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <dt className="font-mono text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-muted">
                {stat.term}
              </dt>
              <dd className="mt-2 text-[15px] font-semibold text-ink">
                {stat.detail}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Tells the reader the fixed 3D backdrop is scroll-driven. Desktop only:
          on the auto-height mobile hero there is no "bottom" to pin it to. */}
      <p className="absolute bottom-10 right-12 hidden items-center gap-3 min-[900px]:flex">
        <span aria-hidden="true" className="h-px w-16 bg-ink" />
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          Scroll: the blocks rearrange for each section
        </span>
      </p>
    </section>
  );
}
