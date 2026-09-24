import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Harness } from './harness';

/**
 * DEV-ONLY harness for the Private-mode runtime (src/lib/fit/local): proves
 * probe → bench → load → run end to end in a real browser. Not the /fit UI.
 * 404s outside `next dev`.
 */
export const metadata: Metadata = {
  title: 'Private mode harness (dev)',
  robots: { index: false, follow: false },
};

export default function FitDevPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <Harness />;
}
