/**
 * The site's canonical origin — one constant, because it is used both by
 * `metadata` in layout.tsx and by the JSON-LD in page.tsx, and those two
 * disagreeing is exactly the bug this replaced.
 *
 * It previously read `https://kalebkougl.dev`, which is not a registered
 * domain (dig returns NXDOMAIN). That made `metadataBase` resolve the OG
 * image to a dead host, so link previews on LinkedIn, Slack and elsewhere
 * had no image, and the JSON-LD advertised a `url` that goes nowhere.
 *
 * When a real domain exists, change it here and nowhere else.
 */
export const SITE_URL = 'https://kalebkougl-portfolio.vercel.app';
