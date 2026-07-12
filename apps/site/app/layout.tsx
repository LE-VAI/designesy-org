import type { Metadata } from 'next';
import './globals.css';
import { CuelumeBinder } from './lib/cuelume-binder';

export const metadata: Metadata = {
  metadataBase: new URL('https://designesy.org'),
  title: {
    default: 'Designesy — Design intelligence infrastructure',
    template: '%s · Designesy',
  },
  description:
    'Design intelligence infrastructure for a humane creative civilization. Sources into principles, principles into contracts, contracts into tools, tools into better designed work.',
  openGraph: {
    title: 'Designesy — Design intelligence infrastructure',
    description:
      'Design intelligence infrastructure for a humane creative civilization. Sources into principles, principles into contracts, contracts into tools.',
    url: 'https://designesy.org',
    siteName: 'Designesy',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Designesy — Design intelligence infrastructure',
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
      <body>
        <CuelumeBinder />
        {children}
      </body>
    </html>
  );
}