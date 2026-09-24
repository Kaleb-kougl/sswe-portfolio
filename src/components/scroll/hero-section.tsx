import { CAREER_START_YEAR, CONTACT_INFO, RESUME_DATA } from '@/data/resumeData';

/**
 * Every number and proper noun below is READ OUT OF `resumeData`, never
 * retyped. The résumé is the single source of truth; when it changes, the hero
 * changes with it and can never quietly contradict the PDF a recruiter has
 * open in the next tab.
 */

/** "San Francisco, CA" -> "San Francisco". */
const CITY = CONTACT_INFO.location.split(',')[0].trim();

/**
 * Exported because `src/app/opengraph-image.tsx` renders the same eyebrow on
 * the social card. One definition, so the card cannot contradict the page.
 */
export const HERO_EYEBROW = `${CONTACT_INFO.title} · ${CITY}`.toUpperCase();

/**
 * The hero headline. Exported for the same reason as `HERO_EYEBROW`: the OG
 * card shows this sentence, and a second copy of it would be a second thing to
 * forget to update.
 */
export const HERO_HEADLINE =
  'I build the platform other frontend teams ship on.';

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

/** Also rendered, verbatim, on the OG card. */
export const HERO_STATS = [
  { term: 'Experience', detail: `Since ${CAREER_START_YEAR}` },
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
      className="hero"
    >
      <div className="w-full max-w-[660px]">
        <p className="eyebrow">{HERO_EYEBROW}</p>

        <h1
          id="hero-heading"
          className="hero__title mt-6"
        >
          {HERO_HEADLINE}
        </h1>

        {/*
          The AI clause used to be four words — "Lately, GenAI and agentic
          workflows" — for the largest body of work on the résumé below it. It
          now names the two things that clause was standing in for, both of
          which are bullets on `indeed-sr-swe`: the code-generation harnesses
          that took 10% off cycle time, and the secure gateway that opens
          internal AI platforms to third-party agents.
        */}
        <p className="hero__lead mt-7 max-w-[54ch]">
          {`TypeScript and React since ${CAREER_START_YEAR}: component libraries, module federation, Core Web Vitals and frontend SLOs.`}{' '}
          Lately, AI in the delivery path — code-generation harnesses, and a
          secure gateway that opens internal AI platforms to third-party
          agents.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a
            href="#work"
            className="button button--pill button--primary button--hero px-6 transition-transform hover:-translate-y-px"
          >
            See my work
          </a>
          <a
            href={CONTACT_INFO.github}
            rel="noopener noreferrer"
            className="button button--pill button--outline button--hero px-6 transition-colors hover:bg-panel"
          >
            GitHub
          </a>
          {/* Its own route (plan v4, Phase 2e): the fit checker's code never
              ships with this page, only this link does. A plain <a>, not
              next/link: <Link> is a Client Component, and this page doesn't
              otherwise load it — it measured +2.3 KB gzip on the homepage JS
              budget (scripts/check-homepage-js.mjs) for a prefetch of a page
              few visitors open. */}
          <a
            href="/fit"
            className="button button--pill button--outline button--hero px-6 transition-colors hover:bg-panel"
          >
            Check your role against my work
          </a>
        </div>

        <dl className="hero__stats mt-14">
          {HERO_STATS.map((stat) => (
            <div key={stat.term} className="hero__stat">
              <dt className="label-mono label-mono--tight">
                {stat.term}
              </dt>
              <dd className="hero__stat-value mt-2">
                {stat.detail}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Tells the reader the fixed 3D backdrop is scroll-driven. Desktop only:
          on the auto-height mobile hero there is no "bottom" to pin it to. */}
      <p className="hero__scroll-hint">
        <span aria-hidden="true" className="hero__scroll-rule" />
        <span className="hero__scroll-label">
          Scroll: the blocks rearrange for each section
        </span>
      </p>
    </section>
  );
}
