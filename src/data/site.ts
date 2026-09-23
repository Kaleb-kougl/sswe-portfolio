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

/**
 * The reCAPTCHA v3 **site** key for the contact form.
 *
 * This is the public half of the pair: it is embedded in the client HTML by
 * design and is worthless on its own — Google only issues a token for it on
 * the origins registered against it, and the token is verified against the
 * **secret** key, which lives in the Formspree form settings and must never
 * enter this repo.
 *
 * Formspree's custom integration expects the site owner to register their own
 * key pair and post the token back as a field named exactly
 * `g-recaptcha-response`; with reCAPTCHA switched on for the form, every
 * submission without one is rejected with `400 "Please complete the
 * reCAPTCHA"`.
 *
 * It lives here for the same reason `SITE_URL` does: it is a public,
 * deploy-level fact, and the one place to change it is this file.
 */
export const RECAPTCHA_SITE_KEY = '6Lchp78tAAAAAECkHg6mrEAqYpbj8W83vVroPoXa';

/**
 * The public MCP endpoint (Streamable HTTP, read-only tools over the corpus).
 * Derived from `SITE_URL` so a domain change moves it too. `/llms.txt` and the
 * "Use with your AI" block in the contact section both advertise it; the
 * handler lives at `src/app/api/mcp/[transport]/route.ts`.
 */
export const MCP_URL = `${SITE_URL}/api/mcp`;
