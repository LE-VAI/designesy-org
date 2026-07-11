import Link from 'next/link';

const NAV_ROUTES = [
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/review', label: 'Review' },
  { href: '/contracts', label: 'Contracts' },
];

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
      <header className="topbar scrolled">
        <div className="topbar-inner">
          <Link className="wordmark" href="/">
            designesy<span className="dot">.</span>
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {NAV_ROUTES.map((route) => (
              <Link href={route.href} key={route.href}>
                {route.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

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
              <div className="principle" key={d.num}>
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
          <ul className="checkmark-list">
            {REVIEW_CHECKS.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
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

        <div className="status-note">
          This is review language and quality discipline. Each artifact carries
          its review status and dimension checklist as the process becomes
          operational across live projects.
        </div>
      </main>

      <footer className="footer">
        <div className="surface-page footer-inner">
          <div className="footer-meta">
            <span className="wordmark">designesy<span className="dot">.</span></span>
            <span><strong>Designesy LLC</strong> · Design intelligence infrastructure</span>
          </div>
          <a className="footer-link" href="mailto:le@designesy.org">
            le@designesy.org
          </a>
        </div>
      </footer>
    </>
  );
}