import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';

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
              <span className="status-badge">Lab One</span>
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
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Lab anatomy</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            A mature Lab should include all of the following. Each one makes the
            experiment inspectable, reviewable, and promotable into durable
            rules.
          </p>
          <ul className="checkmark-list">
            {LAB_ANATOMY.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
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
          <ul className="checkmark-list">
            <li>What the artifact tests</li>
            <li>What caused the behavior</li>
            <li>What it communicates</li>
            <li>Where it belongs</li>
            <li>What would make it excessive</li>
            <li>How it degrades for accessibility, performance, or reduced motion</li>
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What Labs are not</h2>
          <ul className="avoid-list">
            {NOT_LABS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
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
