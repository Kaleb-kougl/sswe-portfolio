import type { CanonicalSkillId, SegmentDecision, SegmentedJd } from '@/lib/fit/contract';

/**
 * Fit-checker fixtures: eight job descriptions, each hand-labelled with the
 * segments a careful reader would call requirements, their priority, and
 * the canonical skills each names.
 *
 * - The first five are the plan's "done when" set (frontend, full stack, AI
 *   platform, poor match, non-engineering): tidy, with clear headers.
 * - The last three are messier on purpose: prose with no headers at all,
 *   a Responsibilities list full of technology, and a posting wrapped in
 *   company blurb, pay and EEO boilerplate.
 *
 * Labels are the ground truth for both paths:
 * - the no-model baseline (`analyzeWithoutModel`) is scored against them in
 *   segment.test.ts (recall, precision, priority accuracy);
 * - `idealDecisions` turns them into the decisions a perfect model would
 *   make, which fixtures.test.ts renders to `<name>.report.md`.
 *
 * A label's `text` is the segment text exactly as `segmentJd` produces it,
 * so a segmentation change that alters a requirement's text fails loudly.
 */
export interface Label {
  text: string;
  priority: 'must' | 'nice';
  /** Canonical skills the requirement names (code's finds plus what a model should add). */
  skills: CanonicalSkillId[];
}

export interface Fixture {
  name: string;
  jd: string;
  /** The role `segmentJd` should find. */
  role: string;
  labels: Label[];
}

/** The judging clock for every fixture, so the years arithmetic is stable. */
export const FIXTURE_NOW = new Date('2026-09-23T12:00:00Z');

const must = (text: string, ...skills: CanonicalSkillId[]): Label => ({ text, priority: 'must', skills });
const nice = (text: string, ...skills: CanonicalSkillId[]): Label => ({ text, priority: 'nice', skills });

