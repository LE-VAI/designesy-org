import type { ReactNode } from 'react';

/**
 * Parts the sibling contract pages (/contracts/a11y, compare, drift,
 * guardrails, monitor, motion, readiness, report, tokens) share. Server
 * components only. Every string they print comes from the page's contract
 * module (lib/*-contract.ts, served as /contracts/*.json): these parts change
 * how a value is laid out, never what it says. Styles: ./contracts.css.
 */

type Criteria = {
  readonly pass: string;
  readonly warn?: string;
  readonly fail?: string;
  readonly na?: string;
};

type State = 'pass' | 'warn' | 'fail' | 'hold';

/** An outcome the check cannot reach is written "n/a" in the contract. */
const UNREACHABLE = /^n\/a$/i;

function Outcome({ state, label, text }: { state: State; label: string; text: string }) {
  return (
    <span className="row-side-line">
      <span className="row-side-chip" data-state={UNREACHABLE.test(text) ? 'hold' : state}>
        {label}
      </span>{' '}
      <span className="check-side-text">{text}</span>
    </span>
  );
}

/**
 * A verification row's side pane: one line per outcome the contract defines,
 * PASS first, then WARN, FAIL and N/A, each led by its state chip. The spaces
 * between lines are not laid out (the pane is a grid); they keep the lines
 * apart in the page's text, which the markdown export and the prose gates read.
 */
export function CheckSide({ check }: { check: Criteria }) {
  return (
    <span className="row-side check-side">
      <Outcome state="pass" label="Pass" text={check.pass} />
      {check.warn ? <>{' '}<Outcome state="warn" label="Warn" text={check.warn} /></> : null}
      {check.fail ? <>{' '}<Outcome state="fail" label="Fail" text={check.fail} /></> : null}
      {check.na ? <>{' '}<Outcome state="hold" label="N/A" text={check.na} /></> : null}
    </span>
  );
}

/** "Source: "the words"", the form the contracts cite a quotation in. */
const QUOTED = /^(.+?):\s*"(.+)"$/;

/**
 * A source-authority value. A quotation is set as the words, with the source
 * that said them as a footnote; anything else is the contract's text as is.
 */
export function KvValue({ text, mono = false }: { text: string; mono?: boolean }) {
  const quoted = QUOTED.exec(text);
  if (quoted) {
    return (
      <>
        <dd className="kv-quote">
          <q>{quoted[2]}</q>
        </dd>
        <dd className="kv-source">{quoted[1]}</dd>
      </>
    );
  }
  return <dd className={mono ? 'kv-mono' : undefined}>{text}</dd>;
}

export type Figure = { value: string; caption: string };

/**
 * A statistic: its numerals side by side, each over its caption, then an
 * optional note and the source as a footnote. A page builds the figures by
 * matching its contract sentence and falls back to the sentence itself when
 * the sentence no longer matches, so the figure can never outlive its source.
 */
export function KvFigures({ figures, note, source }: { figures: Figure[]; note?: ReactNode; source?: string }) {
  return (
    <>
      <dd className="kv-figures">
        {figures.map((f, i) => (
          <span key={f.value + f.caption} className="kv-figure">
            {i > 0 ? ' ' : null}
            <span className="kv-figure-num">{f.value}</span>{' '}
            <span className="kv-figure-cap">{f.caption}</span>
          </span>
        ))}
      </dd>
      {note ? <dd className="kv-note">{note}</dd> : null}
      {source ? <dd className="kv-source">{source}</dd> : null}
    </>
  );
}
