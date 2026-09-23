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
