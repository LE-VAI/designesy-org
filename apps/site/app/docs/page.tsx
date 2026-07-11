import Link from 'next/link';

const NAV_ROUTES = [
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/review', label: 'Review' },
  { href: '/contracts', label: 'Contracts' },
];

const PRINCIPLES = [
  { num: '01', title: 'Purpose earns form', desc: 'Every meaningful element should have a job. Remove, merge, or demote anything that does not help the design act, communicate, withstand use, or create necessary feeling.' },
  { num: '02', title: 'Economy is intelligence', desc: 'Prefer fewer, stronger decisions over many weak flourishes. Reduction is valuable when it preserves user power while lowering cognitive, physical, emotional, or maintenance burden.' },
  { num: '03', title: 'Context is part of the object', desc: 'Design cannot be judged in isolation. The use environment, user state, device, bandwidth, culture, ability, maintenance model, and social setting are part of the design.' },
  { num: '04', title: 'Affordance should be felt', desc: 'The form should suggest the action. People should not need a lecture to discover primary use, especially for repeated or urgent tasks.' },
  { num: '05', title: 'Durability includes time and change', desc: 'Durability includes maintainability, adaptability, learnability, repairability, localization, and the ability to remain useful as conditions shift.' },
  { num: '06', title: 'Inclusion is structural', desc: 'Inclusion starts at the decision layer. Ask who can use the artifact, who has to work harder, who is excluded, and who pays the cost of ambiguity.' },
  { num: '07', title: 'Systems enable freedom', desc: 'Strong systems give parts shared logic so people and agents can recombine them confidently. Coherence should create room for expression, not lock every surface into sameness.' },
  { num: '08', title: 'Delight must be earned', desc: 'Joy, beauty, play, surprise, and personality are legitimate design goals when they deepen trust, clarity, identity, learning, or emotional connection.' },
  { num: '09', title: 'Responsibility is a design material', desc: 'Equity, environment, economy, human development, and social consequence are not externalities. They are design materials.' },
];

export default function DocsPage() {
  return (
    <>
      <header className="topbar scrolled">
        <div className="topbar-inner">
          <Link className="wordmark" href="/">
            designesy<span className="dot">.</span>
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {NAV_ROUTES.map((route) => (
              <Link href={route.href} key={route.href}>
                {route.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Context surface</p>
          <h1 className="surface-title">Docs</h1>
          <p className="surface-lede">
            Designesy is design intelligence infrastructure for a humane creative
            civilization.
          </p>
          <p className="surface-note">
            It turns sources into principles, principles into contracts,
            contracts into tools, and tools into better designed work. This is
            the public orientation layer — selected doctrine, language, and
            context for anyone who wants to understand what Designesy is and how
            it operates.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Mission</h2>
          <div className="definition">
            <p className="definition-label">Working sentence</p>
            <p>
              Designesy turns design knowledge into living systems: sources
              become principles, principles become contracts, contracts become
              tools, and tools become better designed work.
            </p>
          </div>
          <p className="surface-note">
            Designesy is an organization first, not merely a company, brand,
            SaaS product, template shop, prompt library, or content site. It
            should be able to contain practical products, public resources,
            agent kits, labs, contracts, research systems, review systems, and
            creative infrastructure without being reduced to any one of them.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Operating principles</h2>
          <div className="principle-list">
            {PRINCIPLES.map((p) => (
              <div className="principle" key={p.num}>
                <span className="principle-num">{p.num}</span>
                <div className="principle-body">
                  <h3>{p.title}</h3>
                  <p>{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Architecture</h2>
          <div className="doctrine-cols">
            <div>
              <div className="definition">
                <p className="definition-label">System flow</p>
                <p>
                  Source → Observation → Claim → Tension → Principle → Pattern →
                  Contract Rule → Token / Component / Behavior → Verification
                  Artifact → Shipped Work
                </p>
              </div>
              <p className="surface-note">
                The Graph preserves provenance and prevents design knowledge
                from becoming anonymous taste. Every shipped artifact should
                trace back through this chain.
              </p>
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--ink)' }}>
                Seven layers
              </h3>
              <ul className="checkmark-list">
                <li><strong style={{ color: 'var(--ink)' }}>Core</strong> — mission, doctrine, principles, quality bar</li>
                <li><strong style={{ color: 'var(--ink)' }}>Graph</strong> — living knowledge tree with provenance</li>
                <li><strong style={{ color: 'var(--ink)' }}>Contracts</strong> — portable design agreements</li>
                <li><strong style={{ color: 'var(--ink)' }}>Labs</strong> — experiments that compile into contracts</li>
                <li><strong style={{ color: 'var(--ink)' }}>Review</strong> — quality-control layer for artifacts</li>
                <li><strong style={{ color: 'var(--ink)' }}>Agent Kits</strong> — reusable instructions for agents</li>
                <li><strong style={{ color: 'var(--ink)' }}>Logs</strong> — institutional memory, file-based</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Public voice</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Designesy public language should feel intelligent, precise, useful,
            soulful but not vague, technical but not cold, ambitious but not
            delusional, artist-centered, systems-aware, deeply humane,
            anti-generic, anti-corporate-slop, and anti-empty-AI-branding.
          </p>
          <div className="doctrine-cols">
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                What to imply
              </h3>
              <ul className="checkmark-list">
                <li>Design judgment made operational</li>
                <li>Principles with provenance</li>
                <li>Contracts that agents and teams can use</li>
                <li>Artifacts that can be inspected, copied, tested, remixed</li>
                <li>Creative infrastructure for people building better worlds</li>
              </ul>
            </div>
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                What to avoid
              </h3>
              <ul className="avoid-list">
                <li>Generic AI SaaS language</li>
                <li>Shallow future-of-design clichés</li>
                <li>Vague promises with no operational mechanism</li>
                <li>Pretending Designesy is already a massive institution</li>
                <li>Reducing the mission to templates or a design blog</li>
                <li>Corporate care language that feels unearned</li>
              </ul>
            </div>
          </div>
        </section>

        <div className="status-note">
          Foundation stage — this public surface is an early, controlled
          baseline. Private doctrine, working drafts, and internal project
          material stay outside this surface. Ready for polish and review, not
          deployment claims.
        </div>
      </main>

      <footer className="footer">
        <div className="surface-page footer-inner">
          <div className="footer-meta">
            <span className="wordmark">designesy<span className="dot">.</span></span>
            <span><strong>Designesy LLC</strong> · Design intelligence infrastructure</span>
          </div>
          <a className="footer-link" href="mailto:le@designesy.org">
            le@designesy.org
          </a>
        </div>
      </footer>
    </>
  );
}