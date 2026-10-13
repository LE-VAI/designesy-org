import type { Metadata, Viewport } from 'next';
import { Fraunces, Schibsted_Grotesk, Atkinson_Hyperlegible_Mono } from 'next/font/google';
import { SiteAnalytics } from './lib/site-analytics';
import { CriticalCss } from './lib/critical-css';
import { CuelumeBinder } from './lib/cuelume-binder';
import { BackButton } from './lib/back-button';
import { DirectorDock } from './lib/director-dock';
import { DefinitionCopyEnhancer } from './lib/definition-copy-enhancer';
import { EffectEnhancer } from './lib/effect-enhancer';
import { ScrambleEnhancer } from './lib/scramble-enhancer';
import { ScrollDepth } from './lib/scroll-depth';
import { ScrollRegions } from './lib/scroll-regions';
import { FlameFlipShortcut } from './lib/flame-flip';

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
  match, which keeps the swap from moving layout. Fraunces is the exception: its
  generated fallback was sized for the default optical size, not the opsz-80
  titles, so it is off here and 'Fraunces Fallback Tuned' (globals.css, top)
  takes its place.

  `variable` exposes each face as a CSS custom property that the tokens in
  globals.css reference — the token layer stays the single source of truth and
  no component CSS has to change.
*/
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  axes: ['SOFT', 'WONK', 'opsz'],
  adjustFontFallback: false,
  fallback: ['Fraunces Fallback Tuned', 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', 'serif'],
});

