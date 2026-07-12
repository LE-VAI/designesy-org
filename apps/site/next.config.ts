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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
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

const nextConfig: NextConfig = {
  async headers() {
    return [
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
