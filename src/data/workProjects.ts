import { SITE_URL } from './site';

/**
 * WORK SECTION DATA — the six things worth showing a hiring manager: two
 * featured cards across the full width (Roblox Dungeons, then Glassgrid), and
 * four below them.
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

/**
 * Glassgrid's one published timing, kept as data so the card's sentence, the
 * résumé bullet and the e2e test all read the same figure and the same
 * conditions — never the number without the machine it was measured on.
 *
 * WHY CONDITIONS TRAVEL WITH THE NUMBER. This site has already refused one
 * machine-dependent figure ("120 fps", see the header of corpus/evidence.ts).
 * A latency is the same kind of claim: true on the machine that measured it.
 * So it ships only with that machine named, and only with a file to check.
 *
 * Source, read on glassgrid@main (cd419c3):
 * docs/benchmarks/m3/m3-exit-gate-medians-linux-x64.json →
 * exitGate.crossfilter.p95Ms.median = 80.5 (runs 94.7 / 79.4 / 80.5),
 * budgetMs 100, brushes 20, rows 10,000,000, machine.cpuCount 2, totalMemBytes
 * 8,419,655,680 (8 GB), "4 charts + grid", source "parquet" (the background
 * Parquet copy of the CSV). Measured from brush release to every other view
 * painted, in Electron 44 under Xvfb with software rendering. The README's
 * "Numbers" table and the case study's "Results" table quote the same median.
 */
export const GLASSGRID_CROSSFILTER = {
  p95Ms: 80.5,
  budgetMs: 100,
  rows: '10M',
  /** Says where the number is true; always printed with it. */
  conditions: 'measured on a 2-vCPU Linux VM',
  source:
    'https://github.com/Kaleb-kougl/glassgrid/blob/main/docs/benchmarks/m3/m3-exit-gate-medians-linux-x64.json',
} as const;

/** The figure as the card states it. The e2e test asserts this exact string. */
export const GLASSGRID_CROSSFILTER_CLAIM = `${GLASSGRID_CROSSFILTER.p95Ms} ms at p95, ${GLASSGRID_CROSSFILTER.conditions}`;

/**
 * Roblox Dungeons is read at one commit, not at `main`.
 *
 * The game's repository moves every day, so a sentence read off `main` is true
 * only until the next merge. Every claim on the card, in the résumé entry and
 * in the corpus is read at this commit, and every source link is a permalink
 * to it. Bump the pin on purpose, re-read the sources named in the card's
 * SOURCING note, and only then change a sentence.
 *
 * Pinned 2026-11-22 from `git ls-remote` on the public repository (`main`).
 */
export const ROBLOX_DUNGEONS_REPO = 'https://github.com/Kaleb-kougl/roblox-dungeons';
export const ROBLOX_DUNGEONS_PIN = 'dff7b30418327964a522ac1f0939a98ed7358d46';
/** A permalink to a file in the game's repository at the pinned commit. */
export const robloxDungeonsFile = (path: string) =>
  `${ROBLOX_DUNGEONS_REPO}/blob/${ROBLOX_DUNGEONS_PIN}/${path}`;

/**
 * Roblox Dungeons' one published measurement: the rollback spike's CPU result.
 *
 * WHY THIS ONE. The card is an argument about judgment, and this is the number
 * a decision was made on: rollback netcode was measured against a gate set in
 * advance, failed it, and was not built. Like Glassgrid's latency it is true
 * on the device that measured it, so the device is printed with it, always.
 *
 * Source, read at the pin: docs/decisions/0004-rollback-measured-then-not-built.md,
 * the "Decision" table: "CPU: copy the state and step it 16 ticks, per rendered
 * frame", gate "4 ms p95 on a mid-range phone", measured "11.77 ms p95 on an
 * iPhone 17, which dropped to 50 fps". The full record is
 * docs/ROLLBACK_SPIKE.md (decision RBD8 and the device table).
 *
 * NOT ON THE CARD: the spike's second result (teammates corrected by a tile or
 * more 27 to 74 times a minute against a gate of 6). It is from a bot sweep,
 * and the record says so; a card has no room for that qualifier.
 */
