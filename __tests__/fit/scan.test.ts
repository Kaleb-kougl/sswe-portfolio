import { describe, expect, it } from 'vitest';

import { GAP_VOCABULARY, SKILLS_TABLE } from '@/data/corpus/skills';
import { detectSkills, SCAN_STOP_TERMS } from '@/lib/fit/scan';

const ids = (text: string) => detectSkills(text).map((d) => d.id);

describe('detectSkills: true positives', () => {
  it.each([
    ['Node.js', 'node-js'],
    ['NodeJS', 'node-js'],
    ['node js services', 'node-js'],
    ['C# and .NET', 'csharp'],
    ['C# and .NET', 'dotnet'],
    ['ASP.NET MVC', 'dotnet'],
    ['modern C++ (17/20)', 'cpp'],
    ['CI/CD pipelines', 'ci-cd'],
    ['CI-CD', 'ci-cd'],
    ['cicd', 'ci-cd'],
    ['continuous integration', 'ci-cd'],
    ['experience in Go', 'go'],
    ['Go, Rust or Java', 'go'],
    ['Python or Go.', 'go'],
    ['(Go)', 'go'],
    ['Go/Kubernetes', 'go'],
    ['Go services at scale', 'go'],
    ['Golang', 'go'],
    ['React Native', 'react-native'],
    ['TypeScript/JavaScript', 'typescript'],
    ['TypeScript/JavaScript', 'javascript'],
    ['WCAG 2.1 AA', 'wcag'],
    ['a11y', 'wcag'],
    ['micro-frontends', 'micro-frontends'],
    ['microfrontends', 'micro-frontends'],
    ['a micro frontend', 'micro-frontends'],
    ['Vue.js', 'vue'],
    ['Kubernetes (k8s)', 'kubernetes'],
    ['k8s', 'kubernetes'],
    ['Swift and SwiftUI', 'swift'],
    ['a design system', 'design-systems'],
    ['a shared component library', 'component-libraries'],
    ['microservice design', 'microservices'],
    ['a Chrome extension', 'chrome-extensions'],
    ['Three.js', 'threejs'],
    ['R3F', 'react-three-fiber'],
    ['Apache Spark', 'spark'],
    ['Spark and Airflow', 'spark'],
    ['Ruby on Rails', 'rails'],
    ['Rails', 'rails'],
    ['Unreal Engine 5', 'unreal-engine'],
    ['Objective-C', 'objective-c'],
    ['LLMs', 'genai'],
    ['AI agents', 'agentic-workflows'],
    ['unit testing', 'automated-testing'],
    ['Apollo Client', 'apollo-graphql'],
    ['software architecture', 'system-design'],
    ['Entity Component System', 'ecs'],
    // The site's own stack (portfolio-site records) and the wider gap vocabulary.
    ['Next.js App Router', 'nextjs'],
    ['Tailwind CSS', 'tailwind-css'],
    ['React Testing Library', 'react-testing-library'],
    ['GitHub Actions workflows', 'github-actions'],
    ['Playwright or Cypress', 'playwright'],
    ['axe-core audits', 'accessibility-testing'],
    ['Node.js/Express', 'express'],
    ['Express.js APIs', 'express'],
    ['Webpack, Vite or Rollup', 'rollup'],
    ['Bootstrap or Material UI', 'bootstrap'],
    ['React Query or SWR', 'react-query'],
    ['Nx or Turborepo', 'nx'],
    ['Deploy with Helm charts', 'helm'],
    ['Pinecone or pgvector', 'pinecone'],
    ['Agile methodologies', 'agile'],
    ['Agile, Scrum', 'agile'],
    ['working in agile teams', 'agile'],
    ['Redux Toolkit', 'redux'],
    ['strong SQL', 'sql'],
    ['relational databases such as PostgreSQL', 'relational-databases'],
    ['an RDBMS', 'relational-databases'],
  ])('%s → %s', (text, id) => {
    expect(ids(text)).toContain(id);
  });

  it('finds every canonical label and every gap label in a plain sentence', () => {
    for (const skill of SKILLS_TABLE) {
      expect(ids(`We use ${skill.label}, daily.`), skill.label).toContain(skill.id);
    }
    for (const term of GAP_VOCABULARY) {
      expect(ids(`We use ${term.label}, daily.`), term.label).toContain(term.id);
    }
  });

  it('finds every alias except the scan stop terms', () => {
    for (const skill of SKILLS_TABLE) {
      for (const alias of skill.aliases) {
        if (SCAN_STOP_TERMS.has(alias.toLowerCase())) continue;
        expect(ids(`Experience with ${alias}.`), alias).toContain(skill.id);
      }
    }
  });
});

