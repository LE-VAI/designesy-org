'use client';

import Link from 'next/link';
import { useState, useCallback } from 'react';
import type { CheckItem } from './check-items';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function statusClass(status?: string) {
  if (!status) return '';
  const key = status.trim().toLowerCase();
  if (key === 'hold' || key === 'holds') return ' is-hold';
  return '';
}

/**
 * Tight interactive checklist grid for peer lists.
 * Non-link cells toggle a checkmark on click (verification/checklist value).
 * Link cells show an arrow and navigate.
 * Prefer over .row-stack when items are peer checks/labels (~5+).
 * Keep .row-stack for sequential narrative paths and multi-link rows.
 * Keep .principle-list for long prose dimensions.
 */
export function CheckGrid({
  items,
  dense = false,
  stack = false,
  className = '',
  start = 1,
  labelledBy,
}: {
  items: CheckItem[];
  dense?: boolean;
  stack?: boolean;
  className?: string;
  start?: number;
  labelledBy?: string;
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = useCallback((i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const mods = [dense ? 'is-dense' : '', stack ? 'is-stack' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={`check-grid${mods ? ` ${mods}` : ''}`}
      role="list"
      aria-labelledby={labelledBy}
    >
      {items.map((item, i) => {
        const index = pad(start + i);
        const isChecked = checked.has(i);

        const body = (
          <>
            <span className="check-cell-index" aria-hidden="true">
              {index}
            </span>
            <span className="check-cell-body">
              <span className="check-cell-title">{item.title}</span>
              {item.meta ? (
                <span className="check-cell-meta">{item.meta}</span>
              ) : null}
              {item.status ? (
                <span
                  className={`check-cell-status${statusClass(item.status)}`}
                >
                  {item.status}
                </span>
              ) : null}
            </span>
            <span className="check-cell-tail" aria-hidden="true">
              {item.href ? (
                <span className="check-cell-arrow">&rarr;</span>
              ) : isChecked ? (
                <span className="check-cell-check">
                  {item.avoid ? (
                    <svg
                      viewBox="0 0 16 16"
                      width="13"
                      height="13"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 16 16"
                      width="13"
                      height="13"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 8.5l3.5 3.5L13 5" />
                    </svg>
                  )}
                </span>
              ) : null}
            </span>
          </>
        );

        const cellClass = `check-cell${item.avoid ? ' is-avoid' : ''}${isChecked ? ' is-checked' : ''}`;

        if (item.href) {
          return (
            <Link
              key={`${item.href}-${item.title}`}
              href={item.href}
              className={cellClass}
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              {body}
            </Link>
          );
        }

        return (
          <button
            key={`${index}-${item.title}`}
            className={cellClass}
            role="listitem"
            type="button"
            data-cuelume-hover="whisper"
            data-cuelume-toggle="toggle"
            onClick={() => toggle(i)}
            aria-pressed={isChecked}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

export type { CheckItem };
