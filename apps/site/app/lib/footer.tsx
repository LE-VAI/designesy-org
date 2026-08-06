'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { initScrollPause } from './scroll-pause';

const SURFACE_LINKS = [
  { href: '/score', label: 'Score' },
  { href: '/drift', label: 'Drift' },
  { href: '/readiness', label: 'Readiness' },
  { href: '/guardrails', label: 'Guardrails' },
  { href: '/monitor', label: 'Monitor' },
  { href: '/compare', label: 'Compare' },
  { href: '/report', label: 'Report' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/frameworks', label: 'Evaluations' },
  { href: '/state-of-compliance', label: 'State of Compliance' },
  { href: '/benchmarks', label: 'Benchmarks' },
  { href: '/specs', label: 'Specs' },
  { href: '/maturity', label: 'Maturity' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/m3-bridge', label: 'M3 Bridge' },
  { href: '/spring-validator', label: 'Spring Validator' },
  { href: '/learn', label: 'Learn' },
  { href: '/open', label: 'Open' },
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/kits', label: 'Kits' },
  { href: '/review', label: 'Review' },
  { href: '/badge', label: 'Badge' },
  { href: '/work', label: 'Work' },
  { href: '/continuity', label: 'Continuity' },
  { href: '/graph', label: 'Graph' },
  { href: '/contracts', label: 'Contracts' },
  { href: '/pricing', label: 'Pricing' },
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
  { href: '/contracts/tokens', label: 'Tokens' },
  { href: '/contracts/a11y', label: 'Accessibility' },
  { href: '/contracts/motion', label: 'Motion' },
  { href: '/open/handoff', label: 'Open handoff' },
  { href: '/privacy', label: 'Privacy' },
];

const MACHINE_LINKS = [
  { href: '/open.json', label: 'open.json' },
  { href: '/llms.txt', label: 'llms.txt' },
  { href: '/llms-full.txt', label: 'llms-full.txt' },
  { href: '/.well-known/agent.json', label: 'agent.json' },
  { href: '/contracts/design-system.json', label: 'design-system.json' },
  { href: '/export/dtcg', label: 'dtcg.json' },
  { href: '/contracts/tokens.json', label: 'tokens.json' },
  { href: '/contracts/a11y.json', label: 'a11y.json' },
  { href: '/contracts/motion.json', label: 'motion.json' },
  { href: '/contracts/drift.json', label: 'drift.json' },
  { href: '/contracts/readiness.json', label: 'readiness.json' },
  { href: '/contracts/guardrails.json', label: 'guardrails.json' },
  { href: '/contracts/monitor.json', label: 'monitor.json' },
  { href: '/contracts/compare.json', label: 'compare.json' },
  { href: '/contracts/report.json', label: 'report.json' },
  { href: '/kits/design-review.json', label: 'design-review.json' },
  { href: '/acoustic-tokens.json', label: 'acoustic-tokens.json' },
  { href: '/labs/poise.json', label: 'poise.json' },
  { href: '/labs/takt.json', label: 'takt.json' },
  { href: '/labs/cadence.json', label: 'cadence.json' },
  { href: '/graph.json', label: 'graph.json' },
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
    const cleanups: (() => void)[] = [];
    if (surfaceClipRef.current && surfaceTrackRef.current) {
      cleanups.push(initScrollPause(surfaceClipRef.current, surfaceTrackRef.current, 'horizontal'));
    }
    if (machineClipRef.current && machineTrackRef.current) {
      cleanups.push(initScrollPause(machineClipRef.current, machineTrackRef.current, 'horizontal'));
    }
    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <footer className="footer" data-pagefind-ignore>
      <div className="site-shell footer-inner">
        <div className="footer-meta">
          <span className="wordmark" data-cuelume-hover="sparkle">
            designesy<span className="dot">.</span>
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/badge-light.svg"
              alt="Verified by Designesy — see our live score"
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