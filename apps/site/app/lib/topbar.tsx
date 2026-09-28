'use client'; // build-cache-bust:1784949264

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MotionToggle } from './motion-toggle';
import { CommandPalette } from './command-palette';
import { SensesMenu } from './senses-menu';
import { StudioGlyph, STUDIO_HREF, STUDIO_LABEL } from './director-dock';
import { inertOutside, lockScroll, scrollLocked } from './scroll-lock';

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

// The phone menu's second tier. On a phone these pages were reachable only
// through the footer's moving rails. Three groups of at most six, each under a
// short label, below the five primary rows and styled as the lower tier: the
// shape NN/g's menu research and Baymard's (~10 options at one level) point to.
// Labels are the pages' own titles.
const MORE_GROUPS = [
  {
    id: 'tools',
    label: 'Tools',
    links: [
      { href: '/drift', label: 'Drift radar' },
      { href: '/readiness', label: 'AI readiness' },
      { href: '/compare', label: 'Compare' },
      { href: '/monitor', label: 'Drift monitor' },
      { href: '/guardrails', label: 'Guardrails' },
      { href: '/badge', label: 'Badge' },
    ],
  },
  {
    id: 'scoring',
    label: 'How scoring works',
    links: [
      { href: '/methodology', label: 'Methodology' },
      { href: '/benchmarks', label: 'Benchmarks' },
      { href: '/specs', label: 'Specs' },
      { href: '/frameworks', label: 'Frameworks' },
      { href: '/state-of-compliance', label: 'State of compliance' },
      { href: '/changelog', label: 'Changelog' },
    ],
  },
  {
    id: 'explore',
    label: 'Explore',
    links: [
      { href: '/work', label: 'Work' },
      { href: '/review', label: 'Review' },
      { href: '/labs', label: 'Labs' },
      { href: '/open', label: 'Open' },
      { href: '/continuity', label: 'Continuity' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Closing by Escape, Close or the scrim hands focus back to the trigger;
  // closing because a link was followed does not (the next page takes it).
  const returnFocus = useRef(true);
  const closeDrawer = useCallback((restoreFocus = true) => {
    returnFocus.current = restoreFocus;
    setDrawerOpen(false);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      // Skip state updates while a modal layer (the palette, the phone menu)
      // holds the scroll lock, so the bar does not re-render under it.
      if (scrollLocked()) return;

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
    closeDrawer(false);
  }, [pathname, closeDrawer]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, closeDrawer]);

  // The open menu is modal. The page behind holds still (lib/scroll-lock:
  // the lock sits on html, since a lock on body let a phone scroll the page
  // behind) and goes inert, so Tab and a screen reader stay inside the menu.
  // Focus starts on Close; closing hands it back to the trigger.
  useEffect(() => {
    if (!drawerOpen || !drawerRef.current) return;
    const unlock = lockScroll();
    const restore = inertOutside(drawerRef.current, [scrimRef.current]);
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      restore();
      unlock();
      if (returnFocus.current) triggerRef.current?.focus({ preventScroll: true });
      returnFocus.current = true;
    };
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
              ref={triggerRef}
              type="button"
              className="nav-trigger"
              // A verb phrase (the contract's own v38); while the menu is open the
              // trigger sits behind it, inert, so "open" is always what it does.
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              aria-controls="site-menu"
              onClick={() => (drawerOpen ? closeDrawer() : setDrawerOpen(true))}
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
          ref={scrimRef}
          className="nav-scrim open"
          onClick={() => closeDrawer()}
          aria-hidden="true"
        />
      )}
      {/* The phone menu: a modal dialog. Closed, it is inert and hidden, so a
          keyboard cannot tab into links parked off-screen. */}
      <div
        ref={drawerRef}
        id="site-menu"
        className={`nav-drawer${drawerOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!drawerOpen}
      >
        {/* Explicit close control — always visible inside the drawer. The
            hamburger→X CSS rotation is subtle and easy to miss on a real
            device; an obvious "Close" labelled button means users don't
            feel forced to select a route to escape. */}
        <button
          ref={closeRef}
          type="button"
          className="nav-drawer-close"
          aria-label="Close menu"
          onClick={() => closeDrawer()}
        >
          <span className="nav-drawer-close-icon" aria-hidden="true">✕</span>
          <span className="nav-drawer-close-label">Close</span>
        </button>
        <nav className="nav-drawer-links" aria-label="Pages">
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
        <nav className="nav-drawer-more" aria-label="More pages">
          {MORE_GROUPS.map((group) => (
            <div className="nav-drawer-group" key={group.id}>
              <p className="nav-drawer-group-label" id={`nav-more-${group.id}`}>
                {group.label}
              </p>
              {/* role="list": Safari drops list semantics once list-style is none. */}
              <ul className="nav-drawer-group-list" role="list" aria-labelledby={`nav-more-${group.id}`}>
                {group.links.map((route) => {
                  const active = isActiveRoute(pathname, route.href);
                  return (
                    <li key={route.href}>
                      <Link
                        href={route.href}
                        className={active ? 'is-active' : undefined}
                        aria-current={active ? 'page' : undefined}
                      >
                        {route.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        {/* On phones the Studio pill tucks away while reading, so the menu
            carries the Studio as well. */}
        <a
          className="nav-drawer-studio"
          href={STUDIO_HREF}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={STUDIO_LABEL}
        >
          <StudioGlyph />
          <span>Ask the Studio</span>
          <span className="nav-drawer-studio-out" aria-hidden="true">↗</span>
        </a>
        <MotionToggle variant="row" />
      </div>
    </>
  );
}
