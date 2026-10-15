// A site's category profile in one glance: one column per category, heaviest
// category first, each filled to its score (0 to 100) and tinted by the grade
// band that score falls in. No axes and no labels: a sparkline of columns,
// read down a table of sites. An unscored category is an empty, dashed column.
// The drawing's name spells out every value; the page's table has them too.

import type { CSSProperties } from 'react';
import type { CategoryBreakdown } from '../../leaderboard/seed';
import { CATEGORY_LABELS, RELATIONSHIP_LABEL, scoreTone, type CohortSite } from './cohort';

/** A site the latest run could not re-score keeps its last score, outside the
    ranking, and the tag says so in these words: "last scored <date> ·
    could not re-score". In a phone-width table it reads "last scored 08-31";
    the full wording is the one assistive tech hears (data.css, .dx-tag). */
export function HeldTag({ date }: { date: string | null | undefined }) {
  const d = date ?? '';
  return (
    <span className="dx-tag" data-kind="held">
      <span className="dx-tag-full">
        last scored <time dateTime={d || undefined}>{d || 'on an earlier run'}</time> · could not re-score
      </span>
      <span className="dx-tag-short" aria-hidden="true">
        last scored {d.slice(5)}
      </span>
    </span>
  );
}

/** Every label a listed site carries: the self-score, a site Designesy
    operates, a competing product, and a score the latest run could not renew.
    One component, so a table and the leaderboard can never label differently. */
export function SiteTags({ s }: { s: CohortSite }) {
  return (
    <>
      {s.self && <span className="dx-tag">self-scored</span>}
      {!s.self && s.relationship && (
        <span className="dx-tag" data-kind={s.relationship}>
          {RELATIONSHIP_LABEL[s.relationship]}
        </span>
      )}
      {s.stale && <HeldTag date={s.scoredAt} />}
    </>
  );
}

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
