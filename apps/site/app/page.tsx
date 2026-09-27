import type { Metadata } from 'next';
import Link from 'next/link';
import './home.css';
import { Topbar } from './lib/topbar';
import { Footer } from './lib/footer';
import { Toggle } from './lib/toggle';
import { ToggleRow } from './lib/toggle-row';
import { StateMarquee } from './lib/state-marquee';
import { pageMeta } from './lib/site-meta';
import { ScoreForm } from './score/score-form';
import { HeroConstruction } from './hero-construction';
import { ContractHealthRack, CONTRACT_HEALTH_DIMS, CONTRACT_HEALTH_MEAN } from './contract-health-rack';
import { CountUp } from './lib/count-up';
import { ScoreLoop } from './lib/score-loop';
import { ContractRing } from './lib/contract-ring';
import { CheckGrid } from './lib/check-grid';
import {
  ENGINE_CHECK_COUNT,
  CONTRACT_VERSION,
  SELF_SCORE,
  SELF_GRADE,
  COHORT_SCORED_COUNT,
  COHORT_TOTAL_COUNT,
  COHORT_LAST_SCORED,
  RECENT_SCORES,
  LOWEST_SCORE,
  LOWEST_GRADE,
  LOWEST_NAME,
} from './hero-stats';

// ISR: the homepage is statically rendered and cached at the Vercel edge,
// regenerated at most once per hour. This is now possible because the theme
// stamp moved out of the RSC render path (cookies() in layout.tsx forced the
// whole tree dynamic; it now runs client-side via the inline script).
//
// ⚠️ RE-RENDER CADENCE IS NOT DATA FRESHNESS — do not conflate these.
// `revalidate = 3600` controls how often this PAGE re-renders. It says nothing
// about how fresh the numbers on it are. The hero's self-score is read from the
// leaderboard seed, which only changes when the weekly rescore workflow runs
// (Mondays 10:00 UTC) — so the page can re-render hourly while quoting a score
// measured days earlier.
//
// This comment previously read "the hero self-score is baked at build/revalidate
// time — it refreshes within the hour window", which is true of the RENDER and
// false of the VALUE. That wording is why the hero displayed "Self-score 93%" as
// though it were live while the live engine returned 98% for the same verdict
// counts. The number now renders with its measurement date beside it
// (COHORT_LAST_SCORED) so the reader is told which fact they are looking at.
//
// If you want the hero to quote a fresher number, the fix is to raise the
// rescore cadence in .github/workflows/rescore-leaderboard.yml — NOT to lower
// this value. Lowering it re-renders the same stale number more often.
export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'Designesy: design judgment, verified live',
  description:
    `AI makes execution free. We make execution provable. Designesy publishes design judgment as a versioned contract and verifies any live page against it: ${ENGINE_CHECK_COUNT} checks, one grade, evidence you can cite.`,
  path: '/',
  ogTitle: 'Designesy: design judgment, verified live',
  ogDescription:
    `A published design contract and a live engine that verifies any page against it. ${ENGINE_CHECK_COUNT} checks, one grade. AI makes execution free. We make execution provable.`,
  twitterDescription:
    `Verify any site against the Designesy design contract. ${ENGINE_CHECK_COUNT} checks. One grade. designesy.org`,
});

// The hero headline, in the two parts the markup renders. HERO_ROTATOR_WORDS[0]
// is the word the rotator rests on, so the canonical sentence and the settled
// animation can never disagree — see HERO_HEADLINE below.
const HERO_LINE_1 = 'AI makes execution free.';
const HERO_LINE_2_PREFIX = 'We make execution ';
// Facelift: the list was nine words and led with its weakest ("yours"). The
// headline now lands the outcome first ("provable"), and the rotation cycles
// four words that each state a result, pausable with the site-wide motion
// toggle. Word 0 is also the accessible name and the settled state.
const HERO_ROTATOR_WORDS = ['provable', 'legitimate', 'real', 'yours'] as const;

