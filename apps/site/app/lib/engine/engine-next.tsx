'use client';

// Next steps as whole-row links. After a run, links that take a URL carry the
// one just scanned, so the next engine opens on the same site. The form tells
// this list through a window event, so neither owns the other.

import Link from 'next/link';
import { useEffect, useState } from 'react';

export type NextItem = { title: string; desc: string; route: string; carry?: boolean; param?: string };

export const TARGET_EVENT = 'designesy:engine-target';

export function announceTarget(url: string) {
  window.dispatchEvent(new CustomEvent(TARGET_EVENT, { detail: url }));
}

export function EngineNextLinks({ items }: { items: NextItem[] }) {
  const [target, setTarget] = useState('');
  useEffect(() => {
    const on = (e: Event) => setTarget(String((e as CustomEvent).detail || ''));
    window.addEventListener(TARGET_EVENT, on);
    return () => window.removeEventListener(TARGET_EVENT, on);
  }, []);
  return (
    <ul className="eg-next-list">
      {items.map((it) => {
        const href = it.carry && target ? `${it.route}?${it.param ?? 'url'}=${encodeURIComponent(target)}` : it.route;
        return (
          <li key={it.route}>
            <Link className="eg-go" href={href}>
              <span className="eg-go-text">
                <span className="eg-go-title">{it.title}</span>
                <span className="eg-go-desc">{it.desc}</span>
              </span>
              <span className="eg-go-route">{it.route}</span>
              <svg className="eg-go-arrow" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
              </svg>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
