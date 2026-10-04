import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { pageMeta } from '../lib/site-meta';
import { AgentActions } from '../lib/agent-actions';
import { CONTRACT_VERSION } from '../lib/design-system-contract';
import { designReviewKit as kit } from '../lib/kits/design-review';
import { labs } from '../lib/labs';
import './kits.css';

export const metadata: Metadata = pageMeta({
  title: 'Kits',
  description:
    'Designesy Use Kits: portable instruction packages for people and agents. Kit One is Design Review.',
  path: '/kits',
  ogDescription:
    'Portable instruction packages agents and teams can run. Kit One · Design Review is live.',
  twitterDescription:
    'Portable instruction packages for people and agents · designesy.org/kits',
});

const KIT_ANATOMY = [
  'Purpose',
  'When to use',
  'Required inputs',
  'Permission level',
  'Core method or dimensions',
  'Agent prompt',
  'Output format',
  'Verification checklist',
  'Anti-patterns',
  'Related contracts and surfaces',
];

/* Kit One against the map: which map parts its package ships, and what it
   ships beyond them (lib/kits/design-review anatomy). Its core method is its
   eight review dimensions. The card states the count against the map, and
   the map's note names the extra part, instead of a bare "11 parts" beside a
   map of ten. */
const partIn = (part: string, entry: string) =>
  part === entry || (part === 'Core method or dimensions' && /dimensions/i.test(entry));
const KIT_PARTS_COVERED = KIT_ANATOMY.filter((part) =>
  kit.anatomy.some((entry) => partIn(part, entry)),
).length;
const KIT_EXTRAS = kit.anatomy.filter(
  (entry) => !KIT_ANATOMY.some((part) => partIn(part, entry)),
);

/* Related surfaces. Each row's datum (a version or role) and its route
   stand in the side pane behind the 7-line, in the kit card's mono; the
   face keeps the title and one line. */
const RELATED: { href: string; title: string; meta: string; datum: string }[] = [
  {
    href: '/open',
    title: 'Open design intelligence',
    meta: 'Package catalog, human and machine',
    datum: 'catalog · /open.json feed',
  },
  {
    href: '/review',
    title: 'Review',
    meta: 'Quality gate and public field checks',
    datum: 'quality gate',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract',
    meta: 'Portable values and verification',
    datum: CONTRACT_VERSION,
  },
  ...[labs.poise, labs.takt, labs.cadence, labs.acoustics].map((lab) => ({
    href: `/labs/${lab.id}`,
    title: `Lab ${lab.number} · ${lab.title}`,
    meta: 'Source lab · rules adopted into the contract',
    datum: `contract v${lab.adopted_in_contract}`,
  })),
];

const KIT_BOUNDARIES = [
  'Portable instruction packages',
  'Named methods with verification',
  'Contract-cited, working alongside the contract',
  'Permission-scoped agent authorizations',
  'Reusable methods',
  'Published, working kits',
];

export default function KitsPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Use lane</p>
          <h1 className="surface-title" data-scramble>Kits</h1>
          <p className="surface-lede">
            Portable instruction packages for people and agents.
          </p>
          <p className="surface-note">
            A Use Kit bundles purpose, inputs, method, prompt, output shape,
            verification, and boundaries so design judgment can travel. Kits do
            not invent taste. They package living rules from contracts, labs,
            and review into something you can hand to an agent or a teammate.
          </p>
          <AgentActions mdPath="/kits.md" label="the kits index" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Live kits</h2>
          <Link
            href="/kits/design-review"
            className="lab-card kit-card"
            data-cuelume-hover="tick"
            data-cuelume-press
          >
            <div className="kit-card-panes">
              <div className="kit-card-face">
                <div className="lab-card-top">
                  <span className="status-badge status-badge--kit">Kit One</span>
                </div>
                <h3 className="lab-card-title">{kit.title}</h3>
                <p className="lab-card-lede">
                  Turn taste into inspection.
                </p>
                <p className="lab-card-desc">
                  Eight dimensions, a portable agent prompt, output format, and
                  verification for interfaces, systems, and agent output.
                </p>
                <span className="lab-card-arrow">Open kit →</span>
              </div>
              {/* The kit's facts, read from the package itself (the same
                  record /kits/design-review.json serves), so the card cannot
                  drift from the kit. */}
              <dl className="kit-card-side">
                <div>
                  <dt>Status</dt>
                  <dd>
                    <i className="kit-card-led" aria-hidden="true" />
                    Live
                  </dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>v{kit.version}</dd>
                </div>
                <div>
                  <dt>Dimensions</dt>
                  <dd>{kit.dimensions.length}</dd>
                </div>
                <div>
                  <dt>Anatomy</dt>
                  <dd>
                    {KIT_PARTS_COVERED} of {KIT_ANATOMY.length}
                    {KIT_EXTRAS.length > 0 ? ` (+${KIT_EXTRAS.length})` : null}
                  </dd>
                </div>
                <div>
                  <dt>Permission</dt>
                  <dd>{kit.permission.split(' · ')[0]}</dd>
                </div>
                <div>
                  <dt>Machine export</dt>
                  <dd>design-review.json</dd>
                </div>
              </dl>
            </div>
          </Link>
          <p className="surface-note" style={{ marginTop: '1.25rem' }}>
            One live kit is intentional. Machine export lives at{' '}
            <Link href="/kits/design-review.json" data-cuelume-hover="tick">
              /kits/design-review.json
            </Link>
            . The lane stays empty until the next package earns full anatomy.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Related surfaces</h2>
          <div className="row-stack" role="list">
            {RELATED.map((row, i) => (
              <div role="listitem" key={row.href}>
                <Link
                  href={row.href}
                  className="row"
                  data-cuelume-hover="bloom"
                  data-cuelume-press
                >
                  <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="row-body">
                    <span className="row-title">{row.title}</span>
                    <span className="row-meta">{row.meta}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-side-line">{row.datum}</span>
                    <span className="row-side-line">{row.href}</span>
                    <span className="row-side-arrow" aria-hidden="true" />
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Kit anatomy</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Package map for a mature Use Kit. Missing parts mean the package is
            not ready to publish. Kit One ships {KIT_PARTS_COVERED} of{' '}
            {KIT_ANATOMY.length}
            {KIT_EXTRAS.length > 0 ? <>, plus {KIT_EXTRAS.join(', ').toLowerCase()}</> : null}.
          </p>
          <CheckGrid dense items={checkItemsFromStrings(KIT_ANATOMY)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Kit boundaries</h2>
          <CheckGrid
            items={checkItemsFromStrings(KIT_BOUNDARIES)}
          />
        </section>

        <div className="status-note">
          Kits ship as named packages with permission level, verification, and
          related contracts. Kit One is Design Review. Future kits follow the
          same anatomy and the site drift rule: every public UI change cites a
          contract token or an open tension.
        </div>
      </main>

      <Footer />
    </>
  );
}
