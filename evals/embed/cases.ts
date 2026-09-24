/**
 * Hand-written cases for the embedding matcher, written before any model
 * was run so they couldn't be fitted to one.
 *
 * - SYNONYMS: a JD line that names a canonical skill in words the alias scan
 *   has no entry for. `expect` must be added; anything outside
 *   `expect ∪ allow` counts as a wrong add. A case whose expected skill the
 *   scan already finds is reported and skipped, so the list can't flatter
 *   the matcher by testing what the scan does.
 * - NEGATIVES: lines where nothing may be added. Most are the traps: a word
 *   that is also a skill name in another sense ("design", "product",
 *   "testing the waters", "Go-to-market", "state tax", "tokens"), a
 *   neighbouring skill the corpus deliberately doesn't claim (LCP is not an
 *   alias of core-web-vitals), and gap terms (Kubernetes, Kafka) that must
 *   stay gaps.
 *
 * This is the TUNING split: thresholds are chosen here and reported on the
 * labelled fixtures and the held-out JDs.
 */

export interface SynonymCase {
  text: string;
  expect: string[];
  /** Adds that aren't wrong, but aren't required either. */
  allow?: string[];
}

export const SYNONYMS: readonly SynonymCase[] = [
  { text: 'Designing and building REST APIs', expect: ['api-design'] },
  { text: 'Experience with RESTful services and API contracts', expect: ['api-design'] },
  { text: "You've mentored junior developers", expect: ['mentoring'] },
  { text: 'Coached and grew the engineers on your team', expect: ['mentoring'], allow: ['tech-leadership'] },
  { text: 'Guiding junior teammates through code reviews', expect: ['mentoring'], allow: ['tech-leadership'] },
  { text: 'Building for screen readers and keyboard navigation', expect: ['wcag'] },
  { text: 'Inclusive, accessible interfaces', expect: ['wcag'] },
  { text: 'Unit and integration tests for everything you ship', expect: ['automated-testing'] },
  { text: 'Writing end-to-end tests', expect: ['automated-testing'] },
  { text: 'Page load speed and rendering performance', expect: ['web-performance'], allow: ['core-web-vitals'] },
  { text: 'Prompt engineering for chat assistants', expect: ['genai'] },
  { text: 'Building autonomous agents that call tools', expect: ['agentic-workflows'], allow: ['genai'] },
  { text: 'JSON schema constrained generation from models', expect: ['structured-output'] },
  { text: 'Evaluation harnesses and quality checks for model responses', expect: ['output-validation'] },
  { text: 'Working closely with designers, PMs and data scientists', expect: ['cross-functional-collaboration'] },
  { text: 'Partnering with product and design stakeholders', expect: ['cross-functional-collaboration'] },
  { text: 'Leading a team of four engineers', expect: ['tech-leadership'] },
  { text: 'Serving as engineering lead on a squad', expect: ['tech-leadership'] },
  { text: 'Setting technical direction for the team', expect: ['tech-leadership'], allow: ['system-design'] },
  { text: 'Setting and tracking reliability targets such as error budgets', expect: ['slos'] },
  { text: 'Automated build and deployment pipelines', expect: ['ci-cd'], allow: ['build-systems'] },
  { text: 'GitHub Actions workflows for deploys', expect: ['ci-cd'] },
  { text: 'Serverless on Lambda and S3', expect: ['aws'] },
  { text: 'Service-oriented architecture and distributed services', expect: ['microservices'], allow: ['system-design'] },
  { text: 'Designing scalable distributed systems', expect: ['system-design'], allow: ['microservices'] },
  { text: 'Browser-based products used by millions', expect: ['web-applications'] },
  { text: 'Single-page applications', expect: ['web-applications'] },
  { text: 'Reusable UI component kits', expect: ['component-libraries'], allow: ['design-systems'] },
  { text: 'A shared visual language with tokens for color and spacing', expect: ['design-tokens'], allow: ['design-systems'] },
  { text: 'Maintaining a style guide and UI kit used by every team', expect: ['design-systems'], allow: ['component-libraries'] },
  { text: 'Client-side state with Redux or Zustand', expect: ['state-management'] },
  { text: 'Micro-interactions and transitions in the UI', expect: ['animation'] },
  { text: 'Building browser add-ons for Chrome and Firefox', expect: ['chrome-extensions'] },
  { text: 'Protecting against cross-site scripting', expect: ['frontend-security'] },
  { text: 'Bundling with Vite or Rollup', expect: ['build-systems'], allow: ['webpack'] },
  { text: 'Splitting a monolithic frontend into independently deployed apps', expect: ['micro-frontends'], allow: ['module-federation'] },
  { text: 'Search ranking and organic traffic', expect: ['seo'] },
  { text: 'Improving engineering velocity and tooling for other developers', expect: ['developer-productivity'] },
  { text: 'Moving a legacy codebase to a new framework', expect: ['codebase-migrations'] },
  { text: 'Frontend and backend work across the whole stack', expect: ['full-stack'] },
  { text: 'Maintaining public GitHub projects', expect: ['open-source'] },
  { text: 'Shaders and GPU rendering on the web', expect: ['webgl'], allow: ['threejs', 'gpu-instancing'] },
  { text: 'Building games people love', expect: ['game-development'] },
  { text: 'Path finding and NPC behaviour', expect: ['game-ai'] },
  { text: 'Immutable data and pure functions', expect: ['functional-programming'] },
  { text: 'Inversion of control containers', expect: ['dependency-injection'] },
  { text: 'Writing a compiler front end and grammars', expect: ['parsers'] },
  { text: 'Statecharts and XState', expect: ['state-machines'], allow: ['state-management'] },
  { text: 'Using Copilot and Cursor to ship faster', expect: ['ai-assisted-development'] },
  { text: 'Relational database design in Postgres', expect: ['postgresql'] },
];

