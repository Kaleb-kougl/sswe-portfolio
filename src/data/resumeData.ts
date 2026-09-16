export interface ContactInfo {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
}

export interface ProjectEntry {
  fileId: string;
  title: string;
  company: string;
  dates: string;
  type: 'work' | 'project' | 'profile' | 'contact' | 'skill';
  /**
   * The point of the entry, not the job title — a concrete claim a hiring
   * manager can act on. Rendered as the Inspector's display headline.
   * Keep it under ~60 characters.
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

export const CONTACT_INFO: ContactInfo = {
  name: 'Kaleb Kougl',
  title: 'Senior Software Engineer',
  email: 'KalebKougl@gmail.com',
  phone: '479-283-4454',
  location: 'San Francisco, CA',
  linkedin: 'linkedin.com/in/kaleb-kougl',
  github: 'https://github.com/Kaleb-kougl',
};

export const SUMMARY =
  'Front\u2011End Platform engineer with 7+ years building scalable TypeScript/React web applications and reusable component libraries. Experienced with Webpack, CI/CD, Core Web Vitals, Frontend SLOs, GenAI, and Agentic Workflows.';

export const EDUCATION = [
  {
    school: 'Northwestern University',
    graduationDate: 'Jan 2019',
    degree: 'Full-Stack Web Development Certificate',
  },
  {
    school: 'University of Arkansas',
    graduationDate: 'Jul 2017',
    degree: 'Bachelor of Science, Cum Laude',
    gpa: '3.9',
  },
];

export const SKILLS = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Java',
  'React',
  'Redux',
  'Next.js',
  'GraphQL',
  'Apollo Client',
  'HTML5',
  'CSS3',
  'Styled-Components',
  'Webpack 5',
  'Docker',
  'CI/CD',
  'Git',
  'Cypress',
  'DataDog',
  'Design Systems',
  'Design Tokens',
  'State Management',
  'Microfrontend Architecture',
  'Component-Driven Development',
  'Performance Optimization (Core Web Vitals)',
  'System Design',
  'TDD',
  'Frontend Security Best Practices',
  'Agile Methodologies',
  'GenAI',
  'Agentic Workflows',
];

export const RESUME_DATA: Record<string, ProjectEntry> = {
  'profile': {
    fileId: 'profile',
    title: 'Kaleb Kougl',
    company: '',
    dates: '',
    type: 'profile',
    headline: '7+ years building front-end platforms.',
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
  'indeed-sr-swe': {
    fileId: 'indeed-sr-swe',
    title: 'Senior Software Engineer',
    company: 'Indeed.com',
    dates: 'Aug 2022 \u2013 Present',
    type: 'work',
    headline: 'Led the migration to a federated microfrontend.',
    summary:
      'Owns the OneHost module-federation platform behind Indeed consumer web, plus the Frontend SLOs that keep those features out of incident.',
    result: 'Mentored ~12 engineers to accelerate deployment cadence.',
    bullets: [
      'Migrated to OneHost microfrontend platform (Webpack 5 module federation) to enable reusable component library and scale consumer web experiences; automated CI/CD and mentored ~12 engineers to accelerate deployment cadence.',
      'Operationalized Frontend SLOs with SRE and Product, reducing customer\u2011facing incidents for consumer features.',
      'Applied AI\u2011assisted code generation and model\u2011assisted workflows to speed delivery.',
      'Architected a gRPC third\u2011party integration platform.',
      'Shipped a TypeScript/React Manifest V3 analytics troubleshooting extension.',
    ],
    controls: ['isModuleFederationEnabled', 'isSloIncidentSimulated'],
  },
  'ibm-staff-swe': {
    fileId: 'ibm-staff-swe',
    title: 'Staff Software Engineer',
    company: 'IBM',
    dates: 'Sep 2021 \u2013 Aug 2022',
    type: 'work',
    headline: 'Cut the bundle from 6 MB to 300 KB.',
    summary:
      'Rebuilt IBM Developer on React and re-tuned its Webpack pipeline for build time, bundle size, and Core Web Vitals.',
    result: 'Bundle 6 MB \u2192 300 KB; hot-reload 29x faster.',
    bullets: [
      'Modernized IBM Developer site (https://developer.ibm.com/) with React and Webpack, improving SEO and Core Web Vitals (TTI/FCP) across devices.',
      'Optimized Webpack to halve build time, improve rebuild/hot\u2011reload 29x, and shrink bundle from 6 MB to 300 KB.',
      'Designed and launched a Watson Media video upload pipeline to streamline advocate video publishing.',
    ],
    controls: ['targetBundleSize'],
  },
  'ibm-swe': {
    fileId: 'ibm-swe',
    title: 'Software Engineer',
    company: 'IBM',
    dates: 'May 2019 \u2013 Sep 2021',
    type: 'work',
    headline: 'API caching cut response time by 30%.',
    summary:
      'Shipped a modernized United Airlines agent portal and the Apollo GraphQL API behind GolfTV\u2019s worldwide launch.',
    result: 'Reduced average API response time by 30%.',
    bullets: [
      'Partnered with senior engineers to deliver a modernized customer service agent portal for United Airlines; implemented API caching that reduced average response time by 30%.',
      'Developed the GolfTV Graph API using Apollo Server and AWS to enable the worldwide launch of GolfTV.',
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
    headline: 'Campaign diagnostics with zero auth tokens.',
    summary:
      'A Manifest V3 React extension that deep-links Indeed campaign troubleshooting straight into backend microservices.',
    bullets: [
      '**Architected** a React (Manifest V3) browser extension, designing a zero-auth, stateless bridge that connects the frontend client to backend microservices via dynamic URL generation to eliminate traditional API token overhead.',
      '**Engineered** an automated, deep-linked troubleshooting UI workflow, enabling the extension to instantly auto-populate and trigger complex campaign diagnostics without requiring manual data entry.',
      '**Secured** cross-platform data transfers by implementing strict frontend input allowlists and automatic URL sanitization to prevent XSS, seamlessly routing external inputs into existing backend validation pipelines.',
    ],
    skills: ['React', 'TypeScript', 'Manifest V3', 'Chrome Extensions'],
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
      'A published CSS-to-Roblox translation middleware for roblox-ts, covered by 1,298 distinct test assertions across 9 spec files.',
    bullets: [
      'Designed and shipped a CSS\u2011to\u2011Roblox UI translation middleware for roblox\u2011ts — write familiar CSS props (flex, grid, gradients, calc) and get native Roblox engine primitives automatically.',
      'Built a branded type system, three specialized parsers (color, dimension, gradient), and Framer\u2011Motion\u2011inspired variant\u2011driven animation primitives powered by @rbxts/ripple.',
      '1,298 distinct test assertions across 9 spec files. Published as @k9kbdev/roblox-css under LGPL\u20113.0. NPM: https://www.npmjs.com/package/@k9kbdev/roblox-css',
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
