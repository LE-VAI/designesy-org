import Link from 'next/link';

const NAV_ROUTES = [
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/review', label: 'Review' },
  { href: '/contracts', label: 'Contracts' },
];

const LAB_ANATOMY = [
  'Thesis',
  'Live artifact or demo',
  'Principle explanation',
  'Portable contract',
  'Codex-ready implementation prompt',
  'Review checklist',
  'Provenance',
  'Anti-patterns',
  'Remix notes',
  'Verification artifact',
];

const NOT_LABS = [
  'Not a blog',
  'Not a gallery',
  'Not a moodboard',
  'Not generic case studies',
  'Not a collection of decorative demos',
  'Not a landing page for AI SaaS',
];

export default function LabsPage() {
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
          <p className="surface-eyebrow">Experiment lane</p>
          <h1 className="surface-title">Labs</h1>
          <p className="surface-lede">
            Experiments that compile into contracts.
          </p>
          <p className="surface-note">
            A Lab is a controlled design experiment where a principle becomes
            visible, testable, remixable, and reviewable. Labs are the public
            practical layer of Designesy — a workbench where a thesis becomes a
            live artifact, review checklist, portable contract, and
            implementation-ready prompt.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Lab anatomy</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            A mature Lab should include all of the following. Each one makes the
            experiment inspectable, reviewable, and promotable into durable
            rules.
          </p>
          <ul className="checkmark-list">
            {LAB_ANATOMY.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Promotion rule</h2>
          <div className="definition">
            <p className="definition-label">Core rule</p>
            <p>
              An experiment becomes contract material only after its useful
              behavior is named.
            </p>
          </div>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Before promotion, a Lab records:
          </p>
          <ul className="checkmark-list">
            <li>What the artifact tests</li>
            <li>What caused the behavior</li>
            <li>What it communicates</li>
            <li>Where it belongs</li>
            <li>What would make it excessive</li>
            <li>How it degrades for accessibility, performance, or reduced motion</li>
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What Labs are not</h2>
          <ul className="avoid-list">
            {NOT_LABS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <div className="status-note">
          Labs is defined as an operating model. The first live experiments will
          be labeled with their thesis, review status, and promotion readiness.
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