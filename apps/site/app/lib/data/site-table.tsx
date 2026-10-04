// A table of scored sites in the leaderboard's row style: cohort rank, the site
// (linked to its evaluation), grade and score, and, where there is room, the
// category profile. Used by the frameworks index and each evaluation's peers.
// Every instance declares the same columns (data.css, "The ranking"), so the
// score and profile columns sit at one x down a page of tables.

import Link from 'next/link';
import { BATCH_CATEGORIES, fmt, toneOf, type CohortSite } from './cohort';
import { CategoryProfile, HeldTag } from './cells';

export function SiteTable({
  sites,
  caption,
  current,
  group,
  rowId,
}: {
  sites: CohortSite[];
  caption: string;
  /** The site the page is about: marked, not linked. */
  current?: string;
  /** Show each site's seed category, for a table that mixes categories. */
  group?: boolean;
  /** An anchor for a row, so an in-page link can land on it. */
  rowId?: (s: CohortSite) => string | undefined;
}) {
  return (
    <div className="dx-table-box">
      <table className="dx-table dx-rank">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" data-num className="dx-col-n">
              Rank
            </th>
            <th scope="col" className="dx-col-site">
              Site
            </th>
            {group && (
              <th scope="col" data-opt className="dx-col-group">
                Group
              </th>
            )}
            <th scope="col" data-num className="dx-col-score">
              Score
            </th>
            <th scope="col" data-opt className="dx-col-cat">
              By category
            </th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.url} id={rowId?.(s)} data-self={s.slug === current || undefined}>
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
                  <span>
                    {s.host}
                    {/* Where the group column steps out (a narrow box), the
                        group joins the meta line; only one is ever shown. */}
                    {group && <span className="dx-rank-meta-group"> · {s.category}</span>}
                  </span>
                  {s.self && <span className="dx-tag">self-scored</span>}
                  {s.unreachable && (
                    <HeldTag date={s.scoredAt} />
                  )}
                </span>
              </th>
              {group && (
                <td data-opt className="dx-rank-group">
                  {s.category}
                </td>
              )}
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
