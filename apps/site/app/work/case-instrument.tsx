import type { CSSProperties, ReactNode } from 'react';
import { DigitStrip, stripValues } from '../lib/digit-strip';

/**
 * Case-study instruments: the score-delta panel, the build readout, the
 * engagement readout, and the type pieces the case-study pages share (the
 * split title, the state chips). Styles: app/work/work.css.
 *
 * The register is the engine instrument's (engine.css .eg-inst), so a case
 * study reads its evidence in the same language the engines report it: an
 * opaque, top-lit panel whose title bar and body split their face from their
 * side on the 7-line, mono labels, and one lit glass cell per check. The face
 * holds the runs on one shared scale (a cell is a check, so equal counts are
 * equal widths by construction); the side holds the verdict.
 *
 * Every number on a panel is also in its text: the cells, the rolling digit
 * strips and the grade scale are aria-hidden drawings, and each pane states
 * its values in words a reader, the markdown twin and search all receive.
 * The strips sit outside every <p>, <li> and heading, because the markdown
 * twin reads those blocks and would otherwise print every row of a strip.
 */

export type Counts = { pass: number; fail: number; warn: number; skip: number };
type State = keyof Counts;

/** Resolved first, unrun last: the skips of two runs end on the same cells. */
const ORDER: readonly State[] = ['pass', 'warn', 'fail', 'skip'];

/** The engine's grade bands (app/api/score): A from 90, then ten points a grade. */
const BANDS = [
  { grade: 'F', from: 0, to: 60 },
  { grade: 'D', from: 60, to: 70 },
  { grade: 'C', from: 70, to: 80 },
  { grade: 'B', from: 80, to: 90 },
  { grade: 'A', from: 90, to: 100 },
] as const;

function gradeFor(score: number): string {
  return [...BANDS].reverse().find((b) => score >= b.from)?.grade ?? 'F';
}

function total(c: Counts): number {
  return c.pass + c.fail + c.warn + c.skip;
}

function cellsFor(c: Counts): State[] {
  return ORDER.flatMap((s) => Array.from({ length: c[s] }, () => s));
}

/* ---------------------------------------------------------------------------
   Type pieces
   ------------------------------------------------------------------------ */

/**
 * A page title in two parts, "name · tail". On a line wide enough for both
 * the separator sits between them; when the tail wraps it starts the next
 * line flush, and its separator wraps with it into a strip the title clips,
 * so no line ever starts or ends on the dot (at 390 the h1 broke as
 * "designesy.org" / "· D to A"). The dot stays in the text, so the heading's
 * accessible name and the markdown twin still read "name · tail".
 *
 * (The dated definition labels that split at "2026-" / "07-13" were the
 * engagement and build-verification callouts; their dates now sit in the
 * instruments' title bars, which never wrap.)
 */
export function CaseTitle({ name, tail }: { name: string; tail: string }) {
  return (
    <h1 className="surface-title cs-title">
      <span className="cs-title-run">
        <span className="cs-title-part">{name}</span>
        <span className="cs-title-part">
          <span className="cs-title-sep"> · </span>
          {tail}
        </span>
      </span>
    </h1>
  );
}

const STATE_OF: Record<string, State> = { PASS: 'pass', FAIL: 'fail', WARN: 'warn', SKIP: 'skip' };

/**
 * A check status as a chip in its state token: fail, warn and skip in their
 * own hue, pass in the pass token (never the brand accent). `before` is the
 * superseded state, drawn at reduced emphasis: a hollow lamp and a quieter
 * ring, the same hue.
 */
export function StateChip({ status, before = false }: { status: string; before?: boolean }) {
  const state = STATE_OF[status.toUpperCase()];
  return (
    <span className={`cs-state${before ? ' is-before' : ''}`} data-state={state ?? 'pending'}>
      {status}
    </span>
  );
}

/** "FAIL → PASS": the move a check made between two runs. */
export function StateMove({ before, after }: { before: string; after: string }) {
  return (
    <p className="cs-move">
      <StateChip status={before} before />
      <span className="cs-move-arrow"> → </span>
      <StateChip status={after} />
    </p>
  );
}

