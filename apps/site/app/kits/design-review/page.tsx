import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { designReviewKit as k } from '../../lib/kits/design-review';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { CopyPrompt } from '../../lib/copy-prompt';
import { pageMeta } from '../../lib/site-meta';
import { JsonLd, creativeWorkJsonLd } from '../../lib/json-ld';
import { AgentActions } from '../../lib/agent-actions';
import { openIndex } from '../../lib/open-index';
import { CONTRACT_VERSION } from '../../lib/design-system-contract';

const ANATOMY_HREFS: Record<string, string> = {
  Purpose: '#purpose',
  'When to use': '#when',
  'Required inputs': '#inputs',
  'Permission level': '#permission',
  'Eight review dimensions': '#dimensions',
  'Agent prompt': '#prompt',
  'Output format': '#output',
  'Verification checklist': '#verification',
  'Anti-rationalizations': '#anti-rationalizations',
  'Anti-patterns': '#anti-patterns',
  'Related contracts and surfaces': '#related',
};

// The side pane of each related surface: what it is and the version or
// outcome it carries. A field check's outcome is a state, so it reads as a
// chip; everything else is a plain datum. The face keeps the line the kit
// record carries, less the part the side now says.
const RELATED_SIDE: Record<
  string,
  { meta: string; datum: string; state?: 'pass' | 'warn' | 'fail' }
> = {
  '/open': {
    meta: 'Catalog of portable packages · human + machine',
    datum: `Catalog v${openIndex.version}`,
  },
  '/review': { meta: 'Eight dimensions and field checks', datum: 'Doctrine' },
  '/contracts/design-system': {
    meta: 'Human home and machine export · Poise + Takt + Cadence + Acoustics adopted',
    datum: `Contract ${CONTRACT_VERSION}`,
  },
  '/review/poise': { meta: 'Kit One applied to Lab One', datum: 'Pass with notes', state: 'warn' },
  '/review/takt': { meta: 'Kit One applied to Lab Two', datum: 'Pass with notes', state: 'warn' },
  '/review/designesy-org': {
    meta: `Public surface review against contract ${CONTRACT_VERSION}`,
    datum: 'Surface review',
  },
  '/labs/poise': { meta: 'Source lab · interaction rules', datum: 'adopted v0.1.1' },
  '/labs/takt': { meta: 'Source lab · interface-feel rules', datum: 'adopted v0.1.2' },
  '/labs/cadence': { meta: 'Source lab · typography rules', datum: 'adopted v0.1.3' },
  '/labs/acoustics': { meta: 'Source lab · acoustic mapping rules', datum: 'adopted v0.3.0' },
  '/review/cadence': { meta: 'Kit One applied to Lab Three', datum: 'Pass with notes', state: 'warn' },
  '/review/acoustics': { meta: 'Kit One applied to Lab Four', datum: 'Pass with notes', state: 'warn' },
};

export const metadata: Metadata = pageMeta({
  title: 'Design Review',
  description:
    'Use Kit One · Design Review: portable design judgment for people and agents. Eight dimensions, agent prompt, output format, verification.',
  path: '/kits/design-review',
  ogTitle: 'Design Review · Kit One',
  ogDescription:
    'Turn taste into inspection. Portable review package for interfaces, systems, and agent output.',
  twitterDescription:
    'Eight dimensions and a portable agent prompt · designesy.org/kits/design-review',
});

// The permission line in full: what an agent may do with this kit until an
// operator widens it (the status note at the foot says the same).
const PERMISSION =
  'Agents report and recommend. The kit grants no edit rights, no deployment rights, and no secret access. Edit scope exists only when an operator grants it explicitly.';

