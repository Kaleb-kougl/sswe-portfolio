import { IDELayoutWrapper } from '@/components/ide-layout-wrapper';
import { CONTACT_INFO, EDUCATION, SKILLS, SUMMARY } from '@/data/resumeData';
import { SpeedInsights } from "@vercel/speed-insights/next"

// Structured data for crawlers that DO execute JS — the one audience the
// server-rendered hero in <IDELayoutWrapper> misses, since React replaces that
// markup on hydration. Rendered as a plain <script>, per the Next.js JSON-LD
// guide (next/script is for executable code; this is data).
const personJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: CONTACT_INFO.name,
  jobTitle: CONTACT_INFO.title,
  description: SUMMARY,
  email: `mailto:${CONTACT_INFO.email}`,
  telephone: CONTACT_INFO.phone,
  url: 'https://kalebkougl.dev',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'San Francisco',
    addressRegion: 'CA',
    addressCountry: 'US',
  },
  sameAs: [`https://${CONTACT_INFO.linkedin}`, CONTACT_INFO.github],
  knowsAbout: SKILLS,
  alumniOf: EDUCATION.map((school) => ({
    '@type': 'CollegeOrUniversity',
    name: school.school,
  })),
};

export default function Home() {
  return (
    <>
      {/* Skip link — first focusable element */}
      <a
        href="#main-content"
        className="skip-link"
      >
        Skip to main content
      </a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(personJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <IDELayoutWrapper />
      <SpeedInsights />
    </>
  );
}
