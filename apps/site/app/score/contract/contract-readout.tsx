'use client';

// The two numbers, never blended (brand D79, owner decisions D1 and D3): the
// pair of readouts in the instrument's side. Each readout is five rows on the
// pair's own grid (label, figure, line, count, scale), so a line that wraps
// longer on one side never pushes that side's count off the other's.
//
// The numeral is the hero at its full house size at every width (D79). Where
// the pair is 26rem and wider "/100" and the grade chip sit beside it; below
// that they form one nowrap row under it (contract.css, the cf-pair container).
// A layer with no score shows "No score": never a 0, a letter or a scale.

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Lamp } from '../../lib/engine/instrument';
import { GRADE_BANDS, fmtScore } from '../verdict';
import { countLine, gradeLamp, type LayerResult } from './copy';

/** The grade scale without its tick row (a half-width readout has no room for
    five labels, and the grade sits beside the number), with the score's marker
    and, under a ceiling, the uncapped reading as an outline marker, so the cap
    is seen and not only stated. Decorative: the numbers are text above it. */
function Scale({ score, grade, ghost }: { score?: number; grade?: string; ghost?: number | null }) {
  const here = typeof score === 'number' && grade ? [...GRADE_BANDS].reverse().find((b) => score >= b.from)?.grade : null;
  return (
    <div className="eg-scale" aria-hidden="true">
      <div className="eg-scale-track">
        {GRADE_BANDS.map((b) => (
          <span
            key={b.grade}
            className={`eg-scale-zone${here === b.grade ? ' is-here' : ''}`}
            data-grade={grade ? grade.toLowerCase() : undefined}
            style={{ '--w': b.to - b.from } as CSSProperties}
          />
        ))}
        {typeof ghost === 'number' && <i className="cf-ghost" style={{ '--at': Math.max(0, Math.min(100, ghost)) } as CSSProperties} />}
        {typeof score === 'number' && <i className="eg-scale-marker" style={{ '--at': Math.max(0, Math.min(100, score)) } as CSSProperties} />}
      </div>
    </div>
  );
}

export type ReadoutKind = 'rest' | 'scored' | 'none';

export function ContractReadout({
  id,
  label,
  line,
  layer,
  kind,
  min = 3,
}: {
  id: string;
  label: string;
  line: ReactNode;
  layer?: LayerResult | null;
  kind: ReadoutKind;
  /** Fewest scored checks for a score (the published formula), for the no-score count. */
  min?: number;
}) {
  const scored = kind === 'scored' && layer && layer.score !== null && layer.grade !== null;
  // The count under a no-score readout says what was missing only where the
  // reason is too few checks; an empty run has no counts at all (W8, W9).
  const tooFew = kind === 'none' && layer?.nullReason?.code === 'too_few_checks';
  const count = scored ? countLine(layer) : tooFew && layer ? countLine(layer, true, min) : null;
  return (
    <section className="cf-readout" aria-labelledby={id}>
      <h2 className="cf-readout-label" id={id}>
        {label}
      </h2>
      {scored ? (
        <p className="cf-figure">
          <span className="cf-num">{fmtScore(layer.score!)}</span>
          <span className="cf-figure-meta">
            <span className="cf-of" aria-hidden="true">
              /100
            </span>
            <span className="sr-only"> out of 100,</span>
            <span className="cf-grade" data-grade={layer.grade!}>
              <Lamp status={gradeLamp(layer.grade!)} />
              <span className="sr-only">grade </span>
              {layer.grade}
            </span>
          </span>
        </p>
      ) : kind === 'none' ? (
        <p className="cf-figure">
          <span className="cf-null">No score</span>
        </p>
      ) : (
        <p className="cf-figure is-rest" aria-hidden="true">
          <span className="cf-num" />
          <span className="cf-of">/100</span>
        </p>
      )}
      <p className="cf-readout-line">{line}</p>
      {count ? (
        <p className="cf-count">
          <b>{count.k}</b>
          {count.rest}
        </p>
      ) : (
        <p className="cf-count" aria-hidden="true" />
      )}
      {scored ? (
        <Scale score={layer.score!} grade={layer.grade!} ghost={layer.ceilingApplied ? layer.uncappedScore : null} />
      ) : kind === 'rest' ? (
        <Scale />
      ) : (
        <div className="eg-scale" aria-hidden="true" />
      )}
    </section>
  );
}

/**
 * The pair, always side by side (owner decision D8, brand D81). The numeral's
 * size already fits "100.0" in its column at every width (contract.css), so
 * the readouts never stack. From a 26rem pair "/100" and the grade chip sit
 * beside the numeral; where numeral, gap and chip do not fit there, the pair
 * sets them in the row under it (data-fit="row"), measured, because Fraunces
 * has no tabular figures and a numeral's width follows its digits.
 */
export function ReadoutPair({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<'' | 'row'>('');
  useLayoutEffect(() => {
    const pair = ref.current;
    if (!pair) return;
    const measure = () => {
      const nums = [...pair.querySelectorAll<HTMLElement>('.cf-num')].filter((n) => n.textContent);
      if (!nums.length) {
        setFit('');
        return;
      }
      const cs = getComputedStyle(pair);
      const gap = parseFloat(cs.columnGap) || 0;
      const w = pair.getBoundingClientRect().width;
      // Side by side, the second readout's column is half the pair less the
      // gap and its own inset (the inset is the same --space-16 as the gap).
      const column = (w - gap) / 2 - gap;
      const num = Math.max(...nums.map((n) => n.getBoundingClientRect().width));
      const grade = Math.max(0, ...[...pair.querySelectorAll<HTMLElement>('.cf-grade, .cf-of')].map((g) => g.getBoundingClientRect().width));
      // The beside gap is --space-8 (the figure's column gap when beside); read
      // from the token, not the figure, whose gap is 0 while it is a row.
      const root = getComputedStyle(document.documentElement);
      const remPx = parseFloat(root.fontSize) || 16;
      const token = root.getPropertyValue('--space-8').trim();
      const inner = token.endsWith('rem') ? parseFloat(token) * remPx : parseFloat(token) || 0;
      const beside = w >= 26 * remPx - 0.5;
      setFit(beside && num + inner + grade > column + 0.5 ? 'row' : '');
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(pair);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) measure();
    });
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [children]);
  return (
    <div className="cf-pair" ref={ref} data-fit={fit || undefined}>
      {children}
    </div>
  );
}