describe('detectSkills: false positives', () => {
  it.each([
    ['our go-to person', 'go'],
    ['Go-to-market strategy', 'go'],
    ['Go to market with us', 'go'],
    ["Let's go build it", 'go'],
    ['Go beyond the brief', 'go'],
    ['work on the go', 'go'],
    ['a positive reaction', 'react'],
    ['reactive programming', 'react'],
    ['three years of experience', 'threejs'],
    ['user research', 'scientific-research'],
    ['customer support agents', 'agentic-workflows'],
    ['A/B testing', 'automated-testing'],
    ['information architecture', 'system-design'],
    ['JavaScript', 'java'],
    ['swift delivery', 'swift'],
    ['spark curiosity', 'spark'],
    ['guard rails', 'rails'],
    ['unreal growth', 'unreal-engine'],
    ['Next.js', 'javascript'],
    ['FP&A', 'functional-programming'],
    ['AWS ECS', 'ecs'],
    ['Apollo.io and Outreach', 'apollo-graphql'],
    ['MySQL', 'sql'],
    ['PostgreSQL', 'sql'],
    ['NoSQL', 'sql'],
    ['React Native', 'react'],
    ['Node.js', 'javascript'],
    ['campaign performance optimization', 'web-performance'],
    ['motion graphics', 'animation'],
    ['sales coaching', 'mentoring'],
    ['typescripts', 'python'],
    ['Cassandra', 'css'],
    ['ScalaTest', 'scala'],
    ['example.net', 'dotnet'],
    ['React Testing Library', 'react'],
    ['Next.js', 'react'],
    ['bootstrap a new team', 'bootstrap'],
    ['parcel delivery', 'parcel'],
    ['a weekly data rollup', 'rollup'],
    ['emotional intelligence and empathy', 'emotion'],
    ['team unity', 'unity'],
    ['Express interest in the role', 'express'],
    ['at the helm of a small team', 'helm'],
    ['a career expo', 'expo'],
    ['an agile, fast-moving startup', 'agile'],
    ['stay agile as we grow', 'agile'],
  ])('%s ↛ %s', (text, id) => {
    expect(ids(text)).not.toContain(id);
  });

  it('finds nothing in text with no skills', () => {
    expect(ids('We are a friendly team who love to go the extra mile. Three days in office.')).toEqual([]);
  });
});

describe('detectSkills: word forms (plan 2g)', () => {
  it.each([
    ['You mentored two junior engineers', 'mentoring'],
    ['Mentor new hires', 'mentoring'],
    ['Build and version public APIs', 'api-design'],
    ['Design a REST API for partners', 'api-design'],
    ['RESTful services', 'api-design'],
    ['Build gRPC APIs', 'api-design'],
    ['Migrate the app from Vue to React', 'codebase-migrations'],
    ['You have migrated a large codebase', 'codebase-migrations'],
    ['Led the migration to TypeScript', 'codebase-migrations'],
    ['Comfortable working across the stack', 'full-stack'],
    ['Opinions on testing strategy', 'automated-testing'],
    ['Write unit tests and integration tests', 'automated-testing'],
    ['Leading projects end to end', 'tech-leadership'],
    ['Work with cross-functional partners', 'cross-functional-collaboration'],
    ['Daily use of Copilot or Claude Code', 'ai-assisted-development'],
    ['Built agentic systems in production', 'agentic-workflows'],
    ['Games industry background', 'game-development'],
  ])('%s → %s', (text, id) => {
    expect(ids(text)).toContain(id);
  });

  it.each([
    // Someone else's API being used, not API design.
    ['Experience calling the OpenAI API', 'api-design'],
    ['Integrate the Stripe APIs', 'api-design'],
    ['Rotate API keys safely', 'api-design'],
    ['OpenAI and Anthropic models', 'api-design'],
    // Moving records is not a codebase migration.
    ['Data migration of customer records in a CRM', 'codebase-migrations'],
    ['Migrate customer accounts to the new plan', 'codebase-migrations'],
    ['Database migrations', 'codebase-migrations'],
    // Near-misses of the new aliases.
    ['A mentorship-free zone', 'tech-leadership'],
    ['Stack Overflow answers', 'full-stack'],
    ['A tech lead will guide you', 'mentoring'],
  ])('%s ↛ %s', (text, id) => {
    expect(ids(text)).not.toContain(id);
  });
});

describe('detectSkills: order and dedupe', () => {
  it('lists each skill once, in order of first mention', () => {
    expect(ids('Kubernetes, then React, then Kubernetes again and React.')).toEqual(['kubernetes', 'react']);
  });

  it('marks gap-vocabulary skills as gaps', () => {
    expect(detectSkills('React and Go.')).toEqual([
      { id: 'react', gap: false },
      { id: 'go', gap: true },
    ]);
  });
});
