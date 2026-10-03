import type { Metadata } from 'next';
import Link from 'next/link';
import './instrument.css';
import './home.css';
import './home-lvl.css';
import './home-inspect.css';
import { Topbar } from './lib/topbar';
import { Footer } from './lib/footer';
import { Toggle } from './lib/toggle';
import { ToggleRow } from './lib/toggle-row';
import { StateMarquee } from './lib/state-marquee';
import { pageMeta } from './lib/site-meta';
import { ScoreForm } from './score/score-form';
import { ContractHealthRack, CONTRACT_HEALTH_DIMS, CONTRACT_HEALTH_MEAN } from './contract-health-rack';
import { VerifyConsole, VC_TIMING } from './lib/verify-console';
import { PlayWhenVisible } from './lib/play-when-visible';
import { InspectSequence } from './lib/inspect-sequence';
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
  SELF_COUNTS,
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

// The hero headline, in the two parts the markup renders. The claim holds
// still: the proof moves (the console below verifies this site on a loop, and
// draws the underline under HERO_ACCENT each time its verdict lands).
//
// The final word used to rotate through four synonyms with a character
// scramble. Captured mid-rotation it read "We make execution 3GzeY.", and a
// moving word in the headline competed with the one instrument that proves it.
// The sentence now rests on its strongest word.
const HERO_LINE_1 = 'AI makes execution free.';
const HERO_LINE_2_PREFIX = 'We make execution ';
const HERO_ACCENT = 'provable';

/**
 * The h1's accessible name, declared once and derived from the same parts the
 * markup renders. The two visual lines are block spans, and accessible-name
 * computation does not insert a space at a block boundary, so the name is
 * handed to the browser rather than left to the DOM ("free.We make ...").
 * The visual lines are aria-hidden so they cannot contribute a second name.
 * (Guarded by scripts/check-hero-a11y-name.js.)
 */
const HERO_HEADLINE = `${HERO_LINE_1} ${HERO_LINE_2_PREFIX}${HERO_ACCENT}.`;

// A pillar's source, when it has one, is a footnote under the grid (marked
// with `note`), so the cards hold the same four or five lines: inline, the
// citation ran card 02 to eight.
const PILLAR_SOURCE = 'Belitsoft, State of React Development 2026';

const PILLARS: { number: string; title: string; text: string; note?: string }[] = [
  {
    number: '01',
    title: 'Taste codified',
    text: 'The contract encodes design judgment as tokens, motion, sound, takt, and cadence, so taste survives any tool, any team, and any AI that generates your UI.',
  },
  {
    number: '02',
    title: 'Verification as proof',
    text: `${ENGINE_CHECK_COUNT} automated checks prove the contract is met. With 42% of committed React now AI-generated, the score measures what shipped: the rendered page a visitor meets.`,
    note: '1',
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
    icon: 'contract' as const,
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
    icon: 'review' as const,
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
    icon: 'studio' as const,
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
    icon: 'continuity' as const,
  },
];

/** One line icon per "put the contract to work" card: what the thing is,
 *  drawn in the same 1.5px stroke as the search palette's row icons. */
