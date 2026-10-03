// /specs: the Design Review Findings schema, documented from the schema itself
// (lib/review-findings-schema, the object /specs/review-findings.json serves),
// so the field tables here cannot drift from what the route publishes.

import type { Metadata } from 'next';
import Link from 'next/link';
import '../instrument.css';
import '../engine.css';
import '../data.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { AgentActions } from '../lib/agent-actions';
import { EngineHead, EngineNext } from '../lib/engine/engine-page';
import { display } from '../lib/engine/types';
import { REVIEW_FINDINGS_SCHEMA as SCHEMA } from '../lib/review-findings-schema';
import { DataTable } from '../lib/data/figure';

export const metadata: Metadata = pageMeta({
  title: 'Specs',
  description:
    'Designesy Specs: the canonical format for design verification findings. One JSON schema that any verification tool can populate. Agents consuming findings from multiple verifiers need a common schema.',
  path: '/specs',
  ogDescription:
    'The canonical review-findings schema. Designesy, Google design.md, Lighthouse, and jakubkrehel/skills all map into it.',
  twitterDescription:
    'Design verification findings schema · designesy.org/specs',
});

type Prop = { type?: string | string[]; description?: string; enum?: readonly string[]; const?: string };

const typeOf = (p: Prop) => (p.const ? `"${p.const}"` : Array.isArray(p.type) ? p.type.join(' | ') : p.type ?? 'any');
const descOf = (p: Prop) =>
  `${display(p.description ?? '')}${p.enum ? `${p.description ? ' ' : ''}One of: ${p.enum.join(', ')}.` : ''}`.trim() || 'No description';

const TOP = Object.entries(SCHEMA.properties as Record<string, Prop>);
const REQUIRED = new Set<string>(SCHEMA.required as string[]);
const FINDING = Object.entries((SCHEMA.$defs.finding as { properties: Record<string, Prop> }).properties);
const FINDING_REQUIRED = new Set<string>(((SCHEMA.$defs.finding as { required?: string[] }).required ?? []) as string[]);

const FORMATS = [
  { format: 'designesy', type: 'application/json', desc: 'The native shape: score, grade, checks and categoryScores. The default.' },
  { format: 'canonical', type: 'application/json', desc: 'This schema in full, every field. The source of truth the others project from.' },
  { format: 'review', type: 'text/markdown', desc: 'A report in the better-interface style: scope, a findings table, the verdict.' },
  { format: 'google', type: 'application/json', desc: 'The @google/design.md shape: findings, summary and designSystem.' },
];

const SEVERITY = [
  ['designesy', 'PASS', 'pass'],
  ['designesy', 'FAIL', 'error'],
  ['designesy', 'WARN', 'warning'],
  ['designesy', 'SKIP', 'skip'],
  ['Google design.md', 'error', 'error'],
  ['Google design.md', 'warning', 'warning'],
  ['Google design.md', 'info', 'info'],
  ['jakubkrehel', 'HIGH', 'high'],
  ['jakubkrehel', 'MEDIUM', 'medium'],
  ['jakubkrehel', 'LOW', 'low'],
  ['Lighthouse', 'score = 0, binary', 'fail'],
  ['Lighthouse', 'score = 1, binary', 'pass'],
  ['Lighthouse', 'informative', 'informative'],
  ['Lighthouse', 'notApplicable', 'notApplicable'],
];

const WHY = [
  { t: 'One shape to aggregate', d: 'Agents reading findings from several verifiers need one schema to combine, compare and act on them.' },
  { t: 'The union of the tools', d: 'Lighthouse, axe, Google design.md and designesy each emit their own JSON; this schema holds all of it.' },
  { t: 'Nothing lost', d: 'The raw field keeps each tool’s native output, for a lossless round trip where the canonical shape drops detail.' },
  { t: 'Routed by source', d: 'The tool field lets a consumer route: designesy for contract conformance, Lighthouse for performance, axe for accessibility.' },
  { t: 'One verdict for CI', d: 'The verdict field gives a gate one answer: pass, fail, block or needs-changes.' },
  { t: 'One severity vocabulary', d: 'Severity is normalised across tools, so an agent can triage everything with one scale.' },
];

const CURL = `curl -X POST https://www.designesy.org/api/score \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://www.designesy.org/","format":"canonical"}'`;

