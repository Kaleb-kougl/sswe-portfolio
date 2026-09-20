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

/**
 * roblox-css coverage, re-derived rather than quoted.
 *
 * The package has its own repo, so `npm run roblox-css:check` measures this
 * against a local clone and fails if it drifts. Keep these two numbers as the
 * single source — the card's copy is built from them.
 *
 * DISTINCT, not total. At v0.1.1 eight spec files are byte-identical duplicates
 * between src/tests/ and src/tests/<subdir>/; both copies compile and run, so a
 * raw count reports 1,966 assertions across 20 files. We publish what is
 * actually distinct.
 *
 * This said 1,298 across 9 until the check script was found to be matching only
 * `.spec.ts` and skipping `.spec.tsx` — three real spec files, 40 assertions,
 * invisible to the very thing meant to keep the claim honest. The script now
 * matches both extensions and is scoped to `src/`, since the package's
 * root-level `tests/` tree never compiles and has never run.
 *
 * The package's README and CHANGELOG used to say "1,419 assertions across 24
 * spec files", matching nothing countable. Corrected upstream in roblox-css
 * 87429f8, which now publishes these same two numbers.
 */
export const ROBLOX_CSS_COVERAGE = {
  assertions: 1338,
  specFiles: 12,
} as const;

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
    // Read off the package at v0.1.1 rather than quoted from the résumé:
    // the three parsers are roblox-css/src/styles/{dimension,color,gradient}
    // Parser.ts, the UDim2/Color3/UIGradient emission and the
    // `uisizeconstraint` / `uiaspectratioconstraint` / `uitextsizeconstraint`
    // injection are in styles/webStyle.ts, and "at render time" is literal —
    // there is no build step, the peer dep is @rbxts/react.
    //
    // The résumé bullet this replaces said "incl. recursive calc()". That is
    // not true and must not come back: parseCalc (styles/dimensionParser.ts)
    // splits its terms on " - " / " + " with no regard for parentheses and
    // bails unless it gets exactly two, so every nested calc() fails — and so
    // does a single-term one. The spec only covers two-term expressions, which
    // is why nothing caught it. What ships here is what the parser does.
    //
    // The coverage figure comes from ROBLOX_CSS_COVERAGE above, which
    // `npm run roblox-css:check` re-derives from a clone of the real repo.
    description:
      'Write familiar CSS — flex, grid, gradients, calc — and get native Roblox UI. Hand-written parsers resolve dimensions, colors and linear-gradient() into UDim2, Color3 and UIGradient at render time, and a React layer injects the matching UI constraint instances. Held in place by ' +
      `${ROBLOX_CSS_COVERAGE.assertions.toLocaleString('en-US')} assertions across ${ROBLOX_CSS_COVERAGE.specFiles} spec files.`,
    links: [
      // Verified HTTP 200. NOTE: this repo's README still advertises "1,419
      // assertions across 24 spec files", a figure matching neither the raw
      // count (1,926/17) nor the distinct one this card publishes (1,298/9).
      // Now that the card links to it, a reader who follows Source sees the
      // contradiction. Fix belongs upstream, in the package's README.
      {
        label: 'Source',
        href: 'https://github.com/Kaleb-kougl/roblox-css',
        screenReaderSuffix: ' for roblox-css on GitHub',
      },
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
    // The Roblox link is the live game, verified HTTP 200 with the title
    // "BonkBall | Play on Roblox". It is the only public artifact for this
    // project — there is no repo and no case-study page — so it is the one
    // link the card carries.
    description:
      'A PvPvE multiplayer Roblox game in strict TypeScript. An Entity-Component-System boundary keeps client and server apart, with Finite-State-Machine bots and match phases synchronized across 20+ decoupled services.',
    links: [
      {
        label: 'Play on Roblox',
        href: 'https://www.roblox.com/games/125331448291741/BonkBall',
        screenReaderSuffix: ' — BonkBall on Roblox',
      },
    ],
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
