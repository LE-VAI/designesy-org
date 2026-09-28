// A chart on a data page: its title and what it shows, the drawing (one
// role="img" with an explicit name, so a screen reader meets one image instead
// of walking every mark), the numbers as a real table behind a disclosure, and
// where the numbers came from. The table is the text alternative: every value
// the drawing encodes is in it.

import type { ReactNode } from 'react';

export function DataFigure({
  id,
  title,
  note,
  source,
  table,
  tableLabel = 'The numbers',
  tableRef,
  children,
}: {
  id: string;
  title: ReactNode;
  note?: ReactNode;
  source?: ReactNode;
  table?: ReactNode;
  tableLabel?: string;
  /** When the figure's numbers are already a table on the page: its id. */
  tableRef?: { id: string; label: string };
  children: ReactNode;
}) {
  return (
    <figure className="dx-fig" id={id} data-table={tableRef?.id}>
      <figcaption className="dx-fig-cap">
        <span className="dx-fig-title">{title}</span>
        {note && <span className="dx-fig-note">{note}</span>}
      </figcaption>
      <div className="dx-fig-plot">{children}</div>
      {(source || table || tableRef) && (
        <div className="dx-fig-foot">
          {source && <p className="dx-src">{source}</p>}
          {tableRef && (
            <p className="dx-src">
              The numbers: <a href={`#${tableRef.id}`}>{tableRef.label}</a>
            </p>
          )}
          {table && (
            <details className="dx-data">
              <summary>{tableLabel}</summary>
              <div className="dx-table-box">{table}</div>
            </details>
          )}
        </div>
      )}
    </figure>
  );
}

/** A value the run did not produce. The dash is for the eye; a screen reader
    hears the words, because a lone dash is silent in NVDA and "n dash" in JAWS. */
export function NotMeasured() {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">Not measured</span>
    </>
  );
}

/** A plain table in the data pages' type: numbers right-aligned in tabular
    figures, the first column a row header. */
export function DataTable({
  caption,
  head,
  rows,
  numeric = [],
  opt = [],
}: {
  caption: string;
  head: ReactNode[];
  rows: ReactNode[][];
  /** Column indexes that hold numbers (right-aligned). */
  numeric?: number[];
  /** Column indexes that step out when the table's box is narrow. */
  opt?: number[];
}) {
  return (
    <table className="dx-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i} scope="col" data-num={numeric.includes(i) || undefined} data-opt={opt.includes(i) || undefined}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {c}
                </th>
              ) : (
                <td key={j} data-num={numeric.includes(j) || undefined} data-opt={opt.includes(j) || undefined}>
                  {c}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
