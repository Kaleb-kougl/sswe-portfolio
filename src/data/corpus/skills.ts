import type { Skill } from './schema';

/**
 * CANONICAL SKILL TAGS — the only vocabulary `evidence.ts` may use.
 *
 * Aliases exist so a job description's wording ("a11y", "MFE", "R3F") finds
 * the record that uses the canonical tag. They are search terms, so an alias
 * must mean the same thing as its tag, not something adjacent: "LCP" is
 * deliberately not an alias of core-web-vitals, because the evidence measures
 * TTI and FCP and a match on LCP would claim work that wasn't done.
 *
 * A few tags have no evidence behind them yet (postgresql, datadog,
 * web-applications). They are here because `SKILLS` in resumeData.ts — the
 * JSON-LD `knowsAbout` list — names them, and the corpus test holds every
 * `SKILLS` string to a canonical tag so the two lists can't drift. A tag with
 * no evidence reads as a gap to the fit checker, which is the honest answer.
 *
 * `SKILLS` is not derived from this list: contact-section.tsx is a client
 * component that imports resumeData.ts, so an import here would put this
 * table in the homepage bundle for the sake of seventeen strings.
 */
export const SKILLS_TABLE: readonly Skill[] = [
  // Languages and runtimes
  { id: 'typescript', label: 'TypeScript', aliases: ['ts'] },
  { id: 'javascript', label: 'JavaScript', aliases: ['js', 'ecmascript'] },
  { id: 'python', label: 'Python', aliases: ['py'] },
  { id: 'node-js', label: 'Node.js', aliases: ['node'] },
  { id: 'html', label: 'HTML', aliases: ['html5'] },
  { id: 'css', label: 'CSS', aliases: ['css3'] },

  // Frontend
  { id: 'react', label: 'React', aliases: ['reactjs'] },
  { id: 'react-native', label: 'React Native', aliases: [] },
  { id: 'web-applications', label: 'Web applications', aliases: ['web apps'] },
  { id: 'component-libraries', label: 'Component libraries', aliases: ['shared components', 'ui libraries'] },
  { id: 'design-systems', label: 'Design systems', aliases: ['component-driven development'] },
  { id: 'design-tokens', label: 'Design tokens', aliases: ['css design tokens'] },
  { id: 'storybook', label: 'Storybook', aliases: ['react storybook'] },
  { id: 'wcag', label: 'Accessibility (WCAG)', aliases: ['a11y', 'accessibility', 'web accessibility'] },
  { id: 'state-management', label: 'State management', aliases: [] },
  { id: 'animation', label: 'UI animation', aliases: ['motion'] },
  { id: 'chrome-extensions', label: 'Chrome extensions', aliases: ['browser extensions', 'manifest v3', 'mv3'] },
  { id: 'frontend-security', label: 'Frontend security', aliases: ['xss', 'xss prevention', 'input sanitization', 'web security'] },

  // Build, platform, performance
  { id: 'webpack', label: 'Webpack', aliases: ['webpack 5'] },
  { id: 'module-federation', label: 'Module federation', aliases: ['mfe', 'federated modules', 'webpack module federation'] },
  { id: 'micro-frontends', label: 'Micro-frontends', aliases: ['microfrontends', 'microfrontend architecture'] },
  { id: 'build-systems', label: 'Build systems', aliases: ['build tooling', 'bundlers'] },
  { id: 'ci-cd', label: 'CI/CD', aliases: ['continuous integration', 'continuous delivery'] },
  { id: 'web-performance', label: 'Web performance', aliases: ['performance optimization', 'frontend performance', 'bundle size'] },
  { id: 'core-web-vitals', label: 'Core Web Vitals', aliases: ['cwv', 'performance optimization (core web vitals)', 'tti', 'fcp', 'time to interactive'] },
  { id: 'seo', label: 'SEO', aliases: ['search engine optimization'] },
  { id: 'slos', label: 'Frontend SLOs', aliases: ['slo', 'service level objectives'] },
  { id: 'datadog', label: 'Datadog', aliases: [] },
  { id: 'developer-productivity', label: 'Developer productivity', aliases: ['developer experience', 'dx'] },
  { id: 'codebase-migrations', label: 'Codebase migrations', aliases: ['migrations', 'platform migrations', 'large-scale migrations'] },

  // Data and backend
  { id: 'graphql', label: 'GraphQL', aliases: ['gql'] },
  { id: 'apollo-graphql', label: 'Apollo GraphQL', aliases: ['apollo', 'apollo client', 'apollo server'] },
  { id: 'postgresql', label: 'PostgreSQL', aliases: ['postgres'] },
  { id: 'aws', label: 'AWS', aliases: ['amazon web services'] },
  { id: 'microservices', label: 'Microservices', aliases: [] },
  { id: 'full-stack', label: 'Full-stack development', aliases: ['fullstack'] },
  { id: 'system-design', label: 'System design', aliases: ['software architecture', 'architecture'] },
  { id: 'api-design', label: 'API and interface design', aliases: ['interface design'] },

  // AI
  { id: 'genai', label: 'Generative AI', aliases: ['gen ai', 'llm', 'llms', 'large language models'] },
  { id: 'ai-assisted-development', label: 'AI-assisted development', aliases: ['ai-assisted code generation', 'ai coding', 'model-assisted workflows', 'ai tooling'] },
  { id: 'ai-platform', label: 'AI platform integration', aliases: ['ai gateway', 'ai infrastructure'] },
  { id: 'agentic-workflows', label: 'Agentic workflows', aliases: ['agents', 'ai agents', 'agentic ai', 'multi-agent systems'] },
  { id: 'gemini', label: 'Google Gemini', aliases: [] },
  { id: 'langchain', label: 'LangChain', aliases: [] },
  { id: 'pydantic', label: 'Pydantic', aliases: [] },
  { id: 'structured-output', label: 'Structured model output', aliases: ['structured outputs', 'schema-constrained output'] },
  { id: 'output-validation', label: 'Output validation and quality gates', aliases: ['quality gates', 'guardrails'] },

  // Testing
  { id: 'automated-testing', label: 'Automated testing', aliases: ['testing', 'unit testing', 'test automation'] },
  { id: 'jest', label: 'Jest', aliases: [] },
  { id: 'appium', label: 'Appium', aliases: [] },

  // Leadership
  { id: 'tech-leadership', label: 'Technical leadership', aliases: ['tech lead', 'team lead', 'technical lead'] },
  { id: 'mentoring', label: 'Mentoring', aliases: ['mentorship', 'coaching'] },
  { id: 'cross-functional-collaboration', label: 'Cross-functional collaboration', aliases: ['stakeholder management'] },

  // 3D, games, open source
  { id: 'react-three-fiber', label: 'React Three Fiber', aliases: ['r3f'] },
  { id: 'threejs', label: 'Three.js', aliases: ['three'] },
  { id: 'webgl', label: 'WebGL', aliases: [] },
  { id: 'gpu-instancing', label: 'GPU instancing', aliases: ['instanced rendering', 'instancedmesh'] },
  { id: 'roblox-ts', label: 'roblox-ts', aliases: ['roblox', 'rbxts'] },
  { id: 'game-development', label: 'Game development', aliases: ['gamedev'] },
  { id: 'ecs', label: 'Entity-Component-System', aliases: ['entity component system'] },
  { id: 'dependency-injection', label: 'Dependency injection', aliases: ['di'] },
  { id: 'state-machines', label: 'Finite state machines', aliases: ['fsm', 'finite state machine'] },
  { id: 'game-ai', label: 'Game AI and pathfinding', aliases: ['npc ai', 'pathfinding'] },
  { id: 'functional-programming', label: 'Functional programming', aliases: ['fp'] },
  { id: 'parsers', label: 'Parsers', aliases: ['parsing', 'ast parsing'] },
  { id: 'open-source', label: 'Open source and npm publishing', aliases: ['oss', 'npm', 'npm packages'] },

  // Outside software
  { id: 'scientific-research', label: 'Scientific research', aliases: ['research', 'analytical chemistry'] },
];