/**
 * The h1's accessible name — the sentence as a reader hears it, fixed.
 *
 * WHY THIS IS HANDED TO THE BROWSER RATHER THAN LEFT TO THE DOM
 * The headline animates: the final word scrambles and cycles every 3.2s. That
 * animation must not be the source of the page's primary heading text, because
 * everything that caches or cites an h1 gets a different sentence depending on
 * WHEN it looked. Measured on production, reading Chrome's own accessibility
 * tree: "AI makes execution We make execution yours." while the visible word
 * read "legitimate" — and the word "free" was missing entirely, because the
 * enhancer derives each line's aria-label from that line's first text node and
 * line 1 ends in a sibling <span>.
 *
 * So the name is declared here, derived from the same rotator list the markup
 * uses, and both animated lines are aria-hidden. Text in the accessibility tree
 * is then complete and constant whether the reader arrives before the first
 * decode, between two rotations, or mid-scramble.
 *
 * aria-hidden on the lines is safe: this is decorative repetition of the name
 * above it, not content. The visible text still renders exactly as before, and
 * the markdown generator (which reads DOM text, not the a11y tree) is
 * unaffected.
 *
 * The rotator's own aria-label writes are left in place — they are the
 * enhancer's business during the animation, and they cost nothing now that both
 * lines are hidden from assistive tech.
 */
const HERO_HEADLINE = `${HERO_LINE_1} ${HERO_LINE_2_PREFIX}${HERO_ROTATOR_WORDS[0]}.`;

const PILLARS = [
  {
    number: '01',
    title: 'Taste codified',
    text: 'The contract encodes design judgment as tokens, motion, sound, takt, and cadence, so taste survives any tool, any team, and any AI that generates your UI.',
  },
  {
    number: '02',
    title: 'Verification as proof',
    text: `${ENGINE_CHECK_COUNT} automated checks prove the contract is met. With 42% of committed React now AI-generated (Belitsoft, State of React Development 2026), the score measures what actually shipped: the rendered page, as a visitor meets it.`,
  },
  {
    number: '03',
    title: 'Anti-generic by design',
    text: 'Twelve anti-generic tells detect when a surface has defaulted to the AI mean. No generator has this. The contract is the structural defense against AI sameness.',
  },
  {
    number: '04',
    title: 'Multi-surface hardening',
    text: 'Every new surface that ingests the contract stress-tests it. Each failure closes a gap the AI tools left open. The contract gets stronger with every generation.',
  },
];

const SURFACES = [
  {
    href: '/open',
    label: 'Open',
    desc: 'Portable design intelligence: human index and machine feed',
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
    meta: 'Poise + Takt + Cadence + Acoustics live',
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
    meta: CONTRACT_VERSION + ' public',
  },
  {
    href: '/work',
    label: 'Work',
    desc: 'Case studies: shipped artifacts with before and after scores',
    meta: '5 case studies',
  },
  {
    href: '/methodology',
    label: 'Methodology',
    desc: `The full ${ENGINE_CHECK_COUNT}-check scoring methodology: weights, math, grade bands`,
    meta: 'Fully transparent',
  },
  {
    href: '/benchmarks',
    label: 'Benchmarks',
    desc: 'Designesy, hallmark, and slop-eval side by side: three tools, three questions',
    meta: 'Competitive',
  },
  {
    href: '/badge',
    label: 'Badge',
    desc: 'Embed the Verified by Designesy badge, linked to a live score',
    meta: 'SVG embed',
  },
  {
    href: '/graph',
    label: 'Graph',
    desc: 'The provenance chain: how a source becomes a principle, a rule, a token, and a check',
    meta: 'Provenance',
  },
  {
    href: '/pricing',
    label: 'Pricing',
    desc: 'Open core, paid continuity, enterprise',
    meta: 'Free forever',
  },
];

const FIELD = [
  {
    href: '/contracts/design-system',
    badge: 'Contract',
    status: CONTRACT_VERSION,
    title: 'Design system contract',
    lede: 'The rules behind this site, portable and versioned.',
    desc: 'Tokens, motion, components, and the Poise, Takt, Cadence, and Acoustics rules. A human overview, plus a machine export agents can cite directly.',
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
    title: 'Try the Studio',
    lede: 'The contract, conversational. Ask about type, motion, or spacing, or score any site.',
    desc: 'A conversational instance of the Designesy Director. It answers from the designesy.org contract: tokens, principles, and open tensions.',
    arrow: 'Open the chat →',
    kind: 'kit' as const,
  },
  {
    href: '/continuity',
    badge: 'Early access',
    status: 'Waitlist',
    title: 'Continuity',
    lede: 'Design judgment that stays current.',
    desc: 'Score, contract, verify, and keep the receipt. Open core stays free. Continuity adds history and drift for work that continues.',
    arrow: 'Join the waitlist →',
    kind: 'kit' as const,
  },
];

