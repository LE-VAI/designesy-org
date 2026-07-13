import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { Toggle } from '../lib/toggle';
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
    state: 'Public · design system v0.1.3',
  },
  {
    num: '04',
    name: 'Labs',
    desc: 'experiments that compile into contracts',
    state: 'Public · Poise + Takt + Cadence',
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
    meta: 'Portable values, roles, verification · v0.1.3 · Poise + Takt + Cadence adopted',
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
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Context surface</p>
          <h1 className="surface-title">Docs</h1>
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
                data-cuelume-hover="whisper"
                data-cuelume-press
                data-cuelume-release
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
          <p className="surface-note">
            Designesy is an organization first, not merely a company, brand,
            SaaS product, template shop, prompt library, or content site. It
            should be able to contain practical products, public resources,
            agent kits, labs, contracts, research systems, review systems, and
            creative infrastructure without being reduced to any one of them.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Quality bar</h2>
          <div className="definition">
            <p className="definition-label">Standard</p>
            <p>
              The artifact should feel considered after it becomes functional.
            </p>
          </div>
          <p className="surface-note">
            Functional is the baseline. Considered is the bar. Public work on
            this site is expected to cite a contract token or name an open
            tension — silence is not quality.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Operating principles</h2>
          <div className="principle-list">
            {PRINCIPLES.map((p) => (
              <div className="principle" key={p.num}>
                <span className="principle-num">{p.num}</span>
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
              <p className="surface-note">
                The Graph preserves provenance and prevents design knowledge
                from becoming anonymous taste. Every shipped artifact should
                trace back through this chain.
              </p>
            </div>
            <div>
              <h3 className="layer-heading">Seven layers</h3>
              <div className="layer-stack">
                {LAYERS.map((layer) => (
                  <Toggle
                    className="layer-item"
                    key={layer.num}
                    data-cuelume-hover="bloom"
                    data-cuelume-press
                    data-cuelume-release
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
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Designesy public language should feel intelligent, precise, useful,
            soulful but not vague, technical but not cold, ambitious but not
            delusional, artist-centered, systems-aware, deeply humane,
            anti-generic, anti-corporate-slop, and anti-empty-AI-branding.
          </p>
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
                ], { avoid: true })} />
            </div>
          </div>
        </section>

        <div className="status-note">
          Designesy is a live operating model. Graph and logs remain internal by
          design. What is public here — principles, architecture, voice,
          contracts, labs, kits, and review — is the real system, not a preview
          of a larger empty product.
        </div>
      </main>

      <Footer />
    </>
  );
}