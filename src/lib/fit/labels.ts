import type { Evidence } from '@/data/corpus';
import { RESUME_DATA } from '@/data/resumeData';

/**
 * SHORT LABELS for evidence in fit-report notes ("Evidence: <label> (<entry>)").
 *
 * Each is a few words cut from the record's own claim — nothing a claim
 * doesn't already say. A figure may appear only if the claim or metric has
 * it (the fit tests extract the digits and check), so a label can't drift
 * from the record it names. A record without a label here falls back to its
 * claim, clipped at a word boundary.
 */
export const EVIDENCE_LABELS: Readonly<Record<string, string>> = {
  'indeed-sr-swe.ai-cycle-time': '10% shorter cycle time with AI tooling',
  'indeed-sr-swe.ai-gateway': 'AI gateway for third-party agents',
  'indeed-sr-swe.onehost-lead': 'Led the OneHost micro-frontend migration',
  'indeed-sr-swe.onehost-architecture': 'Co-architected OneHost, led 6 engineers',
  'indeed-sr-swe.luxon-migration': 'Luxon timezone migration',
  'indeed-sr-swe.mentoring': 'Mentored ~12 engineers',
  'indeed-sr-swe.frontend-slos': 'Frontend SLOs with SRE and Product',
  'indeed-sr-swe.redux': 'React features with Redux',
  'indeed-sr-swe.agile': 'Agile teams: sprints, standups, retros',
  'indeed-swe-ii.redux': 'React features with Redux',
  'indeed-swe-ii.agile': 'Agile teams: sprints, standups, retros',
  'ibm-swe.golftv-postgresql': 'GolfTV API, PostgreSQL tuned for launch',
  'indeed-swe-ii.apply-flow-tti': '15% faster TTI for 680M+ users',
  'indeed-swe-ii.wcag-components': 'WCAG across 20+ React components',
  'ibm-staff-swe.ibm-developer-react': 'IBM Developer rebuild for SEO and vitals',
  'ibm-staff-swe.build-time': 'Halved Webpack build time',
  'ibm-staff-swe.bundle-size': 'Bundle cut from 6 MB to 300 KB',
  'ibm-staff-swe.video-upload-pipeline': 'Node.js video upload pipeline',
  'ibm-swe.agent-portal': 'Agent portal, 30% faster API response',
  'ibm-swe.golftv-graphql': 'GolfTV GraphQL API on AWS',
  'jbhunt-intern.react-native': 'React Native features with Jest and Appium',
  'analytics-extension.troubleshooting-time': 'GenAI Chrome extension, 20% faster troubleshooting',
  'analytics-extension.single-click': 'Full-stack single-click workflow',
  'analytics-extension.stateless-bridge': 'Stateless bridge to microservices',
  'analytics-extension.deep-linked-diagnostics': 'Deep-linked diagnostics workflow',
  'analytics-extension.xss-hardening': 'XSS hardening with input allowlists',
  'video-pipeline.orchestrator': 'Agentic pipeline with Gemini and LangChain',
  'video-pipeline.structured-output': 'Model output bound to a Pydantic schema',
  'video-pipeline.quality-gates': 'Scored quality-gate validators',
  'video-pipeline.tests': '149 passing tests',
  'r3f-projectiles.engine': 'GPU-instanced projectile engine on npm',
  'r3f-projectiles.pattern-system': 'Pattern system of pure functions',
  'r3f-projectiles.instanced-renderer': '20,000 bullets in one instanced draw',
  'r3f-projectiles.tests': '553 assertions across 13 spec files',
  'roblox-css.css-to-roblox': 'CSS-to-Roblox UI middleware on npm',
  'roblox-css.parsers': 'Hand-written CSS value parsers',
  'roblox-css.animation': 'Variant-driven animation primitives',
  'roblox-css.tests': 'roblox-css test suite',
  'hammerball.ecs-architecture': 'Multiplayer game on DI and ECS',
  'hammerball.fsm-bots': 'State-machine NPC bots with pathfinding',
  'hammerball.reactive-state': 'Reactive state across 20+ services',
  'hammerball.combatant-interface': 'Unified combatant interface',
  'portfolio-site.stack': 'This site on Next.js App Router',
  'portfolio-site.ci-pipeline': 'GitHub Actions CI with Vitest and Playwright',
  'portfolio-site.cross-browser-a11y': 'Cross-browser Playwright with axe scans',
  'acs-microdialysis.paper': 'Peer-reviewed Analytical Chemistry paper',
  'acs-microdialysis.lc-ms': 'LC-MS quantification experiments',
};

const LABEL_FALLBACK_CHARS = 48;

/** The short label for a record: the table's, or the claim clipped at a word. */
export function evidenceLabel(evidence: Pick<Evidence, 'id' | 'claim'>): string {
  const label = EVIDENCE_LABELS[evidence.id];
  if (label) return label;
  const claim = evidence.claim.replace(/^I\s+/, '').replace(/\.$/, '');
  if (claim.length <= LABEL_FALLBACK_CHARS) return capitalize(claim);
  const cut = claim.slice(0, LABEL_FALLBACK_CHARS);
  return `${capitalize(cut.slice(0, cut.lastIndexOf(' ')))}…`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Where a record comes from, as a reader would say it: the employer for work
 * history ("Indeed", "IBM"), the project's name for projects. Long titles
 * (the paper's) fall back to the venue.
 */
export function entryLabel(entry: string): string {
  const data = RESUME_DATA[entry];
  if (!data) return entry;
  if (data.type === 'work') return data.company.replace(/\.com$/, '');
  return data.title.length <= 28 ? data.title : data.company || entry;
}