/* ---------------------------------------------------------------------------
   The panel
   ------------------------------------------------------------------------ */

type Lamp = 'pass' | 'live' | 'warn' | 'pending';

function Panel({
  label,
  app,
  target,
  state,
  lamp,
  face,
  side,
}: {
  label: string;
  app: string;
  target?: string;
  state: string;
  lamp: Lamp;
  face: ReactNode;
  side: ReactNode;
}) {
  return (
    <figure className="cs-bench" aria-label={label}>
      <div className="cs-inst">
        <div className="cs-inst-bar">
          <span className="cs-inst-face">
            <span className="cs-inst-app">
              <span className="cs-mark" aria-hidden="true">
                <i />
              </span>
              {app}
            </span>
            {target ? <span className="cs-inst-target">{target}</span> : null}
          </span>
          <span className="cs-inst-state">
            <span className="cs-led" data-lamp={lamp} aria-hidden="true" />
            {state}
          </span>
        </div>
        <div className="cs-inst-body">
          <div className="cs-face">{face}</div>
          {/* The divider: its 1px border-left lands on the 7-line (edge
              contract E4 measures [data-divider]). */}
          <div className="cs-side" data-divider="">
            {side}
          </div>
        </div>
      </div>
    </figure>
  );
}

/* ---------------------------------------------------------------------------
   Score delta: runs on one scale, the verdict beside them
   ------------------------------------------------------------------------ */

export type Run = {
  label: string;
  /** Mono note under the label, e.g. "D · 67.4". */
  note: string;
  counts: Counts;
  /** A projection, not a measurement: drawn ghosted, never resolved. */
  projected?: boolean;
};

function RunRow({
  run,
  scale,
  resolve,
  states = ORDER,
}: {
  run: Run;
  scale: number;
  resolve: boolean;
  /** The states this registry reports (a test run has no warn or skip). */
  states?: readonly State[];
}) {
  const cells = cellsFor(run.counts);
  return (
    <li
      className="cs-run"
      data-projected={run.projected ? '' : undefined}
      data-resolve={resolve ? '' : undefined}
    >
      <span className="cs-run-head">
        <span className="cs-run-label">{run.label}</span>{' '}
        <span className="cs-run-note">{run.note}</span>
      </span>
      <span className="cs-cells" aria-hidden="true" style={{ '--cs-n': scale } as CSSProperties}>
        {Array.from({ length: scale }, (_, i) => (
          <span
            key={i}
            className={`cs-cell${cells[i] ? ` is-${cells[i]}` : ''}`}
            style={{ '--i': i } as CSSProperties}
          />
        ))}
      </span>
      <span className="cs-tally">
        {states.map((s) => (
          <span key={s} className="cs-tally-item">
            <span className={`cs-swatch is-${s}`} aria-hidden="true" />
            <b>{run.counts[s]}</b> {s}
          </span>
        ))}
      </span>
    </li>
  );
}

function GradeScale({ marks }: { marks: { at: number; was?: boolean }[] }) {
  const now = marks.find((m) => !m.was);
  const was = marks.find((m) => m.was);
  return (
    <div className="cs-scale" aria-hidden="true">
      <span className="cs-scale-track">
        {BANDS.map((b) => (
          <span
            key={b.grade}
            className={`cs-scale-zone${now && gradeFor(now.at) === b.grade ? ' is-now' : ''}${
              was && gradeFor(was.at) === b.grade ? ' is-was' : ''
            }`}
            style={{ '--w': b.to - b.from } as CSSProperties}
          />
        ))}
        {marks.map((m) => (
          <span
            key={m.at}
            className={`cs-scale-mark${m.was ? ' is-was' : ''}`}
            style={{ '--at': m.at } as CSSProperties}
          />
        ))}
      </span>
      <span className="cs-scale-ticks">
        {BANDS.map((b) => (
          <span key={b.grade} style={{ '--w': b.to - b.from } as CSSProperties}>
            {b.grade}
            {b.from ? <span className="cs-tick-n"> {b.from}</span> : null}
          </span>
        ))}
      </span>
    </div>
  );
}

