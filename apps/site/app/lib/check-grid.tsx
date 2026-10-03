'use client';

import Link from 'next/link';
import { useState, useCallback } from 'react';
import type { CheckItem } from './check-items';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// A result chip reads its state first: FAIL and WARN take their state hue and
// an LED, HOLD the signal; PASS (and any other label) stays neutral, so the
// exceptions are what the eye finds in a row of results.
function statusClass(status?: string) {
  if (!status) return '';
  const key = status.trim().toLowerCase();
  if (key === 'hold' || key === 'holds') return ' is-hold';
  if (key === 'fail' || key === 'failed') return ' is-fail';
  if (key === 'warn' || key === 'warning') return ' is-warn';
  return '';
}

/**
 * Columns the grid takes at full width (its own width >= 64rem), chosen from
 * the item count so every row closes: 3 for 3, 6 and 9; 5 for 5, 10 and 15;
 * 4 for 4, 8 and 16; a dense grid opens to 6 for 6, 11 and 12 and to 7 for 14
 * (7 only from 80rem; below that 14 dense cells sit 4-up).
 * Any other count takes 4 and its last cell closes the row (globals.css,
 * "Count-aware columns"). auto-fit only drops empty tracks when there are
 * fewer items than columns, so 5, 6, 7, 9, 10 or 11 items used to end on 1-3
 * blank tiles painted as panel.
 */
function wideCols(count: number, dense: boolean, stack: boolean) {
  if (stack || count <= 1) return 1;
  if (count === 2) return 2;
  if (dense && count === 14) return 7;
  if (dense && (count % 6 === 0 || count === 11)) return 6;
  if (count % 5 === 0) return 5;
  if (count % 3 === 0 && count % 4 !== 0) return 3;
  return 4;
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
      data-count={items.length}
      data-cols={wideCols(items.length, dense, stack)}
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
            <div key={`${item.href}-${item.title}`} role="listitem">
              <Link
                href={item.href}
                className={cellClass}
                data-cuelume-hover="whisper"
                data-cuelume-press
              >
                {body}
              </Link>
            </div>
          );
        }

        return (
          <div key={`${index}-${item.title}`} role="listitem">
            <button
              className={cellClass}
              type="button"
              data-cuelume-hover="whisper"
              data-cuelume-toggle="toggle"
              onClick={() => toggle(i)}
              aria-pressed={isChecked}
            >
              {body}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export type { CheckItem };
