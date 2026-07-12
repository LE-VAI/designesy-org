import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { ToggleRow } from '../lib/toggle-row';
import { checkItemsFromStrings } from '../lib/check-items';
import { pageMeta } from '../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Privacy',
  description:
    'Designesy privacy — what this public surface collects, what it does not, and how machine exports stay open without turning visitors into product.',
  path: '/privacy',
  ogDescription:
    'Plain-language trust surface for designesy.org: logs, contact, open exports, and what we do not track.',
  twitterDescription: 'Trust language for designesy.org — designesy.org/privacy',
});

const PRINCIPLES = [
  {
    num: '01',
    title: 'Public by design, not extractive by default',
    desc: 'designesy.org is an institutional surface for design intelligence. Its purpose is clarity, review, and portable rules — not harvesting personal data for ads or resale.',
  },
  {
    num: '02',
    title: 'Empty is better than filler',
    desc: 'We do not invent tracking claims, cookie walls, or consent theater for features this site does not run. What is stated here is what is operated.',
  },
  {
    num: '03',
    title: 'Open packages are intentional',
    desc: 'Machine exports such as open.json and kit JSON are public so people and agents can fetch design rules. That openness is a product choice, not a silent data leak about you.',
  },
  {
    num: '04',
    title: 'Contact stays voluntary',
    desc: 'Email is the contact path. Writing to us is optional. Messages are used to respond and operate the organization, not to build marketing profiles.',
  },
];

const COLLECT = [
  {
    title: 'What you send us',
    meta: 'Email you choose to write to le@designesy.org, and any files or context you attach. Used to reply and run Designesy LLC work.',
  },
  {
    title: 'What the host may log',
    meta: 'Standard web-host logs for reliability and abuse defense: request path, approximate time, user-agent, and network address as retained by the hosting provider. Not used for advertising profiles on this surface.',
  },
  {
    title: 'What the browser keeps locally',
    meta: 'Interface preferences that stay on your device when present (for example sound or motion preference used by live labs). These are not sold and are not required for reading docs.',
  },
];

const DO_NOT = [
  'Sell personal data',
  'Run third-party advertising trackers on this surface',
  'Require an account to read public docs, contracts, kits, labs, or Open',
  'Turn open machine feeds into a dossier about individual visitors',
  'Ask for more personal detail than the work requires',
];

const OPEN_SCOPE = [
  {
    href: '/open',
    title: 'Open index',
    meta: 'Human catalog of portable packages',
  },
  {
    href: '/open.json',
    title: 'open.json',
    meta: 'Machine feed of contracts, kits, labs, and reviews',
  },
  {
    href: '/kits/design-review.json',
    title: 'Design Review kit JSON',
    meta: 'Portable agent prompt and verification shape',
  },
  {
    href: '/contracts/design-system.json',
    title: 'Design system contract JSON',
    meta: 'Portable design judgment export',
  },
];

export default function PrivacyPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Trust surface</p>
          <h1 className="surface-title">Privacy</h1>
          <p className="surface-lede">
            Designesy treats privacy as infrastructure, not decoration.
          </p>
          <p className="surface-note">
            This page states how the public designesy.org surface handles
            information: what is collected, what is not, and how open design
            intelligence stays fetchable without turning visitors into product.
            Operator: Designesy LLC. Contact:{' '}
            <a href="mailto:le@designesy.org" data-cuelume-hover="tick">
              le@designesy.org
            </a>
            .
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Public</span>
            <span className="lab-meta-item">Plain language · not a cookie wall</span>
            <span className="lab-meta-item">Updated 2026-07-12</span>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Stance</h2>
          <div className="definition">
            <p className="definition-label">Working sentence</p>
            <p>
              The public site exists so people and agents can inspect design
              rules, review practice, and portable packages. Trust is part of
              that product: fewer hidden systems, clearer defaults, and no
              invented surveillance language.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Principles</h2>
          <div className="principle-list">
            {PRINCIPLES.map((item) => (
              <div
                className="principle"
                key={item.num}
              >
                <span className="principle-num">{item.num}</span>
                <div className="principle-body">
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What may be collected</h2>
          <div className="row-stack" role="list">
            {COLLECT.map((item, i) => (
              <ToggleRow key={item.title} index={String(i + 1).padStart(2, '0')}>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </ToggleRow>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What we do not do here</h2>
          <CheckGrid
            items={checkItemsFromStrings(DO_NOT, { avoid: true })}
          />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Open exports</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            These routes publish design packages on purpose. They describe
            Designesy systems and review cargo. They are not personal profiles
            of site visitors.
          </p>
          <div className="row-stack" role="list">
            {OPEN_SCOPE.map((item, i) => (
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
          <h2 className="doctrine-heading">Third parties</h2>
          <div className="definition">
            <p className="definition-label">Hosting and mail</p>
            <p>
              The site is served through a web host and content delivery
              network. Those providers process the technical request data needed
              to deliver pages. Email is handled through ordinary mail
              infrastructure when you write to us. We do not add separate
              advertising SDKs to this public surface.
            </p>
          </div>
          <div className="definition" style={{ marginTop: '1rem' }}>
            <p className="definition-label">If this changes</p>
            <p>
              If Designesy adds accounts, analytics products, payment flows, or
              other personal-data systems, this page will be updated before
              those systems become the default public path. Silence is not
              adoption of hidden tracking.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Requests</h2>
          <p className="surface-note">
            For privacy questions, correction requests about correspondence you
            sent, or operational concerns, write to{' '}
            <a href="mailto:le@designesy.org" data-cuelume-hover="tick">
              le@designesy.org
            </a>
            . Include enough context to locate the request. We respond as an
            organization, not as an automated dark pattern.
          </p>
          <div className="lab-meta" style={{ marginTop: '1.25rem' }}>
            <Link href="/docs" data-cuelume-hover="tick">
              Docs →
            </Link>
            <Link href="/open" data-cuelume-hover="tick">
              Open →
            </Link>
            <Link href="/contracts/design-system" data-cuelume-hover="tick">
              Design system →
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