export function ScoreDelta({
  label,
  host,
  date,
  runs,
  before,
  after,
  projected,
  note,
}: {
  /** The figure's accessible name. */
  label: string;
  host: string;
  date: string;
  runs: Run[];
  /** The measured score the side opens on. */
  before: number;
  /** The measured score after the fix; omitted for a snapshot. */
  after?: number;
  /** A projected grade (no number is invented for it). */
  projected?: string;
  /** The sentence under the verdict. Its first words state the verdict in full for a reader. */
  note: ReactNode;
}) {
  const scale = Math.max(...runs.map((r) => total(r.counts)));
  const end = after ?? before;
  // The strip climbs through every grade line it crosses, so the letter and
  // the number change together: 67.4 → 70.0 → 80.0 → 90.0 → 96.3 reads
  // D, C, B, A, A. A snapshot has one row and does not move.
  const stops =
    after == null ? [before] : [before, ...BANDS.map((b) => b.from).filter((t) => t > before && t < after), after];
  const fmt = (n: number) => n.toFixed(1);
  const resolveAt = after == null ? 0 : runs.length - 1;

  return (
    <Panel
      label={label}
      app="Score engine"
      target={host}
      state={`${scale} checks · ${date}`}
      lamp={gradeFor(end) === 'A' ? 'pass' : 'warn'}
      face={
        <>
          <ol className="cs-runs">
            {runs.map((r, i) => (
              <RunRow key={r.label} run={r} scale={scale} resolve={!r.projected && i === resolveAt} />
            ))}
          </ol>
          <span className="cs-axis" aria-hidden="true">
            <span>
              <span>0</span>
              <span>{scale} checks, one cell each</span>
            </span>
          </span>
        </>
      }
      side={
        <>
          <span className="cs-label">Verdict</span>
          <div className="cs-verdict" aria-hidden="true" data-pagefind-ignore="">
            {after != null ? (
              <>
                <span className="cs-was">
                  <span className="cs-glyph is-was">{gradeFor(before)}</span>
                  <span className="cs-score is-was">{fmt(before)}</span>
                </span>
                <span className="cs-verdict-arrow">→</span>
              </>
            ) : null}
            <span
              className={stops.length > 1 ? 'cs-now cs-roll' : 'cs-now'}
              style={{ '--cs-steps': stops.length } as CSSProperties}
            >
              <span className="cs-glyph">
                <DigitStrip values={stops.map(gradeFor)} />
              </span>
              <span className="cs-score">
                <DigitStrip values={stops.map(fmt)} />
              </span>
            </span>
            {projected ? (
              <span className="cs-projected">
                <span className="cs-glyph is-projected">{projected}</span>
                <span className="cs-projected-label">Projected</span>
              </span>
            ) : null}
          </div>
          <p className="cs-side-note">{note}</p>
          <GradeScale marks={after != null ? [{ at: before, was: true }, { at: after }] : [{ at: before }]} />
        </>
      }
    />
  );
}

/* ---------------------------------------------------------------------------
   Build verification: a local test run, before any public score exists
   ------------------------------------------------------------------------ */

