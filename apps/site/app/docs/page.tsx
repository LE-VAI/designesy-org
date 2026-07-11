import Link from 'next/link';

const NAV_ROUTES = [
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/review', label: 'Review' },
  { href: '/contracts', label: 'Contracts' },
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
            A public index for selected Designesy notes, context, and operating
            language.
          </p>
          <p className="surface-note">
            This is an early scaffold for public documentation. Private doctrine,
            working drafts, and internal project material stay outside this
            surface.
          </p>
        </section>

        <section className="surface-grid" aria-label="Docs areas">
          <article className="surface-item">
            <p className="surface-item-label">Context</p>
            <p className="surface-item-desc">
              Public orientation for what Designesy is and what is planned.
            </p>
          </article>
          <article className="surface-item">
            <p className="surface-item-label">Language</p>
            <p className="surface-item-desc">
              Selected public voice and terms that keep claims grounded.
            </p>
          </article>
          <article className="surface-item">
            <p className="surface-item-label">Status</p>
            <p className="surface-item-desc">
              Foundation-stage notes only; not a private-source mirror.
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