function FieldIcon({ name }: { name: 'contract' | 'review' | 'studio' | 'continuity' }) {
  const props = {
    width: 18,
    height: 18,
    viewBox: '0 0 18 18',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (name === 'contract') {
    return (
      <svg {...props}>
        <path d="M4.5 2.5h6.2l2.8 2.8v10.2h-9z" />
        <path d="M10.5 2.7v2.8h2.8M6.8 9.2l1.6 1.6 3-3.3" />
      </svg>
    );
  }
  if (name === 'review') {
    return (
      <svg {...props}>
        <circle cx="8" cy="8" r="4.8" />
        <path d="M11.6 11.6 15.5 15.5M6 8.2l1.4 1.4 2.6-2.8" />
      </svg>
    );
  }
  if (name === 'studio') {
    return (
      <svg {...props}>
        <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5v6A1.5 1.5 0 0 1 13.5 12H8l-3.5 3v-3h0A1.5 1.5 0 0 1 3 10.5z" />
        <path d="M6 6.8h6M6 9.2h3.6" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M2.8 9a6.2 6.2 0 1 0 1.9-4.5" />
      <path d="M2.6 2.8v2.6h2.6M9 5.6V9l2.4 1.6" />
    </svg>
  );
}

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

      <main id="main-content" data-pagefind-body className="site-shell home">
        {/* --- Hero: the claim, then the instrument that proves it ---
            Positioning: Designesy states design judgment as a published
            standard and proves it live on any page, its own included:
            authoritative in what it claims, playful in how it shows the proof.
            The claim and the command bar sit still; the console below is the
            page's one moving mass. PlayWhenVisible pauses the hero as one unit
            off screen, so the console clock and the headline underline (same
            timing, VC_TIMING) can never drift apart. The hero is a 12-column
            region (g12): the command bar ends on the 7-line, the same x as
            the console's divider, so control and instrument read as one
            device (home-lvl.css). */}
        <PlayWhenVisible
          as="section"
          className="hero home-hero g12"
          aria-labelledby="hero-title"
          data-play="on"
        >
          <div className="home-hero-copy" style={VC_TIMING}>
            <p className="home-kicker">
              <span className="home-kicker-live" aria-hidden="true" />
              <span>
                Contract <b>{CONTRACT_VERSION}</b> is live · <b>{ENGINE_CHECK_COUNT}</b> checks<span className="home-kicker-more">, rescored weekly</span>
              </span>
            </p>
            <h1 className="hero-title hero-display" id="hero-title" aria-label={HERO_HEADLINE}>
              <span className="hero-display-line" aria-hidden="true">
                {HERO_LINE_1}
              </span>
              <span className="hero-display-line is-accent" aria-hidden="true">
                {HERO_LINE_2_PREFIX}
                <span className="hero-accent">
                  {HERO_ACCENT}
                  <span className="hero-proof-line">
                    <i />
                  </span>
                </span>
                .
              </span>
            </h1>

            <p className="hero-sub">
              Designesy publishes design judgment as a versioned contract, then verifies any live
              page against it. {ENGINE_CHECK_COUNT} checks, one grade, and evidence you can cite.
            </p>

            {/* THE PRODUCT: the URL input, as one command bar */}
            <div id="score" className="score-hero-input">
              <ScoreForm />
            </div>
          </div>

          {/* The instrument: this site, verified by its own engine. Every
              value is from the registry and the leaderboard seed. */}
          <VerifyConsole
            host="designesy.org"
            score={SELF_SCORE}
            grade={SELF_GRADE}
            measured={COHORT_LAST_SCORED}
            contract={CONTRACT_VERSION}
            pass={SELF_COUNTS.pass}
            warn={SELF_COUNTS.warn}
            fail={SELF_COUNTS.fail}
          />

          <div className="hero-cohort" role="group" aria-label="This week's cohort">
            <span className="hero-cohort-label">
              Cohort, week of {COHORT_LAST_SCORED}: <b>{COHORT_SCORED_COUNT}</b> of {COHORT_TOTAL_COUNT} sites scored
            </span>
            <ul className="hero-cohort-list">
              {RECENT_SCORES.filter((s) => !s.isSelf)
                .slice(0, 3)
                .map((s) => (
                  <li key={s.url}>
                    <a
                      className="hero-cohort-link"
                      href={`/score?url=${encodeURIComponent(new URL(s.url).host.replace(/^www\./, ''))}`}
                      data-cuelume-hover="tick"
                    >
                      <span className="hero-cohort-name">{s.name}</span>
                      <span className="hero-cohort-score" data-tabular>{s.score.toFixed(1)}</span>
                      <span className={`hero-cohort-grade is-${s.grade.toLowerCase()}`}>{s.grade}</span>
                    </a>
                  </li>
                ))}
              {LOWEST_SCORE !== null && (
                <li className="hero-cohort-low">
                  Lowest <span data-tabular>{LOWEST_SCORE}%</span>
                  <span className={`hero-cohort-grade is-${LOWEST_GRADE?.toLowerCase()}`}>{LOWEST_GRADE}</span>
                </li>
              )}
            </ul>
            <Link className="hero-cohort-more text-link" href="/leaderboard" data-cuelume-hover="tick">
              See the leaderboard
              <span aria-hidden="true"> →</span>
            </Link>
          </div>
        </PlayWhenVisible>

        {/* --- Inspection: the product, working, told by scroll ---
            Replaces the MP4 loop (a black rectangle in light mode). A generic
            page drawn in HTML, inspected in four steps the reader scrolls
            through: read, measure, find, grade (lib/inspect-sequence). */}
        <section className="section home-inspect" aria-labelledby="inspect-title">
          <p className="section-eyebrow">The engine</p>
          <div className="home-split-head g12">
            <h2 className="section-title home-title home-title--section" id="inspect-title">
              Every check, run against the page.
            </h2>
            <p className="surface-lede">
              Each of the {ENGINE_CHECK_COUNT} checks inspects a part of the page. A finding pins to
              the element it flags, named by the check that caught it.
            </p>
          </div>
          <InspectSequence />
        </section>

        {/* --- Statement: why it matters ---
            The page's largest claim after the hero, stated positively. The four
            pillars are Toggle cells (cell logic kept: press, toggle, sound). */}
        <section className="section home-statement" aria-labelledby="pillars-title">
          <p className="section-eyebrow">Why it matters</p>
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
                <p>
                  {pillar.text}
                  {pillar.note && <sup>{pillar.note}</sup>}
                </p>
              </Toggle>
            ))}
          </div>
          <p className="home-pillar-note">
            <sup>1</sup> The 42% figure: {PILLAR_SOURCE}.
          </p>
        </section>

        {/* --- The contract: nine principles and the health rack ---
            All nine principles as CheckGrid cells beside the instrument that
            measures the contract's own health. */}
        <section className="section home-principles" aria-labelledby="principles-title">
          <p className="section-eyebrow">The contract</p>
          <div className="home-principles-grid g12">
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
                    <span className="field-card-icon" aria-hidden="true">
                      <FieldIcon name={item.icon} />
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
          <p className="section-eyebrow">The index</p>
          <h2 className="section-title home-title home-title--compact" id="surfaces-title" data-scramble>
            Every surface is public.
          </h2>
          <div className="surface-list home-launcher g12">
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
