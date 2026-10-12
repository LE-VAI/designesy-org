import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './instrument.css';
import './home.css';
import './home-lvl.css';
import './home-inspect.css';
import { Topbar } from './lib/topbar';
import { Footer } from './lib/footer';
import { BrandIcon } from './lib/brand-icons';
import { pageMeta, LISTING_LINE } from './lib/site-meta';
import { ScoreForm } from './score/score-form';
import {
  ContractHealthRack,
  SELF_CATEGORY_DIMS,
  SELF_BROWSER_ONLY,
  SELF_NOT_RECORDED,
  SELF_CATEGORY_DATE,
  SELF_CATEGORY_ENGINE,
} from './contract-health-rack';
import { ENGINE_SCORED_CHECK_COUNT, ENGINE_MANUAL_CHECK_COUNT } from './lib/check-definitions';
import { VerifyConsole, VC_TIMING } from './lib/verify-console';
import { PlayWhenVisible } from './lib/play-when-visible';
import { InspectSequence } from './lib/inspect-sequence';
import {
  ENGINE_CHECK_COUNT,
  CONTRACT_VERSION,
  SELF_SCORE,
  SELF_GRADE,
  COHORT_RESCORED_COUNT,
  COHORT_HELD_OVER_COUNT,
  COHORT_TOTAL_COUNT,
  COHORT_LAST_SCORED,
  MEASURED_CONTRACT_VERSION,
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

// The home page's one-liner is the confirmed listing line (owner decision,
// 2026-10-12), used everywhere a one-liner appears and built from the engine
// count (LISTING_LINE, lib/site-meta). The hero copy on the page is unchanged.
export const metadata: Metadata = pageMeta({
  title: 'Designesy: design judgment, verified live',
  description: LISTING_LINE,
  path: '/',
  ogTitle: 'Designesy: design judgment, verified live',
  ogDescription: LISTING_LINE,
  twitterDescription: LISTING_LINE,
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
//
// The 42% is Sonar's: "Developers report that 42% of the code they commit is
// currently AI-generated or assisted" (State of Code Developer Survey, more than
// 1,100 professional developers, published 2026-01-08). It covers all code and
// it is the developers' own estimate. The card used to call it "42% of committed
// React" and credit Belitsoft, whose 2026 React report restates Sonar's survey.
const PILLAR_SOURCE = {
  name: 'Sonar, State of Code Developer Survey, January 2026',
  href: 'https://www.sonarsource.com/blog/state-of-code-developer-survey-report-the-current-reality-of-ai-coding/',
};

const PILLARS: { title: string; text: string; note?: string }[] = [
  {
    title: 'Taste codified',
    text: 'The contract encodes design judgment as tokens, motion, sound, takt, and cadence, so taste survives any tool, any team, and any AI that generates your UI.',
  },
  {
    title: 'Verification as proof',
    text: `${ENGINE_SCORED_CHECK_COUNT} automated checks read what shipped: the page your server sends. Developers report that 42% of the code they commit is now AI-generated or assisted.`,
    note: '1',
  },
  {
    title: 'Anti-generic by design',
    text: 'Twelve anti-slop rules take up to 20 points off for recognisable template patterns, and seven craft signals add up to 8 back. Every rule and signal is published on the methodology page.',
  },
  {
    title: 'Versioned in the open',
    text: 'Every contract change is versioned and dated, with the checks it touched and the reason for it, in the public changelog.',
  },
];

// The index (D60): a typographic list, not a wall of cards. Score and the
// contracts lead as the anchor row; every other surface is a name and one
// line, in the board's reading order, then Brand (D71). Pricing is not
// repeated here: the top bar and the footer both carry it.
const INDEX_ANCHORS = [
  {
    href: '/score',
    label: 'Score',
    desc: 'Grade any live page against the contract.',
  },
  {
    href: '/contracts',
    label: 'Contracts',
    desc: `Portable design agreements and verification · ${CONTRACT_VERSION}`,
  },
];

const SURFACES = [
  {
    href: '/docs',
    label: 'Docs',
    desc: 'Mission, nine principles, architecture, public voice',
  },
  {
    href: '/methodology',
    label: 'Methodology',
    desc: `The full ${ENGINE_CHECK_COUNT}-check scoring methodology: weights, math, grade bands`,
  },
  {
    href: '/labs',
    label: 'Labs',
    desc: 'Experiments that compile into contracts',
  },
  {
    href: '/work',
    label: 'Work',
    desc: 'Case studies: shipped artifacts with before and after scores',
  },
  {
    href: '/kits',
    label: 'Kits',
    desc: 'Portable instruction packages for people and agents',
  },
  {
    href: '/benchmarks',
    label: 'Benchmarks',
    desc: 'Designesy, hallmark, and slop-eval side by side: three tools, three questions',
  },
  {
    href: '/review',
    label: 'Review',
    desc: 'Eight dimensions and field checks',
  },
  {
    href: '/badge',
    label: 'Badge',
    desc: 'Embed your live score: the grade, the score and the date it was measured',
  },
  {
    href: '/open',
    label: 'Open',
    desc: 'Portable design intelligence: human index and machine feed',
  },
  {
    href: '/graph',
    label: 'Graph',
    desc: 'The provenance chain: how a source becomes a principle, a rule, a token, and a check',
  },
  {
    href: '/brand',
    label: 'Brand',
    desc: 'Logo, colours and kit',
  },
];

const FIELD = [
  {
    href: '/contracts/design-system',
    meta: `Contract · ${CONTRACT_VERSION}`,
    title: 'Design system contract',
    lede: 'The rules behind this site, portable and versioned.',
    desc: 'Tokens, motion, components, and the Poise, Takt, Cadence, and Acoustics rules. A human overview, plus a machine export agents can cite directly.',
    arrow: 'Read the contract →',
    kind: 'contract' as const,
    icon: 'contract' as const,
  },
  {
    href: '/kits/design-review',
    meta: 'Kit · available',
    title: 'Design Review',
    lede: 'Turn taste into inspection. Point your agent at any design.',
    desc: 'Eight dimensions, a copyable agent prompt, output format, and verification checklist. Human and machine read the same rules.',
    arrow: 'Open the kit →',
    kind: 'kit' as const,
    icon: 'review' as const,
  },
  {
    href: 'https://designesy.ai.studio/',
    meta: 'Studio · available',
    title: 'Try the Studio',
    lede: 'The contract, conversational. Ask about type, motion, or spacing, or score any site.',
    desc: 'A conversational instance of the Designesy Director. It answers from the designesy.org contract: tokens, principles, and open tensions.',
    arrow: 'Open the chat →',
    kind: 'kit' as const,
    icon: 'studio' as const,
  },
  {
    href: '/continuity',
    meta: 'Continuity · waitlist',
    title: 'Continuity',
    lede: 'Design judgment that stays current.',
    desc: 'Score, contract, verify, and keep the receipt. Open core stays free. Continuity adds history and drift for work that continues.',
    arrow: 'Join the waitlist →',
    kind: 'kit' as const,
    icon: 'continuity' as const,
  },
];

/** One icon per "put the contract to work" card: what the thing is, from the
 *  icon family (v2 and v2.1), as in the search palette's rows. */
function FieldIcon({ name }: { name: 'contract' | 'review' | 'studio' | 'continuity' }) {
  // The contract (its dot the signature), the Design Review kit (its dot the
  // head), the Studio bubble (its dot the reply), and Continuity's history
  // clock (a neutral hub dot at its centre).
  if (name === 'contract') return <BrandIcon name="contract" size={18} />;
  if (name === 'review') return <BrandIcon name="kit" size={18} />;
  if (name === 'studio') return <BrandIcon name="studio" size={18} />;
  return <BrandIcon name="continuity" size={18} />;
}

// System state (D60, D72): one ledger. Each fact appears once, with its
// evidence and its state as a word beside a check, because every fact here is
// already true: no numerals, no empty checkboxes, and no flame, which means
// "happening now" and nothing else (D57). It merges the old register (twelve
// rows with a checkbox each) and the status pane beside it (twelve pills, seven
// of them repeating a row). Every row names its public evidence: the fact links
// to the page that proves it, and a row whose proof is several pages links
// them in its evidence. A fact with no public proof page is not listed (the
// multi-surface stress log waits for one), and nothing says "verified" without
// a link to the proof.
type LedgerState = 'published' | 'available' | 'adopted' | 'verified' | 'active';

type LedgerRow = {
  fact: string;
  evidence: ReactNode;
  state: LedgerState;
  href?: string;
};

const LEDGER: LedgerRow[] = [
  {
    fact: 'Design system contract ' + CONTRACT_VERSION,
    evidence: 'Human home, full tables, machine export · Poise, Takt, Cadence, and Acoustics adopted',
    state: 'published',
    href: '/contracts/design-system',
  },
  {
    fact: 'SKILL.md',
    evidence: 'The portable export of the design system contract',
    state: 'published',
    href: '/contracts/skill',
  },
  {
    fact: `Verification engine · ${ENGINE_CHECK_COUNT} checks`,
    evidence: 'Live on /score · scores any URL against the contract in real time',
    state: 'available',
    href: '/score',
  },
  {
    fact: 'Poise · Takt · Cadence · Acoustics',
    evidence: 'Lab rules adopted into the contract',
    state: 'adopted',
    href: '/labs',
  },
  { fact: 'Cuelume', evidence: 'Sound on', state: 'active', href: '/labs/acoustics' },
  {
    fact: 'Use Kit One · Design Review',
    evidence: 'Portable review package · human and machine export',
    state: 'published',
    href: '/kits/design-review',
  },
  {
    fact: 'Keyboard path',
    evidence: 'Site-wide and Lab One tab order and focus-visible proof',
    state: 'verified',
    href: '/review/keyboard',
  },
  {
    fact: 'Public surface review',
    evidence: 'designesy.org checked against its own contract',
    state: 'verified',
    href: '/review/designesy-org',
  },
  {
    fact: 'Drift rule',
    evidence: 'Every new public UI cites a contract token or an open tension',
    state: 'active',
    href: '/drift',
  },
  {
    fact: 'Reduced motion',
    evidence: 'Disables non-essential animation and defaults sound off',
    state: 'active',
    href: '/contracts/motion',
  },
  {
    fact: 'Evidentiary surfaces',
    evidence: (
      <>
        <Link href="/methodology">Methodology</Link>, <Link href="/benchmarks">Benchmarks</Link>,{' '}
        <Link href="/badge">Badge</Link>, <Link href="/specs">Specs</Link>,{' '}
        <Link href="/acoustic-tokens">Acoustic tokens</Link>, and <Link href="/graph">Graph</Link>, all open
        and documented
      </>
    ),
    state: 'published',
  },
  {
    fact: 'Machine feeds',
    evidence: (
      <>
        <a href="/open.json">open.json</a> and <a href="/llms.txt">llms.txt</a>
      </>
    ),
    state: 'published',
  },
];

/** The ledger's confirmed-state mark: a drawn check, never a box to tick. */
function LedgerCheck() {
  return (
    <svg className="home-ledger-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

// All nine operating principles (canonical titles from /docs). The homepage
// used to show four under "Nine principles. Four shown here.", a headline that
// announced its own incompleteness. Titles only: the full wording lives in the
// doctrine, one link away. They are a set with no order, so they read as a
// plain list: no numerals, no cells, nothing to check off (D60).
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
];

// The note under the category rack names its run and what it leaves out, from
// the data.
const listOf = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const HEALTH_NOTE = [
  `Category scores for designesy.org from its own engine (${SELF_CATEGORY_ENGINE}), in the leaderboard batch.`,
  SELF_BROWSER_ONLY.length > 0 ? `${listOf(SELF_BROWSER_ONLY)} need a browser, so they are not scored here.` : '',
  SELF_NOT_RECORDED.length > 0 ? `The batch does not record ${listOf(SELF_NOT_RECORDED)} by category.` : '',
]
  .filter(Boolean)
  .join(' ');

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
            <h1 className="hero-title hero-display" id="hero-title" aria-label={HERO_HEADLINE}>
              <span className="hero-display-line is-premise" aria-hidden="true">
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
              page against it. One grade, with evidence you can cite.
            </p>

            {/* THE PRODUCT: the URL input, as one command bar. The version line
                is the bar's resting note, a plain sentence under the form: the
                H1 opens the page, with no badge above it (D60). */}
            <div id="score" className="score-hero-input">
              <ScoreForm
                noteAfter={
                  <Link
                    className="home-hero-held"
                    href="/contracts/design-system"
                    data-cuelume-hover="tick"
                  >
                    Held to contract {CONTRACT_VERSION}, rescored weekly
                    <span aria-hidden="true"> →</span>
                  </Link>
                }
              />
            </div>
          </div>

          {/* The instrument: this site, verified by its own engine. Every
              value is from the registry and the leaderboard seed. */}
          <VerifyConsole
            host="designesy.org"
            score={SELF_SCORE}
            grade={SELF_GRADE}
            measured={COHORT_LAST_SCORED}
            contract={MEASURED_CONTRACT_VERSION}
            pass={SELF_COUNTS.pass}
            warn={SELF_COUNTS.warn}
            fail={SELF_COUNTS.fail}
          />

          <div className="hero-cohort" role="group" aria-label="This week's cohort">
            <span className="hero-cohort-label">
              Cohort, week of {COHORT_LAST_SCORED}: <b>{COHORT_RESCORED_COUNT}</b> of {COHORT_TOTAL_COUNT} sites rescored
              {COHORT_HELD_OVER_COUNT > 0 && <>, {COHORT_HELD_OVER_COUNT} held over</>}
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
                  Lowest <span data-tabular>{LOWEST_SCORE.toFixed(1)}</span>
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
          <div className="home-split-head g12">
            <h2 className="section-title home-title home-title--section" id="inspect-title">
              Every check, run against the page.
            </h2>
            <p className="surface-lede">
              Each of the {ENGINE_CHECK_COUNT} checks reads one part of the page. A finding names the
              check that caught it and the rule it broke, and points to the element where the check
              can name one.
            </p>
          </div>
          <InspectSequence />
        </section>

        {/* --- Statement: why it matters ---
            The page's largest claim after the hero, stated positively. The four
            points are a two-column read: a bold lead-in and its sentences,
            divided by hairlines. They have no order, so no numerals, and they
            are not cards (D60). */}
        <section className="section home-statement" aria-labelledby="pillars-title">
          <h2 className="section-title home-title home-title--statement" id="pillars-title" data-scramble>
            Coherence is how a site earns trust now.
          </h2>
          <p className="surface-lede home-statement-lede">
            When AI can generate any interface, trust goes to the sites that hold together:
            consistent type, coherent motion, a steady rhythm. The contract makes that coherence
            checkable: {ENGINE_SCORED_CHECK_COUNT} of its {ENGINE_CHECK_COUNT} checks run on the HTML
            and CSS a page ships, {ENGINE_MANUAL_CHECK_COUNT} need a browser, and every verdict comes
            back with its reason.
          </p>
          <ul className="home-points" role="list">
            {PILLARS.map((pillar) => (
              <li className="home-point" key={pillar.title}>
                <strong className="home-point-lead">{pillar.title}.</strong> {pillar.text}
                {pillar.note && <sup>{pillar.note}</sup>}
              </li>
            ))}
          </ul>
          <p className="home-pillar-note">
            <sup>1</sup> The 42% figure:{' '}
            <a className="text-link" href={PILLAR_SOURCE.href} target="_blank" rel="noopener noreferrer">
              {PILLAR_SOURCE.name}
            </a>
            . It covers all code, as estimated by the developers surveyed.
          </p>
        </section>

        {/* --- The contract: nine principles and this site by category ---
            All nine principles as a two-column serif list beside the
            engine's category scores for designesy.org, read from the
            leaderboard batch. */}
        <section className="section home-principles" aria-labelledby="principles-title">
          <div className="home-principles-grid g12">
            <div className="home-principles-main">
              <h2 className="section-title home-title home-title--section" id="principles-title" data-scramble>
                Nine principles. One contract.
              </h2>
              <p className="surface-lede">
                Every check traces back to a principle. The full wording lives in the doctrine.
              </p>
              <ul className="home-principle-list" role="list">
                {PRINCIPLES.map((principle) => (
                  <li key={principle}>{principle}</li>
                ))}
              </ul>
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
            <aside
              className="health-panel home-health"
              aria-label={`designesy.org by category: ${SELF_CATEGORY_DIMS.length} category scores from its own engine, batch run of ${SELF_CATEGORY_DATE}`}
            >
              <div className="home-health-head">
                <span className="section-heading-badge-label">This site, by category</span>
                <span className="section-heading-badge-value">
                  <span className="section-heading-badge-unit">scored {SELF_CATEGORY_DATE}</span>
                </span>
              </div>
              <ContractHealthRack />
              <p className="home-health-note">{HEALTH_NOTE}</p>
            </aside>
          </div>
        </section>

        {/* --- Four ways: a bento with one featured card (the contract) ---
            Each card carries one meta line in sentence case. Availability is a
            plain word: the flame means "happening now" (D57), and the
            contract card's full border is the set's one accent (D60). */}
        <section className="section home-field" aria-labelledby="field-title">
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
                    <p className="field-card-meta">{item.meta}</p>
                    <span className="field-card-icon" aria-hidden="true">
                      <FieldIcon name={item.icon} />
                    </span>
                  </div>
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

        {/* --- Index: every public surface, as a typographic index ---
            Score and the contracts are the anchor row under a heavy rule; the
            rest are a name and one line each, in two columns divided by
            hairlines. No card boxes, no micro-labels (D60). Visible at rest:
            no scroll-gated reveal on the homepage, so a crawler, a preview,
            print, or a full-page capture sees every entry. */}
        <section className="section home-index" aria-labelledby="surfaces-title">
          <h2 className="section-title home-title home-title--compact" id="surfaces-title" data-scramble>
            Every surface is public.
          </h2>
          <ul className="home-index-anchors" role="list">
            {INDEX_ANCHORS.map((anchor) => (
              <li key={anchor.href}>
                <Link className="home-index-anchor" href={anchor.href} data-cuelume-hover="tick" data-cuelume-press>
                  <span className="home-index-name">{anchor.label}</span>
                  <span className="home-index-desc">{anchor.desc}</span>
                </Link>
              </li>
            ))}
          </ul>
          <ul className="home-index-list" role="list">
            {SURFACES.map((surface) => (
              <li key={surface.href}>
                <Link className="home-index-row" href={surface.href} data-cuelume-hover="tick" data-cuelume-press>
                  <span className="home-index-name">{surface.label}</span>
                  <span className="home-index-desc">{surface.desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* --- System state: one ledger ---
            Fact, evidence, and a confirmed state (D60, D57). */}
        <section className="section home-state" aria-labelledby="system-state-title">
          <h2 className="section-title home-title home-title--section" id="system-state-title" data-scramble>
            What is real on this site.
          </h2>
          <ul className="home-ledger" role="list">
            {LEDGER.map((row) => (
              <li className="home-ledger-row" key={row.fact}>
                <span className="home-ledger-fact">
                  {row.href ? (
                    <Link href={row.href} data-cuelume-hover="tick">
                      {row.fact}
                    </Link>
                  ) : (
                    row.fact
                  )}
                </span>
                <span className="home-ledger-evidence">{row.evidence}</span>
                <span className="home-ledger-state">
                  <LedgerCheck />
                  {row.state}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Footer />
    </>
  );
}
