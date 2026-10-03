import type { CSSProperties } from 'react';

/**
 * DigitStrip — a number that rolls: a strip of every value it takes, one line
 * showing.
 *
 * The score console's counter technique (lib/verify-console, DIGIT_LH), made
 * reusable. The window is one 1.25em line with overflow hidden; the strip is
 * every row stacked. A value changes by moving the strip with translateY, in
 * steps(), so a counter never animates a CSS counter, a custom property or the
 * text itself: transform only, on the compositor.
 *
 * AT REST the strip sits on `at` (default: the last row), so server markup,
 * no-JS and reduced motion all read the final value. The rest position is the
 * custom property --ds-at, never an inline transform, so a stylesheet can still
 * move the strip with a transition or a scroll-driven animation (an inline
 * transform would outrank both). The mechanics live with their first consumer
 * (home-inspect.css, "Digit strips"); a second page needs those few rules too.
 *
 * SEGMENTS split one count across clocks. `segments={[14, 14, 14]}` wraps the
 * rows in three nested spans (data-seg 1..3), each moving its own share. Nested
 * transforms add, so three timelines can drive one counter with no
 * animation-composition and no shared property.
 *
 * The strip is aria-hidden: a reader would hear every row. The surface that
 * shows it states the value in its own accessible name.
 */

export const DIGIT_LH = 1.25; // em, one row

export function DigitStrip({
  values,
  at,
  segments,
  className,
}: {
  values: readonly (number | string)[];
  /** Row shown at rest. Defaults to the last row. */
  at?: number;
  /** Rows moved by each nested segment, outermost first. */
  segments?: readonly number[];
  className?: string;
}) {
  const last = values.length - 1;
  let rows = (
    <span className="digit-strip-rows">
      {values.map((v, i) => (
        <span key={i}>{v}</span>
      ))}
    </span>
  );
  if (segments) {
    for (let k = segments.length - 1; k >= 0; k--) {
      rows = (
        <span className="digit-strip-seg" data-seg={k + 1} style={{ '--ds-seg': segments[k] } as CSSProperties}>
          {rows}
        </span>
      );
    }
  }
  return (
    <span
      className={className ? `digit-strip ${className}` : 'digit-strip'}
      style={{ '--ds-last': last, '--ds-at': at ?? last, '--ds-lh': `${DIGIT_LH}em` } as CSSProperties}
      aria-hidden="true"
    >
      {rows}
    </span>
  );
}

/** Evenly spaced rows from 0 to `to` in `steps` jumps: steps(n) lands on each. */
export function stripValues(to: number, steps: number): number[] {
  return Array.from({ length: steps + 1 }, (_, i) => Math.round((to * i) / steps));
}
