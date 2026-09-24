import { CONTACT_INFO, type ContactInfo } from './contact';

export { CONTACT_INFO, type ContactInfo };

export interface ProjectEntry {
  fileId: string;
  title: string;
  company: string;
  dates: string;
  type: 'work' | 'project' | 'profile' | 'contact' | 'skill';
  /**
   * The point of the entry, not the job title — a concrete claim a hiring
   * manager can act on. Keep it under ~60 characters.
   *
   * NOT CURRENTLY RENDERED. This was the Inspector's display headline in the
   * IDE shell, which the scroll rebuild retired (see the note at the top of
   * `e2e/server-rendering.spec.ts`). Nothing reads it today — CareerSection
   * renders `summary` and `result`. It is kept as each entry's one-line
   * thesis: the thing `summary` has to end up saying.
   */
  headline: string;
  /** One plain sentence under the headline. */
  summary: string;
  /**
   * One concrete result, sourced verbatim (or near-verbatim) from `bullets`.
   * Used as the footer of a LevelTimeline card. Never invent a metric here.
   */
  result?: string;
  bullets: string[];
  controls?: string[];
  skills?: string[];
}


/**
 * The first year of the earliest role on the résumé (the 2018 J.B. Hunt
 * internship). Every "since <year>" on the site interpolates this constant —
 * the hero stat, the hero paragraph, the EXPERIENCE eyebrow and the career
 * heading — so the site states a start date and never a years-of-experience
 * count, which automated résumé filters read literally and mis-score.
 *
 * Authored here rather than derived from `RESUME_DATA` because SUMMARY (below)
 * needs it, and RESUME_DATA quotes SUMMARY in turn. If the earliest role
 * changes, change this with it.
 */
export const CAREER_START_YEAR = 2018;

export const SUMMARY =
  `Software engineer making high-traffic web applications faster, more accessible and easier for others to build on since ${CAREER_START_YEAR}. I\u2019ve focused on work that compounds such as platform migrations, shared component systems and now AI-assisted development workflows. This improves not only my work but other engineers\u2019 ability to ship features. Most recently I\u2019ve led frontend platform and AI-tooling initiatives at Indeed across software applications serving 680M+ users.`;

export const EDUCATION = [
  {
    school: 'Northwestern University',
    // The current résumé prints this certificate without a date. The date below is
    // carried over from the previous résumé rather than dropped, because
    // CareerSection sorts EDUCATION by the years inside `graduationDate`.
    graduationDate: 'Jan 2019',
    degree: 'Full-Stack Web Development Certificate',
  },
  {
    school: 'University of Arkansas',
    graduationDate: 'Jul 2017',
    degree: 'Bachelor of Science in Biological Sciences, Cum Laude',
    gpa: '3.9',
  },
];

export interface Testimonial {
  /**
   * An excerpt, never a paraphrase. Where sentences either side of an elision
   * are joined, the elision is marked with an ellipsis in the string itself —
   * the reader can see that something was cut, and `source` says where to read
   * the whole thing.
   */
  quote: string;
  name: string;
  /** Their title at the time of writing, not today's. */
  title: string;
  /** How they knew the work, in LinkedIn's own words. */
  relationship: string;
  date: string;
}

/**
 * Recommendations received, quoted from
 * linkedin.com/in/kaleb-kougl/details/recommendations (visibility: all
 * LinkedIn members).
 *
 * THREE OF SIX, chosen because they corroborate claims this site already makes
 * rather than because they are the warmest. Caleb worked on the same Indeed
 * team and is the only outside voice for the Indeed roles the summary leads
 * with — planning through implementation, scoping, full-stack. Alvaro managed
 * the IBM work and describes the React platform transformation and the
 * mentoring; Thai worked alongside it and names an artifact — the org-wide
 * open-source clearance tool — that appears nowhere else on this site or on
 * the résumé.
 *
 * Newest first. CareerSection gives the first entry the full row, so the
 * remaining two pair up in the two-column grid.
 *
 * Do not edit the quotes to read better. Trim them at sentence boundaries or
 * leave them alone. ONE EXCEPTION, made at Kaleb's request: two typos in
 * Caleb's original are corrected here — "he was a effective communicator"
 * reads "an", and "At indeed" is capitalized. Nothing else in that quote is
 * changed.
 */
