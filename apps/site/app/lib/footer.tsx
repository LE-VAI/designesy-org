import Link from 'next/link';

const SURFACE_LINKS = [
  { href: '/open', label: 'Open' },
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/kits', label: 'Kits' },
  { href: '/review', label: 'Review' },
  { href: '/contracts', label: 'Contracts' },
  { href: '/kits/design-review', label: 'Design Review' },
  { href: '/review/poise', label: 'Poise review' },
  { href: '/contracts/design-system', label: 'Design system' },
  { href: '/privacy', label: 'Privacy' },
];

const MACHINE_LINKS = [
  { href: '/open.json', label: 'open.json' },
  { href: '/llms.txt', label: 'llms.txt' },
  { href: '/llms-full.txt', label: 'llms-full.txt' },
  { href: '/.well-known/agent.json', label: 'agent.json' },
  { href: '/open/handoff', label: 'Open handoff' },
  { href: '/review/keyboard', label: 'Keyboard' },
];

/**
 * Shared footer — wordmark, legal line, grouped wayfinding, contact.
 * Surfaces vs machine links stay separated for scan clarity.
 */
export function Footer() {
  return (
    <footer className="footer">
      <div className="site-shell footer-inner">
        <div className="footer-meta">
          <span className="wordmark">
            designesy<span className="dot">.</span>
          </span>
          <span>
            <strong>Designesy LLC</strong> · Design intelligence infrastructure
          </span>

          <div className="footer-groups">
            <nav className="footer-nav" aria-label="Surfaces">
              <span className="footer-group-label">Surfaces</span>
              {SURFACE_LINKS.map((link) => (
                <Link
                  href={link.href}
                  key={link.href}
                  data-cuelume-hover="tick"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <nav className="footer-nav footer-nav--machine" aria-label="Machine">
              <span className="footer-group-label">Machine</span>
              {MACHINE_LINKS.map((link) => (
                <Link
                  href={link.href}
                  key={link.href}
                  data-cuelume-hover="tick"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
        <a
          className="footer-link"
          href="mailto:le@designesy.org"
          data-cuelume-hover="tick"
        >
          le@designesy.org
        </a>
      </div>
    </footer>
  );
}
