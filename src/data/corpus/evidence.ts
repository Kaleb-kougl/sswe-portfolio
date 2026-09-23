import { RESUME_DATA } from '../resumeData';
import { SITE_URL } from '../site';
import { ROBLOX_CSS_COVERAGE, WORK_PROJECTS, type WorkProjectId } from '../workProjects';
import type { Evidence } from './schema';

/**
 * EVIDENCE — the site's existing claims, one checkable sentence at a time.
 *
 * Each record paraphrases a bullet in RESUME_DATA or a card in WORK_PROJECTS
 * into the first person. Nothing here is new copy: if a sentence can't be
 * traced to its `entry`, it doesn't belong. The sourcing rule at the top of
 * workProjects.ts applies to every `metric` — a number ships only if a reader
 * could go check it — and the corpus test holds each metric's figures to the
 * entry's own text.
 *
 * DELIBERATELY NOT HERE, because nothing public backs them:
 *   - video-pipeline's "over 60%" parallel image generation and its separate
 *     TDD coding agent (see the SOURCING note on that card in workProjects.ts),
 *     and the ChromaDB character analysis, which the card doesn't vouch for.
 *   - combat_system's IK enemies and boss AI. Its other bullets repeat
 *     r3f-projectiles, which is cited instead.
 *   - "120fps" for the r3f-projectiles renderer. The pool size is in the code;
 *     a frame rate depends on the machine it was measured on.
 * Entries of type profile, contact and skill are keyword lists or contact
 * details, not claims, and are skipped too.
 *
 * Sources: public URLs already in the data where one exists. Work history has
 * none, so it points at the section of this site that renders it.
 */

const CAREER_ANCHOR = `${SITE_URL}/#career`;
const WORK_ANCHOR = `${SITE_URL}/#work`;

type Draft = Pick<Evidence, 'claim' | 'skills' | 'metric'>;
type EntryId = keyof typeof RESUME_DATA | WorkProjectId;

/** Look up a link a Work card already publishes, so no URL is retyped. */
function cardLink(id: WorkProjectId, label: string): string {
  const href = WORK_PROJECTS.find((p) => p.id === id)?.links.find((l) => l.label === label)?.href;
  if (!href) throw new Error(`No "${label}" link on the ${id} card`);
  return href;
}

/** Pull a URL out of an entry's bullets, for entries that only carry one there. */
function bulletUrl(fileId: string, host: string): string {
  for (const bullet of RESUME_DATA[fileId].bullets) {
    const match = bullet.match(/https:\/\/\S+/);
    if (match && new URL(match[0]).hostname.endsWith(host)) return match[0];
  }
  throw new Error(`No ${host} URL in ${fileId}'s bullets`);
}

/** A work-history entry: sourced to the career section, dated from the entry. */
function career(fileId: string, slug: string, draft: Draft): Evidence {
  const entry = RESUME_DATA[fileId];
  return {
    id: `${fileId}.${slug}`,
    entry: fileId,
    ...draft,
    source: { label: `Résumé: ${entry.title}, ${entry.company}`, href: CAREER_ANCHOR },
    period: entry.dates,
  };
}

function project(
  entry: EntryId,
  slug: string,
  draft: Draft,
  source: Evidence['source'],
  period?: string,
): Evidence {
  return { id: `${entry}.${slug}`, entry, ...draft, source, ...(period ? { period } : {}) };
}

const R3F_SOURCE = { label: 'r3f-projectiles on GitHub', href: cardLink('r3f-projectiles', 'Source') };
const R3F_NPM = { label: '@k9kbdev/r3f-projectiles on npm', href: cardLink('r3f-projectiles', 'npm') };
const ROBLOX_CSS_SOURCE = { label: 'roblox-css on GitHub', href: cardLink('roblox-css', 'Source') };
const ROBLOX_CSS_NPM = { label: '@k9kbdev/roblox-css on npm', href: cardLink('roblox-css', 'npm') };
const VIDEO_PIPELINE_SOURCE = { label: 'video-pipeline on GitHub', href: cardLink('video-pipeline', 'Source') };
const BONKBALL = { label: 'BonkBall on Roblox', href: bulletUrl('hammerball', 'roblox.com') };
const EXTENSION = { label: 'Work: Indeed Analytics Extension (internal, no public link)', href: WORK_ANCHOR };

// The DOI bullet is a bare identifier ("DOI: 10.1021/..."), not a URL.
const DOI = RESUME_DATA['acs-microdialysis'].bullets
  .map((b) => b.match(/^DOI: (\S+)$/)?.[1])
  .find(Boolean);
