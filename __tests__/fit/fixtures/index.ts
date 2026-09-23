import type { Extraction } from '@/lib/fit/contract';

/**
 * Five hand-written extractions — what a good model should produce for each
 * kind of JD in the plan's "done when" list — with a short JD alongside so
 * the scan can be compared on the same role. Their reports are written to
 * `<name>.report.md` next to this file by fixtures.test.ts; read those
 * files to judge whether the verdicts are ones you'd defend.
 */
export interface Fixture {
  name: string;
  jd: string;
  extraction: Extraction;
}

/** The judging clock for every fixture, so the years arithmetic is stable. */
export const FIXTURE_NOW = new Date('2026-09-23T12:00:00Z');

const none = { skills: [], otherSkills: [], minYears: null };

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
    extraction: {
      role: 'Senior Frontend Engineer',
      requirements: [
        { text: '5+ years building production React and TypeScript applications', priority: 'must', skills: ['react', 'typescript'], otherSkills: [], minYears: 5 },
        { text: 'Deep knowledge of web accessibility (WCAG 2.1 AA)', priority: 'must', skills: ['wcag'], otherSkills: [], minYears: null },
        { text: 'Improving Core Web Vitals and frontend performance', priority: 'must', skills: ['core-web-vitals', 'web-performance'], otherSkills: [], minYears: null },
        { text: 'Built or maintained a design system or shared component library', priority: 'must', skills: ['design-systems', 'component-libraries'], otherSkills: [], minYears: null },
        { text: 'Strong testing habits (Jest, React Testing Library)', priority: 'must', skills: ['automated-testing', 'jest'], otherSkills: ['React Testing Library'], minYears: null },
        { text: 'Excellent written communication', priority: 'must', ...none },
        { text: 'Micro-frontends or Module Federation', priority: 'nice', skills: ['micro-frontends', 'module-federation'], otherSkills: [], minYears: null },
        { text: 'Next.js and server-side rendering', priority: 'nice', skills: [], otherSkills: ['Next.js', 'server-side rendering'], minYears: null },
        { text: 'GraphQL', priority: 'nice', skills: ['graphql'], otherSkills: [], minYears: null },
        { text: 'Mentoring other engineers', priority: 'nice', skills: ['mentoring'], otherSkills: [], minYears: null },
      ],
    },
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
    extraction: {
      role: 'Senior Full Stack Engineer',
      requirements: [
        { text: '6+ years of professional software engineering experience', priority: 'must', skills: [], otherSkills: [], minYears: 6 },
        { text: 'Node.js and TypeScript on the backend', priority: 'must', skills: ['node-js', 'typescript'], otherSkills: [], minYears: null },
        { text: 'React on the frontend', priority: 'must', skills: ['react'], otherSkills: [], minYears: null },
        { text: 'PostgreSQL schema design and query tuning', priority: 'must', skills: ['postgresql'], otherSkills: [], minYears: null },
        { text: 'Designing REST and GraphQL APIs', priority: 'must', skills: ['api-design', 'graphql'], otherSkills: ['REST'], minYears: null },
        { text: 'Shipping on AWS with CI/CD', priority: 'must', skills: ['aws', 'ci-cd'], otherSkills: [], minYears: null },
        { text: 'Owning an on-call rotation', priority: 'must', ...none },
        { text: 'Microservices at scale', priority: 'nice', skills: ['microservices'], otherSkills: [], minYears: null },
        { text: 'Docker and Kubernetes', priority: 'nice', skills: [], otherSkills: ['Docker', 'Kubernetes'], minYears: null },
      ],
    },
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
    extraction: {
      role: 'Senior Software Engineer, AI Platform',
      requirements: [
        { text: '5+ years of software engineering', priority: 'must', skills: [], otherSkills: [], minYears: 5 },
        { text: 'Production applications on large language models', priority: 'must', skills: ['genai'], otherSkills: [], minYears: null },
        { text: 'Agentic workflows: tool use, multi-step agents', priority: 'must', skills: ['agentic-workflows'], otherSkills: [], minYears: null },
        { text: 'Structured outputs, evals and guardrails for model quality', priority: 'must', skills: ['structured-output', 'output-validation'], otherSkills: ['evals'], minYears: null },
        { text: 'Python', priority: 'must', skills: ['python'], otherSkills: [], minYears: null },
        { text: 'RAG and vector databases', priority: 'must', skills: [], otherSkills: ['RAG', 'vector databases'], minYears: null },
        { text: 'Exposing AI capabilities through a gateway or internal platform', priority: 'must', skills: ['ai-platform'], otherSkills: [], minYears: null },
        { text: 'TypeScript', priority: 'nice', skills: ['typescript'], otherSkills: [], minYears: null },
        { text: 'Model fine-tuning', priority: 'nice', skills: [], otherSkills: ['fine-tuning'], minYears: null },
        { text: 'Model Context Protocol (MCP)', priority: 'nice', skills: [], otherSkills: ['MCP'], minYears: null },
      ],
    },
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
    extraction: {
      role: 'Backend Engineer, Infrastructure',
      requirements: [
        { text: '5+ years writing production services in Go', priority: 'must', skills: [], otherSkills: ['Go'], minYears: 5 },
        { text: 'Operating Kubernetes clusters in production', priority: 'must', skills: [], otherSkills: ['Kubernetes'], minYears: null },
        { text: 'Distributed systems and microservice design', priority: 'must', skills: ['microservices', 'system-design'], otherSkills: ['distributed systems'], minYears: null },
        { text: 'Kafka or another event streaming platform', priority: 'must', skills: [], otherSkills: ['Kafka'], minYears: null },
        { text: 'PostgreSQL', priority: 'must', skills: ['postgresql'], otherSkills: [], minYears: null },
        { text: 'Willingness to join the on-call rotation', priority: 'must', ...none },
        { text: 'gRPC', priority: 'nice', skills: [], otherSkills: ['gRPC'], minYears: null },
        { text: 'Terraform', priority: 'nice', skills: [], otherSkills: ['Terraform'], minYears: null },
      ],
    },
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
    extraction: {
      role: 'Senior Content Marketing Manager',
      requirements: [
        { text: '5+ years in B2B content marketing', priority: 'must', skills: [], otherSkills: ['content marketing'], minYears: 5 },
        { text: 'SEO strategy and keyword research', priority: 'must', skills: ['seo'], otherSkills: [], minYears: null },
        { text: 'HubSpot', priority: 'must', skills: [], otherSkills: ['HubSpot'], minYears: null },
        { text: 'Google Analytics and campaign reporting', priority: 'must', skills: [], otherSkills: ['Google Analytics'], minYears: null },
        { text: 'A/B testing landing pages', priority: 'must', skills: [], otherSkills: ['A/B testing'], minYears: null },
        { text: 'Exceptional storytelling', priority: 'must', ...none },
        { text: 'Stakeholder management across Sales and Product', priority: 'nice', skills: ['cross-functional-collaboration'], otherSkills: [], minYears: null },
      ],
    },
  },
];
