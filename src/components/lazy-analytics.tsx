'use client';

import dynamic from 'next/dynamic';

/**
 * Vercel Web Analytics, loaded after hydration instead of in first-load JS.
 *
 * `<Analytics />` renders nothing and only injects `/_vercel/insights/script.js`
 * from an effect, so nothing is lost by fetching the component itself lazily —
 * but importing it straight into the layout put ~1.1 KB gzip on every page and
 * failed the homepage JS budget (scripts/check-homepage-js.mjs). `dynamic()`
 * with `ssr: false` moves it into its own chunk, which the budget does not
 * count, and it still records the first pageview once it loads.
 *
 * `ssr: false` is only allowed in a Client Component, hence this wrapper rather
 * than a `dynamic()` call in the (server) root layout.
 */
export const LazyAnalytics = dynamic(
  () => import('@vercel/analytics/next').then((m) => m.Analytics),
  { ssr: false, loading: () => null },
);
