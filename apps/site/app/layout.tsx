import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { CuelumeBinder } from './lib/cuelume-binder';
import { BackButton } from './lib/back-button';
import { DefinitionCopyEnhancer } from './lib/definition-copy-enhancer';
import { FireworkBurst } from './lib/firework-burst';
import {
  SITE_BASE,
  SITE_DEFAULT_DESCRIPTION,
  SITE_NAME,
} from './lib/site-meta';
import {
  JsonLd,
  organizationJsonLd,
  websiteJsonLd,
} from './lib/json-ld';

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  // Canonical host is www — apex 308s. Social crawlers (especially X)
  // often fail image fetch when og/twitter image URLs redirect.
  metadataBase: new URL(SITE_BASE),
  title: {
    default: `${SITE_NAME} — Design intelligence infrastructure`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DEFAULT_DESCRIPTION,
  keywords: [
    'Designesy',
    'design intelligence infrastructure',
    'portable design judgment',
    'design system contract',
    'design review kit',
    'open design intelligence',
    'agent-ready design rules',
  ],
  alternates: {
    canonical: SITE_BASE,
    types: {
      'application/json': [
        { url: `${SITE_BASE}/open.json`, title: 'Open catalog' },
        {
          url: `${SITE_BASE}/.well-known/agent.json`,
          title: 'Agent discovery',
        },
      ],
      'text/plain': [
        { url: `${SITE_BASE}/llms.txt`, title: 'Agent brief' },
        { url: `${SITE_BASE}/llms-full.txt`, title: 'Full agent brief' },
      ],
    },
  },
  openGraph: {
    title: `${SITE_NAME} — Design intelligence infrastructure`,
    description:
      'Design intelligence infrastructure for a humane creative civilization. Sources into principles, principles into contracts, contracts into tools.',
    url: SITE_BASE,
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Design intelligence infrastructure`,
    description:
      'Design intelligence infrastructure for a humane creative civilization.',
  },
  manifest: '/manifest.webmanifest',
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
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        <CuelumeBinder />
        <BackButton />
        <DefinitionCopyEnhancer />
        <FireworkBurst />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
