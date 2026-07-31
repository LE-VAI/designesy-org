'use client'; // build-cache-bust:1784949264

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { HapticsToggle } from './haptics-toggle';
import { SoundToggle } from './sound-toggle';
import { ThemeToggle } from './theme-toggle';

// Primary nav — 5 items. Score + Leaderboard pair as the public verification
// surface; Contract, Kits, Docs cover the developer/designer path.
// Secondary routes (Learn, Open, Labs, Review, Badge, Work, Graph, Continuity,
// Privacy) live in the footer.
// See: razegrowth.com SaaS navigation architecture guide.
const NAV_ROUTES = [
  { href: '/score', label: 'Score' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/contracts', label: 'Contract' },
  { href: '/kits', label: 'Kits' },
  { href: '/docs', label: 'Docs' },
];

function isActiveRoute(pathname: string, href: string) {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

/**
 * Shared topbar — wordmark, primary routes, sense toggles, scroll progress.
 * Scrolled state uses restrained frost for chrome.
 */
export function Topbar({ scrolled = false }: { scrolled?: boolean }) {
  const pathname = usePathname() || '/';
  const [isScrolled, setIsScrolled] = useState(scrolled);
  const [progress, setProgress] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setIsScrolled(y > 40 || scrolled);

      const doc = document.documentElement;
      const max = Math.max(doc.scrollHeight - window.innerHeight, 1);
      setProgress(Math.min(Math.max(y / max, 0), 1));
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [scrolled]);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [drawerOpen]);

  useEffect(() => {
    if (!activeRef.current) return;
    activeRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [pathname]);

  return (
    <header className={`topbar${isScrolled ? ' scrolled' : ''}`} id="topbar">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="topbar-inner">
        <Link
          className="wordmark"
          href="/"
          data-cuelume-hover="sparkle"
          data-cuelume-press="tick"
          data-firework="true"
          aria-current={pathname === '/' ? 'page' : undefined}
        >
          designesy<span className="dot">.</span>
        </Link>
        <div className="topbar-right">
          <nav className="nav-links" aria-label="Primary">
            {NAV_ROUTES.map((route) => {
              const active = isActiveRoute(pathname, route.href);
              return (
                <Link
                  href={route.href}
                  key={route.href}
                  ref={active ? activeRef : undefined}
                  data-cuelume-hover="tick"
                  data-cuelume-press="tick"
                  data-firework={route.href === '/open' ? true : undefined}
                  className={active ? 'is-active' : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  {route.label}
                </Link>
              );
            })}
          </nav>
          <div className="sense-toggles" role="group" aria-label="Sensory feedback">
            <SoundToggle />
            <HapticsToggle />
          </div>
          <ThemeToggle />
          <button
            className="nav-trigger"
            aria-label="Toggle navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((o) => !o)}
          >
            <span className="nav-trigger-bar" />
            <span className="nav-trigger-bar" />
            <span className="nav-trigger-bar" />
          </button>
        </div>
      </div>
      <div className="scroll-progress" aria-hidden="true">
        <span
          className="scroll-progress-fill"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      {drawerOpen && (
        <div
          className="nav-scrim open"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}
      <nav
        className={`nav-drawer${drawerOpen ? ' open' : ''}`}
        aria-label="Mobile navigation"
      >
        {/* Explicit close control — always visible inside the drawer. The
            hamburger→X CSS rotation is subtle and easy to miss on a real
            device; an obvious "Close" labelled button means users don't
            feel forced to select a route to escape. */}
        <button
          type="button"
          className="nav-drawer-close"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
        >
          <span className="nav-drawer-close-icon" aria-hidden="true">✕</span>
          <span className="nav-drawer-close-label">Close</span>
        </button>
        {NAV_ROUTES.map((route) => {
          const active = isActiveRoute(pathname, route.href);
          return (
            <Link
              href={route.href}
              key={route.href}
              className={active ? 'is-active' : undefined}
              aria-current={active ? 'page' : undefined}
            >
              {route.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