export const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote:
      'He helped take these projects from planning to implementation. Kaleb did a great job in helping propose designs, scoping the work, and distributing the tasks in such a way that the team could efficiently tackle the features - delivering them within the deadlines based on scope. At Indeed we are expected to be full-stack and Kaleb demonstrated this in all the projects we worked on together. In addition, he was an effective communicator - no tasks ever got stale or stuck.',
    name: 'Caleb Cheatham',
    title: 'Engineer, Indeed',
    relationship: 'worked with Kaleb on the same team',
    date: 'September 2026',
  },
  {
    quote:
      'His React knowledge and the way he drove the effort of transforming our platform into a React app allowed for much more flexibility and reliability than we had seen previously. \u2026 He assisted many others on our team in getting up to speed on new technologies and codebase.',
    name: 'Alvaro (Al) Sanchez-Cifuentes',
    title: 'Program Director, IBM Developer, Cloud and Open Source Technologies',
    relationship: 'managed Kaleb directly',
    date: 'May 2022',
  },
  {
    quote:
      'Kaleb is extremely thoughtful and talented, he served as our resident React expert. Kaleb built a web-based tool for managing open-source clearance across all of IBM while he was in my squad. This tool is instrumental in IBM\u2019s success in open-source.',
    name: 'Thai Tran',
    title: 'Senior Software Engineer, IBM',
    relationship: 'was senior to Kaleb',
    date: 'May 2022',
  },
];

export const SKILLS = [
  'TypeScript',
  'JavaScript',
  'React',
  'Node.js',
  'Python',
  'CI/CD',
  'HTML5',
  'CSS3',
  'PostgreSQL',
  'Redux',
  'Agile',
  'Web Applications',
  'Component libraries',
  'Datadog',
  'Webpack',
  'Build Systems',
  'Performance optimization (Core Web Vitals)',
  'AI-assisted development',
  'Model-assisted workflows',
];

