'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { initScrollPause } from './scroll-pause';

const SURFACE_LINKS = [
  { href: '/score', label: 'Score' },
  { href: '/drift', label: 'Drift' },
  { href: '/readiness', label: 'Readiness' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/benchmarks', label: 'Benchmarks' },
  { href: '/open', label: 'Open' },
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/kits', label: 'Kits' },
  { href: '/review', label: 'Review' },
  { href: '/badge', label: 'Badge' },
  { href: '/work', label: 'Work' },
  { href: '/continuity', label: 'Continuity' },
  { href: '/contracts', label: 'Contracts' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/privacy', label: 'Privacy' },
];

const MACHINE_LINKS = [
  { href: '/open.json', label: 'open.json' },
  { href: '/llms.txt', label: 'llms.txt' },
  { href: '/llms-full.txt', label: 'llms-full.txt' },
  { href: '/.well-known/agent.json', label: 'agent.json' },
  { href: '/contracts/design-system.json', label: 'design-system.json' },
  { href: '/contracts/tokens.json', label: 'tokens.json' },
  { href: '/contracts/a11y.json', label: 'a11y.json' },
  { href: '/contracts/motion.json', label: 'motion.json' },
  { href: '/contracts/drift.json', label: 'drift.json' },
  { href: '/contracts/readiness.json', label: 'readiness.json' },
  { href: '/api/mcp', label: 'MCP server' },
  { href: '/docs/mcp', label: 'MCP docs' },
  { href: '/review/keyboard', label: 'Keyboard' },
];

/**
 * Shared footer — wordmark, legal line, dock sitemap, contact.
 * Two separate dock rows: Surfaces (human links) and Machine (agent links).
 * Each dock has a label (always visible) and a clipped track with an inner
 * scroller that auto-translates for the marquee effect. Pure CSS, no JS.
 * Respects prefers-reduced-motion.
 */
export function Footer() {
  const surfaceItems = [...SURFACE_LINKS, ...SURFACE_LINKS];
  const machineItems = [...MACHINE_LINKS, ...MACHINE_LINKS];

  const surfaceClipRef = useRef<HTMLDivElement>(null);
  const surfaceTrackRef = useRef<HTMLDivElement>(null);
  const machineClipRef = useRef<HTMLDivElement>(null);
  const machineTrackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The rails hold still under reduced motion (globals.css), so there is
    // nothing to drag there. Touch screens keep the marquee: a finger landing
    // freezes it in place, and a swipe stops it for the visit (scroll-pause).
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cleanups: (() => void)[] = [];
    if (surfaceClipRef.current && surfaceTrackRef.current) {
      cleanups.push(initScrollPause(surfaceClipRef.current, surfaceTrackRef.current, 'horizontal'));
    }
    if (machineClipRef.current && machineTrackRef.current) {
      cleanups.push(initScrollPause(machineClipRef.current, machineTrackRef.current, 'horizontal'));
    }
    return () => cleanups.forEach((fn) => fn());
  }, []);

  // A rail whose links all fit has nothing to scroll. The loop is two copies
  // translated by one copy's width, so when one copy is NARROWER than the rail
  // the second copy shows beside the first and a gap opens at the end: at a
  // 2560px viewport both rails repeated on screen. Such a rail holds still as
  // one aligned row (the same layout reduced motion uses); it only scrolls when
  // there is more than a rail's worth of links. Re-measured on every resize.
  useEffect(() => {
    const pairs: [HTMLDivElement | null, HTMLDivElement | null, number][] = [
      [surfaceClipRef.current, surfaceTrackRef.current, SURFACE_LINKS.length],
      [machineClipRef.current, machineTrackRef.current, MACHINE_LINKS.length],
    ];
    const measure = () => {
      for (const [clip, track, count] of pairs) {
        const dock = clip?.parentElement;
        if (!clip || !track || !dock) continue;
        let copy = 0;
        for (const pill of Array.from(track.children).slice(0, count) as HTMLElement[]) {
          copy += pill.offsetWidth + (parseFloat(getComputedStyle(pill).marginRight) || 0);
        }
        const lead = parseFloat(getComputedStyle(track).marginLeft) || 0;
        dock.toggleAttribute('data-fits', copy + lead <= clip.clientWidth);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const [clip] of pairs) if (clip) ro.observe(clip);
    return () => ro.disconnect();
  }, []);

  return (
    <footer className="footer" data-pagefind-ignore>
      <div className="site-shell footer-inner">
        <div className="footer-meta">
          <span className="wordmark" data-cuelume-hover="sparkle">
            {/* The wrapper keeps the dot on the word: .wordmark is a flex row
                with a gap sized for the topbar's mark, and a bare text node
                plus .dot became two flex items with that gap between them. */}
            <span className="wordmark-type">designesy<span className="dot">.</span></span>
          </span>
          <span>
            <strong>Designesy LLC</strong> · Design intelligence infrastructure
          </span>

          <Link
            href="/score?url=designesy.org"
            className="footer-badge"
            data-cuelume-hover="droplet"
            data-cuelume-press="tick"
          >
            {/* badge.svg is the dark-surface variant (black ground, white
                text); badge-light.svg is the white chip the /badge page
                documents "for light-background sites". The footer is black, so
                the white chip read as a foreign sticker with a barely legible
                mark on it (2026-10-04). The dark variant belongs on this
                surface. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/badge.svg"
              alt="Verified by Designesy badge: see our live score"
              width={156}
              height={32}
              style={{ display: 'block' }}
            />
          </Link>

          <nav className="footer-docks" aria-label="Site map">
            <div className="footer-dock">
              <span className="footer-dock-label">Surfaces</span>
              <div className="footer-dock-clip" ref={surfaceClipRef}>
                <div className="footer-dock-track" ref={surfaceTrackRef}>
                  {surfaceItems.map((link, i) => (
                    <Link
                      href={link.href}
                      key={`s-${link.href}-${i}`}
                      className="footer-dock-pill footer-dock-pill--surface"
                      data-cuelume-hover="tick"
                      data-cuelume-press="tick"
                      aria-hidden={i >= SURFACE_LINKS.length ? true : undefined}
                      tabIndex={i >= SURFACE_LINKS.length ? -1 : undefined}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="footer-dock">
              <span className="footer-dock-label">Machine</span>
              <div className="footer-dock-clip" ref={machineClipRef}>
                <div className="footer-dock-track" ref={machineTrackRef}>
                  {machineItems.map((link, i) => (
                    <Link
                      href={link.href}
                      key={`m-${link.href}-${i}`}
                      className="footer-dock-pill footer-dock-pill--machine"
                      data-cuelume-hover="chime"
                      data-cuelume-press="tick"
                      aria-hidden={i >= MACHINE_LINKS.length ? true : undefined}
                      tabIndex={i >= MACHINE_LINKS.length ? -1 : undefined}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </nav>
        </div>
        <a
          className="footer-link"
          href="mailto:hello@designesy.org"
          data-cuelume-hover="droplet"
          data-cuelume-press="droplet"
        >
          hello@designesy.org
        </a>
      </div>
    </footer>
  );
}