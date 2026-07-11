import Link from 'next/link';

const NAV_ROUTES = [
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/review', label: 'Review' },
  { href: '/contracts', label: 'Contracts' },
];

export default function ReviewPage() {
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
          <p className="surface-eyebrow">Quality gate</p>
          <h1 className="surface-title">Review</h1>
          <p className="surface-lede">
            A public explanation of the checks Designesy uses before artifacts
            are treated as ready.
          </p>
          <p className="surface-note">
            This is review language, not a live intake workflow, approval gate, or
            access system.
          </p>
        </section>

        <section className="surface-grid" aria-label="Review areas">
          <article className="surface-item">
            <p className="surface-item-label">Provenance</p>
            <p className="surface-item-desc">
              Work should show where decisions came from and what changed.
            </p>
          </article>
          <article className="surface-item">
            <p className="surface-item-label">Accessibility</p>
            <p className="surface-item-desc">
              Artifacts are checked for clarity, readability, and use.
            </p>
          </article>
          <article className="surface-item">
            <p className="surface-item-label">Platform fit</p>
            <p className="surface-item-desc">
              Outputs are reviewed against the place they will actually live.
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