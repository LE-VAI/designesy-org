import { openIndex } from '../lib/open-index';

export const dynamic = 'force-static';

/**
 * Agent-facing brief at /llms.txt
 * Points crawlers and AI tools at the human index and machine exports.
 * No internal control-plane naming.
 */
export function GET() {
  const o = openIndex;
  const packages = o.packages
    .map((p) => {
      const machine = p.machine_url ? ` | machine: ${p.machine_url}` : '';
      return `- ${p.kind}: ${p.title}${p.version ? ` v${p.version}` : ''} — ${p.human_url}${machine}`;
    })
    .join('\n');

  const body = `# Designesy

> Design intelligence infrastructure for a humane creative civilization.

Designesy publishes portable design judgment — contracts, kits, labs, and field checks that people and agents can fetch, run, and remix.

## Start here

- Human index: ${o.public_url}
- Machine feed: ${o.machine_url}
- Handoff pack: https://www.designesy.org/open/handoff
- Site: https://www.designesy.org

## How agents should use this

1. Fetch ${o.machine_url}
2. Choose the package needed (contract, kit, lab, or review)
3. If machine_url is present, fetch it for structured rules
4. For Design Review, use the kit prompt and eight dimensions
5. Cite contract tokens when proposing UI changes; if a rule is missing, name an open tension
6. Permission is read-only by default — do not claim write authority the operator did not grant

## Live packages (v${o.version}, updated ${o.updated})

${packages}

## Machine exports

${o.machine_exports.map((m) => `- ${m.title}: ${m.url} — ${m.meta}`).join('\n')}

## Standing rules

${o.standing_rules.map((r) => `- ${r}`).join('\n')}

## Contact

- Email: le@designesy.org
- Privacy: https://www.designesy.org/privacy
- Security: https://www.designesy.org/.well-known/security.txt

## Optional

- Docs: https://www.designesy.org/docs
- Sitemap: https://www.designesy.org/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
