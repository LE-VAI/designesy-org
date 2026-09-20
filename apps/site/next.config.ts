import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval' blob: https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

/** HTML pages advertise machine counterparts for agent crawlers. */
const agentLinkHeaders = {
  home: [
    {
      key: 'Link',
      value: [
        '<https://www.designesy.org/open.json>; rel="alternate"; type="application/json"; title="Open catalog"',
        '<https://www.designesy.org/llms.txt>; rel="describedby"; type="text/plain"; title="Agent brief"',
        '<https://www.designesy.org/.well-known/agent.json>; rel="describedby"; type="application/json"; title="Agent discovery"',
      ].join(', '),
    },
  ],
  open: [
    {
      key: 'Link',
      value: [
        '<https://www.designesy.org/open.json>; rel="alternate"; type="application/json"; title="Machine catalog"',
        '<https://www.designesy.org/llms.txt>; rel="describedby"; type="text/plain"; title="Agent brief"',
        '<https://www.designesy.org/llms-full.txt>; rel="describedby"; type="text/plain"; title="Full agent brief"',
        '<https://www.designesy.org/.well-known/agent.json>; rel="describedby"; type="application/json"; title="Agent discovery"',
      ].join(', '),
    },
  ],
  contract: [
    {
      key: 'Link',
      value: [
        '<https://www.designesy.org/contracts/design-system.json>; rel="alternate"; type="application/json"; title="Machine contract"',
        '<https://www.designesy.org/open.json>; rel="collection"; type="application/json"; title="Open catalog"',
      ].join(', '),
    },
  ],
  kit: [
    {
      key: 'Link',
      value: [
        '<https://www.designesy.org/kits/design-review.json>; rel="alternate"; type="application/json"; title="Machine kit"',
        '<https://www.designesy.org/open.json>; rel="collection"; type="application/json"; title="Open catalog"',
      ].join(', '),
    },
  ],
};

/**
 * Routes that have a build-generated markdown variant, and therefore
 * participate in content negotiation.
 *
 * ONE definition shared by rewrites() and headers(). Two copies would drift,
 * and a route listed in one but not the other fails in the quietest possible
 * way: the rewrite serves markdown with no Vary, so a CDN can hand a cached
 * markdown body to a browser.
 */
const MARKDOWN_ROUTES = [
  'index',
  'docs', 'methodology', 'kits', 'open', 'benchmarks', 'leaderboard',
  'contracts',
  'contracts/design-system', 'contracts/a11y', 'contracts/motion',
  'contracts/drift', 'contracts/readiness', 'contracts/guardrails',
  'contracts/monitor', 'contracts/report', 'contracts/compare',
  'contracts/tokens', 'labs/poise', 'labs/takt', 'labs/cadence',
  'labs/acoustics',
];

// 'index' is the homepage. Its route KEY is the filename Next emits
// (index.html), but its public path is the site root, and those two differ in a
// way that breaks things silently if conflated:
//   - '/' + 'index'  is /index, which 308-redirects to / -- a rewrite from
//     there would never be reached.
//   - naively appending '.md' to the root URL yields https://www.designesy.org.md
// Both helpers exist so the rewrite, the Vary rule and the noindex rule all
// resolve the homepage the same way instead of each special-casing it.
const markdownPublicPath = (route: string) => (route === 'index' ? '/' : '/' + route);
const markdownFilePath = (route: string) => (route === 'index' ? '/index.md' : '/' + route + '.md');

