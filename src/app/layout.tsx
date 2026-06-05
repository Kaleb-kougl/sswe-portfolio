import type { Metadata } from 'next';
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
    url: 'https://your-domain.com', // Replace before deployment
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    type: 'website',
  },
  metadataBase: new URL('https://your-domain.com'), // Replace before deployment
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
      <body>{children}</body>
    </html>
  );
}
