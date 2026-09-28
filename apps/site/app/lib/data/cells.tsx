// A site's category profile in one glance: one column per category, heaviest
// category first, each filled to its score (0 to 100) and tinted by the grade
// band that score falls in. No axes and no labels: a sparkline of columns,
// read down a table of sites. An unscored category is an empty, dashed column.
// The drawing's name spells out every value; the page's table has them too.

import type { CSSProperties } from 'react';
import type { CategoryBreakdown } from '../../leaderboard/seed';
import { CATEGORY_LABELS, scoreTone } from './cohort';

export function CategoryProfile({
  name,
  cats,
  order,
}: {
  name: string;
  cats: Record<string, CategoryBreakdown> | null;
  order: string[];
}) {
  const parts = order.map((k) => {
    const c = cats?.[k];
    return `${CATEGORY_LABELS[k] ?? k} ${c && c.score !== null ? c.score : 'unscored'}`;
  });
  return (
    <span className="dx-profile" role="img" aria-label={`${name} by category: ${parts.join(', ')}`}>
      {order.map((k) => {
        const c = cats?.[k];
        const v = c && c.score !== null ? c.score : null;
        return (
          <i
            key={k}
            data-tone={v === null ? 'none' : scoreTone(v)}
            style={v === null ? undefined : ({ '--v': v / 100 } as CSSProperties)}
          />
        );
      })}
    </span>
  );
}
