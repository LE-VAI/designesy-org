'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { HapticsToggle } from './haptics-toggle';
import { SoundToggle } from './sound-toggle';

const NAV_ROUTES = [
  { href: '/open', label: 'Open' },
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/kits', label: 'Kits' },
  { href: '/review', label: 'Review' },
  { href: '/work', label: 'Work' },
  { href: '/contracts', label: 'Contracts' },
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
        </div>
      </div>
      <div className="scroll-progress" aria-hidden="true">
        <span
          className="scroll-progress-fill"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </header>
  );
}
