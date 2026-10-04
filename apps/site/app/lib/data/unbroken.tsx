// Tokens a line must never split: an ISO date ("2026-08-" over "02") and a
// CSS custom property ("--duration-quick to --" over "duration-slow"). Each
// one found in a string is wrapped in a nowrap span (data.css, .dx-nowrap);
// the rest of the string wraps as usual.

import type { ReactNode } from 'react';

const TOKEN = /(\d{4}-\d{2}-\d{2}|--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)/g;

export function unbroken(text: string): ReactNode {
  const parts = text.split(TOKEN);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="dx-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