const nextConfig: NextConfig = {
  // @sparticuz/chromium ships a prebuilt binary under bin/ and a WASM blob
  // under bin/. Next's server bundler (esbuild/webpack) relocates node_modules
  // and drops these assets, producing "input directory .../bin does not exist"
  // at Lambda runtime. Externalizing both packages keeps them on disk as-is.
  // playwright-core is the Lambda-safe driver (no bundled browser download).
  // @google/design.md resolves its subpath export (@google/design.md/linter)
  // through package-relative paths — Next's bundler inlines build-machine
  // absolute paths (/vercel/path0/...) into the server bundle and the
  // dynamic import in /api/score v37 ENOENTs at Lambda runtime.
  // Externalizing keeps the package on disk, path-resolved at runtime.
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core', '@google/design.md'],
  // Force Vercel's Node File Trace to include the @sparticuz/chromium
  // brotli-compressed binaries in the Lambda zip. Without this, NFT misses
  // the .br files (they're loaded dynamically at runtime, not statically
  // imported), and the /var/task/.../bin directory is empty at runtime.
  // @google/design.md is dynamically imported by /api/score (v37 spec-layer
  // check) — NFT misses it for the same reason, so include it explicitly.
  outputFileTracingIncludes: {
    '/api/score/audit': [
      './node_modules/@sparticuz/chromium/bin/**/*',
      './node_modules/@sparticuz/chromium/build/**/*',
    ],
    '/api/score': [
      './node_modules/@google/design.md/**/*',
    ],
  },
  // Content negotiation: serve the build-generated markdown when a client asks
  // for it. A STATIC FILE SWAP, not the runtime self-fetch pattern a Next.js
  // collaborator calls "your very last resort" — the rewrite points at a file the
  // build already wrote, so there is no second round trip.
  //
  // Only Claude Code, Cursor and OpenCode negotiate (Cloudflare measured content
  // negotiation passing on 3.9% of sites), which is why the .md suffix route
  // exists alongside this rather than instead of it.
  //
  // NOTE beforeFiles, not a bare array. A plain array is treated as `afterFiles`,
  // which runs AFTER static routes. Every one of these pages is statically
  // prerendered, so the static HTML wins and the rewrite never fires — verified:
  // with a bare array an `Accept: text/markdown` request returned 89KB of HTML.
  // beforeFiles runs first, which is the only position where a rewrite can win
  // against a prerendered page.
  async rewrites() {
    return {
      beforeFiles: MARKDOWN_ROUTES.map((route) => ({
        source: markdownPublicPath(route),
        has: [{ type: 'header' as const, key: 'accept', value: '.*text/markdown.*' }],
        destination: markdownFilePath(route),
      })),
      afterFiles: [],
      fallback: [],
    };
  },

  async headers() {
    return [
      // Vary: Accept on the negotiated routes ONLY.
      //
      // Mandatory, not decorative: without it a CDN can serve a cached HTML body
      // to an agent that asked for markdown, or the reverse — the one way content
      // negotiation fails in production. It also carries real infrastructure cost
      // rather than being free: Akamai refuses to cache any Vary response except
      // Accept-Encoding, and CloudFront needs an explicit cache policy listing
      // Accept.
      //
      // Scoped to MARKDOWN_ROUTES deliberately. A blanket '/:path*' would put
      // Vary on every route and deoptimise CDN caching site-wide to serve a
      // negotiation only twenty routes implement.
      ...MARKDOWN_ROUTES.map((route) => ({
        source: markdownPublicPath(route),
        headers: [{ key: 'Vary', value: 'Accept, Accept-Encoding' }],
      })),
      // noindex on the markdown REPRESENTATION only.
      //
      // The markdown is a machine projection of a page that is already
      // indexed. Letting both into the index means a search result can point
      // at a stripped-down text file instead of the page. Mintlify ships the
      // same guard.
      //
      // IMPORTANT: this must be conditional on the Accept header, NOT on the
      // path. A plain rule on '/docs' would stamp noindex on the HTML too and
      // deindex the actual page -- the exact opposite of the intent. Next's
      // `has` matcher is what makes the distinction possible.
      ...MARKDOWN_ROUTES.map((route) => ({
        source: markdownPublicPath(route),
        has: [{ type: 'header' as const, key: 'accept', value: '.*text/markdown.*' }],
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      })),
      // And the .md suffix route: same guard, matched by path because that
      // route has no Accept condition to key on.
      {
        source: '/:path*.md',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/',
        headers: agentLinkHeaders.home,
      },
      {
        source: '/open',
        headers: agentLinkHeaders.open,
      },
      {
        source: '/contracts/design-system',
        headers: agentLinkHeaders.contract,
      },
      {
        source: '/kits/design-review',
        headers: agentLinkHeaders.kit,
      },
    ];
  },

  async redirects() {
    return [
      {
        source: '/index',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
