import Link from 'next/link';

const SURFACE_LINKS = [
  { href: '/open', label: 'Open' },
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/kits', label: 'Kits' },
  { href: '/review', label: 'Review' },
  { href: '/work', label: 'Work' },
  { href: '/graph', label: 'Graph' },
  { href: '/contracts', label: 'Contracts' },
  { href: '/labs/takt', label: 'Takt lab' },
  { href: '/labs/cadence', label: 'Cadence lab' },
  { href: '/kits/design-review', label: 'Design Review' },
  { href: '/review/poise', label: 'Poise review' },
  { href: '/review/takt', label: 'Takt review' },
  { href: '/review/cadence', label: 'Cadence review' },
  { href: '/review/designesy-org', label: 'Site review' },
  { href: '/work/tile', label: 'Tile case study' },
  { href: '/work/continuity', label: 'Continuity case study' },
  { href: '/acoustic-tokens', label: 'Acoustic tokens' },
  { href: '/contracts/design-system', label: 'Design system' },
  { href: '/open/handoff', label: 'Open handoff' },
  { href: '/privacy', label: 'Privacy' },
];

const MACHINE_LINKS = [
  { href: '/open.json', label: 'open.json' },
  { href: '/llms.txt', label: 'llms.txt' },
  { href: '/llms-full.txt', label: 'llms-full.txt' },
  { href: '/.well-known/agent.json', label: 'agent.json' },
  { href: '/contracts/design-system.json', label: 'design-system.json' },
  { href: '/kits/design-review.json', label: 'design-review.json' },
  { href: '/acoustic-tokens.json', label: 'acoustic-tokens.json' },
  { href: '/labs/poise.json', label: 'poise.json' },
  { href: '/labs/takt.json', label: 'takt.json' },
  { href: '/labs/cadence.json', label: 'cadence.json' },
  { href: '/graph.json', label: 'graph.json' },
  { href: '/review/keyboard', label: 'Keyboard' },
];

/**
 * Shared footer — wordmark, legal line, dock sitemap, contact.
 * Two separate dock rows: Surfaces (human links) and Machine (agent links).
 * Each dock auto-scrolls horizontally, pauses on hover/focus.
 * Pure CSS, no JS. Respects prefers-reduced-motion.
 */
export function Footer() {
  const surfaceItems = [...SURFACE_LINKS, ...SURFACE_LINKS];
  const machineItems = [...MACHINE_LINKS, ...MACHINE_LINKS];

  return (
    <footer className="footer">
      <div className="site-shell footer-inner">
        <div className="footer-meta">
          <span className="wordmark" data-cuelume-hover="sparkle">
            designesy<span className="dot">.</span>
          </span>
          <span>
            <strong>Designesy LLC</strong> · Design intelligence infrastructure
          </span>

          <nav className="footer-docks" aria-label="Site map">
            <div className="footer-dock">
              <span className="footer-dock-label">Surfaces</span>
              <div className="footer-dock-track">
                {surfaceItems.map((link, i) => (
                  <Link
                    href={link.href}
                    key={`s-${link.href}-${i}`}
                    className="footer-dock-pill footer-dock-pill--surface"
                    data-cuelume-hover="tick"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="footer-dock">
              <span className="footer-dock-label">Machine</span>
              <div className="footer-dock-track">
                {machineItems.map((link, i) => (
                  <Link
                    href={link.href}
                    key={`m-${link.href}-${i}`}
                    className="footer-dock-pill footer-dock-pill--machine"
                    data-cuelume-hover="chime"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </nav>
        </div>
        <a
          className="footer-link"
          href="mailto:le@designesy.org"
          data-cuelume-hover="droplet"
        >
          le@designesy.org
        </a>
      </div>
    </footer>
  );
}