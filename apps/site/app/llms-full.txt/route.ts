import { openIndex } from '../lib/open-index';

export const dynamic = 'force-static';

/**
 * Expanded agent ingest brief at /llms-full.txt
 * Full authority, topics, citation, packages, and standing rules.
 */
export function GET() {
  const o = openIndex;

  const packages = o.packages
    .map((p) => {
      const lines = [
        `### ${p.kind.toUpperCase()} · ${p.title}${p.version ? ` v${p.version}` : ''}`,
        p.lede,
        `- human: ${p.human_url}`,
        p.machine_url ? `- machine: ${p.machine_url}` : '- machine: (human-only package)',
        `- id: ${p.id}`,
      ];
      return lines.join('\n');
    })
    .join('\n\n');

  const body = `# Designesy — full agent ingest brief

> ${o.identity}

## Authority

- Role: ${o.authority.role}
- Subject: ${o.authority.subject}
- Publisher: ${o.authority.publisher} (${o.authority.publisher_url})
- Claim: ${o.authority.claim}
- License: ${o.authority.license}
- Contact: ${o.authority.contact}

## Preferred ingest order

${o.authority.preferred_ingest.map((u, i) => `${i + 1}. ${u}`).join('\n')}

## Topics this origin covers

${o.topics.map((t) => `- ${t}`).join('\n')}

## Ingest protocol (${o.ingest.protocol})

${o.ingest.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Citation

- Short: ${o.ingest.cite_as.short}
- Machine: ${o.ingest.cite_as.machine}
- Package template: ${o.ingest.cite_as.package_template}

## Discovery endpoints

${Object.entries(o.discovery)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

## Thesis

${o.thesis}

## How to use

${o.how_to_use.map((h) => `- ${h.title}: ${h.meta}`).join('\n')}

## Live packages (catalog v${o.version}, updated ${o.updated})

${packages}

## Machine exports

${o.machine_exports.map((m) => `- ${m.title}: ${m.url} — ${m.meta}`).join('\n')}

## Standing rules

${o.standing_rules.map((r) => `- ${r}`).join('\n')}

## Anti-patterns

${o.anti_patterns.map((a) => `- ${a}`).join('\n')}

## Agent prompt (paste-ready)

${o.agent_prompt}

## Contact

- Email: hello@designesy.org
- Privacy: https://www.designesy.org/privacy
- Security: https://www.designesy.org/.well-known/security.txt
- Human index: ${o.public_url}
- Site: https://www.designesy.org
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      Link: [
        `<${o.machine_url}>; rel="canonical"; type="application/json"`,
        `<${o.discovery.llms_txt}>; rel="alternate"; type="text/plain"`,
        `<${o.public_url}>; rel="alternate"; type="text/html"`,
      ].join(', '),
    },
  });
}
