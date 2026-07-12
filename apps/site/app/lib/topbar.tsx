import Link from 'next/link';
import { SoundToggle } from './sound-toggle';

const NAV_ROUTES = [
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/kits', label: 'Kits' },
  { href: '/review', label: 'Review' },
  { href: '/contracts', label: 'Contracts' },
];

/**
 * Shared topbar — extracted from page duplication.
 * Includes sound toggle and cuelume hover attributes on nav links.
 * Pass `scrolled` to force the scrolled state on route pages.
 */
export function Topbar({ scrolled = false }: { scrolled?: boolean }) {
  return (
    <header className={`topbar${scrolled ? ' scrolled' : ''}`} id="topbar">
      <div className="topbar-inner">
        <Link
          className="wordmark"
          href="/"
          data-cuelume-hover="tick"
        >
          designesy<span className="dot">.</span>
        </Link>
        <div className="topbar-right">
          <nav className="nav-links" aria-label="Primary">
            {NAV_ROUTES.map((route) => (
              <Link
                href={route.href}
                key={route.href}
                data-cuelume-hover="tick"
              >
                {route.label}
              </Link>
            ))}
          </nav>
          <SoundToggle />
        </div>
      </div>
    </header>
  );
}