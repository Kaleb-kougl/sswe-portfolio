export const FILE_LOG_MAP: Record<string, string> = {
  'overview':             '> [SYSTEM] Returning to overview...',
  'profile':              '> [SYSTEM] Loading Player Entity... Kaleb Kougl | San Francisco, CA.',
  'contact-info':       '> [NETWORK] Establishing gRPC channels... LinkedIn, Email configured. OK',
  'indeed-sr-swe':       '> [NETWORK] Opening gRPC channels for third-party integration... OK',
  'ibm-staff-swe':    '> [PERF] Legacy bundle detected. Tree-shaking applied. Reduced to 300KB.',
  'ibm-swe':           '> [GRAPHQL] Initializing Apollo Client... GolfTV Graph API connected.',
  'jbhunt-intern':        '> [MOBILE] React Native bridge initialized. Jest/Appium suites loaded.',
  'hammerball':            '> [SERVER] Authoritative match started. Syncing live-ops economy...',
  'analytics-extension':  '> [EXTENSION] Manifest V3 service worker registered. Analytics pipeline active.',
  'webpack-federation':   '> [WEBPACK 5] Compiling Module Federation... Done in 142ms.',
  'cwv-profiler':         '> [SLO] Core Web Vitals check: TTI < 100ms. FCP < 50ms. [PASS]',
};

export const BOOT_LOGS: string[] = [
  '> [SYSTEM] Bootstrapping React 19 & Zustand state... Location: [San Francisco, CA].',
  '> [WEBPACK 5] Compiling Module Federation... Done in 142ms.',
  '> [SLO] Core Web Vitals check: TTI < 100ms. FCP < 50ms. [PASS]',
];