export const FIXTURES: readonly Fixture[] = [
  {
    name: 'frontend-senior',
    jd: `Senior Frontend Engineer
We're hiring a senior engineer to own our customer-facing web app.
Requirements:
- 5+ years building production React and TypeScript applications
- Deep knowledge of web accessibility (WCAG 2.1 AA)
- Experience improving Core Web Vitals and frontend performance
- Built or maintained a design system or shared component library
- Strong testing habits (Jest, React Testing Library)
- Excellent written communication
Nice to have:
- Micro-frontends or Module Federation
- Next.js and server-side rendering
- GraphQL
- Mentoring other engineers`,
    role: 'Senior Frontend Engineer',
    labels: [
      must('5+ years building production React and TypeScript applications', 'react', 'typescript'),
      must('Deep knowledge of web accessibility (WCAG 2.1 AA)', 'wcag'),
      must('Experience improving Core Web Vitals and frontend performance', 'core-web-vitals', 'web-performance'),
      must('Built or maintained a design system or shared component library', 'design-systems', 'component-libraries'),
      must('Strong testing habits (Jest, React Testing Library)', 'jest', 'automated-testing', 'react-testing-library'),
      must('Excellent written communication'),
      nice('Micro-frontends or Module Federation', 'micro-frontends', 'module-federation'),
      nice('Next.js and server-side rendering', 'nextjs'),
      nice('GraphQL', 'graphql'),
      nice('Mentoring other engineers', 'mentoring'),
    ],
  },
  {
    name: 'fullstack-senior',
    jd: `Senior Full Stack Engineer
You'll build features end to end across our Node.js services and React frontend.
What you'll need:
- 6+ years of professional software engineering experience
- Node.js and TypeScript on the backend
- React on the frontend
- PostgreSQL schema design and query tuning
- Designing REST and GraphQL APIs
- Shipping on AWS with CI/CD
- Comfortable owning an on-call rotation
Bonus points:
- Microservices at scale
- Docker and Kubernetes`,
    role: 'Senior Full Stack Engineer',
    labels: [
      // A duty that names technology: the prompt's rule makes it a nice-to-have.
      nice("You'll build features end to end across our Node.js services and React frontend.", 'node-js', 'react', 'full-stack'),
      must('6+ years of professional software engineering experience'),
      must('Node.js and TypeScript on the backend', 'node-js', 'typescript'),
      must('React on the frontend', 'react'),
      must('PostgreSQL schema design and query tuning', 'postgresql'),
      must('Designing REST and GraphQL APIs', 'graphql', 'api-design'),
      must('Shipping on AWS with CI/CD', 'aws', 'ci-cd'),
      must('Comfortable owning an on-call rotation'),
      nice('Microservices at scale', 'microservices'),
      nice('Docker and Kubernetes'),
    ],
  },
  {
    name: 'ai-platform',
    jd: `Senior Software Engineer, AI Platform
Join the team building the platform every product team uses to ship LLM features.
Required:
- 5+ years of software engineering
- Built production applications on large language models
- Agentic workflows: tool use, multi-step agents
- Structured outputs, evals and guardrails for model quality
- Python
- RAG and vector databases
- Exposing AI capabilities through a gateway or internal platform
Preferred:
- TypeScript
- Model fine-tuning
- Model Context Protocol (MCP)`,
    role: 'Senior Software Engineer, AI Platform',
    labels: [
      must('5+ years of software engineering'),
      must('Built production applications on large language models', 'genai'),
      must('Agentic workflows: tool use, multi-step agents', 'agentic-workflows'),
      must('Structured outputs, evals and guardrails for model quality', 'structured-output', 'output-validation'),
      must('Python', 'python'),
      must('RAG and vector databases'),
      must('Exposing AI capabilities through a gateway or internal platform', 'ai-platform'),
      nice('TypeScript', 'typescript'),
      nice('Model fine-tuning'),
      nice('Model Context Protocol (MCP)'),
    ],
  },
  {
    name: 'poor-match-backend',
    jd: `Backend Engineer, Infrastructure (Go / Kubernetes)
We run high-throughput services in Go on Kubernetes.
Must have:
- 5+ years writing production services in Go
- Operating Kubernetes clusters in production
- Distributed systems and microservice design
- Kafka or another event streaming platform
- PostgreSQL
- Willingness to join the on-call rotation
Nice to have:
- gRPC
- Terraform`,
    role: 'Backend Engineer, Infrastructure (Go / Kubernetes)',
    labels: [
      must('5+ years writing production services in Go'),
      must('Operating Kubernetes clusters in production'),
      must('Distributed systems and microservice design', 'microservices', 'system-design'),
      must('Kafka or another event streaming platform'),
      must('PostgreSQL', 'postgresql'),
      must('Willingness to join the on-call rotation'),
      nice('gRPC'),
      nice('Terraform'),
    ],
  },
  {
    name: 'non-engineering-marketing',
    jd: `Senior Content Marketing Manager
Own our content engine from strategy to distribution.
Requirements:
- 5+ years in B2B content marketing
- SEO strategy and keyword research
- HubSpot
- Google Analytics and campaign reporting
- A/B testing landing pages
- Exceptional storytelling
Nice to have:
- Stakeholder management across Sales and Product`,
    role: 'Senior Content Marketing Manager',
    labels: [
      must('5+ years in B2B content marketing'),
      must('SEO strategy and keyword research', 'seo'),
      must('HubSpot'),
      must('Google Analytics and campaign reporting'),
      must('A/B testing landing pages'),
      must('Exceptional storytelling'),
      nice('Stakeholder management across Sales and Product', 'cross-functional-collaboration'),
    ],
  },
  {
    name: 'prose-only-startup',
    jd: `Founding Engineer at Loop Health

Loop Health is a small team building care-coordination software for clinics. We're looking for a founding engineer to own our web product from the database to the browser. You'll work directly with the CEO and our first customers. Our stack is TypeScript, React and Node.js on AWS, with PostgreSQL underneath.

You have at least four years of experience shipping web applications in production, and you're comfortable across
the stack. You write TypeScript every day and know React well. Experience with HIPAA or healthcare data is a plus.
Ideally you have also run a small team or mentored junior engineers. You communicate clearly in writing, because
we're remote across three time zones.

We offer meaningful equity, a competitive salary and full health coverage.`,
    role: 'Founding Engineer at Loop Health',
    labels: [
      must(
        "You have at least four years of experience shipping web applications in production, and you're comfortable across the stack.",
        'web-applications',
        'full-stack',
      ),
      must('You write TypeScript every day and know React well.', 'typescript', 'react'),
      nice('Experience with HIPAA or healthcare data is a plus.'),
      nice('Ideally you have also run a small team or mentored junior engineers.', 'tech-leadership', 'mentoring'),
      must("You communicate clearly in writing, because we're remote across three time zones."),
    ],
  },
  {
    name: 'responsibilities-tech',
    jd: `Platform Engineer, Developer Experience

## What you'll do
- Build and maintain our internal CI/CD pipelines on GitHub Actions
- Own the Webpack and module federation setup for 30+ micro-frontends
- Migrate legacy services from JavaScript to
  TypeScript, one package at a time
- Partner with product teams to improve build times and developer productivity
- Write clear RFCs and documentation

## What you'll bring
- 4+ years of software engineering experience
- Strong TypeScript and Node.js
- Experience with build tooling (Webpack, Vite, or Rollup)
- You've led a large-scale codebase migration

**Nice to have**
- Bazel or Nx monorepo experience
- Kubernetes`,
    role: 'Platform Engineer, Developer Experience',
    labels: [
      nice('Build and maintain our internal CI/CD pipelines on GitHub Actions', 'ci-cd', 'github-actions'),
      nice('Own the Webpack and module federation setup for 30+ micro-frontends', 'webpack', 'module-federation', 'micro-frontends'),
      nice('Migrate legacy services from JavaScript to TypeScript, one package at a time', 'javascript', 'typescript', 'codebase-migrations'),
      nice('Partner with product teams to improve build times and developer productivity', 'developer-productivity', 'build-systems'),
      must('4+ years of software engineering experience'),
      must('Strong TypeScript and Node.js', 'typescript', 'node-js'),
      must('Experience with build tooling (Webpack, Vite, or Rollup)', 'build-systems', 'webpack'),
      must("You've led a large-scale codebase migration", 'codebase-migrations', 'tech-leadership'),
      nice('Bazel or Nx monorepo experience'),
      nice('Kubernetes'),
    ],
  },
  {
    name: 'boilerplate-payments',
    jd: `Senior Software Engineer - Payments
Acme Pay | New York, NY (Hybrid)

About Acme Pay
Acme Pay moves $40B a year for small businesses. We're a team of 300 across New York and Toronto.

Responsibilities
• Design and build payment APIs used by thousands of merchants
• Improve reliability and observability of our Java and Kotlin services
• Mentor engineers and lead technical design reviews

Qualifications
• Bachelor's degree in Computer Science or equivalent experience
• 5–8 years of backend engineering experience
• Proficiency in Java or Kotlin
• Experience with SQL databases and Kafka
• Excellent communication skills

Preferred Qualifications
• Experience in fintech or payments
• Familiarity with GraphQL

The base salary range for this role is $180,000 - $220,000, plus equity and benefits.
Acme Pay is an equal opportunity employer. We do not discriminate on the basis of race, religion, color, national origin, gender, sexual orientation, age, marital status, veteran status, or disability status.
Benefits
• Medical, dental and vision insurance
• 401(k) with 4% match
• 20 days PTO`,
    role: 'Senior Software Engineer - Payments',
    labels: [
      nice('Design and build payment APIs used by thousands of merchants', 'api-design'),
      nice('Improve reliability and observability of our Java and Kotlin services'),
      nice('Mentor engineers and lead technical design reviews', 'mentoring', 'tech-leadership'),
      must("Bachelor's degree in Computer Science or equivalent experience"),
      must('5–8 years of backend engineering experience'),
      must('Proficiency in Java or Kotlin'),
      must('Experience with SQL databases and Kafka', 'relational-databases'),
      must('Excellent communication skills'),
      nice('Experience in fintech or payments'),
      nice('Familiarity with GraphQL', 'graphql'),
    ],
  },
];

/**
 * The decisions a perfect model would make for a fixture, one per
 * candidate: a labelled segment is a requirement with the label's priority,
 * adding whichever labelled skills code didn't find; every other candidate
 * is not. Throws if a label matches no candidate, so labels can't silently
 * go stale when segmentation changes.
 */
export function idealDecisions(fixture: Fixture, seg: SegmentedJd): SegmentDecision[] {
  const byText = new Map(fixture.labels.map((l) => [l.text, l]));
  const decisions = seg.candidates.map((index): SegmentDecision => {
    const segment = seg.segments[index];
    const label = byText.get(segment.text);
    if (!label) return { requirement: false, priority: 'nice', addSkills: [] };
    byText.delete(segment.text);
    return {
      requirement: true,
      priority: label.priority,
      addSkills: label.skills.filter((s) => !segment.skills.includes(s)),
    };
  });
  if (byText.size) throw new Error(`${fixture.name}: labels match no candidate: ${[...byText.keys()].join(' | ')}`);
  return decisions;
}
