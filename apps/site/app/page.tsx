import Link from 'next/link';
import { Topbar } from './lib/topbar';
import { Footer } from './lib/footer';
import { Toggle } from './lib/toggle';
import { ToggleRow } from './lib/toggle-row';

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
    href: '/open',
    label: 'Open',
    desc: 'Portable design intelligence — human index and machine feed',
    meta: 'open.json live',
  },
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
    meta: 'Poise + Takt + Cadence live',
  },
  {
    href: '/kits',
    label: 'Kits',
    desc: 'Portable instruction packages for people and agents',
    meta: 'Design Review live',
  },
  {
    href: '/review',
    label: 'Review',
    desc: 'Eight dimensions and field checks',
    meta: '5 field checks',
  },
  {
    href: '/contracts',
    label: 'Contracts',
    desc: 'Portable design agreements and verification',
    meta: 'v0.1.4 public',
  },
];

const FIELD = [
  {
    href: '/open',
    badge: 'Open',
    status: 'v0.1',
    title: 'Open design intelligence',
    lede: 'Portable design judgment — yours to fetch, run, and remix.',
    desc: 'Every contract, kit, lab, and field check. Human index and machine feed, kept in sync. Point your agent at open.json.',
    arrow: 'Browse the catalog →',
    kind: 'open' as const,
  },
  {
    href: '/contracts/design-system',
    badge: 'Contract',
    status: 'v0.1.4',
    title: 'Design system',
    lede: 'The rules behind this site — portable and versioned.',
    desc: 'Tokens, motion, components, Poise + Takt + Cadence rules. Human overview plus a machine export agents can cite directly.',
    arrow: 'Read the contract →',
    kind: 'contract' as const,
  },
  {
    href: '/labs/poise',
    badge: 'Lab One',
    status: 'Live',
    title: 'Poise',
    lede: 'How this site responds when you touch it.',
    desc: 'Wordmark breath, press settle, sound preference, reduced motion. Lab rules that compiled into the contract.',
    arrow: 'See the lab →',
    kind: 'lab' as const,
  },
  {
    href: '/labs/takt',
    badge: 'Lab Two',
    status: 'Live',
    title: 'Takt',
    lede: 'How an interface feels under your hands.',
    desc: 'Concentric radii, press scale, image outlines, hit areas, stagger rhythm — rules adopted into contract v0.1.2.',
    arrow: 'See the lab →',
    kind: 'lab' as const,
  },
  {
    href: '/labs/cadence',
    badge: 'Lab Three',
    status: 'Live',
    title: 'Cadence',
    lede: 'The rhythm of text on a page.',
    desc: 'Font smoothing, rem-based scale, line-height by role, tracking by size, measure, text-wrap, tabular numbers, selection — rules adopted into contract v0.1.3.',
    arrow: 'See the lab →',
    kind: 'lab' as const,
  },
  {
    href: '/kits/design-review',
    badge: 'Kit One',
    status: 'Live',
    title: 'Design Review',
    lede: 'Turn taste into inspection. Point your agent at any design.',
    desc: 'Eight dimensions, a copyable agent prompt, output format, and verification checklist. Human and machine read the same rules.',
    arrow: 'Open the kit →',
    kind: 'kit' as const,
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

      <main id="main-content" className="site-shell">
        {/* --- Hero --- */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-seam" aria-hidden="true">
            <span className="hero-seam-line" />
            <div className="hero-seam-constellation">
              {/* Modular mark language — same 5 elements as the brand mark,
                  docked on a vertical seam before dispersing into field icons. */}
              <svg
                className="hero-seam-mark"
                viewBox="0 0 256 406"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                {/* Brand mark geometry — local space from asset builder (256×406) */}
                {/* 1 Signal dot — emits a pulse ring on hover */}
                <g className="seam-shape seam-dot-group">
                  <circle className="seam-dot" cx="200" cy="56" r="56" />
                  <circle className="seam-dot-pulse" cx="200" cy="56" r="56" fill="none" stroke="var(--signal-light)" strokeWidth="2" opacity="0" />
                </g>
                {/* 2 Orbit quarter — NW of (112,266) r112 · M0,266 A… 112,154 L112,266 Z */}
                <g className="seam-shape seam-orbit-group">
                  <path
                    className="seam-orbit"
                    d="M0 266 A112 112 0 0 1 112 154 L112 266 Z"
                  />
                </g>
                {/* 3 Infrastructure square */}
                <g className="seam-shape seam-square-group">
                  <rect
                    className="seam-square"
                    x="144"
                    y="154"
                    width="112"
                    height="112"
                  />
                </g>
                {/* 4 Motion triangle */}
                <g className="seam-shape seam-triangle-group">
                  <path
                    className="seam-triangle"
                    d="M0 406 L112 406 L112 294 Z"
                  />
                </g>
                {/* 5 Stability quarter — SE of (144,294) r112 · M144,294 H256 A… 144,406 Z */}
                <g className="seam-shape seam-block-group">
                  <path
                    className="seam-block"
                    d="M144 294 H256 A112 112 0 0 1 144 406 Z"
                  />
                </g>
              </svg>
            </div>
          </div>
          <p className="hero-eyebrow fade-up">Design intelligence infrastructure</p>
          <h1
            className="wordmark-hero hero-title fade-up fade-up-delay-1"
            id="hero-title"
            data-cuelume-hover="sparkle"
            data-cuelume-press="sparkle"
            data-firework
          >
            <span className="wordmark-shimmer">designesy</span>
            <span className="dot">.</span>
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
              href="/open"
              data-cuelume-hover="chime"
              data-cuelume-press
              data-cuelume-release="success"
              data-firework
            >
              Open design intelligence
            </Link>
            <Link
              className="button ghost"
              href="/kits/design-review"
              data-cuelume-hover="tick"
              data-cuelume-press
              data-cuelume-release
            >
              Use Design Review
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
                data-cuelume-press
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
              <Toggle
                className="pillar fade-in"
                key={pillar.number}
                data-cuelume-hover="bloom"
                data-cuelume-press
                data-cuelume-release
              >
                <p className="pillar-number">{pillar.number}</p>
                <h3>{pillar.title}</h3>
                <p>{pillar.text}</p>
              </Toggle>
            ))}
          </div>
        </section>

        {/* --- Principles preview + Contract health radar --- */}
        <section className="section" aria-labelledby="principles-title">
          <p className="section-eyebrow">Operating principles</p>
          <h2 className="section-title" id="principles-title">
            Nine principles. Four shown here.
          </h2>
          <div className="principle-layout">
            <div className="principle-list principle-list--rail">
              {PRINCIPLES_PREVIEW.map((p) => (
                <div className="principle fade-in" key={p.num}>
                  <span className="principle-num">{p.num}</span>
                  <div className="principle-body">
                    <h3>{p.title}</h3>
                    <p>{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <aside className="health-radar" aria-label="Contract health radar">
              <div className="health-radar-header">
                <span className="health-radar-title">Contract health</span>
                <span className="health-radar-sub">8 dimensions</span>
              </div>
              <svg
                className="health-radar-svg"
                viewBox="0 0 200 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                {/* Grid rings — 3 concentric octagons */}
                {[0.33, 0.66, 1].map((ring, ri) => {
                  const r = 80 * ring;
                  const pts = [];
                  for (let i = 0; i < 8; i++) {
                    const angle = (i * 45 - 90) * Math.PI / 180;
                    pts.push(`${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`);
                  }
                  return (
                    <polygon
                      key={ri}
                      className="health-radar-grid"
                      points={pts.join(' ')}
                    />
                  );
                })}

                {/* Axis lines from center to outer ring */}
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                  const angle = (i * 45 - 90) * Math.PI / 180;
                  return (
                    <line
                      key={i}
                      className="health-radar-axis"
                      x1={100}
                      y1={100}
                      x2={100 + 80 * Math.cos(angle)}
                      y2={100 + 80 * Math.sin(angle)}
                    />
                  );
                })}

                {/* Score polygon — 8 dimensions, all high */}
                {(() => {
                  const scores = [0.95, 0.90, 0.95, 0.88, 0.92, 0.95, 0.90, 1.0];
                  const pts = scores.map((score, i) => {
                    const angle = (i * 45 - 90) * Math.PI / 180;
                    const r = 80 * score;
                    return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
                  });
                  return (
                    <polygon
                      className="health-radar-score"
                      points={pts.join(' ')}
                    />
                  );
                })()}

                {/* Score points */}
                {(() => {
                  const scores = [0.95, 0.90, 0.95, 0.88, 0.92, 0.95, 0.90, 1.0];
                  return scores.map((score, i) => {
                    const angle = (i * 45 - 90) * Math.PI / 180;
                    const r = 80 * score;
                    return (
                      <circle
                        key={i}
                        className="health-radar-point"
                        cx={100 + r * Math.cos(angle)}
                        cy={100 + r * Math.sin(angle)}
                        r={2.5}
                      />
                    );
                  });
                })()}

                {/* Axis labels */}
                {[
                  { label: 'Type', i: 0 },
                  { label: 'Motion', i: 1 },
                  { label: 'Color', i: 2 },
                  { label: 'A11y', i: 3 },
                  { label: 'Space', i: 4 },
                  { label: 'Hierarchy', i: 5 },
                  { label: 'Interact', i: 6 },
                  { label: 'Provenance', i: 7 },
                ].map(({ label, i }) => {
                  const angle = (i * 45 - 90) * Math.PI / 180;
                  const labelR = 92;
                  const x = 100 + labelR * Math.cos(angle);
                  const y = 100 + labelR * Math.sin(angle);
                  return (
                    <text
                      key={i}
                      className="health-radar-label"
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {label}
                    </text>
                  );
                })}
              </svg>
            </aside>
          </div>
          <div className="section-more">
            <Link
              className="text-link"
              href="/docs"
              data-cuelume-hover="tick"
            >
              Read all nine principles
              <span aria-hidden="true"> →</span>
            </Link>
          </div>
        </section>

        {/* --- Field cards --- */}
        <section className="section" aria-labelledby="field-title">
          <p className="section-eyebrow">Now live</p>
          <h2 className="section-title" id="field-title">
            Open stack, contract, labs, and kit.
          </h2>
          <div className="field-grid">
            {FIELD.map((item) => (
              <Link
                className={`field-card field-card--${item.kind}`}
                href={item.href}
                key={item.href}
                data-cuelume-hover={
                  item.kind === 'open'
                    ? 'sparkle'
                    : item.kind === 'lab'
                      ? 'bloom'
                      : item.kind === 'kit'
                        ? 'chime'
                        : 'tick'
                }
                data-cuelume-press
                data-cuelume-release={
                  item.kind === 'open' || item.kind === 'kit' ? 'success' : ''
                }
              >
                <div className="field-card-top">
                  <span className={`status-badge status-badge--${item.kind}`}>
                    {item.badge}
                  </span>
                  <span
                    className={`mark-glyph mark-glyph--${item.kind}`}
                    aria-hidden="true"
                    title={
                      item.kind === 'open'
                        ? 'Open mark · origin signal'
                        : item.kind === 'contract'
                          ? 'Contract mark · structure'
                          : item.kind === 'kit'
                            ? 'Kit mark · usable package'
                            : 'Lab mark · living experiment'
                    }
                  >
                    <span className="mark-glyph-core" />
                    <span className="mark-glyph-ring" />
                  </span>
                </div>
                <div
                  className={`field-card-status${
                    item.status === 'Live' ? ' is-live' : ''
                  }`}
                >
                  {item.status}
                </div>
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
          <div className="state-layout">
            <div className="row-stack" role="list">
              {[
                {
                  title: 'Open design intelligence',
                  meta: 'Human index /open and machine feed /open.json',
                },
                {
                  title: 'Design system contract v0.1.4',
                  meta: 'Human home, full tables, machine export · Poise + Takt + Cadence adopted',
                },
                {
                  title: 'Lab One · Poise',
                  meta: 'Restrained interaction — rules adopted into v0.1.1',
                },
                {
                  title: 'Lab Two · Takt',
                  meta: 'Interface feel — rules adopted into v0.1.2',
                },
                {
                  title: 'Lab Three · Cadence',
                  meta: 'Text rhythm — rules adopted into v0.1.3',
                },
                {
                  title: 'Use Kit One · Design Review',
                  meta: 'Portable review package · human + machine export',
                },
                {
                  title: 'Field checks · Poise, Takt, and Cadence',
                  meta: 'Labs reviewed with Kit One · pass with notes',
                },
                {
                  title: 'Keyboard path',
                  meta: 'Site-wide and Lab One tab order / focus-visible proof',
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
                <ToggleRow key={item.title} index={String(i + 1).padStart(2, '0')}>
                  <span className="row-body">
                    <span className="row-title">{item.title}</span>
                    <span className="row-meta">{item.meta}</span>
                  </span>
                </ToggleRow>
              ))}
            </div>

            <aside className="state-marquee" aria-hidden="true">
              <span className="state-marquee-header">System signals</span>
              <div className="state-marquee-track">
                {[
                  { t: 'v0.1.4 · LIVE', c: 'live' },
                  { t: 'Poise ✓ adopted', c: 'adopted' },
                  { t: 'Takt ✓ adopted', c: 'adopted' },
                  { t: 'Cadence ✓ adopted', c: 'adopted' },
                  { t: 'Review ✓ pass', c: 'adopted' },
                  { t: 'Keyboard ✓ verified', c: 'adopted' },
                  { t: 'Drift rule active', c: 'live' },
                  { t: 'SKILL.md published', c: 'live' },
                  { t: 'open.json · machine feed', c: 'info' },
                  { t: 'llms.txt · agent brief', c: 'info' },
                  { t: 'Cuelume · sound on', c: 'info' },
                  { t: 'reduced-motion safe', c: 'info' },
                  { t: 'v0.1.4 · LIVE', c: 'live' },
                  { t: 'Poise ✓ adopted', c: 'adopted' },
                  { t: 'Takt ✓ adopted', c: 'adopted' },
                  { t: 'Cadence ✓ adopted', c: 'adopted' },
                  { t: 'Review ✓ pass', c: 'adopted' },
                  { t: 'Keyboard ✓ verified', c: 'adopted' },
                  { t: 'Drift rule active', c: 'live' },
                  { t: 'SKILL.md published', c: 'live' },
                  { t: 'open.json · machine feed', c: 'info' },
                  { t: 'llms.txt · agent brief', c: 'info' },
                  { t: 'Cuelume · sound on', c: 'info' },
                  { t: 'reduced-motion safe', c: 'info' },
                ].map((item, i) => (
                  <span className={`state-marquee-pill state-marquee-pill--${item.c}`} key={i}>
                    {item.t}
                  </span>
                ))}
              </div>
            </aside>
          </div>
        </section>
      </main>

      {/* --- Footer --- */}
      <Footer />
    </>
  );
}