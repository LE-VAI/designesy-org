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
 * Shared footer — wordmark, legal line, dock-marquee sitemap, contact.
 * Surfaces and machine links share a single horizontal auto-scrolling dock
 * of pill cells. Pure CSS animation, pause on hover/touch, reduced-motion safe.
 */
export function Footer() {
  // Duplicate the full set so the marquee loops seamlessly
  const allPills = [
    ...SURFACE_LINKS.map((l) => ({ ...l, type: 'surface' as const })),
    { href: '', label: '', type: 'sep' as const },
    ...MACHINE_LINKS.map((l) => ({ ...l, type: 'machine' as const })),
  ];
  const trackItems = [...allPills, ...allPills];

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

          <nav className="footer-dock" aria-label="Site map">
            <span className="footer-dock-label">Sitemap</span>
            <div className="footer-dock-track">
              {trackItems.map((item, i) => {
                if (item.type === 'sep') {
                  return (
                    <span
                      className="footer-dock-sep"
                      aria-hidden="true"
                      key={`sep-${i}`}
                    />
                  );
                }
                return (
                  <Link
                    href={item.href}
                    key={`${item.href}-${i}`}
                    className={`footer-dock-pill footer-dock-pill--${item.type}`}
                    data-cuelume-hover={item.type === 'surface' ? 'tick' : 'chime'}
                  >
                    {item.label}
                  </Link>
                );
              })}
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