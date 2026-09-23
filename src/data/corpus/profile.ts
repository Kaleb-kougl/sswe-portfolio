import { CONTACT_INFO, SUMMARY } from '../resumeData';
import { SITE_URL } from '../site';
import type { Profile } from './schema';

/**
 * Who this is and how to reach him, for agents. Everything that already exists
 * is read from resumeData.ts and site.ts, never retyped.
 *
 * NO PHONE NUMBER. It is public in the page's JSON-LD, but this object feeds
 * `get_profile` and `/llms-full.txt`, which would make it trivially
 * harvestable at scale. Email and the contact form are the ways in, and the
 * corpus test fails if the number shows up anywhere in the serialized corpus.
 */
export const PROFILE: Profile = {
  name: CONTACT_INFO.name,
  title: CONTACT_INFO.title,
  summary: SUMMARY,
  location: CONTACT_INFO.location,
  email: CONTACT_INFO.email,
  links: {
    site: SITE_URL,
    contactForm: `${SITE_URL}/#contact`,
    // Stored scheme-less for display; page.tsx's JSON-LD adds it the same way.
    linkedin: `https://${CONTACT_INFO.linkedin}`,
    github: CONTACT_INFO.github,
  },
  // Stated by Kaleb, 2026-09-23. An agent repeats these as fact, so change
  // them only on his word, never by inference from the résumé.
  roleTargets: [
    'Senior Full Stack Software Engineer',
    'Senior Front End Software Engineer',
  ],
  // Dated, because "now" read months later is a claim nobody made. Update the
  // date whenever this is reconfirmed.
  availability: 'Available now (as of 2026-09-23)',
};