if (!DOI) throw new Error('No DOI in acs-microdialysis bullets');

/*
 * The analytics extension's résumé bullet sits under Software Engineer II, so
 * its records carry that role's dates. The project entry itself is undated.
 */
const EXTENSION_PERIOD = RESUME_DATA['indeed-swe-ii'].dates;

const { assertions, specFiles } = ROBLOX_CSS_COVERAGE;

export const EVIDENCE: readonly Evidence[] = [
  // --- Indeed, Senior Software Engineer ----------------------------------
  career('indeed-sr-swe', 'ai-cycle-time', {
    claim: 'I reduced pickup-to-merge cycle time by 10% by applying AI-assisted code generation and workflow harnesses.',
    skills: ['ai-assisted-development', 'developer-productivity'],
    metric: '10% shorter pickup-to-merge cycle time',
  }),
  career('indeed-sr-swe', 'ai-gateway', {
    claim: 'I contributed to a strategic initiative to externalize core AI capabilities through a secure gateway, enabling third-party client and agent-based integrations with internal AI platforms.',
    skills: ['ai-platform'],
  }),
  career('indeed-sr-swe', 'onehost-lead', {
    claim: 'As tech lead, I led my team’s migration from a monolithic architecture to OneHost, a micro-frontend platform on Webpack 5 module federation, using React Storybook and CSS design tokens, and automated its CI/CD.',
    skills: ['micro-frontends', 'module-federation', 'webpack', 'storybook', 'design-tokens', 'ci-cd', 'tech-leadership', 'codebase-migrations'],
  }),
  career('indeed-sr-swe', 'onehost-architecture', {
    claim: 'I co-architected the OneHost migration with the principal architect, then led a team of 6 engineers on the technical execution using Webpack 5 federated modules and GraphQL.',
    skills: ['system-design', 'module-federation', 'micro-frontends', 'graphql', 'tech-leadership'],
    metric: 'Led a team of 6 engineers',
  }),
  career('indeed-sr-swe', 'luxon-migration', {
    claim: 'I drove the migration to the Luxon library for standardized timezone handling, which unblocked a critical integration with the Horizon platform.',
    skills: ['codebase-migrations', 'javascript'],
  }),
  career('indeed-sr-swe', 'mentoring', {
    claim: 'I mentored ~12 engineers as team and project lead, which led to promotions and improved onboarding.',
    skills: ['mentoring', 'tech-leadership'],
    metric: '~12 engineers mentored',
  }),
  career('indeed-sr-swe', 'frontend-slos', {
    claim: 'I operationalized frontend SLOs with SRE and Product, reducing customer-facing incidents for consumer features.',
    skills: ['slos', 'cross-functional-collaboration'],
  }),

  // --- Indeed, Software Engineer II --------------------------------------
  // Its first bullet, the analytics extension, is cited under that entry below.
  career('indeed-swe-ii', 'apply-flow-tti', {
    claim: 'I cut Time to Interactive by 15% in the apply flow, which serves 680M+ users.',
    skills: ['web-performance', 'core-web-vitals'],
    metric: '15% faster Time to Interactive for 680M+ users',
  }),
  career('indeed-swe-ii', 'wcag-components', {
    claim: 'I led the effort to implement WCAG accessibility standards across 20+ reusable React components consumed by 5 teams.',
    skills: ['wcag', 'react', 'component-libraries', 'design-systems'],
    metric: '20+ components used by 5 teams',
  }),

  // --- IBM, Software Engineer II -----------------------------------------
  career('ibm-staff-swe', 'ibm-developer-react', {
    claim: 'I modernized the IBM Developer site with React and Webpack, improving SEO and Core Web Vitals (TTI/FCP) across devices.',
    skills: ['react', 'webpack', 'seo', 'core-web-vitals', 'web-performance', 'codebase-migrations'],
  }),
  career('ibm-staff-swe', 'build-time', {
    claim: 'I optimized the Webpack configuration to halve build time and make rebuild and hot-reload 29x faster.',
    skills: ['webpack', 'build-systems', 'developer-productivity'],
    metric: 'Build time halved; rebuild/hot-reload 29x faster',
  }),
  career('ibm-staff-swe', 'bundle-size', {
    claim: 'I shrank the bundle from 6 MB to 300 KB, reclaiming 20+ engineer hours per week across a team of 10.',
    skills: ['web-performance', 'webpack', 'developer-productivity'],
    metric: 'Bundle 6 MB → 300 KB; 20+ engineer hours/week reclaimed across a team of 10',
  }),
  career('ibm-staff-swe', 'video-upload-pipeline', {
    claim: 'I designed and launched a Node.js Watson Media video upload pipeline to streamline video publishing for developer advocates.',
    skills: ['node-js', 'system-design'],
  }),

  // --- IBM, Software Engineer --------------------------------------------
  career('ibm-swe', 'agent-portal', {
    claim: 'I delivered a modernized customer service agent portal with 30% faster API response.',
    skills: ['web-applications', 'web-performance'],
    metric: '30% faster API response',
  }),
  career('ibm-swe', 'golftv-graphql', {
    claim: 'I improved data reliability for client integrations through the GolfTV Graph API, built with Apollo GraphQL on AWS.',
    skills: ['graphql', 'apollo-graphql', 'aws', 'api-design'],
  }),

  // --- J.B. Hunt, intern -------------------------------------------------
  career('jbhunt-intern', 'react-native', {
    claim: 'I built cross-platform React Native features and added Jest and Appium test suites to raise release confidence.',
    skills: ['react-native', 'jest', 'appium', 'automated-testing'],
  }),

  // --- Indeed Analytics Extension ----------------------------------------
  project('analytics-extension', 'troubleshooting-time', {
    claim: 'I shipped a TypeScript/Python Manifest V3 GenAI analytics Chrome extension that cut ad-campaign troubleshooting time by 20% for Customer Support.',
    skills: ['genai', 'chrome-extensions', 'typescript', 'python'],
    metric: '20% less ad-campaign troubleshooting time',
  }, EXTENSION, EXTENSION_PERIOD),
  project('analytics-extension', 'single-click', {
    claim: 'I led end-to-end, full-stack development of the extension in React, creating a single-click workflow that replaced a cumbersome manual process.',
    skills: ['full-stack', 'react', 'chrome-extensions'],
  }, EXTENSION, EXTENSION_PERIOD),
  project('analytics-extension', 'stateless-bridge', {
    claim: 'I designed a zero-auth, stateless bridge that connects the extension to backend microservices through dynamic URL generation, eliminating API token overhead.',
    skills: ['system-design', 'microservices', 'chrome-extensions'],
  }, EXTENSION, EXTENSION_PERIOD),
  project('analytics-extension', 'deep-linked-diagnostics', {
    claim: 'I built a deep-linked troubleshooting workflow that auto-populates and triggers complex campaign diagnostics with no manual data entry.',
    skills: ['react', 'developer-productivity'],
  }, EXTENSION, EXTENSION_PERIOD),
  project('analytics-extension', 'xss-hardening', {
    claim: 'I secured cross-platform data transfers with strict frontend input allowlists and automatic URL sanitization to prevent XSS, routing external input into existing backend validation.',
    skills: ['frontend-security'],
  }, EXTENSION, EXTENSION_PERIOD),

  // --- Agentic AI Video Creator ------------------------------------------
  // Claims limited to what the card vouches for: its README, per workProjects.ts.
  project('video-pipeline', 'orchestrator', {
    claim: 'I built a six-stage agentic Python pipeline that turns an episode transcript into a narrated video, with a workflow orchestrator driving sub-agents for transcript discovery, Gemini generation (via LangChain) and compilation.',
    skills: ['agentic-workflows', 'python', 'genai', 'gemini', 'langchain'],
  }, VIDEO_PIPELINE_SOURCE),
  project('video-pipeline', 'structured-output', {
    claim: 'I bound the model to a Pydantic schema so every downstream stage gets a fixed shape instead of prose to parse.',
    skills: ['structured-output', 'pydantic', 'genai', 'python'],
  }, VIDEO_PIPELINE_SOURCE),
  project('video-pipeline', 'quality-gates', {
    claim: 'I wrote six validators that score their own stage 0.0–1.0 against a gate table that keeps criticality separate from score, so a weak episode-discovery result degrades the run while a weak transcript stops it.',
    skills: ['output-validation', 'agentic-workflows', 'python'],
  }, VIDEO_PIPELINE_SOURCE),
  project('video-pipeline', 'tests', {
    claim: 'The pipeline is covered by 149 passing tests.',
    skills: ['automated-testing', 'python'],
    metric: '149 tests passing',
  }, VIDEO_PIPELINE_SOURCE),

  // --- r3f-projectiles ---------------------------------------------------
  project('r3f-projectiles', 'engine', {
    claim: 'I published a GPU-instanced bullet-hell and projectile engine for React Three Fiber to npm under the MIT license.',
    skills: ['react-three-fiber', 'threejs', 'webgl', 'open-source', 'typescript'],
  }, R3F_NPM),
  project('r3f-projectiles', 'pattern-system', {
    claim: 'I designed a composable bullet-pattern system of 7 generators and 6 modifiers in which each pattern is a pure function returning spawn data.',
    skills: ['functional-programming', 'api-design', 'typescript'],
    metric: '7 pattern generators and 6 modifiers',
  }, R3F_SOURCE),
  project('r3f-projectiles', 'instanced-renderer', {
    claim: 'I built a renderer that draws a 20,000-bullet pool through one InstancedMesh, with a zero-allocation physics loop and per-instance color via setColorAt.',
    skills: ['gpu-instancing', 'threejs', 'webgl', 'web-performance'],
    metric: '20,000-bullet pool in one instanced draw call',
  }, R3F_SOURCE),
  project('r3f-projectiles', 'tests', {
    claim: 'The engine is held in place by 553 assertions across 13 spec files.',
    skills: ['automated-testing'],
    metric: '553 assertions across 13 spec files',
  }, R3F_SOURCE),

  // --- roblox-css --------------------------------------------------------
  project('roblox-css', 'css-to-roblox', {
    claim: 'I designed and published a CSS-to-Roblox UI translation middleware for roblox-ts: write familiar CSS (flex, grid, gradients, calc) and get native Roblox UI.',
    skills: ['roblox-ts', 'css', 'typescript', 'open-source'],
  }, ROBLOX_CSS_NPM),
  project('roblox-css', 'parsers', {
    claim: 'I hand-wrote parsers that resolve CSS dimensions, colors and linear-gradient() into UDim2, Color3 and UIGradient at render time, with a React layer that injects the matching UI constraint instances.',
    skills: ['parsers', 'react', 'typescript'],
  }, ROBLOX_CSS_SOURCE),
  project('roblox-css', 'animation', {
    claim: 'I built a branded type system and Framer-Motion-inspired, variant-driven animation primitives powered by @rbxts/ripple.',
    skills: ['animation', 'typescript', 'api-design'],
  }, ROBLOX_CSS_SOURCE),
  // Built from ROBLOX_CSS_COVERAGE, which `npm run roblox-css:check` re-derives.
  project('roblox-css', 'tests', {
    claim: `The package is covered by ${assertions.toLocaleString('en-US')} distinct test assertions across ${specFiles} spec files.`,
    skills: ['automated-testing'],
    metric: `${assertions.toLocaleString('en-US')} assertions across ${specFiles} spec files`,
  }, ROBLOX_CSS_SOURCE),

  // --- BonkBall ----------------------------------------------------------
  project('hammerball', 'ecs-architecture', {
    claim: 'I architected an objective-based multiplayer Roblox game in strict TypeScript, using Flamework dependency injection and an Entity-Component-System pattern to enforce client-server separation.',
    skills: ['game-development', 'roblox-ts', 'typescript', 'ecs', 'dependency-injection'],
  }, BONKBALL),
  project('hammerball', 'fsm-bots', {
    claim: 'I built PvPvE NPC bots driven by a custom finite state machine, optimized with pre-computed spatial queries and SimplePath pathfinding.',
    skills: ['game-ai', 'state-machines', 'game-development'],
  }, BONKBALL),
  project('hammerball', 'reactive-state', {
    claim: 'I implemented reactive, unidirectional state management with Reflex to synchronize match phases across 20+ decoupled services and programmatic HUD controllers.',
    skills: ['state-management', 'game-development'],
    metric: 'Match state synchronized across 20+ decoupled services',
  }, BONKBALL),
  project('hammerball', 'combatant-interface', {
    claim: 'I designed a unified ICombatant interface so hit detection and objective mechanics work the same for human players and AI agents.',
    skills: ['api-design', 'typescript', 'game-development'],
  }, BONKBALL),

  // --- Peer-reviewed paper -----------------------------------------------
  project('acs-microdialysis', 'paper', {
    claim: 'I co-authored peer-reviewed research in Analytical Chemistry that optimized microdialysis sampling of quorum-sensing molecules during in situ biofilm formation.',
    skills: ['scientific-research'],
  }, { label: 'Analytical Chemistry (ACS), DOI', href: `https://doi.org/${DOI}` }, RESUME_DATA['acs-microdialysis'].dates),
  project('acs-microdialysis', 'lc-ms', {
    claim: 'I contributed to LC-MS quantification of acylhomoserine lactones across 4-day continuous sampling experiments with V. harveyi biofilm models.',
    skills: ['scientific-research'],
  }, { label: 'Analytical Chemistry (ACS), DOI', href: `https://doi.org/${DOI}` }, RESUME_DATA['acs-microdialysis'].dates),
];
