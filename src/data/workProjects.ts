/**
 * WORK SECTION DATA — the four things worth showing a hiring manager.
 *
 * SOURCING RULE: every number on this page is one a reader could go check.
 * Each `verified` note below records where the claim came from. If you cannot
 * point at a file, a package, or a public URL, the claim does not ship.
 *
 * Illustrations for these cards live as JSX in
 * `src/components/scroll/work-section.tsx` — data here, drawing there.
 */

/** Which badge tint a card's chip uses. Each tint ships its own legible ink. */
export type WorkBadgeTone = 'lime' | 'blue' | 'neutral';

export interface WorkBadge {
  /** Short, uppercase. Says what kind of thing this is, not what it does. */
  label: string;
  tone: WorkBadgeTone;
}

export interface WorkLink {
  /** Visible label, e.g. "Source" or "npm". */
  label: string;
  href: string;
  /**
   * Appended to the visible label for screen readers, so "npm" does not read
   * as a bare, contextless word in a links list.
   */
  screenReaderSuffix: string;
}

/** Stable key; also selects the card's illustration in the component. */
export type WorkProjectId =
  | 'r3f-projectiles'
  | 'roblox-css'
  | 'bonkball'
  | 'analytics-extension';

export interface WorkProject {
  id: WorkProjectId;
  name: string;
  badge: WorkBadge;
  /** One or two sentences. Concrete over adjectival. */
  description: string;
  /** Real destinations only. A card with nothing public ships zero links. */
  links: WorkLink[];
  /**
   * Shown in place of links when `links` is empty, so the card still has a
   * footer and the absence of a link is stated rather than merely felt.
   */
  linkNote?: string;
}

export const WORK_PROJECTS: readonly WorkProject[] = [
  {
    id: 'r3f-projectiles',
    name: 'r3f-projectiles',
    badge: { label: 'NPM · MIT', tone: 'lime' },
    // Verified in r3f-projectiles/src/patterns.ts — `gen` exports 7 generators
    // (fibonacciSphere, torusKnot, galaxy, helix, rose3D, ring, arc) and `mod`
    // exports 6 modifiers (color, payload, scale, accelerate, sequence,
    // rotate). 553 `expect()` calls across 13 *.test.* files in
    // r3f-projectiles/src/__tests__/. License from its package.json.
    description:
      'A GPU-instanced projectile engine for React Three Fiber. Seven pattern generators and six modifiers compose into a single instanced draw call, held in place by 553 assertions across 13 spec files.',
    links: [
      {
        label: 'Source',
        href: 'https://github.com/Kaleb-kougl/r3f-projectiles',
        screenReaderSuffix: ' for r3f-projectiles on GitHub',
      },
      {
        label: 'npm',
        href: 'https://www.npmjs.com/package/@k9kbdev/r3f-projectiles',
        screenReaderSuffix: ' package page for @k9kbdev/r3f-projectiles',
      },
    ],
  },
  {
    id: 'roblox-css',
    name: 'roblox-css',
    badge: { label: 'NPM · LGPL-3.0', tone: 'lime' },
    // Sourced from src/data/resumeData.ts → RESUME_DATA['roblox-css'].
    // The 1,419/24 figure cannot be re-derived here (the package is not
    // vendored into this repo the way r3f-projectiles is); it is published on
    // the author's confirmation. Re-count it against the real source if that
    // package is ever vendored.
    description:
      'Write familiar CSS — flex, grid, gradients, calc — and get native Roblox UI primitives. A translation middleware for roblox-ts, built on a branded type system, three specialized parsers, and variant-driven animation, held in place by 1,419 assertions across 24 spec files.',
    links: [
      {
        label: 'npm',
        href: 'https://www.npmjs.com/package/@k9kbdev/roblox-css',
        screenReaderSuffix: ' package page for @k9kbdev/roblox-css',
      },
    ],
  },
  {
    id: 'bonkball',
    name: 'BonkBall',
    badge: { label: 'ROBLOX GAME', tone: 'neutral' },
    // Sourced from src/data/resumeData.ts → RESUME_DATA['hammerball'].
    // NO LINK: there is no case-study page on this site and no public Roblox
    // URL anywhere in resumeData, so this card ships without one rather than
    // pointing at a 404.
    description:
      'A PvPvE multiplayer Roblox game in strict TypeScript. An Entity-Component-System boundary keeps client and server apart, with Finite-State-Machine bots and match phases synchronized across 20+ decoupled services.',
    links: [],
    linkNote: 'No public link yet',
  },
  {
    id: 'analytics-extension',
    name: 'Indeed Analytics Extension',
    badge: { label: 'AT INDEED', tone: 'blue' },
    // Sourced from src/data/resumeData.ts → RESUME_DATA['analytics-extension'].
    // Every clause below maps to one of its bullets: Manifest V3 React
    // extension, "zero-auth, stateless bridge", "deep-linked troubleshooting
    // UI workflow", "strict frontend input allowlists and automatic URL
    // sanitization".
    // NO LINK: internal Indeed tooling with no public repository, and no case
    // study page exists to link to.
    description:
      'A Manifest V3 React extension that deep-links straight into campaign diagnostics. A stateless bridge that carries no auth tokens, with strict input allowlists and automatic URL sanitization on the way through.',
    links: [],
    linkNote: 'Internal to Indeed — no public link',
  },
];
