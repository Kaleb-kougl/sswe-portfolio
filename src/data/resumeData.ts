export interface ContactInfo {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
}

export interface ProjectEntry {
  fileId: string;
  title: string;
  company: string;
  dates: string;
  type: 'work' | 'project' | 'profile' | 'contact' | 'skill';
  bullets: string[];
  controls?: string[];
}

export const CONTACT_INFO: ContactInfo = {
  name: 'Kaleb Kougl',
  title: 'Senior Software Engineer',
  email: 'KalebKougl@gmail.com',
  phone: '479-283-4454',
  location: 'San Francisco, CA',
  linkedin: 'linkedin.com/in/kaleb-kougl-7b3292151/',
};

export const SUMMARY =
  'Front\u2011End Platform engineer with 8+ years building scalable TypeScript/React web applications and reusable component libraries. Experienced with Webpack, CI/CD, Core Web Vitals, Frontend SLOs, and AI\u2011assisted code generation to accelerate delivery.';

export const EDUCATION = {
  school: 'University of Arkansas',
  graduationDate: 'Jul 2017',
  degree: 'Bachelor of Science Biological Sciences',
  gpa: '3.9',
};

export const SKILLS = [
  'TypeScript',
  'JavaScript',
  'CI/CD',
  'React',
  'HTML5',
  'CSS3',
  'Web Applications',
  'Component libraries',
  'Webpack',
  'Build Systems',
  'Performance optimization (Core Web Vitals)',
  'AI\u2011assisted development / model\u2011assisted workflows',
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
  'network-config': {
    fileId: 'network-config',
    title: 'Network Configuration',
    company: '',
    dates: '',
    type: 'contact',
    bullets: [
      `Email: ${CONTACT_INFO.email}`,
      `Phone: ${CONTACT_INFO.phone}`,
      `Location: ${CONTACT_INFO.location}`,
      `LinkedIn: ${CONTACT_INFO.linkedin}`,
    ],
  },
  'indeed-onehost': {
    fileId: 'indeed-onehost',
    title: 'Senior Software Engineer',
    company: 'Indeed.com',
    dates: 'Aug 2022 \u2013 Present',
    type: 'work',
    bullets: [
      'Migrated to OneHost microfrontend platform (Webpack 5 module federation) to enable reusable component library and scale consumer web experiences; automated CI/CD and mentored ~12 engineers to accelerate deployment cadence.',
      'Operationalized Frontend SLOs with SRE and Product, reducing customer\u2011facing incidents for consumer features.',
      'Applied AI\u2011assisted code generation and model\u2011assisted workflows to speed delivery; architected a gRPC third\u2011party integration platform and shipped a TypeScript/React Manifest V3 analytics troubleshooting extension.',
    ],
    controls: ['isModuleFederationEnabled', 'isSloIncidentSimulated'],
  },
  'ibm-modernization': {
    fileId: 'ibm-modernization',
    title: 'Staff Software Engineer',
    company: 'IBM',
    dates: 'Sep 2021 \u2013 Aug 2022',
    type: 'work',
    bullets: [
      'Modernized IBM Developer site with React and Webpack, improving SEO and Core Web Vitals (TTI/FCP) across devices.',
      'Optimized Webpack to halve build time, improve rebuild/hot\u2011reload 29x, and shrink bundle from 6 MB to 300 KB.',
      'Designed and launched a Watson Media video upload pipeline to streamline advocate video publishing.',
    ],
    controls: ['targetBundleSize'],
  },
  'ibm-golftv': {
    fileId: 'ibm-golftv',
    title: 'Software Engineer',
    company: 'IBM',
    dates: 'May 2019 \u2013 Sep 2021',
    type: 'work',
    bullets: [
      'Delivered a modernized customer service agent portal (API caching \u2192 ~30% faster avg response) and built the GolfTV Graph API with Apollo on AWS to improve data reliability for client integrations.',
    ],
  },
  'jbhunt-mobile': {
    fileId: 'jbhunt-mobile',
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
    title: 'HammerBall LiveOps',
    company: 'Personal Project',
    dates: '',
    type: 'project',
    bullets: [
      'Shipped a full multiplayer game with a 5-state FSM-driven AI pipeline and authoritative client-server architecture.',
      'Built with TypeScript, Reflex/Redux state management, and real-time live-ops economy syncing.',
    ],
    controls: ['forceAiState', 'showNavMesh'],
  },
  'analytics-extension': {
    fileId: 'analytics-extension',
    title: 'Indeed Analytics Extension',
    company: 'Indeed.com',
    dates: '',
    type: 'project',
    bullets: [
      'End\u2011to\u2011end analytics troubleshooting browser extension in React (Manifest V3) to improve campaign management efficiency.',
    ],
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
};
