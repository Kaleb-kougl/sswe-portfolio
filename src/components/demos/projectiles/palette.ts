/**
 * Demo-local pigments.
 *
 * The retired `src/components/3d/colors.ts` was a site-wide Three.js palette;
 * it went with the IDE and is not coming back. Three needs plain hex strings —
 * it cannot read a CSS custom property — so the five tokens this demo actually
 * paints with are inlined here, next to the only code that uses them, rather
 * than reconstituting a global colors module.
 *
 * Values mirror `src/app/globals.css`. If a token moves there, move it here.
 *
 * NOTE ON THE ACCENT CONTRACT: `cta` orange and `link` blue are interface
 * tokens with one job each on the page. Inside this canvas they are not
 * interface — they are bullet pigment on a near-black arena, the same way
 * `work-section.tsx` paints its illustration panel. Nothing here is a button
 * and nothing here is a link.
 */
export const DEMO_PALETTE = {
  /** --color-lime */
  lime: '#bff03a',
  /** --color-link */
  blue: '#1f3be0',
  /** --color-cta */
  orange: '#ff5e1a',
  /** --color-ink — the arena floor, fog and background */
  ink: '#161310',
  /** --color-paper */
  paper: '#fffdf7',
} as const;