export const NEGATIVES: readonly string[] = [
  'Go-to-market strategy and launch planning',
  'Strong product sense',
  'Testing the waters with new product ideas',
  'Design thinking and user research',
  'Graphic design and brand identity',
  'Experience with React Native and Expo',
  'Excellent written and verbal communication',
  "Bachelor's degree in Computer Science or equivalent experience",
  'Comfortable with ambiguity in a fast-paced startup',
  'Own the product roadmap',
  'Sales coaching and quota attainment',
  'Motion graphics and video editing',
  'Customer support agents and ticket triage',
  'Financial planning and analysis',
  'Performance marketing and paid acquisition',
  'Information architecture for the docs site',
  'Supply chain and logistics operations',
  'Three years of experience in retail',
  'Swift delivery on client commitments',
  'Kubernetes and Terraform',
  'Go and Rust services',
  'Java and Spring Boot',
  'Improving LCP, INP and CLS',
  'Server-side rendering with Next.js',
  'Machine learning model training at scale',
  'Vector databases and retrieval',
  'Data pipelines in Airflow and Spark',
  'iOS and Android native development',
  'Payment processing and fintech compliance',
  'Experience with HIPAA or healthcare data',
  'Manage a team of account executives',
  'Building relationships with enterprise customers',
  'Advanced Excel and PowerPoint',
  'Our office is in downtown Toronto',
  'Unlimited PTO and a home office stipend',
  'Designing marketing campaigns and landing pages',
  'Interior design',
  'Platform fees and revenue share',
  'Quality assurance of manufactured parts',
  'Game theory and economics',
  'State and local tax compliance',
  'Animated storytelling for social video',
  'Security clearance required',
  'Data migration of customer records in Salesforce',
  'Component manufacturing and supply',
  'Tokens and cryptocurrency trading',
  'Product',
  'Design',
  'Excellent communication skills',
  'Comfortable owning an on-call rotation',
];
