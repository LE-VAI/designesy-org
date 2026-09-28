'use client';

// In-page navigation for a long reference page: the sections in order, the one
// being read marked as you scroll. A rail beside the text where the page is
// wide enough, a row of chips above it where it is not (data.css, container
// dxpage). The links are plain anchors, so it works before and without script.

import { useEffect, useState } from 'react';

export function OnThisPage({ items, label = 'On this page' }: { items: { id: string; label: string }[]; label?: string }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || !('IntersectionObserver' in window)) return;
    const visible = new Map<string, boolean>();
    // A section counts as being read while its top third sits in the band
    // between 15% and 35% down the viewport.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        const first = items.find((i) => visible.get(i.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-15% 0px -65% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav className="dx-toc" aria-label={label}>
      <p className="dx-toc-label" aria-hidden="true">
        {label}
      </p>
      <ol>
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} aria-current={active === i.id ? 'true' : undefined}>
              {i.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
