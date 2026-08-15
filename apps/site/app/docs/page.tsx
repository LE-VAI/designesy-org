import type { Metadata } from 'next';
import Link from 'next/link';
import './docs.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { Toggle } from '../lib/toggle';
import { LottieHint } from '../lib/lottie-hint';
import { ReadingProgress } from '../lib/reading-progress';
import { pageMeta } from '../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Docs',
  description:
    'Designesy orientation — mission, nine operating principles, architecture layers, public voice, and paths to live engines.',
  path: '/docs',
  ogDescription:
    'Mission, principles, architecture, and public voice — with paths to live contract, labs, and review.',
  twitterDescription:
    'Orientation for a live design intelligence system — designesy.org/docs',
});

const LAYERS = [
  {
    num: '01',
    name: 'Core',
    desc: 'mission, doctrine, principles, quality bar',
    state: 'Public on this surface',
  },
  {
    num: '02',
    name: 'Open',
    desc: 'portable package catalog for people and agents',
    state: 'Public · /open + open.json',
  },
  {
    num: '03',
    name: 'Contracts',
    desc: 'portable design agreements',
    state: 'Public · design system v0.4.0',
  },
  {
    num: '04',
    name: 'Labs',
    desc: 'experiments that compile into contracts',
    state: 'Public · Poise + Takt + Cadence + Acoustics',
  },
  {
    num: '05',
    name: 'Review',
    desc: 'quality-control layer for artifacts',
    state: 'Public · dimensions + field checks',
  },
  {
    num: '06',
    name: 'Kits',
    desc: 'portable instruction packages for people and agents',
    state: 'Public · Kit One Design Review + machine export',
  },
  {
    num: '07',
    name: 'Graph',
    desc: 'living knowledge tree with provenance',
    state: 'Internal — not published as a public browser',
  },
  {
    num: '08',
    name: 'Logs',
    desc: 'institutional memory, file-based',
    state: 'Internal — not a public feed',
  },
];

const START_HERE = [
  {
    href: '/open',
    title: 'Open design intelligence',
    meta: 'Human index and machine feed of portable packages',
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Portable review package · human + machine export',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract',
    meta: 'Portable values, roles, verification · v0.4.0 · Poise + Takt + Cadence + Acoustics adopted',
  },
  {
    href: '/labs/poise',
    title: 'Lab One · Poise',
    meta: 'How Designesy responds when someone touches it',
  },
  {
    href: '/labs/takt',
    title: 'Lab Two · Takt',
    meta: 'How an interface feels under your hands',
  },
  {
    href: '/labs/cadence',
    title: 'Lab Three · Cadence',
    meta: 'The rhythm of text on a page',
  },
  {
    href: '/labs/acoustics',
    title: 'Lab Four · Acoustics',
    meta: 'Interaction sound as a token system',
  },
  {
    href: '/review/poise',
    title: 'Field check · Poise',
    meta: 'Kit One applied to Lab One · pass with notes',
  },
  {
    href: '/review/takt',
    title: 'Field check · Takt',
    meta: 'Kit One applied to Lab Two · pass with notes',
  },
  {
    href: '/review/cadence',
    title: 'Field check · Cadence',
    meta: 'Kit One applied to Lab Three · pass with notes',
  },
  {
    href: '/review/acoustics',
    title: 'Field check · Acoustics',
    meta: 'Kit One applied to Lab Four · pass with notes',
  },
  {
    href: '/review/designesy-org',
    title: 'Public surface review',
    meta: 'designesy.org checked against its own contract',
  },
  {
    href: '/privacy',
    title: 'Privacy',
    meta: 'What this surface collects, what it does not, open export scope',
  },
  {
    href: '/open/handoff',
    title: 'Open handoff pack',
    meta: 'Share copy, agent prompt, verification paths for /open',
  },
  {
    href: '/review/keyboard',
    title: 'Keyboard path',
    meta: 'Site-wide skip link, tab order, focus-visible proof',
  },
  {
    href: '/contracts#design-system-contract',
    title: 'Full contract tables',
    meta: 'Complete human contract on /contracts',
  },
];

