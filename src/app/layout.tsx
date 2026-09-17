import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Manrope, Space_Mono } from 'next/font/google';
import { SITE_URL } from '@/data/site';
import './globals.css';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: '800',
  display: 'swap',
});

const body = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  weight: ['400', '500', '600'],
  display: 'swap',
});

const label = Space_Mono({
  subsets: ['latin'],
  variable: '--font-space-mono',
  weight: '700',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kaleb Kougl | Senior Software Engineer',
  description:
    'Front-end platform engineer with 7+ years in TypeScript and React: component libraries, module federation, Core Web Vitals, and frontend SLOs.',
  openGraph: {
    title: 'Kaleb Kougl — Senior Software Engineer',
    description:
      'I build the platform other frontend teams ship on. Selected work, career history, and how I work — on one page.',
    url: SITE_URL,
    // No `images` here on purpose. `src/app/opengraph-image.tsx` is the
    // file-convention route that generates the card, and Next emits
    // og:image / :alt / :type / :width / :height from that file's own exports.
    // Listing an image here as well would advertise the card twice — and it is
    // how the old `public/og-image.png` came to claim 1200x630 while actually
    // being a 1024x1024 JPEG.
    type: 'website',
  },
  // Still required. Even for the generated card, Next only resolves a relative
  // social-image URL to an absolute one through `metadataBase`
  // (`resolveAndValidateImage` in next/dist/lib/metadata/resolvers/
  // resolve-opengraph.js). Without it a self-hosted build falls back to
  // `http://localhost:3000`, and crawlers would fetch nothing.
  metadataBase: new URL(SITE_URL),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No `maximumScale` and no `userScalable: false` — deliberately.
  //
  // Capping the scale emits `maximum-scale=1`, which stops pinch-zoom and
  // fails WCAG 2.1 SC 1.4.4 (Resize Text): a low-vision visitor relying on
  // screen magnification cannot enlarge the page at all.
  //
  // The usual motive for that cap is iOS Safari zooming the viewport when a
  // form field is focused. Safari only does that below a 16px font size, so
  // the fix belongs on the inputs, not on everyone's ability to zoom — the
  // contact form's fields are already `text-base` (16px) for exactly this
  // reason. Do not reintroduce a cap here to fix an input-zoom bug.
  viewportFit: 'cover',
  themeColor: '#FFFDF7',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `data-scroll-behavior="smooth"` is the Next.js 16 opt-in that restores the
    // old scroll override on navigation. globals.css sets `scroll-behavior:
    // smooth` on <html> for in-page anchors; without this attribute Next 16 no
    // longer neutralises it during route transitions, so /404 -> / would ease
    // instead of jumping. See the v16 upgrade guide, "Scroll Behavior Override".
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${display.variable} ${body.variable} ${label.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
