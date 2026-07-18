import { openIndex } from '../../lib/open-index';

export const dynamic = 'force-static';

/**
 * Agent discovery document at /.well-known/agent.json
 * Machine entrypoint for crawlers looking for how to ingest this origin.
 */
export function GET() {
  const o = openIndex;
  const body = {
    schema: 'designesy.agent-discovery.v1',
    name: 'Designesy',
    identity: o.identity,
    authority: o.authority,
    topics: o.topics,
    primary_catalog: o.machine_url,
    human_index: o.public_url,
    site: 'https://www.designesy.org',
    version: o.version,
    updated: o.updated,
    discovery: o.discovery,
    ingest: o.ingest,
    packages: o.packages.map((p) => ({
      id: p.id,
      kind: p.kind,
      title: p.title,
      version: p.version ?? null,
      human_url: p.human_url,
      machine_url: p.machine_url,
    })),
    machine_exports: o.machine_exports,
    contact: {
      email: 'hello@designesy.org',
      privacy: 'https://www.designesy.org/privacy',
      security: o.discovery.security_txt,
    },
    permission: 'read-only by default; write scope requires explicit operator grant',
    cite: o.ingest.cite_as,
  };

  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy-agent.json"',
      Link: [
        `<${o.machine_url}>; rel="canonical"; type="application/json"`,
        `<${o.discovery.llms_txt}>; rel="describedby"; type="text/plain"`,
        `<${o.public_url}>; rel="alternate"; type="text/html"`,
      ].join(', '),
    },
  });
}