export default function DesignReviewKitPage() {
  return (
    <>
      <JsonLd
        data={creativeWorkJsonLd({
          name: `Use Kit One · ${k.title}`,
          description: k.lede,
          url: k.public_url,
          version: k.version,
          related: [k.machine_url, 'https://www.designesy.org/open'],
        })}
      />
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link className="lab-crumb" href="/kits">
              Kits
            </Link>
            <span aria-hidden="true"> · </span>
            Kit One
          </p>
          <h1 className="surface-title" data-scramble>{k.title}</h1>
          <p className="surface-lede">{k.lede}</p>
          <p className="surface-note">
            This kit packages the live Review surface into a runnable handoff:
            purpose, inputs, eight dimensions, agent prompt, output format,
            verification, and anti-patterns. Share the path. Agents and people
            open the same rules.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge status-badge--kit">Kit One</span>
            <span className="lab-meta-item">Status · {k.status}</span>
            <span className="lab-meta-item">Version · {k.version}</span>
            <span className="lab-meta-item">Permission · {k.permission}</span>
          </div>
          <AgentActions mdPath="/kits/design-review.md" label="the design review kit" />
        </section>

        <section className="doctrine-section fade-up" id="handoff">
          <h2 className="doctrine-heading">Handoff</h2>
          <div
            className="definition"
            data-copy={k.agent_prompt}
            data-copy-label="agent prompt"
          >
            <p className="definition-label">Share line</p>
            <p>{k.handoff_line}</p>
          </div>
          <p className="surface-note">
            Shows a human share line. Click copies the full agent prompt:
            paste it into your AI tool, replace the placeholders, run the review.
            Human face: this page. Machine face:{' '}
            <Link href="/kits/design-review.json" data-cuelume-hover="tick">
              /kits/design-review.json
            </Link>
            . Catalog:{' '}
            <Link href="/open" data-cuelume-hover="tick">
              /open
            </Link>
            .
          </p>
        </section>

        <section className="doctrine-section fade-up" id="purpose">
          <h2 className="doctrine-heading">Purpose</h2>
          <div className="definition">
            <p className="definition-label">Job of this kit</p>
            <p>{k.purpose}</p>
          </div>
          <div className="definition" style={{ marginTop: '1.25rem' }}>
            <p className="definition-label">Quality bar</p>
            <p>{k.quality_bar}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="anatomy">
          <h2 className="doctrine-heading">Kit anatomy</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Package map first: jump cells land on sections, so the rest of the
            kit reads in any order.
          </p>
          <CheckGrid
            dense
            items={checkItemsFromStrings(k.anatomy, { hrefs: ANATOMY_HREFS })}
          />
        </section>

        <section className="doctrine-section fade-up" id="when">
          <h2 className="doctrine-heading">When to use</h2>
          <CheckGrid items={checkItemsFromStrings(k.when_to_use)} />
        </section>

        <section className="doctrine-section fade-up" id="inputs">
          <h2 className="doctrine-heading">Required inputs</h2>
          <CheckGrid
            items={k.required_inputs.map((item) => ({
              title: item.title,
              meta: item.meta,
            }))}
          />
        </section>

        <section className="doctrine-section fade-up" id="permission">
          <h2 className="doctrine-heading">Permission level</h2>
          <div className="definition definition-split" data-copy={PERMISSION} data-copy-label="permission level">
            <div className="definition-face">
              <p className="definition-label">Read-only by default</p>
              <p>{PERMISSION}</p>
            </div>
            <dl className="definition-side">
              <div>
                <dt>Default</dt>
                <dd>Read-only</dd>
              </div>
              <div>
                <dt>Edits</dt>
                <dd>Operator grant only</dd>
              </div>
              <div>
                <dt>Deploys</dt>
                <dd>Not granted</dd>
              </div>
              <div>
                <dt>Secrets</dt>
                <dd>Not granted</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="dimensions">
          <h2 className="doctrine-heading">Eight review dimensions</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            For each dimension: observation, judgment, action. Lead with
            consequence to the user or system.
          </p>
          <div className="principle-list">
            {k.dimensions.map((d) => (
              <div
                className="principle"
                key={d.num}
                data-cuelume-hover="bloom"
              >
                <span className="principle-num">{d.num}</span>
                <div className="principle-body">
                  <h3>{d.title}</h3>
                  <p>{d.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="prompt">
          <h2 className="doctrine-heading">Agent prompt</h2>
          <p className="surface-note" style={{ marginBottom: '1.25rem' }}>
            Copy the block. Paste into your AI tool. Replace the placeholders
            with your artifact, purpose, audience, and governing rules.
            The agent returns a structured review across all eight dimensions.
            Permission stays read-only unless the operator grants edit scope.
          </p>
          <CopyPrompt label="agent prompt">
            {k.agent_prompt}
          </CopyPrompt>
        </section>

        <section className="doctrine-section fade-up" id="output">
          <h2 className="doctrine-heading">Output format</h2>
          <CheckGrid
            items={k.output_format.map((item) => ({
              title: item.title,
              meta: item.meta,
            }))}
          />
        </section>

        <section className="doctrine-section fade-up" id="verification">
          <h2 className="doctrine-heading">Verification checklist</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Work the grid; leave no cell unexamined when the artifact is
            UI-bearing.
          </p>
          <CheckGrid items={checkItemsFromStrings(k.verification)} />
        </section>

        <section className="doctrine-section fade-up" id="anti-rationalizations">
          <h2 className="doctrine-heading">Anti-rationalizations</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            The reasons a review gets skipped, and what each one misses.
          </p>
          <CheckGrid
            items={k.rationalizations.map((item) => ({
              title: `\u201c${item.excuse}\u201d`,
              meta: item.reality,
            }))}
          />
        </section>

        <section className="doctrine-section fade-up" id="anti-patterns">
          <h2 className="doctrine-heading">Anti-patterns</h2>
          <CheckGrid
            items={checkItemsFromStrings(k.anti_patterns, { avoid: true })}
          />
        </section>

        <section className="doctrine-section fade-up" id="related">
          <h2 className="doctrine-heading">Related surfaces</h2>
          <div className="row-stack" role="list">
            {k.related.map((item, i) => {
              const side = RELATED_SIDE[item.href];
              return (
                <div role="listitem" key={item.href}>
                  <Link
                    href={item.href}
                    className="row"
                    data-cuelume-hover="bloom"
                    data-cuelume-press
                  >
                    <span className="row-index">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="row-body">
                      <span className="row-title">{item.title}</span>
                      <span className="row-meta">{side?.meta ?? item.meta}</span>
                    </span>
                    <span className="row-side">
                      <span className="row-side-line">
                        {side?.state ? (
                          <span className="row-side-chip" data-state={side.state}>
                            {side.datum}
                          </span>
                        ) : (
                          (side?.datum ?? item.href)
                        )}
                      </span>
                      <span className="row-side-arrow" aria-hidden="true" />
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        <div className="status-note">
          Use Kit One · Design Review is a public package with a machine export
          at /kits/design-review.json. It does not grant edit rights, deployment
          rights, or secret access. Agents report and recommend unless an
          operator expands scope. Catalog entry: /open.
        </div>
      </main>

      <Footer />
    </>
  );
}
