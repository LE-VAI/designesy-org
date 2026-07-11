import Link from 'next/link';

const NAV_ROUTES = [
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/review', label: 'Review' },
  { href: '/contracts', label: 'Contracts' },
];

export default function ContractsPage() {
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
          <p className="surface-eyebrow">Operating rules</p>
          <h1 className="surface-title">Contracts</h1>
          <p className="surface-lede">
            Design contracts turn principles into reusable operating rules for
            artifacts, interfaces, and review.
          </p>
          <p className="surface-note">
            These are design contracts: public artifact discipline, not legal
            advice or client service agreements.
          </p>
        </section>

        <section className="surface-grid" aria-label="Contracts areas">
          <article className="surface-item">
            <p className="surface-item-label">Principles</p>
            <p className="surface-item-desc">
              Clear ideas that explain why a design decision exists.
            </p>
          </article>
          <article className="surface-item">
            <p className="surface-item-label">Rules</p>
            <p className="surface-item-desc">
              Reusable constraints for shaping repeatable public work.
            </p>
          </article>
          <article className="surface-item">
            <p className="surface-item-label">Verification</p>
            <p className="surface-item-desc">
              Checks that keep contracts reviewable before promotion.
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