import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { pageMeta } from '../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Labs',
  description:
    'Designesy Labs — experiments that compile into contracts. Lab One is Poise (restrained interaction). Lab Two is Takt (interface feel). Lab Three is Cadence (text rhythm). Lab Four is Acoustics (interaction sound).',
  path: '/labs',
  ogDescription:
    'Experiments that compile into contracts. Lab One · Poise, Lab Two · Takt, Lab Three · Cadence, Lab Four · Acoustics are live.',
  twitterDescription: 'Experiments that compile into contracts — designesy.org/labs',
});

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

const LAB_BOUNDARIES = [
  'Controlled experiments, not editorial posts',
  'Inspectable artifacts, not showcases',
  'Principle tests, not visual studies',
  'Contracted observations, not loose case notes',
  'Working demos, not decorative samples',
  'A workbench for design principles, not a software pitch',
];

export default function LabsPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Experiment lane</p>
          <h1 className="surface-title" data-scramble>Labs</h1>
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
          <div className="lab-grid">
          <Link
            href="/labs/poise"
            className="lab-card"
            data-cuelume-hover="tick" data-cuelume-press="tick"
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
          <Link
            href="/labs/takt"
            className="lab-card"
            data-cuelume-hover="tick" data-cuelume-press="tick"
          >
            <div className="lab-card-top">
              <span className="status-badge status-badge--lab">Lab Two</span>
              <span className="lab-card-status">Live</span>
            </div>
            <h3 className="lab-card-title">Takt</h3>
            <p className="lab-card-lede">
              How an interface feels under your hands.
            </p>
            <p className="lab-card-desc">
              Concentric radii, press scale, image outlines, hit areas, stagger
              rhythm — portable rules with exact values, compiled from external
              design intelligence and verified on designesy.org.
            </p>
            <span className="lab-card-arrow">Open lab →</span>
          </Link>
          <Link
            href="/labs/cadence"
            className="lab-card"
            data-cuelume-hover="tick" data-cuelume-press="tick"
          >
            <div className="lab-card-top">
              <span className="status-badge status-badge--lab">Lab Three</span>
              <span className="lab-card-status">Live</span>
            </div>
            <h3 className="lab-card-title">Cadence</h3>
            <p className="lab-card-lede">
              The rhythm of text on a page.
            </p>
            <p className="lab-card-desc">
              Font smoothing, rem-based scale, line-height by role, tracking by
              size, measure, text-wrap, tabular numbers, and selection —
              portable rules with exact values, compiled from external
              typography intelligence and verified on designesy.org.
            </p>
            <span className="lab-card-arrow">Open lab →</span>
          </Link>
          <Link
            href="/labs/acoustics"
            className="lab-card"
            data-cuelume-hover="tick" data-cuelume-press="tick"
          >
            <div className="lab-card-top">
              <span className="status-badge status-badge--lab">Lab Four</span>
              <span className="lab-card-status">Live</span>
            </div>
            <h3 className="lab-card-title">Acoustics</h3>
            <p className="lab-card-lede">
              Interaction sound as a token system.
            </p>
            <p className="lab-card-desc">
              Ten cues, ten interaction roles, one documented engine. The sound
              parallel to the visual token system — no sound without a token
              name and rationale. Cuelume v0.1.0, adopted in contract v0.3.0.
            </p>
            <span className="lab-card-arrow">Open lab →</span>
          </Link>
          </div>
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
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Design system contract</span>
                <span className="row-meta">
                  Where lab behavior is measured — Poise in v0.1.1, Takt in v0.1.2, Cadence in v0.1.3
                </span>
              </span>
            </Link>
            <Link
              href="/review/poise"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Field check · Poise</span>
                <span className="row-meta">
                  Kit One review of Lab One · pass with notes
                </span>
              </span>
            </Link>
            <Link
              href="/review/takt"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Field check · Takt</span>
                <span className="row-meta">
                  Kit One review of Lab Two · pass with notes
                </span>
              </span>
            </Link>
            <Link
              href="/review/cadence"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Field check · Cadence</span>
                <span className="row-meta">
                  Kit One review of Lab Three · pass with notes
                </span>
              </span>
            </Link>
            <Link
              href="/acoustic-tokens"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">05</span>
              <span className="row-body">
                <span className="row-title">Acoustic token reference</span>
                <span className="row-meta">
                  Ten cues, ten roles — the sound parallel to the visual token system
                </span>
              </span>
            </Link>
            <Link
              href="/review/acoustics"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">06</span>
              <span className="row-body">
                <span className="row-title">Field check · Acoustics</span>
                <span className="row-meta">
                  Kit One review of Lab Four · pass with notes
                </span>
              </span>
            </Link>
            <Link
              href="/review/designesy-org"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">07</span>
              <span className="row-body">
                <span className="row-title">Public surface review</span>
                <span className="row-meta">
                  designesy.org checked against contract v0.4.0
                </span>
              </span>
            </Link>
            <Link
              href="/kits/design-review"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">08</span>
              <span className="row-body">
                <span className="row-title">Use Kit One · Design Review</span>
                <span className="row-meta">
                  Eight-dimension inspection method for any artifact
                </span>
              </span>
            </Link>
            <a
              href="https://designesy.ai.studio/"
              className="row"
              role="listitem"
              target="_blank"
              rel="noopener noreferrer"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">09</span>
              <span className="row-body">
                <span className="row-title">Talk to the Director</span>
                <span className="row-meta">
                  The contract, conversational — type, motion, spacing, or score any site
                </span>
              </span>
            </a>
            <Link
              href="/continuity"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">10</span>
              <span className="row-body">
                <span className="row-title">Continuity waitlist</span>
                <span className="row-meta">
                  Design judgment that stays current — early access, no charge to join
                </span>
              </span>
            </Link>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Lab anatomy</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Package map for a mature Lab. Each cell makes the experiment
            inspectable, reviewable, and promotable into durable rules.
          </p>
          <CheckGrid dense items={checkItemsFromStrings(LAB_ANATOMY)} />
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
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Before promotion, a Lab records:
          </p>
          <CheckGrid
            items={checkItemsFromStrings([
              'What the artifact tests',
              'What caused the behavior',
              'What it communicates',
              'Where it belongs',
              'What would make it excessive',
              'How it degrades for accessibility, performance, or reduced motion',
            ])}
          />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Lab boundaries</h2>
          <CheckGrid
            items={checkItemsFromStrings(LAB_BOUNDARIES)}
          />
        </section>

        <div className="status-note">
          Labs ship as named experiments with thesis, review status, and
          promotion readiness. Poise is Lab One. Takt is Lab Two. Cadence is
          Lab Three. Acoustics is Lab Four. Future labs follow the same anatomy
          and the site drift rule: every public UI change cites a contract token
          or an open tension.
        </div>
      </main>

      <Footer />
    </>
  );
}