export const RESUME_DATA: Record<string, ProjectEntry> = {
  'profile': {
    fileId: 'profile',
    title: 'Kaleb Kougl',
    company: '',
    dates: '',
    type: 'profile',
    headline: `Building front-end platforms since ${CAREER_START_YEAR}.`,
    summary:
      'Front-end platform engineer who builds the component libraries, build pipelines, and SLOs that other product teams ship on.',
    bullets: [SUMMARY],
  },
  'contact-info': {
    fileId: 'contact-info',
    title: 'Contact Info',
    company: '',
    dates: '',
    type: 'contact',
    headline: 'Reachable in one click.',
    summary: 'Email, phone, and the two profiles worth reading, in San Francisco time.',
    bullets: [
      `Email: ${CONTACT_INFO.email}`,
      `Phone: ${CONTACT_INFO.phone}`,
      `Location: ${CONTACT_INFO.location}`,
      `LinkedIn: ${CONTACT_INFO.linkedin}`,
      `GitHub: ${CONTACT_INFO.github}`,
    ],
  },
  /*
   * EDITORIAL NOTE — how the résumé's bullets map onto these entries.
   *
   * The résumé groups bullets PER COMPANY, not per role: seven bullets sit
   * under the two Indeed titles and five under the two IBM titles. This site
   * renders one role per card, so the bullets have been distributed across the
   * two entries for each company. That split is an EDITORIAL CHOICE made here —
   * it is not present in the source résumé, and re-cutting it changes nothing
   * else. The rule used: bullets describing lead/org-wide scope (tech lead,
   * mentoring, cross-functional SLOs, AI tooling) go to the senior title;
   * bullets describing shipped product work go to the earlier title. Every
   * bullet still appears exactly once, verbatim from the résumé, and every
   * `result` quotes a number that appears in it.
   *
   * SECOND SOURCE — LinkedIn. Some work the résumé has no room for is carried
   * on the LinkedIn profile instead, and four bullets now come from there
   * rather than the PDF: the AI gateway, the Luxon migration, the OneHost
   * dimensions (principal architect, 6 engineers) and the extension's
   * single-click workflow. They are marked `LinkedIn:` in a comment above the
   * bullet they belong to. The rule is unchanged in substance — a bullet is
   * still quoted from a document the reader could be handed, never written
   * here — but "verbatim from the résumé" is now "verbatim from the résumé or
   * the profile", and which one is recorded per bullet.
   *
   * ONE DELIBERATE DIVERGENCE: `jbhunt-intern` is not on the current one-page
   * résumé, which drops the 2018 internship for space. It stays here on
   * purpose — the site is not constrained to a page. Do not "resync" by
   * deleting it. Removing it would also move CareerSection's numbers: the
   * "N steps up." heading (five → four) is derived from these entries, and
   * `CAREER_START_YEAR` above — which the eyebrow and every "since <year>"
   * line interpolate — would have to move with it (2018 → 2019).
   */
  'indeed-sr-swe': {
    fileId: 'indeed-sr-swe',
    title: 'Senior Software Engineer',
    company: 'Indeed.com',
    dates: 'Dec 2024 \u2013 Jun 2026',
    type: 'work',
    headline: 'AI gateway, OneHost, six engineers led.',
    summary:
      'Led frontend platform and AI-tooling work at Indeed: AI-assisted code generation and workflow harnesses that shortened delivery, a secure gateway that externalizes internal AI platforms to third-party clients and agents, and the OneHost micro-frontend migration \u2014 co-architected with the principal architect, executed with a team of 6. Mentored ~12 engineers along the way.',
    result: 'Reduced pickup-to-merge cycle time by 10%.',
    bullets: [
      'Reduced Pickup to merge cycle time by 10% through applied AI\u2011assisted code generation and workflow harnesses.',
      /*
       * LinkedIn. The platform-level AI work, which the one-page résumé drops
       * entirely. It is the closest thing on this profile to "externalize AI
       * capabilities for agent-based integrations", so it does not belong in a
       * cut file.
       */
      'Contributed to a strategic initiative to externalize core AI capabilities through a secure gateway, enabling third-party client and agent-based integrations with internal AI platforms.',
      'Led team migration as tech lead from monolithic architecture to OneHost micro\u2011frontend platform (Webpack 5 module federation) leveraging React Storybook and CSS Design Tokens; automated CI/CD.',
      /*
       * LinkedIn, and the one merged bullet on this page. The profile splits
       * OneHost across two entries — "Co-architected... partnering with the
       * principal architect" and "Spearheaded the technical execution...
       * leading a team of 6 engineers" — which restate the résumé's "Led team
       * migration as tech lead" above except for two facts it does not carry:
       * who it was designed with, and how many people executed it. Rather than
       * ship a third overlapping OneHost bullet, those two clauses are joined
       * here. Both halves are the profile's own words; only the join is new.
       */
      'Co-architected the migration to OneHost, the company\u2019s standard micro-frontend UI platform, partnering with the principal architect to define a new, scalable architecture, then led a team of 6 engineers on the technical execution using Webpack 5 Federated Modules and GraphQL.',
      /*
       * LinkedIn. A codebase-wide library migration with a mechanical core —
       * the most tooling-shaped thing in this role, and absent from the résumé.
       */
      'Drove the successful execution of the migration to the Luxon library for standardized timezone handling, a strategic move that unblocked critical integration with the Horizon platform.',
      'Mentored ~12 engineers as team/project lead, resulting in promotions and improved onboarding.',
      'Operationalized Frontend SLOs with SRE and Product, reducing customer\u2011facing incidents for consumer features.',
      /*
       * Stated by Kaleb, 2026-09-24 ("I used it at Indeed"). Not on the one-page
       * résumé; bullets aren't rendered by CareerSection, so these feed the
       * corpus (/fit, llms.txt, MCP) without changing the career cards.
       */
      'Built React features with Redux for application state.',
      'Delivered work in Agile teams, following Agile principles (sprint planning, standups, retrospectives).',
    ],
    controls: ['isModuleFederationEnabled', 'isSloIncidentSimulated'],
  },
  'indeed-swe-ii': {
    fileId: 'indeed-swe-ii',
    title: 'Software Engineer II',
    company: 'Indeed.com',
    dates: 'Aug 2022 \u2013 Dec 2024',
    type: 'work',
    headline: 'Cut Time to Interactive 15% for 680M+ users.',
    summary:
      'Shipped the consumer-facing half: apply-flow performance for 680M+ users, WCAG accessibility across 20+ shared React components consumed by 5 teams, and the analytics extension Customer Support troubleshoots ad campaigns with.',
    result: 'Cut Time to Interactive 15% in the apply flow.',
    bullets: [
      'Cut ad campaign troubleshooting time 20% for Customer Support by shipping a TypeScript/Python Manifest V3 GenAI analytics Chrome extension.',
      'Cut Time to Interactive 15% in the apply flow, serving 680M+ users.',
      'Spearheaded efforts to implement (WCAG) web accessibility standards across 20+ reusable React components consumed by 5 teams.',
      /*
       * Stated by Kaleb, 2026-09-24 ("I used it at Indeed"). Not on the one-page
       * résumé; bullets aren't rendered by CareerSection, so these feed the
       * corpus (/fit, llms.txt, MCP) without changing the career cards.
       */
      'Built React features with Redux for application state.',
      'Delivered work in Agile teams, following Agile principles (sprint planning, standups, retrospectives).',
    ],
  },
  'ibm-staff-swe': {
    fileId: 'ibm-staff-swe',
    title: 'Software Engineer II',
    company: 'IBM',
    dates: 'Sep 2021 \u2013 Aug 2022',
    type: 'work',
    headline: 'Cut the bundle from 6 MB to 300 KB.',
    summary:
      'Rebuilt IBM Developer on React and re-tuned its Webpack pipeline for build time, bundle size, and Core Web Vitals.',
    /*
     * The bundle figure alone is a build-system statistic. The résumé's own
     * bullet already converts it into the thing a reader is actually buying —
     * engineer time — so the `result` quotes that clause instead of stopping at
     * the kilobytes. Same sentence, further along.
     */
    result: 'Bundle 6 MB \u2192 300 KB, reclaiming 20+ engineer hours per week across a team of 10.',
    bullets: [
      'Modernized IBM Developer site (https://developer.ibm.com/) with React and Webpack, improving SEO and Core Web Vitals (TTI/FCP) across devices.',
      'Optimized Webpack to halve build time, improve rebuild/hot\u2011reload 29x, and shrink bundle from 6 MB to 300 KB, reclaiming 20+ engineer hours per week across a team of 10.',
      'Designed and launched a Node.js Watson Media video upload pipeline to streamline advocate video publishing.',
    ],
    controls: ['targetBundleSize'],
  },
  'ibm-swe': {
    fileId: 'ibm-swe',
    title: 'Software Engineer',
    company: 'IBM',
    dates: 'May 2019 \u2013 Sep 2021',
    type: 'work',
    headline: 'API response 30% faster in the agent portal.',
    summary:
      'Delivered a modernized customer service agent portal and the Apollo GraphQL API behind GolfTV.',
    result: 'Agent portal: 30% faster API response.',
    bullets: [
      'Delivered a modernized customer service agent portal (30% faster API response).',
      'Improved data reliability for client integrations through GolfTV Graph API (Apollo GraphQL) on AWS.',
      /*
       * The current résumé's own bullet (2026 PDF). The line above predates it
       * and leaves out the database; this one is the corpus's PostgreSQL record.
       */
      'Built the GolfTV Apollo GraphQL API on AWS for worldwide launch, tuning its PostgreSQL queries for launch traffic.',
    ],
  },
  'jbhunt-intern': {
    fileId: 'jbhunt-intern',
    title: 'Application Development Intern',
    company: 'J.B. Hunt',
    dates: 'Jun 2018 \u2013 Dec 2018',
    type: 'work',
    headline: 'Shipped React Native features, tests included.',
    summary:
      'First engineering role: cross-platform mobile features delivered with their own Jest and Appium coverage.',
    result: 'Added Jest/Appium test suites to raise release confidence.',
    bullets: [
      'Built cross\u2011platform React Native features and added Jest/Appium test suites to raise release confidence.',
    ],
  },
  'video-pipeline': {
    fileId: 'video-pipeline',
    title: 'Agentic AI Video Creator',
    company: 'Open Source \u00b7 video-pipeline',
    dates: '',
    type: 'project',
    headline: 'Sub-agents under one workflow orchestrator.',
    summary:
      'A modular agentic Python application that turns an episode transcript into a narrated video, coordinated by a workflow orchestrator driving specialized sub-agents.',
    /*
     * SOURCING. The first four bullets are the LinkedIn project entry's own
     * words. The fifth is read off the public repository, which is the artifact
     * a reader can actually check, and is the one the Work card is built from —
     * see the note on WORK_PROJECTS['video-pipeline'] in `workProjects.ts` for
     * which claims that README does and does not support.
     */
    bullets: [
      'Engineered a modular, agentic Python application to fully automate the creation of anime summary videos. The system is managed by a workflow orchestrator that coordinates specialized sub-agents for transcript discovery, content generation (using LangChain and Google Gemini), and final video compilation.',
      'Developed and utilized a separate, autonomous coding agent to build and refactor core components of the video creator itself, enforcing a strict Test-Driven Development (TDD) methodology.',
      'Architected a character analysis system using ChromaDB and Sentence Transformers for vector-based semantic search, enabling deep narrative analysis across entire seasons.',
      'Implemented a high-performance, parallel image generation module that reduced media creation time by over 60% through concurrent processing.',
      'Six quality validators score their own stage 0.0\u20111.0 against a gate table that keeps criticality separate from score, so a weak episode-discovery result degrades the run while a weak transcript stops it. 149 tests passing. Source: https://github.com/Kaleb-kougl/video-pipeline',
    ],
    skills: ['Python', 'LangChain', 'Google Gemini', 'ChromaDB', 'Agentic workflows', 'TDD'],
  },
  'hammerball': {
    fileId: 'hammerball',
    title: 'BonkBall',
    company: 'Personal Project',
    dates: '',
    type: 'project',
    headline: '20+ services driving one live Roblox match.',
    summary:
      'A multiplayer PvPvE Roblox game in strict TypeScript, with ECS boundaries, FSM-driven bots, and reactive match state.',
    bullets: [
      'Architected a high-paced, objective-based multiplayer Roblox game in strict TypeScript using Flamework DI and an Entity-Component-System (ECS) pattern to enforce client-server separation.',
      'Engineered a scalable hybrid PvPvE environment featuring intelligent NPC bots driven by a custom Finite State Machine (FSM), optimized with pre-computed spatial queries and SimplePath pathfinding.',
      'Implemented a reactive, unidirectional state management architecture using Reflex to synchronize match phases across 20+ decoupled micro-services and programmatic HUD controllers.',
      'Designed a unified ICombatant interface, abstracting physical entities to allow complex hit-detection and objective mechanics to seamlessly interact with both human players and AI agents.',
      'Playable on Roblox: https://www.roblox.com/games/125331448291741/BonkBall'
    ],
    controls: ['forceAiState', 'showNavMesh'],
    skills: ['TypeScript', 'Roblox-TS', 'Flamework', 'Reflex', 'FSM AI'],
  },
  'combat_system': {
    fileId: 'combat_system',
    title: 'CombatSystem Combat Engine',
    company: 'Personal Project',
    dates: '',
    type: 'project',
    headline: '20,000 bullets at 120 fps.',
    summary:
      'A composable bullet-hell engine: 7 pattern generators, 6 modifiers, and a zero-allocation GPU-instanced renderer.',
    bullets: [
      'Composable bullet-pattern system with 7 generators, 6 modifiers, and functional composition — each pattern is a pure function returning spawn data.',
      'GPU-instanced bullet renderer using InstancedMesh with a 20,000-bullet pool running at 120fps, zero-allocation physics loop, and per-instance color via setColorAt.',
      'Procedural IK spider/centipede enemies and multi-phase boss AI with state-machine-driven attack patterns.',
      'Source Code: https://github.com/Kaleb-kougl/r3f-projectiles',
      'NPM: https://www.npmjs.com/package/@k9kbdev/r3f-projectiles',
    ],
    controls: ['combatSystemPattern', 'combatSystemFireRate', 'combatSystemBloom', 'combatSystemPoolSize'],
    skills: ['React Three Fiber', 'Three.js', 'WebGL', 'TypeScript'],
  },
  'analytics-extension': {
    fileId: 'analytics-extension',
    title: 'Indeed Analytics Extension',
    company: 'Indeed.com',
    dates: '',
    type: 'project',
    headline: '20% faster troubleshooting for Customer Support.',
    /*
     * REORDERED, not rewritten. This entry used to open on the auth bridge and
     * the URL sanitization — real engineering, but plumbing — and left the
     * GenAI half and the 20% outcome to be inferred. The résumé bullet in
     * `indeed-swe-ii` leads with both, and so does this now. The architecture
     * bullets below are unchanged and still carry the interesting part.
     */
    summary:
      'A GenAI analytics Chrome extension that cut ad-campaign troubleshooting time 20% for Customer Support, replacing a manual diagnostic process with a single click.',
    result: 'Cut ad campaign troubleshooting time 20% for Customer Support.',
    bullets: [
      'Cut ad campaign troubleshooting time 20% for Customer Support by shipping a TypeScript/Python Manifest V3 GenAI analytics Chrome extension.',
      /*
       * LinkedIn. Says what the extension replaced, which no résumé bullet does.
       */
      'Led the end-to-end, full-stack development of an internal analytics troubleshooting browser extension (React, Manifest V3), creating a single-click workflow that replaced a cumbersome manual process.',
      '**Architected** a React (Manifest V3) browser extension, designing a zero-auth, stateless bridge that connects the frontend client to backend microservices via dynamic URL generation to eliminate traditional API token overhead.',
      '**Engineered** an automated, deep-linked troubleshooting UI workflow, enabling the extension to instantly auto-populate and trigger complex campaign diagnostics without requiring manual data entry.',
      '**Secured** cross-platform data transfers by implementing strict frontend input allowlists and automatic URL sanitization to prevent XSS, seamlessly routing external inputs into existing backend validation pipelines.',
    ],
    skills: ['React', 'TypeScript', 'Python', 'GenAI', 'Manifest V3', 'Chrome Extensions'],
  },
  'core-skills': {
    fileId: 'core-skills',
    title: 'Core Skills & Technologies',
    company: '',
    dates: '',
    type: 'skill',
    headline: 'Full front-end platform stack, end to end.',
    summary:
      'The languages, frameworks, architecture, and tooling I reach for on a platform team.',
    bullets: [
      '**Languages:** TypeScript, JavaScript, Python, Java',
      '**Frontend Frameworks & Web:** React, Next.js, Redux, HTML5, CSS3, Styled-Components',
      '**Data & State Management:** GraphQL, Apollo Client, State Management',
      '**Architecture & Design:** Microfrontend Architecture, Design Systems, Design Tokens, Component-Driven Development, System Design',
      '**Performance & Security:** Performance Optimization (Core Web Vitals), Frontend Security Best Practices',
      '**Tools & Infrastructure:** Webpack 5, Docker, Git, CI/CD',
      '**Testing & Observability:** Cypress, TDD, DataDog',
      '**Workflow & Automation:** Agile Methodologies, GenAI, Agentic Workflows'
    ],
  },
  'webpack-federation': {
    fileId: 'webpack-federation',
    title: 'Webpack 5 Module Federation',
    company: '',
    dates: '',
    type: 'skill',
    headline: 'Independent deploys from one shared build.',
    summary:
      'Module federation, tree-shaking, and code splitting, wired into automated CI/CD.',
    bullets: [
      'Webpack 5, Module Federation, Tree-shaking, Code Splitting, Build Systems, CI/CD Automation.',
    ],
    controls: ['isModuleFederationEnabled', 'isSloIncidentSimulated'],
  },
  'cwv-profiler': {
    fileId: 'cwv-profiler',
    title: 'Core Web Vitals Profiler',
    company: '',
    dates: '',
    type: 'skill',
    headline: 'Web performance measured, not guessed.',
    summary:
      'TTI/FCP profiling, Lighthouse auditing, and Frontend SLOs that hold a team to a number.',
    bullets: [
      'Performance optimization (Core Web Vitals), Frontend SLOs, TTI/FCP measurement, Lighthouse auditing.',
    ],
  },
  'roblox-css': {
    fileId: 'roblox-css',
    title: 'roblox-css',
    company: 'Published npm Package',
    dates: '',
    type: 'project',
    headline: 'Write CSS, get native Roblox UI.',
    summary:
      'A published CSS-to-Roblox translation middleware for roblox-ts, covered by 1,338 distinct test assertions across 12 spec files.',
    bullets: [
      'Designed and shipped a CSS\u2011to\u2011Roblox UI translation middleware for roblox\u2011ts — write familiar CSS props (flex, grid, gradients, calc) and get native Roblox engine primitives automatically.',
      'Built a branded type system, three specialized parsers (color, dimension, gradient), and Framer\u2011Motion\u2011inspired variant\u2011driven animation primitives powered by @rbxts/ripple.',
      '1,338 distinct test assertions across 12 spec files. Published as @k9kbdev/roblox-css under LGPL\u20113.0. NPM: https://www.npmjs.com/package/@k9kbdev/roblox-css',
    ],
    controls: ['githubLink'],
    skills: ['TypeScript', 'Roblox-TS', 'CSS-in-JS', 'AST Parsing'],
  },
  'r3f-projectiles': {
    fileId: 'r3f-projectiles',
    title: 'r3f-projectiles',
    company: 'Published npm Package',
    dates: '',
    type: 'project',
    headline: '20,000 bullets at 120 fps.',
    summary:
      'A published bullet-hell and projectile engine for React Three Fiber, MIT licensed and installable from npm.',
    bullets: [
      'A high-performance bullet-hell and projectile engine for React Three Fiber (R3F).',
      'Composable bullet-pattern system with 7 generators, 6 modifiers, and functional composition — each pattern is a pure function returning spawn data.',
      'GPU-instanced bullet renderer using InstancedMesh with a 20,000-bullet pool running at 120fps, zero-allocation physics loop, and per-instance color via setColorAt.',
      'Published under MIT License. NPM: https://www.npmjs.com/package/@k9kbdev/r3f-projectiles',
    ],
    controls: ['githubLink', 'combatSystemPattern', 'combatSystemFireRate', 'combatSystemBloom', 'combatSystemPoolSize'],
    skills: ['React Three Fiber', 'Three.js', 'WebGL', 'TypeScript'],
  },
  'portfolio-site': {
    fileId: 'portfolio-site',
    title: 'This portfolio site',
    company: 'Open Source \u00b7 sswe-portfolio',
    dates: '',
    type: 'project',
    headline: 'The site you are reading, with CI that gates it.',
    summary:
      'This site: Next.js App Router and React, tested with Vitest and Playwright, and gated by a GitHub Actions pipeline on every pull request.',
    /*
     * SOURCING. Read off the repository, which is public: package.json for the
     * stack and versions, .github/workflows/ci.yml for the pipeline, and
     * e2e/axe.spec.ts plus playwright.config.ts for the browser and
     * accessibility runs. Nothing here is a result or a metric, so there is
     * nothing to go stale beyond the version numbers.
     */
    bullets: [
      'Built this site with Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS v4. Source: https://github.com/Kaleb-kougl/sswe-portfolio',
      'Every pull request runs a GitHub Actions CI/CD pipeline: ESLint, Vitest and React Testing Library unit tests, a production Next.js build, a homepage JavaScript budget, and Playwright end-to-end tests.',
      'Playwright runs the end-to-end suite in Chromium, WebKit and Firefox, with axe-core scans against WCAG 2.1 AA on the homepage and the fit checker.',
    ],
    skills: ['Next.js', 'TypeScript', 'Tailwind CSS', 'Vitest', 'Playwright', 'GitHub Actions'],
  },
  'acs-microdialysis': {
    fileId: 'acs-microdialysis',
    title: 'Microdialysis Sampling of Quorum Sensing Homoserine Lactones during Biofilm Formation',
    company: 'Analytical Chemistry (ACS)',
    dates: '2019',
    type: 'project',
    headline: 'Peer-reviewed in ACS Analytical Chemistry.',
    summary:
      'Co-authored research on microdialysis sampling of quorum-sensing molecules during in situ biofilm formation.',
    bullets: [
      'Co\u2011authored peer\u2011reviewed research published in Analytical Chemistry — optimized microdialysis sampling procedures to collect quorum sensing molecules during in\u00a0situ biofilm formation.',
      'Contributed to LC\u2011MS quantification of acylhomoserine lactones (AHLs) across 4\u2011day continuous sampling experiments with V.\u00a0harveyi biofilm models.',
      'DOI: 10.1021/acs.analchem.8b05168',
    ],
  },
};