/*
  Body/UI face. Schibsted Grotesk replaced Geist on 2026-09-16.

  Why: the scoring engine's anti-slop rule S1 flags `geist` as an overused family
  (it is Vercel's house face and the most-copied sans of the last two years), and
  it was the only deduction separating the site from a clean score. Beyond the
  points, the substance is that Geist had begun signalling "built on Vercel" more
  than it signalled designesy independently.

  Schibsted Grotesk was chosen over the other candidates for one reason above the
  rest: it was commissioned by a media group, so it is drawn for sustained reading
  rather than interface chrome. That makes it the only candidate sharing Fraunces's
  editorial instinct — the pairing reads as one system rather than a serif headline
  bolted to a product sans. It also measured closest to Geist's line length
  (438 vs 430 units on the same probe at 17px), so the page's existing density,
  measure caps (45-75ch), and line counts do not shift.

  Weight range note: Schibsted Grotesk ships 400-900, not 100-900. The site uses
  400/500/600/700/800 at body sizes (measured: 164x400, 9x500, 12x600, 23x700,
  4x800), so every weight in use is covered. If a lighter weight is ever needed
  below 400, Archivo covers 100-900 and is the documented alternative.
*/
const schibsted = Schibsted_Grotesk({
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

/*
  Mono face for labels, URLs, timestamps, score units and code. Atkinson
  Hyperlegible Mono replaced Geist Mono on 2026-10-12 (brand ledger D65).

  Why: it is the Braille Institute's low-vision face (SIL OFL 1.1). Every
  confusable pair (0/O, 1/l/I, 5/S, 8/B) is drawn distinct, and the site's mono
  text is exactly the text a reader cannot guess from context: hosts, check
  IDs, scores, dates and token names. That fits "Inclusion is structural"
  better than a mono picked for looks.

  Cost, measured from the font files: the advance is 0.632em (Geist Mono 0.6em),
  so a mono run is 5.3% wider; the x-height is 0.496em (Geist Mono 0.53em), so
  lower case reads a little smaller at one size. The tight surfaces were
  re-fitted for the width.

  Weights: one variable file, 200 to 800 (the site uses 400 to 700).
  next/font has no metrics for this family, so it generates no adjusted
  fallback; the first two fallbacks are local monos sized to Atkinson's
  advance and line metrics in globals.css (top), so the swap keeps widths.
*/
const atkinsonMono = Atkinson_Hyperlegible_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  fallback: [
    'Mono Cascadia Fallback',
    'Mono Consolas Fallback',
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
  LISTING_LINE,
  SITE_BASE,
  SITE_DEFAULT_DESCRIPTION,
  SITE_NAME,
} from './lib/site-meta';
import {
  JsonLd,
  organizationJsonLd,
  websiteJsonLd,
} from './lib/json-ld';

/* globals.css, without blocking first paint (production).

   As a plain import here, globals.css became a render-blocking <link> on every
   route, and it was the last blocking response to land: about 255 KB, 47 KB on
   the wire. In production it is now built by scripts/build-critical-css.mjs
   (before `next build`, the same pipeline Next uses) into
   public/_css/globals.<hash>.css. <CriticalCss/> inlines the rules the pages
   use, and globalsLoader below fetches the whole sheet without blocking paint:
   a script-inserted stylesheet is not render-blocking, and media="print" keeps
   it from applying (and from blocking, in every engine) until it has loaded,
   when it switches to "all". A print sheet is fetched at the lowest priority,
   behind every script; fetchPriority "high" brings it in sooner without
   delaying the fonts, which shortens the time an element the subset misses
   (one that appears only on interaction) could show unstyled. It is inserted right after the inline subset, so
   it sits where globals.css always sat in the cascade: before next/font's sheet
   and every route sheet. Without JavaScript the <noscript> link loads it; that
   link, and the subset, then sit after the route sheets (nothing can move them),
   so for a visitor without JavaScript a global rule can win a tie of equal
   specificity that a route rule used to win.

   Development keeps the import, for Fast Refresh: `process.env.NODE_ENV` is a
   build-time constant, so a production build never sees this require. */
if (process.env.NODE_ENV !== 'production') require('./globals.css');
const globalsHref: string | null =
  process.env.NODE_ENV === 'production' ? require('./lib/critical-css.generated.json').href : null;
// The loader also MOVES the inline subset. React writes a precedence's
// stylesheets before its inline styles, so the server puts <CriticalCss/> after
// next/font's sheet and every route sheet; there, a global rule would beat a
// route rule of equal specificity, which it never did. This inline script runs
// after those sheets load (a parser-inserted script waits for the stylesheets
// before it) and before the first paint (which waits for the same sheets), and
// puts the subset back where globals.css sat: before the first of them.
const globalsLoader = globalsHref
  ? `(function(){var d=document,h=d.head,s=d.querySelector('style[data-href~="globals-critical"]'),f=h.querySelector('link[rel="stylesheet"][data-precedence],style[data-precedence]');if(s&&f&&f!==s)h.insertBefore(s,f);if(d.querySelector('link[data-globals-css]'))return;var l=d.createElement('link');l.rel='stylesheet';l.href=${JSON.stringify(globalsHref)};l.media='print';l.fetchPriority='high';l.setAttribute('data-globals-css','');l.onload=function(){l.media='all'};if(s&&s.parentNode){s.parentNode.insertBefore(l,s.nextSibling)}else{h.insertBefore(l,f||h.firstChild)}})();`
  : null;

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
    default: `${SITE_NAME} · Design intelligence infrastructure`,
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
    title: `${SITE_NAME} · Design intelligence infrastructure`,
    description: LISTING_LINE,
    url: SITE_BASE,
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} · Design intelligence infrastructure`,
    description: LISTING_LINE,
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
      className={`${fraunces.variable} ${schibsted.variable} ${atkinsonMono.variable}`}
    >
      <head>
        <CriticalCss />
        {globalsLoader && globalsHref && (
          <>
            <script dangerouslySetInnerHTML={{ __html: globalsLoader }} />
            <noscript
              dangerouslySetInnerHTML={{ __html: `<link rel="stylesheet" href="${globalsHref}">` }}
            />
          </>
        )}
        {/* Set js-ready before CSS paints so [data-reveal] hidden state
            only applies when JS is active — prevents invisible content
            during hydration gap. */}
        <script
          dangerouslySetInnerHTML={{
            // Also restores the visitor's motion toggle before paint, so a
            // paused visitor never sees a frame of motion (lib/motion-toggle).
            __html:
              'document.documentElement.classList.add("js-ready");try{if(localStorage.getItem("motion")==="paused")document.documentElement.dataset.motion="paused"}catch(e){}',
          }}
        />
        {/* Theme detection — stamps data-theme before first paint (no FOUC),
            keeps the RSC render path free of dynamic APIs so ISR can cache. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        <CuelumeBinder />
        <DefinitionCopyEnhancer />
        <EffectEnhancer />
        <ScrambleEnhancer />
        <ScrollDepth />
        <ScrollRegions />
        {/* Ctrl+I flips the page to the flame (brand D69): one keydown
            listener; the flip itself loads on the first press. */}
        <FlameFlipShortcut />
        {/* Ambient signal wash — fixed full-viewport gradient layer, sits
            behind all content (z-index 0 with grid + noise). Pure CSS, no
            JS. Replaces the old hero-bounded mesh that showed a cutoff at
            extreme zoom-out. aria-hidden: decorative only. */}
        <div className="ambient-signal" aria-hidden="true" />
        {/* The ambient particle field and the click fireworks were removed in
            the 2026-09-27 level-up: drifting dots and confetti are the stock
            "AI site" look this contract exists to flag (DESIGN.md: no glowing
            blobs, no AI sparkles), and the dots floated over body text. Motion
            now lives only in instruments that show the product working. */}
        {children}
        {/* The floating pills (Back, Ask the Studio) are position: fixed, so
            their place here is invisible, but it is their place in the Tab
            order. Rendered before the page they took the first two stops,
            ahead of "Skip to content"; after it, the skip link leads and the
            pills come last, where a floating control belongs. */}
        <BackButton />
        <DirectorDock />
        {/* Analytics and Speed Insights never receive a query string or
            fragment: /score?url=… would otherwise send the address a visitor
            scored (lib/analytics-url.ts). */}
        <SiteAnalytics />
      </body>
    </html>
  );
}
