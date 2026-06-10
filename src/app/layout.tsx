import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kaleb Kougl | Senior Software Engineer',
  description:
    'Front-End Platform engineer with 8+ years building scalable TypeScript/React web applications. Interactive IDE-themed portfolio.',
  openGraph: {
    title: 'Kaleb Kougl — IDE Portfolio',
    description:
      'Explore my engineering career through an interactive IDE interface with live 3D visualizations.',
    url: 'https://kalebkougl.dev',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    type: 'website',
  },
  metadataBase: new URL('https://kalebkougl.dev'),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#1e1e2e',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Preload the 3D model during HTML parsing — before JS hydration.
            as="fetch" + crossorigin matches how Three.js fetches GLBs (CORS fetch()),
            ensuring the browser reuses this preloaded response instead of fetching twice. */}
        <link
          rel="preload"
          href="/models/kbMii.glb"
          as="fetch"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
