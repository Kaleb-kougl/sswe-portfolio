/**
 * Contact details, in their own module so the homepage's one client-side
 * reader (`contact-section.tsx`) doesn't pull in all of `resumeData`.
 *
 * Turbopack normally tree-shakes `resumeData` down to this export for the
 * client. Once another client graph needs the whole module (the Private-mode
 * worker, via the corpus), it is emitted whole in a chunk the homepage shares:
 * +6.2 KB gzip on `scripts/check-homepage-js.mjs`. `resumeData` re-exports
 * from here, so every other import is unchanged.
 */
export interface ContactInfo {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
}

export const CONTACT_INFO: ContactInfo = {
  name: 'Kaleb Kougl',
  title: 'Senior Software Engineer',
  email: 'KalebKougl@gmail.com',
  phone: '479-283-4454',
  location: 'South San Francisco, CA',
  linkedin: 'linkedin.com/in/kaleb-kougl',
  github: 'https://github.com/Kaleb-kougl',
};
