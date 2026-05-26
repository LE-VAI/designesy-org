import Link from 'next/link';

export default function HomePage() {
  const pillars = [
    {
      title: 'Design systems',
      text: 'Reusable rules for public artifacts, interfaces, and reviewable decisions.'
    },
    {
      title: 'Review discipline',
      text: 'Clear checkpoints for quality, accessibility, provenance, and platform fit.'
    },
    {
      title: 'Public artifacts',
      text: 'A controlled surface for docs, experiments, and publishing-ready work.'
    },
    {
      title: 'Intelligence infrastructure',
      text: 'A practical bridge between source material, design contracts, and shipped outputs.'
    }
  ];

  const routes = [
    { href: '/docs', label: 'Docs', status: 'Context surface' },
    { href: '/labs', label: 'Labs', status: 'Experiment lane' },
    { href: '/review', label: 'Review', status: 'Quality gate' },
    { href: '/contracts', label: 'Contracts', status: 'Operating rules' }
  ];

  return (
    <main className="site-shell">
      <header className="topbar" aria-label="Designesy public navigation">
        <Link className="wordmark" href="/">
          Designesy
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {routes.map((route) => (
            <Link href={route.href} key={route.href}>
              {route.label}
            </Link>
          ))}
        </nav>
      </header>

      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">Public scaffold / foundation stage</p>
          <h1 id="home-title">Designesy</h1>
          <p className="lede">
            Design intelligence infrastructure for systems, review, and public
            artifacts.
          </p>
          <p className="hero-text">
            Designesy turns sources into principles, principles into contracts,
            and contracts into tools, systems, and artifacts that improve the
            quality of public work.
          </p>
          <div className="hero-actions" aria-label="Primary routes">
            <Link className="button primary" href="/docs">
              Read docs
            </Link>
            <Link className="button secondary" href="/review">
              Review surface
            </Link>
          </div>
        </div>

        <div className="signal-board" aria-label="Designesy system map">
          <div className="signal-row">
            <span>Sources</span>
            <span>Principles</span>
          </div>
          <div className="signal-line" />
          <div className="signal-row middle">
            <span>Contracts</span>
            <span>Review</span>
          </div>
          <div className="signal-line accent" />
          <div className="signal-row">
            <span>Tools</span>
            <span>Artifacts</span>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="pillars-title">
        <div className="section-heading">
          <p className="eyebrow">Public shape</p>
          <h2 id="pillars-title">A compact system for design work.</h2>
        </div>
        <div className="pillar-grid">
          {pillars.map((pillar) => (
            <article className="pillar" key={pillar.title}>
              <h3>{pillar.title}</h3>
              <p>{pillar.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="status-section" aria-labelledby="status-title">
        <div>
          <p className="eyebrow">Status</p>
          <h2 id="status-title">Validated scaffold, not a launch.</h2>
        </div>
        <p>
          This public surface is an early, controlled baseline. It is ready for
          careful polish and review, not deployment claims or private-source
          migration.
        </p>
      </section>

      <section className="section" aria-labelledby="routes-title">
        <div className="section-heading">
          <p className="eyebrow">Surfaces</p>
          <h2 id="routes-title">Planned public lanes.</h2>
        </div>
        <div className="route-list">
          {routes.map((route) => (
            <Link className="route-link" href={route.href} key={route.href}>
              <span>{route.label}</span>
              <small>{route.status}</small>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
