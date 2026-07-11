import Link from 'next/link';

const NAV_ROUTES = [
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/review', label: 'Review' },
  { href: '/contracts', label: 'Contracts' },
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
            A lane for experiments and prototypes that can be reviewed before
            they become public rules.
          </p>
          <p className="surface-note">
            Labs are exploratory. They do not claim that products, services, or
            deployments are live.
          </p>
        </section>

        <section className="surface-grid" aria-label="Labs areas">
          <article className="surface-item">
            <p className="surface-item-label">Prototype notes</p>
            <p className="surface-item-desc">
              Small experiments with clear purpose and review criteria.
            </p>
          </article>
          <article className="surface-item">
            <p className="surface-item-label">Pattern tests</p>
            <p className="surface-item-desc">
              Reusable ideas tested before promotion into contracts.
            </p>
          </article>
          <article className="surface-item">
            <p className="surface-item-label">Promotion path</p>
            <p className="surface-item-desc">
              Evidence first, then rules; unfinished work stays labeled.
            </p>
          </article>
        </section>
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