export default function SpecsPage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg dx">
        <EngineHead
          route="/specs"
          name="Specs"
          thesis="One JSON format for design-verification findings, which any tool can fill in. Designesy, Google design.md, Lighthouse and jakubkrehel/skills all map into it."
          facts={[`schema v${String((SCHEMA.properties as Record<string, Prop>).schemaVersion.const)}`, `${TOP.length} top-level fields`, `${FINDING.length} finding fields`]}
          contract={{ href: '/specs/review-findings.json', label: 'the JSON Schema' }}
        >
          <div className="dx-actions">
            <Link className="button primary" href="/specs/review-findings.json" data-cuelume-press>
              JSON Schema
            </Link>
            <Link className="button ghost" href="/methodology" data-cuelume-press>
              Methodology
            </Link>
          </div>
          <AgentActions mdPath="/specs.md" label="the specs page" />
        </EngineHead>

        <section className="eg-section" aria-labelledby="sp-why-h">
          <h2 className="eg-h2" id="sp-why-h">
            Why one format
          </h2>
          <dl className="dx-defs">
            {WHY.map((w) => (
              <div key={w.t}>
                <dt>{w.t}</dt>
                <dd>{w.d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="eg-section" aria-labelledby="sp-formats-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="sp-formats-h">
                Emission formats
              </h2>
              <p className="eg-section-sub">POST /api/score with a format field</p>
            </div>
          </div>
          <p className="dx-lead">
            The canonical JSON is the source of truth; the other formats are projections of it that drop some detail.
          </p>
          <div className="dx-table-box">
            <DataTable
              caption="The four emission formats of /api/score."
              head={['Format', 'Content type', 'What it is']}
              cols={[3, 2]}
              stack="fields"
              rows={FORMATS.map((f) => [<code key="f">{f.format}</code>, <code key="t">{f.type}</code>, f.desc])}
            />
          </div>
        </section>

        <section className="eg-section" aria-labelledby="sp-top-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="sp-top-h">
                Top-level fields
              </h2>
              <p className="eg-section-sub">
                {TOP.length} fields · {REQUIRED.size} required · read from the schema itself
              </p>
            </div>
          </div>
          <div className="dx-table-box">
            <DataTable
              caption="Top-level fields of the Design Review Findings schema."
              head={['Field', 'Type', 'Required', 'What it holds']}
              opt={[2]}
              cols={[3, 2, 1]}
              stack="fields"
              rows={TOP.map(([k, p]) => [<code key="k">{k}</code>, <code key="t">{typeOf(p)}</code>, REQUIRED.has(k) ? 'yes' : '', descOf(p)])}
            />
          </div>
        </section>

        <section className="eg-section" aria-labelledby="sp-finding-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="sp-finding-h">
                The finding object
              </h2>
              <p className="eg-section-sub">
                {FINDING.length} fields{FINDING_REQUIRED.size ? ` · ${FINDING_REQUIRED.size} required` : ''} · each tool fills the ones it has
              </p>
            </div>
          </div>
          <p className="dx-lead">
            Each entry in <code>findings</code> is one of these. A field a tool does not produce is left out, never set to null.
          </p>
          <div className="dx-table-box">
            <DataTable
              caption="Fields of a finding object."
              head={['Field', 'Type', 'What it holds']}
              cols={[3, 2]}
              stack="fields"
              rows={FINDING.map(([k, p]) => [<code key="k">{k}</code>, <code key="t">{typeOf(p)}</code>, descOf(p)])}
            />
          </div>
        </section>

        <section className="eg-section" aria-labelledby="sp-sev-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="sp-sev-h">
                Severity, normalised
              </h2>
              <p className="eg-section-sub">the native token is kept in severityRaw</p>
            </div>
          </div>
          <div className="dx-table-box">
            <DataTable
              caption="Each tool's native severity and its canonical form."
              head={['Tool', 'Native', 'Canonical']}
              cols={[3, 2]}
              rows={SEVERITY.map(([t, n, c]) => [t, <code key="n">{n}</code>, <code key="c">{c}</code>])}
            />
          </div>
        </section>

        <section className="eg-section" aria-labelledby="sp-use-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="sp-use-h">
                Usage
              </h2>
              <p className="eg-section-sub">POST /api/score · url, format</p>
            </div>
          </div>
          <p className="dx-lead">
            Send <code>url</code> and, optionally, <code>format</code>. The default is <code>designesy</code>; use{' '}
            <code>canonical</code> for the full schema, <code>review</code> for markdown, <code>google</code> for the design.md
            shape.
          </p>
          <div className="dx-formula-box">
            <pre className="dx-formula">{CURL}</pre>
          </div>
        </section>

        <EngineNext
          items={[
            { title: 'Score a site', desc: 'Run the engine on any URL and read its findings in any of the four formats.', route: '/score' },
            { title: 'The methodology', desc: 'How each finding is decided, and how the score is made from them.', route: '/methodology' },
            { title: 'Benchmarks', desc: 'designesy beside hallmark and slop-eval, and the wider field.', route: '/benchmarks' },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
