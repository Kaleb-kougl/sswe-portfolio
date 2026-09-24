/**
 * The site's social card, for /fit too. Setting `openGraph` in fit/page.tsx
 * (its own title, description and url) replaces the root segment's, and with
 * it the root card, so the same generator is re-exported here.
 */
export { default, alt, size, contentType } from '../opengraph-image';
