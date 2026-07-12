import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { designReviewKit as k } from '../../lib/kits/design-review';

export const metadata: Metadata = {
  title: 'Design Review',
  description:
    'Use Kit One · Design Review — portable design judgment for people and agents. Eight dimensions, agent prompt, output format, verification.',
  openGraph: {
    title: 'Design Review · Kit One',
    description:
      'Turn taste into inspection. Portable review package for interfaces, systems, and agent output.',
    url: 'https://www.designesy.org/kits/design-review',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Design Review · Kit One',
    description:
      'Tell your agent to review with Designesy — designesy.org/kits/design-review',
  },
};

export default function DesignReviewKitPage() {
  return (
    <>
      <Topbar scrolled />

      <main className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link className="lab-crumb" href="/kits">
              Kits
            </Link>
            <span aria-hidden="true"> · </span>
            Kit One
          </p>
          <h1 className="surface-title">{k.title}</h1>
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
        </section>

        <section className="doctrine-section fade-up" id="handoff">
          <h2 className="doctrine-heading">Handoff</h2>
          <div className="definition">
            <p className="definition-label">Share line</p>
            <p>{k.handoff_line}</p>
          </div>
          <p className="surface-note">
            Human face: this page. Agent face: the prompt block below plus the
            design system contract when tokens are in scope.
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

        <section className="doctrine-section fade-up" id="when">
          <h2 className="doctrine-heading">When to use</h2>
          <div className="row-stack" role="list">
            {k.when_to_use.map((item, i) => (
              <div className="row" role="listitem" key={item}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="inputs">
          <h2 className="doctrine-heading">Required inputs</h2>
          <div className="row-stack" role="list">
            {k.required_inputs.map((item, i) => (
              <div className="row" role="listitem" key={item.title}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </div>
            ))}
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
                data-cuelume-hover="whisper"
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
            Copy the block. Replace the placeholders. Permission stays
            read-only unless the operator explicitly grants edit scope.
          </p>
          <pre className="kit-prompt" tabIndex={0}>
            <code>{k.agent_prompt}</code>
          </pre>
        </section>

        <section className="doctrine-section fade-up" id="output">
          <h2 className="doctrine-heading">Output format</h2>
          <div className="row-stack" role="list">
            {k.output_format.map((item, i) => (
              <div className="row" role="listitem" key={item.title}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="verification">
          <h2 className="doctrine-heading">Verification checklist</h2>
          <div className="row-stack" role="list">
            {k.verification.map((item, i) => (
              <div className="row" role="listitem" key={item}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="anti-patterns">
          <h2 className="doctrine-heading">Anti-patterns</h2>
          <div className="row-stack" role="list">
            {k.anti_patterns.map((item, i) => (
              <div className="row is-avoid" role="listitem" key={item}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="related">
          <h2 className="doctrine-heading">Related surfaces</h2>
          <div className="row-stack" role="list">
            {k.related.map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                className="row"
                role="listitem"
                data-cuelume-hover="whisper"
                data-cuelume-press
                data-cuelume-release
              >
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Kit anatomy</h2>
          <div className="row-stack" role="list">
            {k.anatomy.map((item, i) => (
              <div className="row" role="listitem" key={item}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="status-note">
          Use Kit One · Design Review is a public package. It does not grant
          edit rights, deployment rights, or secret access. Agents report and
          recommend unless an operator expands scope. Worked example: the public
          surface review of designesy.org.
        </div>
      </main>

      <Footer />
    </>
  );
}
