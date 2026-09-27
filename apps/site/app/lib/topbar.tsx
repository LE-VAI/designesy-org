'use client'; // build-cache-bust:1784949264

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MotionToggle } from './motion-toggle';
import { CommandPalette } from './command-palette';
import { SensesMenu } from './senses-menu';

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
  const [deepScrolled, setDeepScrolled] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      // Skip state updates when the command palette (or any modal) has
      // scroll-locked the body — body.overflow:hidden can reset scrollY
      // to 0, which would falsely collapse the search pill and cause the
      // topbar to re-render while the user is interacting with the palette.
      if (document.body.style.overflow === 'hidden') return;

      setIsScrolled(y > 40 || scrolled);
      setDeepScrolled(y > 320);
      // Search pill expansion tracks ACTUAL scroll, not the `scrolled` prop
      // (which is forced true on every page for the glass tint). This keeps
      // the search icon-only at the top of a page and expands it only after
      // the user starts scrolling down.
      setSearchExpanded(y > 40);

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

  // Scroll the active nav link into view — only needed when the nav-links
  // container actually overflows (narrow desktop windows between 720px and
  // ~1100px). Below 720px the nav is hidden (hamburger drawer takes over);
  // above ~1100px the nav fits without overflow. We use behavior:'instant'
  // (not 'smooth') because a smooth scroll on route change animates the
  // entire nav-links row, which looks like the nav bar is sliding sideways.
  // The active-link underline provides enough visual feedback.
  useEffect(() => {
    if (!activeRef.current) return;
    const nav = activeRef.current.parentElement;
    if (nav && nav.scrollWidth > nav.clientWidth) {
      activeRef.current.scrollIntoView({
        behavior: 'instant',
        block: 'nearest',
        inline: 'center',
      } as ScrollIntoViewOptions);
    }
  }, [pathname]);

  return (
    <>
      <header className={`topbar${isScrolled ? ' scrolled' : ''}${deepScrolled ? ' deep-scrolled' : ''}${searchExpanded ? ' search-expanded' : ''}`} id="topbar" data-pagefind-ignore>
        {/* Glass layer — absolute child behind nav content. iOS 26 Safari
            ignores position:absolute children for toolbar tinting, so the
            blur lives here instead of on the sticky parent. */}
        <div className="topbar-glass" aria-hidden="true" />
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="topbar-inner">
          <Link
            className="wordmark"
            href="/"
            data-cuelume-hover="sparkle"
            data-cuelume-press="tick"
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            {/* The site's own mark (favicon and share-card construction): a
                contract square holding the signal dot. Decorative; the
                wordmark text names the link. */}
            <span className="wordmark-mark" aria-hidden="true"><i /></span>
            <span className="wordmark-type">designesy<span className="dot">.</span></span>
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
                    className={active ? 'is-active' : undefined}
                    aria-current={active ? 'page' : undefined}
                  >
                    {route.label}
                  </Link>
                );
              })}
            </nav>
            <CommandPalette />
            <SensesMenu />
            {/* One primary action, verb-first. Hidden on /score itself, where
                the form is the page. */}
            {!pathname.startsWith('/score') && (
              <Link
                href="/score"
                className="topbar-cta"
                data-cuelume-hover="tick"
                data-cuelume-press="tick"
              >
                Score a site
              </Link>
            )}
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
          {/* Progress runs along the capsule's own lower edge. */}
          <div className="scroll-progress" aria-hidden="true">
            <span
              className="scroll-progress-fill"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
        </div>
      </header>
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
        <MotionToggle variant="row" />
      </nav>
    </>
  );
}
