import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';

export const metadata: Metadata = {
  title: 'Labs',
  description:
    'Designesy Labs — experiments that compile into contracts. Lab One is Poise: restrained interaction made inspectable.',
  openGraph: {
    title: 'Labs · Designesy',
    description:
      'Experiments that compile into contracts. Lab One · Poise is live.',
    url: 'https://www.designesy.org/labs',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Labs · Designesy',
    description:
      'Tell your agent to try Poise — designesy.org/labs/poise',
  },
};

const LAB_ANATOMY = [
  'Thesis',
  'Live artifact or demo',
  'Principle explanation',
  'Portable contract',
  'Builder-ready implementation prompt',
  'Review checklist',
  'Provenance',
  'Anti-patterns',
  'Remix notes',
  'Verification artifact',
];

const NOT_LABS = [
  'Not a blog',
  'Not a gallery',
  'Not a moodboard',
  'Not generic case studies',
  'Not a collection of decorative demos',
  'Not a landing page for AI software',
];

export default function LabsPage() {
  return (
    <>
      <Topbar scrolled />

      <main className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Experiment lane</p>
          <h1 className="surface-title">Labs</h1>
          <p className="surface-lede">
            Experiments that compile into contracts.
          </p>
          <p className="surface-note">
            A Lab is a controlled design experiment where a principle becomes
            visible, testable, remixable, and reviewable. Labs are the public
            practical layer of Designesy — a workbench where a thesis becomes a
            live artifact, review checklist, portable contract, and
            implementation-ready prompt.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Live labs</h2>
          <Link
            href="/labs/poise"
            className="lab-card"
            data-cuelume-hover="tick"
            data-cuelume-press
            data-cuelume-release
          >
            <div className="lab-card-top">
              <span className="status-badge status-badge--lab">Lab One</span>
              <span className="lab-card-status">Live</span>
            </div>
            <h3 className="lab-card-title">Poise</h3>
            <p className="lab-card-lede">
              How Designesy responds when someone touches it.
            </p>
            <p className="lab-card-desc">
              Restrained interaction: wordmark, press, sound preference, and
              reduced motion — made inspectable against the design system
              contract.
            </p>
            <span className="lab-card-arrow">Open lab →</span>
          </Link>
          <p className="surface-note" style={{ marginTop: '1.25rem' }}>
            One live lab is intentional. The lane stays empty until the next
            experiment earns a thesis, demo, and portable rules — not a filler
            card.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Related surfaces</h2>
          <div className="row-stack" role="list">
            <Link
              href="/contracts/design-system"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Design system contract</span>
                <span className="row-meta">
                  Where lab behavior is measured and candidates are recorded
                </span>
              </span>
            </Link>
            <Link
              href="/review/designesy-org"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Public surface review</span>
                <span className="row-meta">
                  Poise included in the live designesy.org field check
                </span>
              </span>
            </Link>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Lab anatomy</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            A mature Lab should include all of the following. Each one makes the
            experiment inspectable, reviewable, and promotable into durable
            rules.
          </p>
          <div className="row-stack" role="list">
            {LAB_ANATOMY.map((item, i) => (
              <div className="row" role="listitem" key={item}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Promotion rule</h2>
          <div className="definition">
            <p className="definition-label">Core rule</p>
            <p>
              An experiment becomes contract material only after its useful
              behavior is named.
            </p>
          </div>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Before promotion, a Lab records:
          </p>
          <div className="row-stack" role="list">
            {[
              'What the artifact tests',
              'What caused the behavior',
              'What it communicates',
              'Where it belongs',
              'What would make it excessive',
              'How it degrades for accessibility, performance, or reduced motion',
            ].map((item, i) => (
              <div className="row" role="listitem" key={item}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What Labs are not</h2>
          <div className="row-stack" role="list">
            {NOT_LABS.map((item, i) => (
              <div className="row is-avoid" role="listitem" key={item}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="status-note">
          Labs ship as named experiments with thesis, review status, and
          promotion readiness. Poise is Lab One. Future labs follow the same
          anatomy and the site drift rule: every public UI change cites a
          contract token or an open tension.
        </div>
      </main>

      <Footer />
    </>
  );
}