export const ROBLOX_DUNGEONS_ROLLBACK = {
  p95Ms: 11.77,
  gateMs: 4,
  /** Says where the number is true; always printed with it. */
  device: 'iPhone 17',
  source: robloxDungeonsFile('docs/decisions/0004-rollback-measured-then-not-built.md'),
} as const;

/** The figure as the card states it. The e2e test asserts this exact string. */
export const ROBLOX_DUNGEONS_ROLLBACK_CLAIM = `${ROBLOX_DUNGEONS_ROLLBACK.p95Ms} ms at p95 on an ${ROBLOX_DUNGEONS_ROLLBACK.device}, against a ${ROBLOX_DUNGEONS_ROLLBACK.gateMs} ms gate`;

/**
 * Golden fixtures the port replays bit for bit: the JSON files in `fixtures/`
 * at the pin (README.md, "Proof": "16 golden files exported from the
 * original"; counted in the directory, 16).
 */
export const ROBLOX_DUNGEONS_FIXTURES = 16;

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
  | 'roblox-dungeons'
  | 'glassgrid'
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
  /**
   * A lead card: spans both columns from 768px up, above the 2x2 of the
   * rest. Two at most, and they are the first entries, in the order a reader
   * should meet them.
   */
  featured?: boolean;
}

export const WORK_PROJECTS: readonly WorkProject[] = [
  {
    id: 'roblox-dungeons',
    name: 'Roblox Dungeons',
    badge: { label: 'LIVE ON ROBLOX · SOURCE AVAILABLE', tone: 'lime' },
    featured: true,
    //
    // FIRST, AND A GAME. BonkBall lost its slot in this grid because "a
    // multiplayer game made a weaker argument than a multi-agent LLM system
    // does". This card is here for the opposite reason, so it must not read
    // as "a game": the first clause says what it is, and every clause after
    // it is a constraint or a decision. If an edit makes this card describe
    // gameplay, it has stopped doing its job.
    //
    // SOURCING — every clause is read off github.com/Kaleb-kougl/roblox-dungeons
    // at ROBLOX_DUNGEONS_PIN (dff7b30), not at main and not from memory. Paths
    // are in that repo:
    //   co-op bullet-hell roguelike,      → README.md, opening paragraph ("A co-op
    //   up to 8 players, live on Roblox     bullet-hell roguelike on Roblox for up
    //                                       to 8 players"), and its "Play it on
    //                                       Roblox" link
    //   deterministic simulation,         → README.md "1. A port that replays bit
    //   replays its TypeScript original     for bit"; fixtures/README.md;
    //   bit for bit, 16 golden fixtures     ROBLOX_DUNGEONS_FIXTURES above
    //   test runner raises on clock,      → README.md "2. Determinism that is
    //   RNG and Roblox API calls            enforced, not promised";
    //                                       scripts/lune/lib/realm.luau
    //   server replays a submitted        → ARCHITECTURE.md "Trust boundary"
    //   run from its inputs                 ("Recomputes a run's hash, score,
    //                                       floor and summary ... the client's
    //                                       numbers are only compared")
    //   rollback measured, 11.77 ms       → ROBLOX_DUNGEONS_ROLLBACK above, which
    //   p95, iPhone 17, 4 ms gate,          records the table it is read from
    //   not built
    //   source available                  → LICENSE ("Source available for review
    //                                       ... All rights reserved"). NOT open
    //                                       source: the badge must never say MIT.
    //
    // ONE NUMBER, ON PURPOSE, as on the Glassgrid card. The README has more
    // (lines of source and tests, spec files, commits). They change daily and
    // say how much was written, not how well it was decided; they belong on a
    // case study with a date next to them, not here.
    //
    // NOT CLAIMED: that the server stops cheating. ARCHITECTURE.md lists what
    // replay validation does not do (bots, tool-assisted inputs, one party
    // member forcing a co-op run unranked). The card says the server replays
    // runs instead of trusting scores, which is what it does.
    //
    // THE THIRD LINK is the repo's one-page architecture, at the pin. When this
    // site has its own case study page (docs plan PS10-PS13) the link becomes
    // "Case study" and points there.
    description:
      `A co-op bullet-hell roguelike for up to 8 players, live on Roblox, built on a deterministic simulation that replays its TypeScript original bit for bit across ${ROBLOX_DUNGEONS_FIXTURES} golden fixtures. ` +
      'The test runner loads the simulation where clock, RNG and Roblox API calls raise, so determinism is enforced rather than promised, and the server replays every submitted run from its inputs instead of trusting the score. ' +
      `Rollback netcode was measured before it was built, at ${ROBLOX_DUNGEONS_ROLLBACK_CLAIM}, and then not built.`,
    links: [
      {
        label: 'Play',
        href: 'https://www.roblox.com/games/87902875988844/Roblox-Dungeons',
        screenReaderSuffix: ' Roblox Dungeons on Roblox',
      },
      {
        label: 'Source',
        href: ROBLOX_DUNGEONS_REPO,
        screenReaderSuffix: ' for Roblox Dungeons on GitHub',
      },
      {
        label: 'Architecture',
        href: robloxDungeonsFile('ARCHITECTURE.md'),
        screenReaderSuffix: ' of Roblox Dungeons, one page on GitHub',
      },
    ],
  },
  {
    id: 'glassgrid',
    name: 'Glassgrid',
    badge: { label: 'DESKTOP + WEB · MIT', tone: 'lime' },
    featured: true,
    //
    // SOURCING — every clause is read off github.com/Kaleb-kougl/glassgrid at
    // main (cd419c3), not from memory. Paths are in that repo:
    //   multi-gigabyte CSV, canvas grid,  → README.md, opening paragraph:
    //   linked charts, DuckDB computes      "Open a multi-gigabyte CSV on your own
    //   every number                        machine, scroll it in a canvas grid and
    //                                       cross-filter linked charts over it. An
    //                                       embedded DuckDB computes every number"
    //   one React app, one engine;        → README.md "How it works" ("One app,
    //   native DuckDB in a                  two runtimes"); docs/case-study.md
    //   utilityProcess, DuckDB-WASM         "Architecture"
    //   in a Web Worker
    //   typed, undoable commands          → README.md "How it works" ("Every action
    //                                       is a command"); docs/m1-commands.md
    //   80.5 ms at p95, 10M rows,         → GLASSGRID_CROSSFILTER above, which
    //   four charts and the grid,           records the JSON field it is read from
    //   2-vCPU Linux VM
    //   MIT                               → LICENSE ("MIT License, Copyright (c)
    //                                       2026 Kaleb Kougl")
    //
    // ONE NUMBER, ON PURPOSE. The README's table has more (open a 329 MB CSV
    // to first rows in 315 ms, a 16.7 ms p95 scroll frame, 253.5 kB of
    // first-load JS), all from the same VM. A card carries the one that is the
    // product's reason to exist; the rest are a click away on the case study,
    // with their conditions next to them.
    //
    // NOT CLAIMED: the MCP bridge. It is milestone M6, planned and not built.
    // What exists is the command registry an agent would drive and a parity
    // test over it; the résumé entry says exactly that and no more.
    //
    // NOT DEPLOYED ELSEWHERE: the README still names glassgrid.vercel.app as a
    // TODO. The demo is served by this site under /glassgrid/, so the link is
    // built from SITE_URL and moves with the domain.
    description:
      'Open a multi-gigabyte CSV on your own machine, scroll it in a canvas grid and cross-filter linked charts over it, with an embedded DuckDB computing every number. One React app and one query engine run as an Electron desktop app on native DuckDB and in the browser on DuckDB-WASM in a Web Worker, and every action is a typed, undoable command. ' +
      `At ${GLASSGRID_CROSSFILTER.rows} rows, a brush repaints four charts and the grid in ${GLASSGRID_CROSSFILTER_CLAIM}.`,
    links: [
      {
        label: 'Live demo',
        href: `${SITE_URL}/glassgrid/?sample=taxi`,
        screenReaderSuffix: ' of Glassgrid in the browser, on its taxi-trips sample',
      },
      {
        label: 'Source',
        href: 'https://github.com/Kaleb-kougl/glassgrid',
        screenReaderSuffix: ' for Glassgrid on GitHub',
      },
      {
        label: 'Case study',
        href: 'https://github.com/Kaleb-kougl/glassgrid/blob/main/docs/case-study.md',
        screenReaderSuffix: ' for Glassgrid on GitHub',
      },
    ],
  },
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
