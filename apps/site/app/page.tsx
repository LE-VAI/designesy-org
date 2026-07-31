import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from './lib/topbar';
import { Footer } from './lib/footer';
import { Toggle } from './lib/toggle';
import { ToggleRow } from './lib/toggle-row';
import { StateMarquee } from './lib/state-marquee';
import { pageMeta } from './lib/site-meta';
import { ScoreForm } from './score/score-form';
import { HeroConstruction } from './hero-construction';
import { ContractHealthRack, CONTRACT_HEALTH_DIMS, CONTRACT_HEALTH_MEAN } from './contract-health-rack';
import {
  ENGINE_CHECK_COUNT,
  CONTRACT_VERSION,
  SELF_SCORE,
  SELF_GRADE,
  COHORT_SCORED_COUNT,
  COHORT_TOTAL_COUNT,
  RECENT_SCORES,
} from './hero-stats';

// ISR: the homepage is statically rendered and cached at the Vercel edge,
// regenerated at most once per hour. This is now possible because the theme
// stamp moved out of the RSC render path (cookies() in layout.tsx forced the
// whole tree dynamic; it now runs client-side via the inline script). The
// hero self-score is baked at build/revalidate time — it refreshes within
// the hour window, which is the correct freshness for a marketing page.
export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'Designesy — Score any site against the design contract',
  description:
    'AI makes execution free. We make execution yours. Score any site against the Designesy design system contract — 40 checks, one grade, real-time. The design legitimacy standard.',
  path: '/',
  ogTitle: 'Designesy — The design legitimacy standard',
  ogDescription:
    '40 automated verification checks against a real design contract. Enter a URL, get a grade. AI makes execution free. We make execution yours.',
  twitterDescription:
    'Score any site against the Designesy design contract. 40 checks. One grade. designesy.org',
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
    text: '40 automated checks prove the contract is met. The score is the output metric — not whether you read the rules, but whether your design passes them.',
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
    meta: 'v0.4.0 public',
  },
];

const FIELD = [
  {
    href: '/contracts/design-system',
    badge: 'Contract',
    status: 'v0.4.0',
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

const pctMean = Math.round(CONTRACT_HEALTH_MEAN * 100);

export default function HomePage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="site-shell">
        {/* --- Product hero — the scoring input is the gravitational center ---
            Layout: eyebrow → editorial display (two-line proof statement) →
            the product (URL input) → a real stats row + recent-scores rail.
            Behind it all: the hero-construction field (datum arc + CAD
            primitives), the architectural-interface midground layer. */}
        <section className="hero hero-architectural" aria-labelledby="hero-title">
          <HeroConstruction />
          <div className="hero-content">
            <p className="hero-eyebrow fade-up" data-scramble>
              The design legitimacy standard
            </p>
            <h1 className="hero-title hero-display fade-up fade-up-delay-1" id="hero-title">
              <span className="hero-display-line" data-scramble>AI makes execution free.</span>
              <span
                className="hero-display-line is-accent"
                data-scramble
                data-scramble-rotate='["We make execution yours.","We make execution count.","We make execution stick.","We make execution intentional."]'
              >
                We make execution yours.
              </span>
            </h1>
            <p className="hero-sub fade-up fade-up-delay-2">
              Score any site against a real design contract. {ENGINE_CHECK_COUNT}{' '}
              checks. One grade. No vibe-tax.
            </p>

            {/* THE PRODUCT — the URL input, the visual center of gravity */}
            <div id="score" className="score-hero-input fade-up fade-up-delay-3">
              <ScoreForm />
            </div>

            {/* REAL proof only — every value from app/hero-stats.ts. Nothing
                fabricated. VWP receipt: see hero-stats module header. */}
            <div className="hero-proof fade-up fade-up-delay-4" role="group" aria-label="Live verification facts">
              <ul className="hero-proof-stats">
                <li className="hero-proof-stat">
                  <span className="hero-proof-dot is-live" aria-hidden="true" />
                  <span>Live contract <b>{CONTRACT_VERSION}</b></span>
                </li>
                <li className="hero-proof-stat">
                  <span className="hero-proof-num">{ENGINE_CHECK_COUNT}</span>
                  <span>checks</span>
                </li>
                <li className="hero-proof-stat">
                  <span>No login</span>
                </li>
                <li className="hero-proof-stat">
                  <span className="hero-proof-num">{COHORT_SCORED_COUNT}</span>
                  <span>of {COHORT_TOTAL_COUNT} sites scored</span>
                </li>
                <li className="hero-proof-stat">
                  <span>Self-score </span>
                  <span className="hero-proof-num">{SELF_SCORE}%</span>
                  <span className="hero-proof-grade is-a">{SELF_GRADE}</span>
                </li>
              </ul>

              <div className="hero-proof-recent">
                <p className="hero-proof-recent-label">Highest-scoring in the cohort</p>
                <ul className="hero-proof-recent-list">
                  {RECENT_SCORES.map((s) => (
                    <li key={s.url} className="hero-proof-recent-item">
                      <a
                        className="hero-proof-recent-link"
                        href={`/score?url=${encodeURIComponent(new URL(s.url).host.replace(/^www\./, ''))}`}
                        data-cuelume-hover="tick"
                      >
                        <span className="hero-proof-recent-name">
                          {s.name}
                          {s.isSelf && <span className="hero-proof-recent-self">self</span>}
                        </span>
                        <span className="hero-proof-recent-dots" aria-hidden="true" />
                        <span className="hero-proof-recent-score" data-tabular>{s.score.toFixed(1)}</span>
                        <span className={`hero-proof-recent-grade is-${s.grade.toLowerCase()}`}>{s.grade}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="hero-hint fade-up fade-up-delay-5">
              No login. Real-time. {ENGINE_CHECK_COUNT} checks against contract {CONTRACT_VERSION}.{' '}
              <Link
                href="/contracts/design-system"
                className="text-link"
                data-cuelume-hover="tick"
                data-cuelume-press
              >
                Read the contract →
              </Link>
            </p>
          </div>
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

        {/* --- Principles preview + Contract health rack --- */}
        <section className="section" aria-labelledby="principles-title">
          <div className="section-heading-row">
            <div>
              <p className="section-eyebrow">Operating principles</p>
              <h2 className="section-title" id="principles-title" data-scramble>
                Nine principles. Four shown here.
              </h2>
            </div>
            <div className="section-heading-badge" aria-label={`Contract health mean ${pctMean} out of 100 across ${CONTRACT_HEALTH_DIMS.length} dimensions`}>
              <span className="section-heading-badge-label">Contract health</span>
              <span className="section-heading-badge-value">
                <span className="section-heading-badge-numeral" data-tabular>{pctMean}</span>
                <span className="section-heading-badge-unit">· {CONTRACT_HEALTH_DIMS.length} dimensions</span>
              </span>
            </div>
          </div>
          <div className="principle-layout" data-reveal-group>
            <div className="principle-cell" role="list">
              {PRINCIPLES_PREVIEW.map((p) => (
                <div className="principle" key={p.num} data-reveal role="listitem">
                  <span className="principle-num">{p.num}</span>
                  <div className="principle-body">
                    <h3>{p.title}</h3>
                    <p>{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="health-panel" data-reveal>
              <ContractHealthRack />
            </div>
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
                  title: 'Design system contract v0.4.0',
                  meta: 'Human home, full tables, machine export · Poise + Takt + Cadence adopted',
                },
                {
                  title: 'Verification engine · 40 checks',
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