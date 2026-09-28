// A table of scored sites in the leaderboard's row style: cohort rank, the site
// (linked to its evaluation), grade and score, and, where there is room, the
// category profile. Used by the frameworks index and each evaluation's peers.

import Link from 'next/link';
import { BATCH_CATEGORIES, fmt, toneOf, type CohortSite } from './cohort';
import { CategoryProfile } from './cells';

export function SiteTable({
  sites,
  caption,
  current,
}: {
  sites: CohortSite[];
  caption: string;
  /** The site the page is about: marked, not linked. */
  current?: string;
}) {
  return (
    <div className="dx-table-box">
      <table className="dx-table dx-rank">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" data-num>
              Rank
            </th>
            <th scope="col">Site</th>
            <th scope="col" data-num>
              Score
            </th>
            <th scope="col" data-opt>
              By category
            </th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.url} data-self={s.slug === current || undefined}>
              <td data-num className="dx-rank-n">
                {s.rank}
              </td>
              <th scope="row" className="dx-rank-site">
                {s.slug === current ? (
                  <span className="dx-rank-here">
                    {s.name} <span className="dx-tag">this page</span>
                  </span>
                ) : (
                  <Link href={`/frameworks/${s.slug}`}>{s.name}</Link>
                )}
                <span className="dx-rank-meta">
                  <span>{s.host}</span>
                  {s.self && <span className="dx-tag">self-scored</span>}
                  {s.unreachable && (
                    <span className="dx-tag" data-kind="held">
                      held over from {s.scoredAt}
                    </span>
                  )}
                </span>
              </th>
              <td data-num className="dx-rank-score">
                <span className="dx-rank-sg">
                  <span className="dx-grade" data-tone={toneOf(s.grade)}>
                    {s.grade}
                  </span>
                  <span className="dx-rank-v">{fmt(s.score)}</span>
                </span>
              </td>
              <td data-opt className="dx-rank-profile">
                <CategoryProfile name={s.name} cats={s.categories} order={BATCH_CATEGORIES} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