const PRINCIPLES = [
  { num: '01', title: 'Purpose earns form', desc: 'Every meaningful element should have a job. Remove, merge, or demote anything that does not help the design act, communicate, withstand use, or create necessary feeling.' },
  { num: '02', title: 'Economy is intelligence', desc: 'Prefer fewer, stronger decisions over many weak flourishes. Reduction is valuable when it preserves user power while lowering cognitive, physical, emotional, or maintenance burden.' },
  { num: '03', title: 'Context is part of the object', desc: 'Design cannot be judged in isolation. The use environment, user state, device, bandwidth, culture, ability, maintenance model, and social setting are part of the design.' },
  { num: '04', title: 'Affordance should be felt', desc: 'The form should suggest the action. People should not need a lecture to discover primary use, especially for repeated or urgent tasks.' },
  { num: '05', title: 'Durability includes time and change', desc: 'Durability includes maintainability, adaptability, learnability, repairability, localization, and the ability to remain useful as conditions shift.' },
  { num: '06', title: 'Inclusion is structural', desc: 'Inclusion starts at the decision layer. Ask who can use the artifact, who has to work harder, who is excluded, and who pays the cost of ambiguity.' },
  { num: '07', title: 'Systems enable freedom', desc: 'Strong systems give parts shared logic so people and agents can recombine them confidently. Coherence should create room for expression, not lock every surface into sameness.' },
  { num: '08', title: 'Delight must be earned', desc: 'Joy, beauty, play, surprise, and personality are legitimate design goals when they deepen trust, clarity, identity, learning, or emotional connection.' },
  { num: '09', title: 'Responsibility is a design material', desc: 'Equity, environment, economy, human development, and social consequence are not externalities. They are design materials.' },
];

