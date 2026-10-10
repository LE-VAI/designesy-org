import type { CSSProperties, Ref } from 'react';
import {
  GRADE_BANDS,
  attentionLine,
  categoryLabel,
  categoryTone,
  fmtCategory,
  fmtScore,
  scalePosition,
} from './verdict';

// The result's readout and its category list, one design for every surface
// that shows a contract score: the score form (/ and /score/{lovable,v0,bolt})
// and the report. Owner-approved layout "B′" (2026-10-10), which replaced the
// ring: the grade letter set in the numeral's own face, size and baseline; a
// grade scale whose F band takes a third of the strip; and one category list
// whose second line names only what needs attention.
//
// Words and formats come from verdict.ts, so a value reads the same way on
// every surface. scripts/check-results-language.mjs and
// scripts/check-results-readout.js hold the line.

type CategoryScore = {
  score: number | null;
  weight: number;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
  manual?: number;
};

/** "D 67.9 /100": the letter and the number in one voice, the grade's colour
    on the letter. The visible glyphs are hidden from assistive technology,
    which reads the sentence in the sr-only span. `display` is the figure as
    drawn (the score form counts it up); `score` is the result. */
export function ResultReadout({ grade, score, display }: { grade: string; score: number; display?: number }) {
  return (
    <div className="rs-readout" data-grade={grade.toLowerCase()}>
      <span className="sr-only">
        Grade {grade}, {fmtScore(score)} out of 100
      </span>
      <span className="rs-grade" aria-hidden="true">
        {grade}
      </span>
      <span className="rs-num" aria-hidden="true">
        {fmtScore(display ?? score)}
        <small>/100</small>
      </span>
    </div>
  );
}

/** The grade scale: F (under 60) takes a third, D to A a sixth each; the
    marker sits where the score falls; the band the score is in is lit and its
    label set in ink. Drawn for the eye; the readout says the grade in words. */
export function ResultScale({ score }: { score: number }) {
  const here = (from: number, to: number) => score >= from && (score < to || (to === 100 && score <= 100));
  return (
    <div className="rs-scale" aria-hidden="true">
      <div className="rs-track">
        {GRADE_BANDS.map((b) => (
          <span key={b.grade} data-grade={b.grade.toLowerCase()} className={here(b.from, b.to) ? 'is-here' : undefined} />
        ))}
        <i className="rs-marker" style={{ '--at': scalePosition(score) } as CSSProperties} />
      </div>
      <div className="rs-ticks">
        {GRADE_BANDS.map((b) => (
          <span key={b.grade} className={here(b.from, b.to) ? 'is-here' : undefined}>
            {b.grade}
            <b>{b.from === 0 ? '<60' : b.from}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** The categories, heaviest weight first, each a row: name, bar, score and a
    line naming only what needs attention. With `onSelect` each row is a
    toggle button (the score form filters its checks by it; the report opens
    that category's checks); the selected row is `aria-pressed`. */
export function CategoryList({
  scores,
  selected,
  onSelect,
  drawn,
  listRef,
}: {
  scores: Record<string, CategoryScore>;
  selected?: string | null;
  onSelect?: (key: string) => void;
  /** Category scores as drawn this frame (the score form's count-up). */
  drawn?: Record<string, number>;
  listRef?: Ref<HTMLUListElement>;
}) {
  const keys = Object.keys(scores).sort((a, b) => (scores[b].weight || 0) - (scores[a].weight || 0));
  return (
    <div className="rs-listwrap">
      <div className="rs-legend" aria-hidden="true">
        <span><i data-tone="pass" />80 and up</span>
        <span><i data-tone="warn" />60 to 79</span>
        <span><i data-tone="fail" />under 60</span>
        <span>– not measured</span>
      </div>
      <ul className="rs-list" aria-label="Score by category, heaviest weight first" ref={listRef}>
        {keys.map((k, i) => {
          const cat = scores[k];
          const value = cat.score === null ? null : (drawn?.[k] ?? cat.score);
          const body = (
            <>
              <span className="rs-name">{categoryLabel(k)}</span>
              <span className="rs-bar" aria-hidden="true">
                <i style={{ width: `${value === null ? 0 : Math.round(value)}%`, '--bar-i': i } as CSSProperties} />
              </span>
              <span className="rs-val">
                {value === null ? (
                  <>
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">Not measured</span>
                  </>
                ) : (
                  fmtCategory(value)
                )}
              </span>
              <span className="rs-detail">{attentionLine(cat)}</span>
            </>
          );
          return (
            <li key={k}>
              {onSelect ? (
                <button
                  type="button"
                  className="rs-row"
                  data-tone={categoryTone(cat.score)}
                  aria-pressed={selected === k}
                  onClick={() => onSelect(k)}
                  data-cuelume-hover="tick"
                >
                  {body}
                </button>
              ) : (
                <div className="rs-row" data-tone={categoryTone(cat.score)}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
