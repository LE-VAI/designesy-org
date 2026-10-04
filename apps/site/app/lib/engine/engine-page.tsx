// The engine page's frame: head, method and next steps. Server components;
// the bench between them (input, instrument, findings) belongs to each
// engine's own client form.

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { EngineNextLinks, type NextItem } from './engine-next';

export function EngineHead({
  route,
  name,
  thesis,
  facts,
  contract,
  children,
}: {
  route: string;
  name: string;
  thesis: ReactNode;
  facts: string[];
  contract?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <header className="eg-head">
      <p className="eg-path">
        <span>
          designesy.org<b>{route}</b>
        </span>
        {facts.map((f) => (
          <span key={f}>{f}</span>
        ))}
        {contract && (
          <span>
            <Link href={contract.href}>{contract.label}</Link>
          </span>
        )}
      </p>
      <h1 className="eg-title">{name}</h1>
      <p className="eg-thesis">{thesis}</p>
      {children}
    </header>
  );
}

export type Step = { title: string; text: ReactNode };

// The letter scale every graded engine shares (A 90 and up, to F below 60),
// as the formula strip's second item. One item per grade, so the line wraps
// between grades and its separators are drawn by the sheet; the operator is
// its own span, set in a face that has the glyph (engine.css, eg-op).
const GRADES = [
  ['A', 90],
  ['B', 80],
  ['C', 70],
  ['D', 60],
] as const;

export function GradeLine() {
  return (
    <span className="eg-grades">
      {GRADES.map(([g, n]) => (
        <span key={g}>
          <b>{g}</b> <span className="eg-op">≥</span> {n}
        </span>
      ))}
      <span>
        <b>F</b> below
      </span>
    </span>
  );
}

export function EngineMethod({
  steps,
  formula,
  heading = 'Method',
}: {
  steps: Step[];
  formula?: ReactNode;
  heading?: string;
}) {
  return (
    <section className="eg-section eg-method" aria-labelledby="eg-method-h">
      <h2 className="eg-h2" id="eg-method-h">{heading}</h2>
      <div className="eg-steps-box" style={{ '--steps': steps.length } as CSSProperties}>
        <i className="eg-rule" aria-hidden="true" />
        <ol className="eg-steps">
          {steps.map((s) => (
            <li className="eg-step" key={s.title}>
              <h3 className="eg-step-title">{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
      {formula && <p className="eg-formula">{formula}</p>}
    </section>
  );
}

export function EngineNext({ items, heading = 'Next' }: { items: NextItem[]; heading?: string }) {
  return (
    <section className="eg-section" aria-labelledby="eg-next-h">
      <h2 className="eg-h2" id="eg-next-h">{heading}</h2>
      <EngineNextLinks items={items} />
    </section>
  );
}