/**
 * Case, whitespace and punctuation carry no meaning in a skill name, so they
 * are dropped before comparing: "Node.js", "node js", "nodejs" and "NODE-JS"
 * all collapse to one key. The corpus test checks that no two tags collapse
 * to the same key, which is the cost of being this forgiving.
 */
export function skillKey(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const LOOKUP: ReadonlyMap<string, string> = new Map(
  SKILLS_TABLE.flatMap((skill) =>
    [skill.id, skill.label, ...skill.aliases].map((term) => [skillKey(term), skill.id] as const),
  ),
);

/** The canonical tag for a term, or `undefined` if the corpus doesn't know it. */
export function normalizeSkill(term: string): string | undefined {
  return LOOKUP.get(skillKey(term));
}

/**
 * SKILL CATEGORIES — what the fit checker means by "related".
 *
 * When a requirement has no evidence, its note may point at the closest work
 * the corpus does have: a record carrying a skill in the same category as
 * one the requirement names. Categories are domains of work, not language
 * families, so Go's closest work is backend work (whatever it was written in)
 * rather than a TypeScript game. Kept apart from `SKILLS_TABLE` so the corpus
 * that agents read (and its token budget) doesn't change; the fit tests hold
 * every canonical tag to a category.
 */
export const SKILL_CATEGORIES = {
  frontend: 'frontend',
  mobile: 'mobile',
  platform: 'frontend platform',
  'cloud-infra': 'cloud and delivery',
  backend: 'backend',
  data: 'data',
  ai: 'AI',
  testing: 'testing',
  leadership: 'leadership',
  'graphics-games': '3D and games',
  practice: 'engineering practice',
  research: 'research',
} as const;
export type SkillCategory = keyof typeof SKILL_CATEGORIES;

export const SKILL_CATEGORY: Readonly<Record<string, SkillCategory>> = {
  typescript: 'frontend',
  javascript: 'frontend',
  html: 'frontend',
  css: 'frontend',
  react: 'frontend',
  'web-applications': 'frontend',
  'component-libraries': 'frontend',
  'design-systems': 'frontend',
  'design-tokens': 'frontend',
  storybook: 'frontend',
  wcag: 'frontend',
  'state-management': 'frontend',
  animation: 'frontend',
  'chrome-extensions': 'frontend',
  'frontend-security': 'frontend',

  'react-native': 'mobile',

  webpack: 'platform',
  'module-federation': 'platform',
  'micro-frontends': 'platform',
  'build-systems': 'platform',
  'web-performance': 'platform',
  'core-web-vitals': 'platform',
  seo: 'platform',
  'developer-productivity': 'platform',
  'codebase-migrations': 'platform',

  'ci-cd': 'cloud-infra',
  aws: 'cloud-infra',
  slos: 'cloud-infra',
  datadog: 'cloud-infra',

  python: 'backend',
  'node-js': 'backend',
  graphql: 'backend',
  'apollo-graphql': 'backend',
  microservices: 'backend',
  'full-stack': 'backend',
  'system-design': 'backend',
  'api-design': 'backend',

  postgresql: 'data',

  genai: 'ai',
  'ai-assisted-development': 'ai',
  'ai-platform': 'ai',
  'agentic-workflows': 'ai',
  gemini: 'ai',
  langchain: 'ai',
  pydantic: 'ai',
  'structured-output': 'ai',
  'output-validation': 'ai',

  'automated-testing': 'testing',
  jest: 'testing',
  appium: 'testing',

  'tech-leadership': 'leadership',
  mentoring: 'leadership',
  'cross-functional-collaboration': 'leadership',

  'react-three-fiber': 'graphics-games',
  threejs: 'graphics-games',
  webgl: 'graphics-games',
  'gpu-instancing': 'graphics-games',
  'roblox-ts': 'graphics-games',
  'game-development': 'graphics-games',
  ecs: 'graphics-games',
  'state-machines': 'graphics-games',
  'game-ai': 'graphics-games',

  'dependency-injection': 'practice',
  'functional-programming': 'practice',
  parsers: 'practice',
  'open-source': 'practice',

  'scientific-research': 'research',
};

export interface GapTerm {
  id: string;
  label: string;
  aliases: readonly string[];
  category: SkillCategory;
}

/**
 * GAP VOCABULARY — common engineering terms the corpus does NOT claim.
 *
 * The no-model skill scan only finds what it has words for. Without this
 * list, a JD asking for Go and Kubernetes would scan as a clean page of
 * React matches; with it, the scan can say "mentioned in the JD, not in my
 * work". The fit tests hold every term here to `normalizeSkill` returning
 * nothing, so a term can't be listed as a gap and claimed at once.
 *
 * Deliberately absent: things this portfolio is built with but the corpus
 * has no record of (Next.js, Tailwind, Playwright, Vitest). Calling those
 * gaps would be false; claiming them needs a record first. Also absent:
 * iOS and Android, which React Native JDs name as platforms, not skills.
 *
 * Matching quirks (case-sensitive "Go", "Swift", "Spark"; no bare "Spring")
 * live in `src/lib/fit/scan.ts`, next to the code that applies them.
 */
export const GAP_VOCABULARY: readonly GapTerm[] = [
  // Languages and backend frameworks
  { id: 'go', label: 'Go', aliases: ['golang'], category: 'backend' },
  { id: 'rust', label: 'Rust', aliases: [], category: 'backend' },
  { id: 'java', label: 'Java', aliases: [], category: 'backend' },
  { id: 'cpp', label: 'C++', aliases: [], category: 'backend' },
  { id: 'csharp', label: 'C#', aliases: ['csharp'], category: 'backend' },
  { id: 'dotnet', label: '.NET', aliases: ['dotnet', 'asp.net'], category: 'backend' },
  { id: 'ruby', label: 'Ruby', aliases: [], category: 'backend' },
  { id: 'rails', label: 'Ruby on Rails', aliases: ['Rails'], category: 'backend' },
  { id: 'php', label: 'PHP', aliases: [], category: 'backend' },
  { id: 'scala', label: 'Scala', aliases: [], category: 'backend' },
  { id: 'elixir', label: 'Elixir', aliases: ['phoenix framework'], category: 'backend' },
  { id: 'django', label: 'Django', aliases: [], category: 'backend' },
  { id: 'flask', label: 'Flask', aliases: [], category: 'backend' },
  { id: 'fastapi', label: 'FastAPI', aliases: [], category: 'backend' },
  { id: 'spring-boot', label: 'Spring Boot', aliases: ['spring framework'], category: 'backend' },
  { id: 'grpc', label: 'gRPC', aliases: [], category: 'backend' },

  // Frontend frameworks not in the corpus
  { id: 'angular', label: 'Angular', aliases: ['angularjs'], category: 'frontend' },
  { id: 'vue', label: 'Vue', aliases: ['vue.js'], category: 'frontend' },
  { id: 'svelte', label: 'Svelte', aliases: ['sveltekit'], category: 'frontend' },

  // Native mobile
  { id: 'swift', label: 'Swift', aliases: ['swiftui'], category: 'mobile' },
  { id: 'kotlin', label: 'Kotlin', aliases: [], category: 'mobile' },
  { id: 'objective-c', label: 'Objective-C', aliases: [], category: 'mobile' },
  { id: 'flutter', label: 'Flutter', aliases: [], category: 'mobile' },

  // Infrastructure and operations
  { id: 'kubernetes', label: 'Kubernetes', aliases: ['k8s'], category: 'cloud-infra' },
  { id: 'docker', label: 'Docker', aliases: ['containerization'], category: 'cloud-infra' },
  { id: 'terraform', label: 'Terraform', aliases: ['infrastructure as code'], category: 'cloud-infra' },
  { id: 'gcp', label: 'Google Cloud', aliases: ['gcp', 'google cloud platform'], category: 'cloud-infra' },
  { id: 'azure', label: 'Azure', aliases: ['microsoft azure'], category: 'cloud-infra' },
  { id: 'prometheus', label: 'Prometheus', aliases: [], category: 'cloud-infra' },
  { id: 'grafana', label: 'Grafana', aliases: [], category: 'cloud-infra' },

  // Data
  { id: 'sql', label: 'SQL', aliases: [], category: 'data' },
  { id: 'nosql', label: 'NoSQL', aliases: [], category: 'data' },
  { id: 'mysql', label: 'MySQL', aliases: [], category: 'data' },
  { id: 'mongodb', label: 'MongoDB', aliases: ['mongo'], category: 'data' },
  { id: 'redis', label: 'Redis', aliases: [], category: 'data' },
  { id: 'dynamodb', label: 'DynamoDB', aliases: [], category: 'data' },
  { id: 'elasticsearch', label: 'Elasticsearch', aliases: [], category: 'data' },
  { id: 'kafka', label: 'Kafka', aliases: ['apache kafka'], category: 'data' },
  { id: 'spark', label: 'Apache Spark', aliases: ['pyspark'], category: 'data' },
  { id: 'airflow', label: 'Airflow', aliases: ['apache airflow'], category: 'data' },
  { id: 'snowflake', label: 'Snowflake', aliases: [], category: 'data' },

  // Machine learning beyond using hosted models
  { id: 'machine-learning', label: 'Machine learning', aliases: ['deep learning', 'model training'], category: 'ai' },
  { id: 'pytorch', label: 'PyTorch', aliases: [], category: 'ai' },
  { id: 'tensorflow', label: 'TensorFlow', aliases: [], category: 'ai' },
  { id: 'rag', label: 'RAG', aliases: ['retrieval-augmented generation'], category: 'ai' },
  { id: 'vector-databases', label: 'Vector databases', aliases: ['vector database', 'vector db'], category: 'ai' },
  { id: 'fine-tuning', label: 'Model fine-tuning', aliases: ['fine-tuning'], category: 'ai' },

  // Testing and engines
  { id: 'cypress', label: 'Cypress', aliases: [], category: 'testing' },
  { id: 'selenium', label: 'Selenium', aliases: [], category: 'testing' },
  { id: 'unreal-engine', label: 'Unreal Engine', aliases: ['unreal'], category: 'graphics-games' },
];

const GAP_LOOKUP: ReadonlyMap<string, GapTerm> = new Map(
  GAP_VOCABULARY.flatMap((term) =>
    [term.id, term.label, ...term.aliases].map((t) => [skillKey(t), term] as const),
  ),
);

/**
 * The gap term a name refers to, or `undefined`. Symbols are dropped by
 * `skillKey`, so "C++" and "C#" both key to "c"; they are looked up by their
 * spelled-out ids ("cpp", "csharp") and by exact label instead.
 */
export function gapTerm(name: string): GapTerm | undefined {
  const exact = GAP_VOCABULARY.find((t) => t.label.toLowerCase() === name.trim().toLowerCase());
  if (exact) return exact;
  const key = skillKey(name);
  return key === 'c' || key === 'net' ? undefined : GAP_LOOKUP.get(key);
}
