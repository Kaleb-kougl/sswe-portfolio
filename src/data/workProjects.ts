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
  | 'video-pipeline'
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
    id: 'video-pipeline',
    name: 'Agentic AI Video Creator',
    badge: { label: 'AGENTIC AI · MIT', tone: 'lime' },
    //
    // REPLACED BonkBall here. BonkBall keeps its résumé entry
    // (RESUME_DATA['hammerball']) and its live Roblox link; what it does not
    // keep is one of the four slots a reader actually looks at. This grid is
    // the site's argument, and a multiplayer game made a weaker one than a
    // multi-agent LLM system does.
    //
    // SOURCING — read before adding a number to this card.
    // Every clause is read off the public repo's README at
    // github.com/Kaleb-kougl/video-pipeline (Public, Python, MIT):
    //   six stages           → "WorkflowOrchestrator (agents/workflow_orchestrator.py)
    //                          drives all six stages"
    //   sub-agents           → transcript discovery, content generation,
    //                          compilation, per the same section
    //   Pydantic schema      → "Constraining a nondeterministic model":
    //                          with_structured_output(Episode_Summary_Schema),
    //                          plot_points: List[str]
    //   six validators/gate  → "Quality gates with explicit criticality":
    //                          agents/quality_agents/, the min_score/critical
    //                          table in quality_coordinator.py
    //   149 tests            → "Tests: 149 passed, 2 skipped"
    //
    // TWO LINKEDIN CLAIMS ARE DELIBERATELY ABSENT, and should not be added to
    // this card without their own artifact to point at:
    //   - "parallel image generation ... reduced media creation time by over
    //     60%". No parallel image module and no 60% figure appears in this
    //     repo. The README's one performance discussion is ContentCache, and
    //     it says that saving is theoretical because nothing calls it.
    //   - the separate autonomous coding agent that enforced TDD. Not in this
    //     repo either.
    // Both live in separate repositories. When one is public, cite it here and
    // the claims can ship — the TDD agent especially, since "an agent that
    // refactors my own code under TDD" is the strongest thing on this profile
    // for an AI-developer-tooling reader. Until then they stay off the card
    // and remain on the résumé entry, which is labelled as LinkedIn-sourced.
    description:
      'A six-stage agentic pipeline that turns an episode transcript into a narrated video. A workflow orchestrator drives sub-agents for transcript discovery, Gemini generation and compilation, with the model bound to a Pydantic schema so everything downstream gets a fixed shape instead of prose to parse. Six validators score their own stage against a gate table that decides whether a weak one degrades the run or stops it. 149 tests passing.',
    links: [
      {
        label: 'Source',
        href: 'https://github.com/Kaleb-kougl/video-pipeline',
        screenReaderSuffix: ' for the Agentic AI Video Creator on GitHub',
      },
    ],
  },
  {
    id: 'analytics-extension',
    name: 'Indeed Analytics Extension',
    badge: { label: 'AT INDEED', tone: 'blue' },
    // Sourced from src/data/resumeData.ts → RESUME_DATA['analytics-extension'].
    // Every clause below maps to one of its bullets: the 20% troubleshooting
    // figure and "GenAI analytics Chrome extension" from the résumé bullet,
    // "single-click workflow that replaced a cumbersome manual process" from
    // the LinkedIn one, then "zero-auth, stateless bridge" and "strict
    // frontend input allowlists and automatic URL sanitization".
    //
    // ORDER IS THE POINT. This card used to open on the auth bridge and the
    // sanitization, which is plumbing, and never said the thing was GenAI or
    // that it saved anyone any time. The security design is still here; it is
    // just no longer the first thing a skimming reader gets.
    //
    // NO LINK: internal Indeed tooling with no public repository, and no case
    // study page exists to link to.
    description:
      'A GenAI analytics extension that cut ad-campaign troubleshooting 20% for Customer Support, turning a manual diagnostic process into one click. Manifest V3 and React over a stateless bridge that carries no auth tokens, with strict input allowlists and automatic URL sanitization on the way through.',
    links: [],
    linkNote: 'Internal to Indeed — no public link',
  },
];
