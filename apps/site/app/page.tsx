import Link from 'next/link';

const NAV_ROUTES = [
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/review', label: 'Review' },
  { href: '/contracts', label: 'Contracts' },
];

const PILLARS = [
  {
    number: '01',
    title: 'Design systems',
    text: 'Reusable rules for artifacts, interfaces, and reviewable decisions.',
  },
  {
    number: '02',
    title: 'Review discipline',
    text: 'Clear checkpoints for quality, accessibility, provenance, and platform fit.',
  },
  {
    number: '03',
    title: 'Public artifacts',
    text: 'A controlled surface for docs, experiments, and publishing-ready work.',
  },
  {
    number: '04',
    title: 'Intelligence infrastructure',
    text: 'A practical bridge between source material, design contracts, and shipped outputs.',
  },
];

const PIPELINE = ['Sources', 'Principles', 'Contracts', 'Tools', 'Artifacts'];

const SURFACES = [
  { href: '/docs', label: 'Docs', desc: 'Context surface' },
  { href: '/labs', label: 'Labs', desc: 'Experiment lane' },
  { href: '/review', label: 'Review', desc: 'Quality gate' },
  { href: '/contracts', label: 'Contracts', desc: 'Operating rules' },
];

export default function HomePage() {
  return (
    <>
      {/* --- Topbar --- */}
      <header className="topbar" id="topbar">
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

      <main className="site-shell">
        {/* --- Hero --- */}
        <section className="hero" aria-labelledby="hero-title">
          <p className="hero-eyebrow fade-up">Design intelligence infrastructure</p>
          <h1 className="wordmark-hero hero-title fade-up fade-up-delay-1" id="hero-title">
            designesy<span className="dot">.</span>
          </h1>
          <p className="hero-lede fade-up fade-up-delay-2">
            Design intelligence infrastructure for a humane creative civilization.
          </p>
          <p className="hero-body fade-up fade-up-delay-3">
            Sources into principles. Principles into contracts. Contracts into
            tools. Tools into better designed work.
          </p>
          <div className="hero-actions fade-up fade-up-delay-4">
            <Link className="button primary" href="/docs">
              Read docs
            </Link>
            <Link className="button ghost" href="/review">
              Review surface
            </Link>
          </div>
        </section>

        {/* --- Pipeline diagram --- */}
        <section className="pipeline fade-up fade-up-delay-5" aria-label="Designesy system flow">
          {PIPELINE.map((step, i) => (
            <div className="pipeline-step" key={step}>
              <span className="pipeline-label">{step}</span>
              {i < PIPELINE.length - 1 && <span className="pipeline-arrow" />}
            </div>
          ))}
        </section>

        {/* --- Pillars --- */}
        <section className="section" aria-labelledby="pillars-title">
          <p className="section-eyebrow">Public shape</p>
          <h2 className="section-title" id="pillars-title">
            A compact system for design work.
          </h2>
          <div className="pillar-grid">
            {PILLARS.map((pillar) => (
              <article className="pillar fade-in" key={pillar.number}>
                <p className="pillar-number">{pillar.number}</p>
                <h3>{pillar.title}</h3>
                <p>{pillar.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* --- Status --- */}
        <div className="status-bar">
          <span className="status-badge">Foundation stage</span>
          <p className="status-text">
            This public surface is an early, controlled baseline. Ready for
            polish and review — not deployment claims.
          </p>
        </div>

        {/* --- Surfaces --- */}
        <section className="section" aria-labelledby="surfaces-title">
          <p className="section-eyebrow">Surfaces</p>
          <h2 className="section-title" id="surfaces-title">
            Planned public lanes.
          </h2>
          <div className="surface-list">
            {SURFACES.map((surface) => (
              <Link className="surface-card" href={surface.href} key={surface.href}>
                <span className="surface-card-label">{surface.label}</span>
                <span className="surface-card-desc">{surface.desc}</span>
                <span className="surface-card-arrow">→</span>
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* --- Footer --- */}
      <footer className="footer">
        <div className="site-shell footer-inner">
          <div className="footer-meta">
            <span className="wordmark">designesy<span className="dot">.</span></span>
            <span><strong>Designesy LLC</strong> · Design intelligence infrastructure</span>
          </div>
          <a className="footer-link" href="mailto:le@designesy.org">
            le@designesy.org
          </a>
        </div>
      </footer>

      {/* --- Scroll detection script (progressive enhancement) --- */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var topbar = document.getElementById('topbar');
              if (!topbar) return;
              function onScroll() {
                if (window.scrollY > 40) {
                  topbar.classList.add('scrolled');
                } else {
                  topbar.classList.remove('scrolled');
                }
              }
              window.addEventListener('scroll', onScroll, { passive: true });
              onScroll();
            })();
          `,
        }}
      />
    </>
  );
}