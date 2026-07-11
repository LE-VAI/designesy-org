import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://designesy.org'),
  title: {
    default: 'Designesy',
    template: '%s · Designesy',
  },
  description:
    'Design intelligence infrastructure for a humane creative civilization. Sources into principles, principles into contracts, contracts into tools.',
  openGraph: {
    title: 'Designesy',
    description:
      'Design intelligence infrastructure for a humane creative civilization.',
    url: 'https://designesy.org',
    siteName: 'Designesy',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Designesy',
    description:
      'Design intelligence infrastructure for a humane creative civilization.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}