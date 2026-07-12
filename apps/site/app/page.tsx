import Link from 'next/link';
import { Topbar } from './lib/topbar';
import { Footer } from './lib/footer';

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

const PIPELINE = [
  { num: '01', label: 'Sources', note: 'Provenance' },
  { num: '02', label: 'Principles', note: 'Judgment' },
  { num: '03', label: 'Contracts', note: 'Rules' },
  { num: '04', label: 'Tools', note: 'Practice' },
  { num: '05', label: 'Artifacts', note: 'Shipped' },
];

const SURFACES = [
  {
    href: '/docs',
    label: 'Docs',
    desc: 'Mission, nine principles, architecture, public voice',
    meta: 'Orientation',
  },
  {
    href: '/labs',
    label: 'Labs',
    desc: 'Experiments that compile into contracts',
    meta: 'Poise live',
  },
  {
    href: '/review',
    label: 'Review',
    desc: 'Eight dimensions and field checks',
    meta: '1 field check',
  },
  {
    href: '/contracts',
    label: 'Contracts',
    desc: 'Portable design agreements and verification',
    meta: 'v0.1 public',
  },
];

const FIELD = [
  {
    href: '/contracts/design-system',
    badge: 'Contract',
    status: 'v0.1',
    title: 'Design system',
    lede: 'Portable design judgment for designesy.org.',
    desc: 'Human overview, full tables, and a machine export for agents and tools.',
    arrow: 'Open contract →',
    kind: 'contract' as const,
  },
  {
    href: '/labs/poise',
    badge: 'Lab One',
    status: 'Live',
    title: 'Poise',
    lede: 'How Designesy responds when someone touches it.',
    desc: 'Restrained interaction — wordmark, press, sound preference, reduced motion.',
    arrow: 'Open lab →',
    kind: 'lab' as const,
  },
];

const PRINCIPLES_PREVIEW = [
  { num: '01', title: 'Purpose earns form', desc: 'Every element should have a job. Remove anything that does not help the design act, communicate, or withstand use.' },
  { num: '02', title: 'Economy is intelligence', desc: 'Prefer fewer, stronger decisions over many weak flourishes. Reduction is valuable when it preserves user power.' },
  { num: '03', title: 'Context is part of the object', desc: 'Design cannot be judged in isolation. Environment, device, culture, ability, and maintenance are part of the design.' },
  { num: '04', title: 'Responsibility is a design material', desc: 'Equity, environment, economy, and social consequence are not externalities. They are design materials.' },
];

export default function HomePage() {
  return (
    <>
      {/* --- Topbar --- */}
      <Topbar />

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
            <Link
              className="button primary"
              href="/contracts/design-system"
              data-cuelume-press
              data-cuelume-release
            >
              Open design system
            </Link>
            <Link
              className="button ghost"
              href="/labs/poise"
              data-cuelume-press
              data-cuelume-release
            >
              Try Poise
            </Link>
          </div>
        </section>

        {/* --- Pipeline diagram --- */}
        <section
          className="pipeline fade-up fade-up-delay-5"
          aria-label="Designesy system flow"
        >
          <p className="pipeline-eyebrow">System flow</p>
          <ol className="pipeline-track">
            {PIPELINE.map((step, i) => (
              <li
                className={`pipeline-step${i === PIPELINE.length - 1 ? ' is-end' : ''}`}
                key={step.label}
                data-cuelume-hover="tick"
              >
                <span className="pipeline-node" aria-hidden="true">
                  <span className="pipeline-node-core" />
                </span>
                <span className="pipeline-num">{step.num}</span>
                <span className="pipeline-label">{step.label}</span>
                <span className="pipeline-note">{step.note}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* --- Pillars --- */}
        <section className="section" aria-labelledby="pillars-title">
          <p className="section-eyebrow">What Designesy does</p>
          <h2 className="section-title" id="pillars-title">
            A compact system for design work.
          </h2>
          <div className="pillar-grid">
            {PILLARS.map((pillar) => (
              <article className="pillar fade-in" key={pillar.number} data-cuelume-hover="bloom" data-cuelume-press data-cuelume-release>
                <p className="pillar-number">{pillar.number}</p>
                <h3>{pillar.title}</h3>
                <p>{pillar.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* --- Principles preview --- */}
        <section className="section" aria-labelledby="principles-title">
          <p className="section-eyebrow">Operating principles</p>
          <h2 className="section-title" id="principles-title">
            Nine principles. Four shown here.
          </h2>
          <div className="principle-list">
            {PRINCIPLES_PREVIEW.map((p) => (
              <div className="principle fade-in" key={p.num} data-cuelume-hover="whisper">
                <span className="principle-num">{p.num}</span>
                <div className="principle-body">
                  <h3>{p.title}</h3>
                  <p>{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '2rem' }}>
            <Link
              className="button ghost"
              href="/docs"
              data-cuelume-press
              data-cuelume-release
            >
              Read all nine principles →
            </Link>
          </div>
        </section>

        {/* --- Field cards --- */}
        <section className="section" aria-labelledby="field-title">
          <p className="section-eyebrow">Now live</p>
          <h2 className="section-title" id="field-title">
            Contract and Lab One.
          </h2>
          <div className="field-grid">
            {FIELD.map((item) => (
              <Link
                className={`field-card field-card--${item.kind}`}
                href={item.href}
                key={item.href}
                data-cuelume-hover="tick"
                data-cuelume-press
                data-cuelume-release
              >
                <div className="field-card-top">
                  <span className={`status-badge status-badge--${item.kind}`}>
                    {item.badge}
                  </span>
                  <span
                    className={`mark-glyph mark-glyph--${item.kind}`}
                    aria-hidden="true"
                    title={
                      item.kind === 'contract'
                        ? 'Contract mark · structure'
                        : 'Lab mark · living experiment'
                    }
                  >
                    <span className="mark-glyph-core" />
                    <span className="mark-glyph-ring" />
                  </span>
                </div>
                <div className="field-card-status">{item.status}</div>
                <h3 className="field-card-title">{item.title}</h3>
                <p className="field-card-lede">{item.lede}</p>
                <p className="field-card-desc">{item.desc}</p>
                <span className="field-card-arrow">{item.arrow}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* --- Surfaces --- */}
        <section className="section" aria-labelledby="surfaces-title">
          <p className="section-eyebrow">Surfaces</p>
          <h2 className="section-title" id="surfaces-title">
            Public lanes with live cargo.
          </h2>
          <div className="surface-list">
            {SURFACES.map((surface) => (
              <Link
                className="surface-card"
                href={surface.href}
                key={surface.href}
                data-cuelume-hover="whisper"
                data-cuelume-press
                data-cuelume-release
              >
                <span className="surface-card-meta">{surface.meta}</span>
                <span className="surface-card-label">{surface.label}</span>
                <span className="surface-card-desc">{surface.desc}</span>
                <span className="surface-card-arrow">→</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="system-state-title">
          <p className="section-eyebrow">System state</p>
          <h2 className="section-title" id="system-state-title">
            What is real on this site.
          </h2>
          <div className="row-stack" role="list">
            {[
              {
                title: 'Design system contract v0.1',
                meta: 'Human home, full tables, machine export',
              },
              {
                title: 'Lab One · Poise',
                meta: 'Restrained interaction — candidate rules for v0.1.1',
              },
              {
                title: 'Public surface review',
                meta: 'designesy.org checked against its own contract',
              },
              {
                title: 'Drift rule',
                meta: 'Every new public UI cites a contract token or open tension',
              },
            ].map((item, i) => (
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
      </main>

      {/* --- Footer --- */}
      <Footer />

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