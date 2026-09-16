import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Manrope, Space_Mono } from 'next/font/google';
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
    url: 'https://kalebkougl.dev',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Kaleb Kougl — Senior Software Engineer, San Francisco',
      },
    ],
    type: 'website',
  },
  metadataBase: new URL('https://kalebkougl.dev'),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