export function BuildReadout({
  label,
  target,
  date,
  passed,
  total: tests,
  domains,
  note,
  caption,
}: {
  label: string;
  target: string;
  date: string;
  passed: number;
  total: number;
  /** What the run covered, named as the study names it. */
  domains: string[];
  /** The side pane's reading of the verdict. */
  note: ReactNode;
  /** The face's caption, under the run. */
  caption?: ReactNode;
}) {
  const run: Run = {
    label: 'Tests',
    note: `${passed} of ${tests}`,
    counts: { pass: passed, fail: tests - passed, warn: 0, skip: 0 },
  };
  return (
    <Panel
      label={label}
      app="Build verification"
      target={target}
      state={`${tests} tests · ${date}`}
      lamp={passed === tests ? 'pass' : 'warn'}
      face={
        <>
          <ol className="cs-runs">
            <RunRow run={run} scale={tests} resolve states={['pass', 'fail']} />
          </ol>
          <div className="cs-domains">
            <span className="cs-label">{domains.length} domains</span>
            <ul>
              {domains.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
          {caption ? <p className="cs-face-note">{caption}</p> : null}
        </>
      }
      side={
        <>
          <span className="cs-label">Verdict</span>
          <div className="cs-readout" aria-hidden="true" data-pagefind-ignore="">
            <span className="cs-big">
              {passed}/{tests}
            </span>
            <span className="cs-unit">passed</span>
          </div>
          <p className="cs-side-note">
            <span className="sr-only">
              {passed} of {tests} tests passed.{' '}
            </span>
            {note}
          </p>
        </>
      }
    />
  );
}

/* ---------------------------------------------------------------------------
   Engagement readout: posts against the noise floor
   ------------------------------------------------------------------------ */

/** A count rolls up in eight jumps (nine rows, 0 to the value). */
const ROLL_STEPS = 8;

export type Post = {
  label: string;
  /** Views; null when the post did not surface at all. */
  views: number | null;
  /** Said in place of a bar when there is no number. */
  absent?: string;
};

export function ViewsReadout({
  label,
  date,
  lamp,
  posts,
  floor,
  max,
  readout,
  note,
  caption,
}: {
  label: string;
  date: string;
  lamp: Lamp;
  posts: Post[];
  /** The noise floor band, in views, drawn only where the study states one. */
  floor?: [number, number];
  /** The scale's end, in views. */
  max: number;
  /** The side pane's headline. */
  readout: { label: string; views?: number; text?: string; sub: ReactNode };
  /** The side pane's one-line reading of the headline. */
  note: ReactNode;
  /** The face's caption, under the posts: the context the bars sit in. */
  caption?: ReactNode;
}) {
  const ticks = Array.from({ length: Math.floor(max / 100) + 1 }, (_, i) => i * 100);
  const band = (floor ? { '--lo': floor[0] / max, '--hi': floor[1] / max } : { '--lo': 0, '--hi': 0 }) as CSSProperties;
  return (
    <Panel
      label={label}
      app="Engagement"
      target="X post"
      state={`24 h · ${date}`}
      lamp={lamp}
      face={
        <>
          <ol className="cs-posts">
            {posts.map((p) => (
              <li key={p.label} className={`cs-post${p.views == null ? ' is-absent' : ''}`}>
                <span className="cs-post-label">{p.label}</span>
                <span className="cs-post-track" style={band}>
                  {floor ? <span className="cs-post-band" aria-hidden="true" /> : null}
                  {p.views == null ? (
                    <span className="cs-post-absent">{p.absent}</span>
                  ) : (
                    <span
                      className="cs-post-fill"
                      aria-hidden="true"
                      style={{ '--v': Math.min(1, p.views / max) } as CSSProperties}
                    />
                  )}
                </span>
                {p.views == null ? null : <span className="cs-post-value">{p.views} views</span>}
              </li>
            ))}
          </ol>
          <span className="cs-axis is-views" aria-hidden="true">
            <span>
              {ticks.map((t) => (
                <span key={t} style={{ '--at': t / max } as CSSProperties}>
                  {t}
                </span>
              ))}
            </span>
          </span>
          {floor ? (
            <p className="cs-legend">
              <span className="cs-swatch is-band" aria-hidden="true" />
              Noise floor: {floor[0]} to {floor[1]} views
            </p>
          ) : null}
          {caption ? <p className="cs-face-note">{caption}</p> : null}
        </>
      }
      side={
        <>
          <span className="cs-label">{readout.label}</span>
          {readout.views != null ? (
            <div
              className="cs-readout cs-roll"
              aria-hidden="true"
              data-pagefind-ignore=""
              style={{ '--cs-steps': ROLL_STEPS + 1 } as CSSProperties}
            >
              <span className="cs-big">
                <DigitStrip values={stripValues(readout.views, ROLL_STEPS)} />
              </span>
              <span className="cs-unit">views</span>
            </div>
          ) : (
            <span className="cs-readout-text">{readout.text}</span>
          )}
          <p className="cs-readout-sub">
            {readout.views != null ? <span className="sr-only">{readout.views} views, </span> : null}
            {readout.sub}
          </p>
          <p className="cs-side-note">{note}</p>
        </>
      }
    />
  );
}
