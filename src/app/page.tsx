import { SpeedInsights } from '@vercel/speed-insights/next';

import { MorphScene } from '@/components/3d/morph-scene';
import { CareerSection } from '@/components/scroll/career-section';
import { ContactSection } from '@/components/scroll/contact-section';
import { HeroSection } from '@/components/scroll/hero-section';
import { ProcessSection } from '@/components/scroll/process-section';
import { SiteNav } from '@/components/scroll/site-nav';
import { UseWithYourAi } from '@/components/scroll/use-with-your-ai';
import { WorkSection } from '@/components/scroll/work-section';
import { CONTACT_INFO, EDUCATION, SKILLS, SUMMARY } from '@/data/resumeData';
import { SITE_URL } from '@/data/site';

/**
 * Structured data for search engines and AI crawlers. Rendered as a plain
 * <script>, per the Next.js JSON-LD guide — next/script is for executable
 * code, and this is data.
 *
 * It now complements the page rather than compensating for it: every section
 * below is a server component, so the real copy is in the initial HTML for
 * crawlers that never run JS. (The retired IDE layout loaded everything with
 * `ssr: false`, which left those clients with an empty document.)
 */
const personJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: CONTACT_INFO.name,
  jobTitle: CONTACT_INFO.title,
  description: SUMMARY,
  email: `mailto:${CONTACT_INFO.email}`,
  telephone: CONTACT_INFO.phone,
  url: SITE_URL,
  // Derived, not retyped: this previously hardcoded "San Francisco" and went
  // stale the moment the résumé said South San Francisco, leaving the
  // structured data contradicting the visible contact block.
  address: {
    '@type': 'PostalAddress',
    addressLocality: CONTACT_INFO.location.split(',')[0].trim(),
    addressRegion: CONTACT_INFO.location.split(',')[1]?.trim() ?? 'CA',
    addressCountry: 'US',
  },
  sameAs: [`https://${CONTACT_INFO.linkedin}`, CONTACT_INFO.github],
  knowsAbout: SKILLS,
  alumniOf: EDUCATION.map((school) => ({
    '@type': 'CollegeOrUniversity',
    name: school.school,
  })),
};

/**
 * Layering, bottom to top:
 *   z-0  the fixed 3D backdrop, decorative and inert
 *   z-1  the scrolling sections
 *   z-2  the fixed nav
 */
export default function Home() {
  return (
    <>
      {/* First focusable element on the page. */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(personJsonLd).replace(/</g, '\\u003c'),
        }}
      />

      {/* Decoration only: no content lives here, and it never takes focus. */}
      <div aria-hidden="true" className="fixed inset-0 z-0">
        <MorphScene />
      </div>

      <SiteNav />

      <main id="main-content" tabIndex={-1} className="relative z-[1]">
        <HeroSection />
        <WorkSection />
        <CareerSection />
        <ProcessSection />
        {/* A Server Component passed through the Client one, so it ships as
            HTML and adds nothing to the homepage JS. */}
        <ContactSection>
          <UseWithYourAi />
        </ContactSection>
      </main>

      <SpeedInsights />
    </>
  );
}
