import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from './lib/topbar';
import { Footer } from './lib/footer';
import { Toggle } from './lib/toggle';
import { ToggleRow } from './lib/toggle-row';
import { StateMarquee } from './lib/state-marquee';
import { pageMeta } from './lib/site-meta';
import { ScoreForm } from './score/score-form';
import { HeroSeam } from './hero-seam';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Designesy — Score any site against the design contract',
  description:
    'AI makes execution free. We make execution yours. Score any site against the Designesy design system contract — 32 checks, one grade, real-time. The design legitimacy standard.',
  path: '/',
  ogTitle: 'Designesy — The design legitimacy standard',
  ogDescription:
    '32 automated verification checks against a real design contract. Enter a URL, get a grade. AI makes execution free. We make execution yours.',
  twitterDescription:
    'Score any site against the Designesy design contract. 32 checks. One grade. designesy.org',
});

const PILLARS = [
  {
    number: '01',
    title: 'Taste codified',
    text: 'The contract encodes design judgment — tokens, motion, acoustic, takt, cadence — so taste survives any tool, any team, any AI.',
  },
  {
    number: '02',
    title: 'Verification as proof',
    text: '32 automated checks prove the contract is met. The score is the output metric — not whether you read the rules, but whether your design passes them.',
  },
  {
    number: '03',
    title: 'Anti-generic by design',
    text: 'Fifteen anti-generic tells detect when a surface has defaulted to the mean. No generator has this. The contract is the structural defense against AI sameness.',
  },
  {
    number: '04',
    title: 'Multi-surface hardening',
    text: 'Every new surface that ingests the contract stress-tests it. Each failure closes a gap. The contract gets stronger with every tool that touches it.',
  },
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
    meta: 'v0.3.0 public',
  },
];

const FIELD = [
  {
    href: '/contracts/design-system',
    badge: 'Contract',
    status: 'v0.3.0',
    title: 'Design system contract',
    lede: 'The rules behind this site — portable and versioned.',
    desc: 'Tokens, motion, components, Poise + Takt + Cadence rules. Human overview plus a machine export agents can cite directly.',
    arrow: 'Read the contract →',
    kind: 'contract' as const,
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
  {
    href: 'https://designesy.ai.studio/',
    badge: 'Conversational',
    status: 'Live',
    title: 'Talk to the Director',
    lede: 'The contract, conversational. Ask about type, motion, spacing — or score any site.',
    desc: 'A conversational instance of the Designesy Director. Answers from the designesy.org contract — tokens, principles, and open tensions, not vibes.',
    arrow: 'Open the chat →',
    kind: 'kit' as const,
  },
  {
    href: '/continuity',
    badge: 'Early access',
    status: 'Waitlist',
    title: 'Continuity',
    lede: 'Design judgment that stays current.',
    desc: 'Score, contract, verify — and keep the receipt. Open core stays free. Continuity adds history and drift for work that continues.',
    arrow: 'Join the waitlist →',
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
      <Topbar scrolled />

      <main id="main-content" className="site-shell">
        {/* --- Score hero — the input is the product, front and center --- */}
        <section className="hero" aria-labelledby="hero-title">
          <HeroSeam />
          <p className="hero-eyebrow fade-up" data-scramble>
            The design legitimacy standard
          </p>
          <h1 className="hero-title sr-only" id="hero-title">
            designesy.
          </h1>
          <p className="hero-lede fade-up fade-up-delay-2" data-scramble>
            AI makes execution free. We make execution yours.
          </p>
          <p className="hero-sub fade-up fade-up-delay-3">
            Score any site against a real design contract. 32 checks. One grade.
            No vibe-tax.
          </p>
          <div id="score" className="score-hero-input fade-up fade-up-delay-4">
            <ScoreForm />
          </div>
          <p className="hero-hint fade-up fade-up-delay-5">
            No login. Real-time. 32 checks against contract v0.3.0.{' '}
            <Link
              href="/contracts/design-system"
              className="text-link"
              data-cuelume-hover="tick"
              data-cuelume-press
            >
              Read the contract →
            </Link>
          </p>
        </section>

        {/* --- Pillars: reframed as brand-legitimacy infrastructure --- */}
        <section className="section" aria-labelledby="pillars-title">
          <p className="section-eyebrow">Why it matters</p>
          <h2 className="section-title" id="pillars-title" data-scramble>
            Brand legitimacy infrastructure.
          </h2>
          <p className="surface-lede">
            When execution is free, design coherence becomes the new legitimacy
            signal. A site that is visually consistent, motion-coherent, and
            takt-disciplined reads as real. The contract is what makes that
            verifiable.
          </p>
          <div className="pillar-grid">
            {PILLARS.map((pillar) => (
              <Toggle
                className="pillar fade-in"
                key={pillar.number}
                data-cuelume-hover="bloom"
                data-cuelume-toggle="toggle"
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
          <h2 className="section-title" id="principles-title" data-scramble>
            Nine principles. Four shown here.
          </h2>
          <div className="principle-layout" data-reveal-group>
            <div className="principle-list principle-list--rail">
              {PRINCIPLES_PREVIEW.map((p) => (
                <div className="principle" key={p.num} data-reveal>
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
              data-cuelume-press="tick"
            >
              Read all nine principles
              <span aria-hidden="true"> →</span>
            </Link>
          </div>
        </section>

        {/* --- Field cards --- */}
        <section className="section" aria-labelledby="field-title">
          <p className="section-eyebrow">Now live</p>
          <h2 className="section-title" id="field-title" data-scramble>
            Contract, labs, and kit.
          </h2>
          <div className="field-grid" data-reveal-group>
            {FIELD.map((item) => {
              const isExternal = item.href.startsWith('http');
              const CardTag = isExternal ? 'a' : Link;
              const externalProps = isExternal
                ? { target: '_blank' as const, rel: 'noopener noreferrer' }
                : {};
              return (
                <CardTag
                  className={`field-card field-card--${item.kind}`}
                  href={item.href}
                  data-reveal
                  key={item.href}
                  data-cuelume-hover={
                    item.kind === 'kit' ? 'chime' : 'tick'
                  }
                  data-cuelume-press
                  {...externalProps}
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
                          : 'Kit mark · usable package'
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
                </CardTag>
              );
            })}
          </div>
        </section>

        {/* --- Surfaces --- */}
        <section className="section" aria-labelledby="surfaces-title">
          <p className="section-eyebrow">Surfaces</p>
          <h2 className="section-title" id="surfaces-title" data-scramble>
            Public lanes with live cargo.
          </h2>
          <div className="surface-list" data-reveal-group>
            {SURFACES.map((surface) => (
              <Link
                className="surface-card"
                href={surface.href}
                data-reveal
                key={surface.href}
                data-cuelume-hover="whisper"
                data-cuelume-press
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
          <h2 className="section-title" id="system-state-title" data-scramble>
            What is real on this site.
          </h2>
          <div className="state-layout">
            <div className="row-stack" role="list">
              {[
                {
                  title: 'Design system contract v0.3.0',
                  meta: 'Human home, full tables, machine export · Poise + Takt + Cadence adopted',
                },
                {
                  title: 'Verification engine · 32 checks',
                  meta: 'Live on /score · scores any URL against the contract in real-time',
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
                  title: 'Multi-surface stress log',
                  meta: 'v0.dev, Lovable, Bolt, Framer, Stripe scored against the contract',
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

            <StateMarquee />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}