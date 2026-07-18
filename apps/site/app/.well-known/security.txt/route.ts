export const dynamic = 'force-static';

/**
 * RFC 9116 security.txt for designesy.org
 */
export function GET() {
  // Expires ~1 year from ship (2026-07-12)
  const body = `Contact: mailto:hello@designesy.org
Preferred-Languages: en
Canonical: https://www.designesy.org/.well-known/security.txt
Expires: 2027-07-12T00:00:00.000Z
Policy: https://www.designesy.org/privacy
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
