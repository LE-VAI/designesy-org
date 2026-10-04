'use client';

import Link from 'next/link';
import { useState, useCallback, type ReactNode } from 'react';
import type { CheckItem } from './check-items';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// A result chip reads its state first: FAIL and WARN take their state hue and
// an LED, HOLD the signal; PASS (and any other label) stays neutral, so the
// exceptions are what the eye finds in a row of results. OPEN maps to WARN
// (an open tension is the attention state; resolved stays neutral) — before
// this the merged Tensions grid drew Open and Resolved as the same grey pill
// and only the word distinguished them (round-3 judges, /review/cadence).
function statusClass(status?: string) {
  if (!status) return '';
  const key = status.trim().toLowerCase();
  if (key === 'hold' || key === 'holds') return ' is-hold';
  if (key === 'fail' || key === 'failed') return ' is-fail';
  if (key === 'warn' || key === 'warning') return ' is-warn';
  if (key === 'open') return ' is-warn';
  return '';
}

/**
 * Layout at full width (the grid's own width >= 64rem). Every family sits on
 * ONE track list: the shell's twelve modules, with the 1px seams on the
 * module's gutter centres (globals.css, "Count-aware columns"). So a cell
 * spans 3 (4-up), 4 (3-up), 6 (2-up) or 12, and every seam a grid draws is a
 * seam the 4-up, 3-up and 2-up grids stacked beside it draw too. The rows
 * close by count:
 *   3, 6, 9, 15 ...        3-up
 *   4, 8, 12, 16 ...       4-up (a dense 12 too: six columns were 183px)
 *   5                      3 + 2
 *   10                     4 + 4 + 2
 *   7, 11 ...  (4n + 3)    4-up, then a row of three
 *   14, 22 ... (4n + 2)    4-up, then two rows of three (4 + 4 + 3 + 3)
 *   13, 17 ... (4n + 1)    4-up, then three rows of three
 *   long titles (mean over LONG_TITLE characters)
 *                          2-up; an odd count opens on a row of three
 * Five-up was the old answer for 5, 10 and 15, and its seams sat on no module
 * line; seven-up for a dense 14 left one 885px cell under three rows of four.
 */
const LONG_TITLE = 70;

function wideSpans(
  count: number,
  stack: boolean,
  long: boolean,
): number[] {
  const all = (span: number) => Array.from({ length: count }, () => span);
  if (stack || count <= 1) return all(12);
  if (count === 2) return all(6);
  if (long) {
    // three peers open an odd count, then pairs: no cell takes the row
    return count % 2 === 1 ? all(6).map((s, i) => (i < 3 ? 4 : s)) : all(6);
  }
  if (count === 5) return [4, 4, 4, 6, 6];
  if (count === 10) return all(3).map((s, i) => (i >= 8 ? 6 : s));
  if (count % 3 === 0 && count % 4 !== 0) return all(4);
  // four-up; the remainder closes on rows of three
  const threes = [0, 9, 6, 3][count % 4];
  return all(3).map((s, i) => (i >= count - threes ? 4 : s));
}

/**
 * The middle tier (34-64rem) is two-up, an odd last cell taking the row, but
 * from 40rem a short-titled 6, 9 or 15 keeps three columns (span 4), the
 * same list home's 3 x 3 principle cells set.
 */
function midCols(count: number, stack: boolean, long: boolean) {
  if (stack || count <= 1) return 1;
  return !long && count > 3 && count % 3 === 0 ? 3 : 2;
}

/**
 * CSS names and values set in a title (`--radius-sm`, `var(--signal)`,
 * `text-decoration-skip-ink:`, `prefers-reduced-motion`, `:root`) are code:
 * mono, and never broken at their own hyphens (a hyphen is a line-break
 * opportunity whatever `hyphens` says, so "--radius-" / "sm 4px" happened in
 * a 235px cell). Internal route paths (`/contracts#design-system-contract`)
 * are code too, for the same reason: a path that broke at its hyphen read
 * "/contracts#design-system-" / "contract" (round-3 judges, Evidence cells).
 * Plain hyphenated words ("press-and-release") stay prose.
 */
const CODE_TOKEN =
  /(^|[^\w-])(var\(--[\w-]+\)|--[a-z][\w-]*|:root|\/[a-z0-9/#._-]*[a-z0-9](?:-[a-z0-9]+)+[a-z0-9/#._-]*|#[a-z][\w-]*|\[[a-z-]+(?:="?[\w-]+"?)?\]|[a-z][a-z0-9-]*(?:\.[a-z][\w-]*)+|[a-z]+(?:-[a-z0-9]+)+(?=:)|(?:prefers|margin|padding|border|font|text|user|will|focus|tabular|inset|scroll|overflow|line|letter|word|white|align|justify|grid|flex|place|box|outline|transition|animation|transform|backdrop|background|aspect|pointer|touch|data|aria)-[a-z0-9]+(?:-[a-z0-9]+)*|[a-z]+(?:-[a-z]+)*-\d+)(?![\w-])/g;

// No lookbehind in the pattern (a parse error before Safari 16.4 would take
// the whole client bundle down): the boundary is a captured leading character.
function withCode(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CODE_TOKEN)) {
    const start = (m.index ?? 0) + m[1].length;
    if (start > last) out.push(text.slice(last, start));
    out.push(<code key={start}>{m[2]}</code>);
    last = start + m[2].length;
  }
  if (last === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
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

  const meanTitle =
    items.reduce((sum, item) => sum + item.title.length, 0) /
    Math.max(items.length, 1);
  const long = meanTitle > LONG_TITLE;
  const spans = wideSpans(items.length, stack, long);

  return (
    <div
      className={`check-grid${mods ? ` ${mods}` : ''}`}
      role="list"
      aria-labelledby={labelledBy}
      data-count={items.length}
      data-cols={12 / (spans[0] ?? 12)}
      data-mid={midCols(items.length, stack, long)}
      data-density={long ? 'long' : undefined}
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
              <span className="check-cell-title">
                {withCode(item.title)}
              </span>
              {item.meta ? (
                <span className="check-cell-meta">
                  {withCode(item.meta)}
                </span>
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
            <div
              key={`${item.href}-${item.title}`}
              role="listitem"
              data-span={spans[i]}
            >
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
          <div
            key={`${index}-${item.title}`}
            role="listitem"
            data-span={spans[i]}
          >
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
