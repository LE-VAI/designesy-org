'use client';

/**
 * Docs table of contents — sticky right rail with scroll-spy.
 *
 * Why this exists: /docs is 6 viewports tall across 8 sections with no on-page
 * navigation, so a reader arriving mid-page cannot tell where they are or what
 * remains. Research consensus for docs IA is three navigation layers — a
 * structural sidebar, breadcrumbs, and a right-rail TOC of the current page —
 * and the teardown of a major docs site that *omits* the right rail calls it a
 * flaw ("a right rail with H2 anchors would save the round trip"), not a
 * pattern to copy.
 *
 * Implementation notes:
 *
 * 1. `scroll-target-group` (CSS-only scroll-spy) is not used. It is the right
 *    long-term answer, but it needs `::target-current` on the anchors and its
 *    support is narrower than the animation features we already gate. An
 *    IntersectionObserver is ~20 lines, works everywhere, and degrades to a
 *    plain anchor list if JS never runs — the links are real hrefs either way,
 *    so the TOC is useful before hydration.
 *
 * 2. The observer uses a rootMargin that treats the band just below the sticky
 *    topbar as "current", rather than requiring a section to occupy most of the
 *    viewport. With a plain threshold, tall sections and short sections fight
 *    over the highlight and a short final section can never win.
 *
 * 3. No smooth-scroll hijacking. `scroll-behavior: smooth` is declared in CSS
 *    where the user's motion preference allows it; the links do not call
 *    scrollIntoView, so reduced-motion users and keyboard users get native
 *    anchor behavior (including the browser's own focus handling).
 */

import { useEffect, useRef, useState } from 'react';

export interface TocItem {
  id: string;
  label: string;
}

export function DocsToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  const visible = useRef<Map<string, number>>(new Map());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const nodes = items
      .map((i) => document.getElementById(i.id))
      .filter((n): n is HTMLElement => !!n);
    if (!nodes.length) return;

    // The band starts 96px down (clear of the sticky topbar) and ends 55% up
    // the viewport, so the "current" section is whichever one is crossing the
    // upper-middle of the screen — which is what a reader perceives as current.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          visible.current.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        }
        let best: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visible.current) {
          if (ratio > bestRatio) { bestRatio = ratio; best = id; }
        }
        // Fall back to document order when nothing is meaningfully intersecting
        // (happens at the very top and very bottom of the page).
        if (best) setActive(best);
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: [0, 0.1, 0.25, 0.5, 1] },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [items]);

  const current = items.find((i) => i.id === active);

  return (
    <nav className="docs-toc" aria-label="On this page">
      {/* Mobile: a collapsed disclosure. Rendered as a real <details> so it
          works without JS and cannot trap focus. */}
      <details className="docs-toc-mobile" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>
          <span className="docs-toc-summary-label">On this page</span>
          <span className="docs-toc-summary-current">{current?.label ?? ''}</span>
        </summary>
        <ol className="docs-toc-list">
          {items.map((i) => (
            <li key={i.id}>
              <a href={`#${i.id}`} className={i.id === active ? 'is-active' : undefined}>
                {i.label}
              </a>
            </li>
          ))}
        </ol>
      </details>

      {/* Desktop: sticky rail. */}
      <div className="docs-toc-desktop">
        <p className="docs-toc-heading">On this page</p>
        <ol className="docs-toc-list">
          {items.map((i) => (
            <li key={i.id}>
              <a
                href={`#${i.id}`}
                className={i.id === active ? 'is-active' : undefined}
                aria-current={i.id === active ? 'true' : undefined}
              >
                {i.label}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
