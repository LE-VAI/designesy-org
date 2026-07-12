import { openIndex } from '../lib/open-index';

export const dynamic = 'force-static';

/**
 * Machine catalog root. Preferred agent ingest for Designesy open cargo.
 * Headers advertise related discovery surfaces for crawlers that honor Link.
 */
export function GET() {
  const o = openIndex;
  return Response.json(o, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': `inline; filename="designesy-open-v${o.version}.json"`,
      'X-Designesy-Authority': o.authority.role,
      'X-Designesy-Ingest-Protocol': o.ingest.protocol,
      Link: [
        `<${o.public_url}>; rel="alternate"; type="text/html"; title="Human index"`,
        `<${o.discovery.llms_txt}>; rel="describedby"; type="text/plain"; title="Agent brief"`,
        `<${o.discovery.llms_full_txt}>; rel="describedby"; type="text/plain"; title="Full agent brief"`,
        `<${o.discovery.agent_json}>; rel="describedby"; type="application/json"; title="Agent discovery"`,
        ...o.machine_exports.map(
          (m) => `<${m.url}>; rel="item"; type="application/json"; title="${m.title}"`,
        ),
      ].join(', '),
    },
  });
}
