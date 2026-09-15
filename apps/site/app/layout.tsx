import type { Metadata, Viewport } from 'next';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { CuelumeBinder } from './lib/cuelume-binder';
import { BackButton } from './lib/back-button';
import { DirectorDock } from './lib/director-dock';
import { DefinitionCopyEnhancer } from './lib/definition-copy-enhancer';
import { AmbientParticles } from './lib/ambient-particles';
import { FireworkBurst } from './lib/firework-burst';
import { EffectEnhancer } from './lib/effect-enhancer';
import { ScrambleEnhancer } from './lib/scramble-enhancer';
import { ScrollDepth } from './lib/scroll-depth';

/*
  Brand faces — self-hosted at build time by next/font.

  These were previously DECLARED in globals.css (--sans: 'Geist Variable',
  --display: 'Fraunces Variable') but never actually delivered: no @font-face
  rule was served, no font file existed in the repo, next/font was unused, and
  neither face is installed on a typical machine. Every visitor therefore read
  the site in whatever system serif/sans their OS provided — Times New Roman on
  Windows, Iowan Old Style or Palatino on macOS — so the brand typography was
  neither what was intended nor consistent between visitors.

  next/font/google downloads the files at BUILD time and serves them from our
  own origin, so there is no runtime request to Google, no third-party origin
  added to the CSP, and no shift on a slow connection.

  display:'swap' shows the fallback immediately and swaps when the real face
  arrives, so text is never invisible. The `fallback` arrays mirror the previous
  stacks exactly, and adjustFontFallback (on by default) sizes the fallback to
  match, which keeps the swap from moving layout.

  `variable` exposes each face as a CSS custom property that the tokens in
  globals.css reference — the token layer stays the single source of truth and
  no component CSS has to change.
*/
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  axes: ['SOFT', 'WONK', 'opsz'],
  fallback: ['Iowan Old Style', 'Palatino Linotype', 'Times New Roman', 'serif'],
});

const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  fallback: [
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Arial',
    'Helvetica',
    'sans-serif',
  ],
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  fallback: [
    'ui-monospace',
    'SF Mono',
    'Cascadia Code',
    'Source Code Pro',
    'Menlo',
    'Consolas',
    'monospace',
  ],
});
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

/* Theme detection — inline blocking script that runs before first paint.
   Reads cookie → localStorage → matchMedia. Only runs when no data-theme
   has been stamped server-side (first visit / cleared cookies). After the
   cookie exists, the server stamp renders the right theme from byte one. */
const themeScript = `(function(){try{var d=document.documentElement;if(d.hasAttribute('data-theme'))return;var m=document.cookie.match(/(?:^|;\\s*)theme=(light|dark)/);var s=null;try{s=localStorage.getItem('theme')}catch(e){}var v=m?m[1]:(s||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));if(v==='system'){v='dark'}d.setAttribute('data-theme',v);}catch(e){}})();`

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#010102' },
    { media: '(prefers-color-scheme: light)', color: '#fbfbfc' },
  ],
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
  // NOTE: no cookies()/headers() here. Reading the theme cookie in the RSC
  // render path forces the WHOLE layout (and every page under it) to dynamic,
  // `Cache-Control: private, no-store` — defeating ISR (Next.js #82571). The
  // theme is stamped client-side by the inline script below (cookie →
  // localStorage → prefers-color-scheme), which runs before first paint → no
  // FOUC AND identical server HTML for every user → page can be ISR-cached.
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${geist.variable} ${geistMono.variable}`}
    >
      <head>
        {/* Set js-ready before CSS paints so [data-reveal] hidden state
            only applies when JS is active — prevents invisible content
            during hydration gap. */}
        <script
          dangerouslySetInnerHTML={{
            __html: 'document.documentElement.classList.add("js-ready");',
          }}
        />
        {/* Theme detection — stamps data-theme before first paint (no FOUC),
            keeps the RSC render path free of dynamic APIs so ISR can cache. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        <CuelumeBinder />
        <BackButton />
        <DirectorDock />
        <DefinitionCopyEnhancer />
        <FireworkBurst />
        <EffectEnhancer />
        <ScrambleEnhancer />
        <ScrollDepth />
        {/* Ambient signal wash — fixed full-viewport gradient layer, sits
            behind all content (z-index 0 with grid + noise). Pure CSS, no
            JS. Replaces the old hero-bounded mesh that showed a cutoff at
            extreme zoom-out. aria-hidden: decorative only. */}
        <div className="ambient-signal" aria-hidden="true" />
        {/* Ambient particle field — fixed full-viewport canvas at z-index 0.
            ~450 signal-blue dots drift via Perlin noise and pull toward the
            cursor. Reads CSS-var palette + watches data-theme to swap with
            night/day. Sits behind all content (z-1), above body paper. */}
        <AmbientParticles />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
