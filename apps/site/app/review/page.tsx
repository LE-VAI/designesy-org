import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';

export const metadata: Metadata = {
  title: 'Review',
  description:
    'Designesy Review — quality gate for interfaces, systems, and agent output. Eight dimensions and public field checks.',
  openGraph: {
    title: 'Review · Designesy',
    description:
      'Review leads with consequences, not personal taste. Eight dimensions and live field checks.',
    url: 'https://www.designesy.org/review',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Review · Designesy',
    description:
      'Quality gate for public artifacts — designesy.org/review',
  },
};

const DIMENSIONS = [
  { num: '01', title: 'Purpose', desc: 'What is the design trying to make possible? Which elements directly support that purpose? What can be removed without weakening action?' },
  { num: '02', title: 'Clarity', desc: 'Is the primary action discoverable? Does the form suggest use? Do labels, hierarchy, layout, and motion reduce uncertainty?' },
  { num: '03', title: 'Context', desc: 'Where and when will this be used? What constraints shape the experience: device, bandwidth, attention, lighting, language, ability, stress, social setting, maintenance?' },
  { num: '04', title: 'Inclusion', desc: 'Who benefits most? Who has to work harder? What assumptions about body, language, culture, knowledge, money, or technology are embedded?' },
  { num: '05', title: 'System coherence', desc: 'Does this follow an existing system? If it breaks the system, is the reason explicit and worth it? Can others reuse or extend the decision?' },
  { num: '06', title: 'Durability', desc: 'Will this hold up under repeated use? Can it be maintained, repaired, localized, and adapted? Is the need more durable than the trend?' },
  { num: '07', title: 'Delight', desc: 'Does the emotional quality clarify purpose, trust, identity, learning, or human connection? Or does it distract from weak function?' },
  { num: '08', title: 'Responsibility', desc: 'What environmental, economic, social, or human costs are hidden? Does the design distribute effort fairly? What would make it more honest?' },
];

const REVIEW_CHECKS = [
  'Separate observed behavior from derived judgment',
  'Name tradeoffs',
  'Identify hidden burdens',
  'Check missing states',
  'Verify accessibility, responsiveness, keyboard flow',
  'Check persistence, performance, and source provenance',
  'Recommend concrete corrections',
];

export default function ReviewPage() {
  return (
    <>
      <Topbar scrolled />

      <main className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Quality gate</p>
          <h1 className="surface-title">Review</h1>
          <p className="surface-lede">
            Review leads with consequences, not personal taste.
          </p>
          <p className="surface-note">
            Designesy Review is the quality-control layer for interfaces,
            products, artifacts, identity systems, design systems, agent output,
            and environmental or experiential design. It evaluates purpose,
            clarity, context, inclusion, system coherence, durability, delight,
            responsibility, and verification proof.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Review dimensions</h2>
          <div className="principle-list">
            {DIMENSIONS.map((d) => (
              <div className="principle" key={d.num} data-cuelume-hover="whisper">
                <span className="principle-num">{d.num}</span>
                <div className="principle-body">
                  <h3>{d.title}</h3>
                  <p>{d.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Agent review stance</h2>
          <div className="row-stack" role="list">
            {REVIEW_CHECKS.map((check, i) => (
              <div className="row" role="listitem" key={check}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{check}</span>
                </span>
              </div>
            ))}
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
          <p className="surface-note">
            Functional is the baseline. Considered is the bar. An artifact is
            ready when every dimension above has been checked, tradeoffs have
            been named, and the remaining tensions are documented — not hidden.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Field checks</h2>
          <Link
            href="/review/designesy-org"
            className="lab-card"
            data-cuelume-hover="tick"
            data-cuelume-press
            data-cuelume-release
          >
            <div className="lab-card-top">
              <span className="status-badge">Public surface</span>
              <span className="lab-card-status">Live</span>
            </div>
            <h3 className="lab-card-title">designesy.org</h3>
            <p className="lab-card-lede">
              Public review against design system contract v0.1.
            </p>
            <p className="lab-card-desc">
              Holds, tensions, and standing rules for the live site — including
              Lab One, Poise.
            </p>
            <span className="lab-card-arrow">Open review →</span>
          </Link>
          <p className="surface-note" style={{ marginTop: '1.25rem' }}>
            Field checks publish when an artifact is live enough to judge.
            Empty slots are not advertised as upcoming reviews.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Use this as a kit</h2>
          <Link
            href="/kits/design-review"
            className="lab-card"
            data-cuelume-hover="tick"
            data-cuelume-press
            data-cuelume-release
          >
            <div className="lab-card-top">
              <span className="status-badge status-badge--kit">Kit One</span>
              <span className="lab-card-status">Live</span>
            </div>
            <h3 className="lab-card-title">Design Review</h3>
            <p className="lab-card-lede">
              Portable package of these dimensions for agents and teams.
            </p>
            <p className="lab-card-desc">
              Prompt, output format, verification, and anti-patterns — ready to
              hand off as a shareable path.
            </p>
            <span className="lab-card-arrow">Open kit →</span>
          </Link>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Review against</h2>
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
                <span className="row-title">Design system contract v0.1</span>
                <span className="row-meta">Human home and machine export</span>
              </span>
            </Link>
            <Link
              href="/labs/poise"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Lab One · Poise</span>
                <span className="row-meta">
                  Interaction behaviors under review for adoption
                </span>
              </span>
            </Link>
            <Link
              href="/kits/design-review"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Use Kit One · Design Review</span>
                <span className="row-meta">
                  Runnable package of these dimensions
                </span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          Review language and quality discipline for public artifacts. Published
          reviews live under /review. The first is the public surface review of
          designesy.org itself — judged against contract v0.1, not against taste.
        </div>
      </main>

      <Footer />
    </>
  );
}