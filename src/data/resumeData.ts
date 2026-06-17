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
  linkedin: 'linkedin.com/in/kaleb-kougl-7b3292151/',
  github: 'https://github.com/Kaleb-kougl',
};

export const SUMMARY =
  'Front\u2011End Platform engineer with 8+ years building scalable TypeScript/React web applications and reusable component libraries. Experienced with Webpack, CI/CD, Core Web Vitals, Frontend SLOs, and AI\u2011assisted code generation to accelerate delivery.';

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
    bullets: [SUMMARY],
  },
  'contact-info': {
    fileId: 'contact-info',
    title: 'Contact Info',
    company: '',
    dates: '',
    type: 'contact',
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
    bullets: [
      'Architected a high-paced, objective-based multiplayer Roblox game in strict TypeScript using Flamework DI and an Entity-Component-System (ECS) pattern to enforce client-server separation.',
      'Engineered a scalable hybrid PvPvE environment featuring intelligent NPC bots driven by a custom Finite State Machine (FSM), optimized with pre-computed spatial queries and SimplePath pathfinding.',
      'Implemented a reactive, unidirectional state management architecture using Reflex to synchronize match phases across 20+ decoupled micro-services and programmatic HUD controllers.',
      'Designed a unified ICombatant interface, abstracting physical entities to allow complex hit-detection and objective mechanics to seamlessly interact with both human players and AI agents.'
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
    bullets: [
      'Composable bullet-pattern system with 15 generators, 9 modifiers, and functional composition — each pattern is a pure function returning spawn data.',
      'GPU-instanced bullet renderer using InstancedMesh with a 10,000-bullet pool running at 120fps, zero-allocation physics loop, and per-instance color via setColorAt.',
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
    bullets: [
      '**Architected** a React (Manifest V3) browser extension, designing a zero-auth, stateless bridge that connects the frontend client to backend microservices via dynamic URL generation to eliminate traditional API token overhead.',
      '**Engineered** an automated, deep-linked troubleshooting UI workflow, enabling the extension to instantly auto-populate and trigger complex campaign diagnostics without requiring manual data entry.',
      '**Secured** cross-platform data transfers by implementing strict frontend input allowlists and automatic URL sanitization to prevent XSS, seamlessly routing external inputs into existing backend validation pipelines.',
    ],
    skills: ['React', 'TypeScript', 'Manifest V3', 'Chrome Extensions'],
  },
  'webpack-federation': {
    fileId: 'webpack-federation',
    title: 'Webpack 5 Module Federation',
    company: '',
    dates: '',
    type: 'skill',
    bullets: [
      'Webpack 5, Module Federation, Tree-shaking, Code Splitting, Build Systems, CI/CD Automation.',
    ],
  },
  'cwv-profiler': {
    fileId: 'cwv-profiler',
    title: 'Core Web Vitals Profiler',
    company: '',
    dates: '',
    type: 'skill',
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
    bullets: [
      'Designed and shipped a CSS\u2011to\u2011Roblox UI translation middleware for roblox\u2011ts — write familiar CSS props (flex, grid, gradients, calc) and get native Roblox engine primitives automatically.',
      'Built a branded type system, three specialized parsers (color, dimension, gradient), and Framer\u2011Motion\u2011inspired variant\u2011driven animation primitives powered by @rbxts/ripple.',
      '1,419 test assertions across 24 spec files. Published as @k9kbdev/roblox-css under LGPL\u20113.0. NPM: https://www.npmjs.com/package/@k9kbdev/roblox-css',
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
    bullets: [
      'A high-performance bullet-hell and projectile engine for React Three Fiber (R3F).',
      'Composable bullet-pattern system with 15 generators, 9 modifiers, and functional composition — each pattern is a pure function returning spawn data.',
      'GPU-instanced bullet renderer using InstancedMesh with a 10,000-bullet pool running at 120fps, zero-allocation physics loop, and per-instance color via setColorAt.',
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
    bullets: [
      'Co\u2011authored peer\u2011reviewed research published in Analytical Chemistry — optimized microdialysis sampling procedures to collect quorum sensing molecules during in\u00a0situ biofilm formation.',
      'Contributed to LC\u2011MS quantification of acylhomoserine lactones (AHLs) across 4\u2011day continuous sampling experiments with V.\u00a0harveyi biofilm models.',
      'DOI: 10.1021/acs.analchem.8b05168',
    ],
  },
};