export default function DocsPage() {
  return (
    <>
      <ReadingProgress />
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Context surface</p>
          <h1 className="surface-title" data-scramble>Docs</h1>
          <p className="surface-lede">
            Designesy is design intelligence infrastructure for a humane creative
            civilization.
          </p>
          <p className="surface-note">
            It turns sources into principles, principles into contracts,
            contracts into tools, and tools into better designed work. This is
            the public orientation layer — selected doctrine, language, and
            context for anyone who wants to understand what Designesy is and how
            it operates.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Start here</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Orientation is useful only when it leads to live artifacts. These
            are the public engines on designesy.org today.
          </p>
          <div className="row-stack" role="list">
            {START_HERE.map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                className="row"
                role="listitem"
                data-cuelume-hover="bloom"
                data-cuelume-press
              >
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Mission</h2>
          <div className="definition">
            <p className="definition-label">Working sentence</p>
            <p>
              Designesy turns design knowledge into living systems: sources
              become principles, principles become contracts, contracts become
              tools, and tools become better designed work.
            </p>
          </div>
          <div className="text-cell">
            <p className="surface-note">
              Designesy is an organization first, not merely a company, brand,
              SaaS product, template shop, prompt library, or content site. It
              should be able to contain practical products, public resources,
              agent kits, labs, contracts, research systems, review systems, and
              creative infrastructure without being reduced to any one of them.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Quality bar</h2>
          <div className="definition">
            <p className="definition-label">Standard</p>
            <p>
              The artifact should feel considered after it becomes functional.
            </p>
          </div>
          <div className="text-cell">
            <p className="surface-note">
              Functional is the baseline. Considered is the bar. Public work on
              this site is expected to cite a contract token or name an open
              tension — silence is not quality.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Operating principles</h2>
          <div className="principle-list">
            {PRINCIPLES.map((p, i) => (
              <div className="principle" key={p.num}>
                <span className="principle-num">
                  {i === 0 && <LottieHint type="orbit" size={16} className="principle-orbit" />}
                  {p.num}
                </span>
                <div className="principle-body">
                  <h3>{p.title}</h3>
                  <p>{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Architecture</h2>
          <div className="doctrine-cols">
            <div>
              <div className="definition">
                <p className="definition-label">System flow</p>
                <p>
                  Source → Observation → Claim → Tension → Principle → Pattern →
                  Contract Rule → Token / Component / Behavior → Verification
                  Artifact → Shipped Work
                </p>
              </div>
              <div className="text-cell">
                <p className="surface-note">
                  The Graph preserves provenance and prevents design knowledge
                  from becoming anonymous taste. Every shipped artifact should
                  trace back through this chain.
                </p>
              </div>
            </div>
            <div>
              <h3 className="layer-heading">Seven layers</h3>
              <div className="layer-stack">
                {LAYERS.map((layer) => (
                  <Toggle
                    className="layer-item"
                    key={layer.num}
                    data-cuelume-hover="bloom"
                    data-cuelume-toggle="toggle"
                  >
                    <span className="layer-num">{layer.num}</span>
                    <div className="layer-body">
                      <strong className="layer-name">{layer.name}</strong>
                      <span className="layer-desc"> — {layer.desc}</span>
                      <span className="layer-state">{layer.state}</span>
                    </div>
                  </Toggle>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Public voice</h2>
          <div className="text-cell" style={{ marginBottom: '1.5rem' }}>
            <p className="surface-note">
              Designesy public language should feel intelligent, precise, useful,
              soulful but not vague, technical but not cold, ambitious but not
              delusional, artist-centered, systems-aware, deeply humane,
              anti-generic, and anti-corporate-slop.
            </p>
          </div>
          <div className="doctrine-cols">
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                What to imply
              </h3>
              <CheckGrid items={checkItemsFromStrings([
                  'Design judgment made operational',
                  'Principles with provenance',
                  'Contracts that agents and teams can use',
                  'Artifacts that can be inspected, copied, tested, remixed',
                  'Creative infrastructure for people building better worlds',
                  'A declarative interface — finished, restrained, factual',
                ])} />
            </div>
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                What to avoid
              </h3>
              <CheckGrid items={checkItemsFromStrings([
                  'Generic AI SaaS language',
                  'Shallow future-of-design clichés',
                  'Vague promises with no operational mechanism',
                  'Pretending Designesy is already a massive institution',
                  'Reducing the mission to templates or a design blog',
                  'Corporate care language that feels unearned',
                  'Process narration presented as substance',
                  'Discipline announced rather than demonstrated',
                  'Defensive or confessional framing of outcomes',
                ], { avoid: true })} />
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Declarative voice rule</h2>
          <div className="definition">
            <p className="definition-label">Contract rule · public voice</p>
            <p>
              Public surfaces state what the artifact is, what happened, and what
              the findings are. They do not narrate the review process or frame
              discipline as a virtue. The structure is the evidence; naming it
              negates it.
            </p>
          </div>
          <div className="text-cell">
            <p className="surface-note">
              A visitor should feel they are looking at a finished interface —
              restrained, declarative, complete. Process narration belongs in
              machine exports, not public prose.
            </p>
          </div>
        </section>

        <div className="status-note">
          Designesy is a live operating model. Graph and logs remain internal by
          design. What is public here — principles, architecture, voice,
          contracts, labs, kits, and review — is the real system.
        </div>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Drift score acknowledged</h2>
          <div className="definition">
            <p className="definition-label">Honest reading of /report?url=designesy.org</p>
            <p>
              The composite grade is <strong>A (91/100)</strong> — a weighted
              synthesis of the design-score engine (95.3/100, A), the drift
              engine (88/100, B), and AI-readiness (80/100, B). Of the 12 drift
              checks, 9 PASS, 0 FAIL, and 3 WARN. The 3 WARNs are:
            </p>
            <p style={{ marginTop: '0.75rem' }}>
              <strong>d04 — spacing scale (WARN):</strong> 8 distinct hardcoded
              spacing values remain — down from 30 before the tokenization pass,
              but the engine still sees loose clustering rather than a strict
              scale. Most remaining values are in library CSS and responsive
              clamp() expressions that the engine counts but should not.
            </p>
            <p style={{ marginTop: '0.75rem' }}>
              <strong>d05 — color consistency (WARN):</strong> 15 distinct base
              colors — down from 148 before the grade-color tokenization pass.
              The remaining 15 are a mix of gradient stops, alpha variants, and
              library CSS. The engine counts each distinct RGB value; most of
              what remains is legitimate variety, not drift.
            </p>
            <p style={{ marginTop: '0.75rem' }}>
              <strong>d06 — font-family stacks (WARN):</strong> 7 distinct
              font-family stacks. The site uses mono, sans, and display stacks
              plus a few component-specific overrides — the engine counts each
              as a separate stack. This is intentional typographic variety, not
              amnesia.
            </p>
            <p style={{ marginTop: '0.75rem' }}>
              The 9 PASSes are real wins: 142 custom properties are registered
              at :root (d01), all 2,283 var() references resolve (d02), 98%
              token coverage on color (d03), z-index stays within 0–1000 across
              12 distinct levels (d10), and all alias chains resolve (d12).
              The drift engine grew up alongside the site — the WARNs are
              honest feedback about where the engine counts aggressively, not
              where the design is inconsistent.
            </p>
          </div>
          <div className="text-cell">
            <p className="surface-note">
              <Link
                href="/report?url=https%3A%2F%2Fwww.designesy.org"
                className="text-link"
                data-cuelume-hover="tick"
                data-cuelume-press
              >
                Run the live composite report
              </Link>
              {' '}or read the{' '}
              <Link
                href="/drift"
                className="text-link"
                data-cuelume-hover="tick"
                data-cuelume-press
              >
                drift engine methodology
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}