// All nine operating principles (canonical titles from /docs). The homepage
// used to show four under "Nine principles. Four shown here.", a headline that
// announced its own incompleteness. Titles only: the full wording lives in the
// doctrine, one link away. Rendered with CheckGrid, the site's cell system, so
// a reader can check each one off.
const PRINCIPLES = [
  'Purpose earns form',
  'Economy is intelligence',
  'Context is part of the object',
  'Affordance should be felt',
  'Durability includes time and change',
  'Inclusion is structural',
  'Systems enable freedom',
  'Delight must be earned',
  'Responsibility is a design material',
].map((title) => ({ title }));

const pctMean = Math.round(CONTRACT_HEALTH_MEAN * 100);

export default function HomePage() {
  return (
    <>
      <Topbar scrolled />

      {/* data-particles="quiet": the ambient field thins here so the contract
          ring stays the page's one dominant mass (lib/ambient-particles). */}
      <main id="main-content" data-pagefind-body className="site-shell home" data-particles="quiet">
        {/* --- Hero: the claim, the product, and the one anchor ---
            Positioning: Designesy states design judgment as a published
            standard and proves it live on any page, its own included:
            authoritative in what it claims, playful in how it shows the proof.
            Left: the claim (editorial, left-aligned), the form, the proof row.
            Right: the contract ring, the page's single dominant mass and its
            one cinematic moment. */}
        <section className="hero hero-architectural home-hero" aria-labelledby="hero-title">
          <HeroConstruction />
          <div className="hero-content home-hero-content">
            <p className="home-kicker">
              <span className="home-kicker-mark" aria-hidden="true" />
              The design standard, verified live
            </p>
            <h1 className="hero-title hero-display" id="hero-title" aria-label={HERO_HEADLINE}>
              <span className="hero-display-line" data-scramble aria-hidden="true">
                AI makes execution<span className="hero-word-free"> free</span>.
              </span>
              <span
                className="hero-display-line is-accent"
                data-scramble
                aria-hidden="true"
                data-scramble-rotate-words={JSON.stringify(HERO_ROTATOR_WORDS)}
                data-scramble-rotate-delay="3200"
              >
                <span data-prefix>{HERO_LINE_2_PREFIX}</span>
                <span data-word>{HERO_ROTATOR_WORDS[0]}</span>
                <span>.</span>
              </span>
            </h1>

            <div className="home-hero-grid">
              <div className="home-hero-main">
                <p className="hero-sub fade-up fade-up-delay-1">
                  Designesy publishes design judgment as a versioned contract, then verifies any live
                  page against it. {ENGINE_CHECK_COUNT} checks, one grade, and evidence you can cite.
                </p>

                {/* THE PRODUCT: the URL input */}
                <div id="score" className="score-hero-input fade-up fade-up-delay-2">
                  <ScoreForm />
                </div>

                {/* REAL proof only: every value from app/hero-stats.ts. */}
                <div className="hero-proof fade-up fade-up-delay-3" role="group" aria-label="Live verification facts">
                  <ul className="hero-proof-stats">
                    <li className="hero-proof-stat">
                      <span className="hero-proof-dot is-live" aria-hidden="true" />
                      <span>Live contract <b>{CONTRACT_VERSION}</b></span>
                    </li>
                    <li className="hero-proof-stat">
                      <span className="hero-proof-num"><CountUp value={ENGINE_CHECK_COUNT} /></span>
                      <span>checks</span>
                    </li>
                    <li className="hero-proof-stat">
                      <span className="hero-proof-num"><CountUp value={COHORT_SCORED_COUNT} /></span>
                      <span>of <CountUp value={COHORT_TOTAL_COUNT} /> sites scored</span>
                    </li>
                    {LOWEST_SCORE !== null && (
                      <li className="hero-proof-stat">
                        <span>Lowest </span>
                        <span className="hero-proof-num"><CountUp value={LOWEST_SCORE} suffix="%" /></span>
                        <span className={`hero-proof-grade is-${LOWEST_GRADE?.toLowerCase()}`}>{LOWEST_GRADE}</span>
                      </li>
                    )}
                  </ul>
                </div>

                <p className="hero-hint fade-up fade-up-delay-4">
                  The compliance layer for AI-generated UI. No login, {ENGINE_CHECK_COUNT} checks against
                  contract {CONTRACT_VERSION}.{' '}
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

              {/* The anchor: the contract as an instrument, then the cohort it
                  measures, at a lower rank. */}
              <div className="home-instrument">
                {/* The self-score is a dated fact from the leaderboard seed
                    (weekly rescore), shown with its date; see hero-stats. */}
                <ContractRing grade={SELF_GRADE} score={SELF_SCORE} measured={COHORT_LAST_SCORED} />
                <div className="hero-proof-recent home-cohort">
                  <p className="hero-proof-recent-label">Highest-scoring in the cohort</p>
                  <ul className="hero-proof-recent-list">
                    {RECENT_SCORES.slice(0, 3).map((s) => (
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
                          <span className="hero-proof-recent-score" data-tabular><CountUp value={s.score} decimals={1} /></span>
                          <span className={`hero-proof-recent-grade is-${s.grade.toLowerCase()}`}>{s.grade}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- Demonstration: the product, working ---
            A seamless 6s loop of the engine's checks sweeping a generic page.
            v03 FAIL (no score ceiling) and v06 WARN (WARN never triggers v06's
            cap), so grade A holds. No eyebrow: the heading and the loop carry it. */}
        <section className="section home-demo" aria-labelledby="score-loop-title">
          <div className="home-split-head">
            <h2 className="section-title home-title home-title--section" id="score-loop-title" data-scramble>
              Every check, run against the page.
            </h2>
            <p className="surface-lede">
              Each of the {ENGINE_CHECK_COUNT} checks inspects a part of the page. A finding pins to
              the element it flags, named by the check that caught it.
            </p>
          </div>
          <ScoreLoop description="Demo on a generic page. v03 fails because no focus-visible ring is declared. v06 warns because muted text measures 3.8 to 1, under the 4.5 to 1 body minimum. Neither finding caps the score, so the page grades A." />
        </section>

        {/* --- Statement: why it matters ---
            The page's largest claim after the hero, stated positively. The four
            pillars are Toggle cells (cell logic kept: press, toggle, sound). */}
        <section className="section home-statement" aria-labelledby="pillars-title">
          <h2 className="section-title home-title home-title--statement" id="pillars-title" data-scramble>
            Coherence is how a site earns trust now.
          </h2>
          <p className="surface-lede home-statement-lede">
            When AI can generate any interface, trust goes to the sites that hold together:
            consistent type, coherent motion, a steady rhythm. The contract makes that coherence
            checkable. {ENGINE_CHECK_COUNT} checks run against the live page, and each one passes or
            fails in the open.
          </p>
          <div className="pillar-grid home-pillars">
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

        {/* --- The contract: nine principles and the health rack ---
            All nine principles as CheckGrid cells beside the instrument that
            measures the contract's own health. */}
        <section className="section home-principles" aria-labelledby="principles-title">
          <p className="section-eyebrow">The contract</p>
          <div className="home-principles-grid">
            <div className="home-principles-main">
              <h2 className="section-title home-title home-title--section" id="principles-title" data-scramble>
                Nine principles. One contract.
              </h2>
              <p className="surface-lede">
                Every check traces back to a principle. Check them off as you read; the full wording
                lives in the doctrine.
              </p>
              <CheckGrid items={PRINCIPLES} labelledBy="principles-title" className="home-principle-cells" />
              <div className="section-more">
                <Link
                  className="text-link"
                  href="/docs#operating-principles"
                  data-cuelume-hover="tick"
                  data-cuelume-press="tick"
                >
                  Read the nine principles in full
                  <span aria-hidden="true"> →</span>
                </Link>
              </div>
            </div>
            <aside className="health-panel home-health" aria-label={`Contract health mean ${pctMean} out of 100 across ${CONTRACT_HEALTH_DIMS.length} dimensions`}>
              <div className="home-health-head">
                <span className="section-heading-badge-label">Contract health</span>
                <span className="section-heading-badge-value">
                  <span className="section-heading-badge-numeral" data-tabular>{pctMean}</span>
                  <span className="section-heading-badge-unit">· {CONTRACT_HEALTH_DIMS.length} dimensions</span>
                </span>
              </div>
              <ContractHealthRack />
            </aside>
          </div>
        </section>

        {/* --- Now live: a bento with one featured card (the contract) --- */}
        <section className="section home-field" aria-labelledby="field-title">
          <p className="section-eyebrow">Now live</p>
          <h2 className="section-title home-title home-title--section" id="field-title" data-scramble>
            Four ways to put the contract to work.
          </h2>
          <div className="field-grid home-bento">
            {FIELD.map((item, i) => {
              const isExternal = item.href.startsWith('http');
              const CardTag = isExternal ? 'a' : Link;
              const externalProps = isExternal
                ? { target: '_blank' as const, rel: 'noopener noreferrer' }
                : {};
              return (
                <CardTag
                  className={`field-card field-card--${item.kind}${i === 0 ? ' is-featured' : ''}`}
                  href={item.href}
                  key={item.href}
                  data-cuelume-hover={item.kind === 'kit' ? 'chime' : 'tick'}
                  data-cuelume-press
                  {...externalProps}
                >
                  <div className="field-card-top">
                    <span className={`status-badge status-badge--${item.kind}`}>{item.badge}</span>
                    <span
                      className={`mark-glyph mark-glyph--${item.kind}`}
                      aria-hidden="true"
                      title={item.kind === 'contract' ? 'Contract mark · structure' : 'Kit mark · usable package'}
                    >
                      <span className="mark-glyph-core" />
                      <span className="mark-glyph-ring" />
                    </span>
                  </div>
                  <div className={`field-card-status${item.status === 'Live' ? ' is-live' : ''}`}>{item.status}</div>
                  <h3 className="field-card-title">{item.title}</h3>
                  <p className="field-card-lede">{item.lede}</p>
                  <p className="field-card-desc">{item.desc}</p>
                  {i === 0 && (
                    <dl className="home-contract-facts">
                      <div><dt>Version</dt><dd data-tabular>{CONTRACT_VERSION}</dd></div>
                      <div><dt>Principles</dt><dd data-tabular>{PRINCIPLES.length}</dd></div>
                      <div><dt>Checks</dt><dd data-tabular>{ENGINE_CHECK_COUNT}</dd></div>
                    </dl>
                  )}
                  <span className="field-card-arrow">{item.arrow}</span>
                </CardTag>
              );
            })}
          </div>
        </section>

        {/* --- Index: every public surface, dense, launcher-like ---
            Visible at rest: no scroll-gated reveal on the homepage, so a
            crawler, a preview, print, or a full-page capture sees every card. */}
        <section className="section home-index" aria-labelledby="surfaces-title">
          <h2 className="section-title home-title home-title--compact" id="surfaces-title" data-scramble>
            Every surface is public.
          </h2>
          <div className="surface-list home-launcher">
            {SURFACES.map((surface) => (
              <Link
                className="surface-card"
                href={surface.href}
                key={surface.href}
                data-cuelume-hover="bloom"
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

        {/* --- System state: the site's own status panel --- */}
        <section className="section home-state" aria-labelledby="system-state-title">
          <p className="section-eyebrow">System state</p>
          <h2 className="section-title home-title home-title--section" id="system-state-title" data-scramble>
            What is real on this site.
          </h2>
          <div className="state-layout home-state-panel">
            <div className="row-stack" role="list">
              {[
                {
                  title: 'Design system contract ' + CONTRACT_VERSION,
                  meta: 'Human home, full tables, machine export · Poise, Takt, Cadence, and Acoustics adopted',
                },
                {
                  title: `Verification engine · ${ENGINE_CHECK_COUNT} checks`,
                  meta: 'Live on /score · scores any URL against the contract in real time',
                },
                { title: 'Lab One · Poise', meta: 'Restrained interaction, rules adopted into v0.1.1' },
                { title: 'Lab Two · Takt', meta: 'Interface feel, rules adopted into v0.1.2' },
                { title: 'Lab Three · Cadence', meta: 'Text rhythm, rules adopted into v0.1.3' },
                { title: 'Lab Four · Acoustics', meta: 'Interaction sound, rules adopted into v0.3.0' },
                { title: 'Use Kit One · Design Review', meta: 'Portable review package · human and machine export' },
                { title: 'Multi-surface stress log', meta: 'v0.dev, Lovable, Bolt, Framer, and Stripe scored against the contract' },
                { title: 'Keyboard path', meta: 'Site-wide and Lab One tab order and focus-visible proof' },
                { title: 'Public surface review', meta: 'designesy.org checked against its own contract' },
                { title: 'Drift rule', meta: 'Every new public UI cites a contract token or an open tension' },
                {
                  title: 'Evidentiary surfaces',
                  meta: 'Methodology, Benchmarks, Badge, Specs, Acoustic tokens, and Graph, all open and documented',
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
