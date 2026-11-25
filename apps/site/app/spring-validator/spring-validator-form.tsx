'use client';

// Spring physics validator: reads a spring from its closed-form response and
// checks it against the contract's reduced-motion thresholds. The physics
// lives in lib/spring-sampler.ts, so the readouts, the chart, the budget row
// and the exported CSS all read one sampled response.
//
// All computation is client-side.

import { useState, useMemo, useCallback, useRef, useEffect, useId, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import './spring-validator.css';
import {
  readSpring,
  chartDomainMs,
  sampleResponse,
  linearEasing,
  cubicBezierProgress,
  formatMs,
  springFromResponse,
  dampingForRatio,
  type Spring,
  type SpringReading,
  type LinearResult,
} from '../lib/spring-sampler';

// ── Types ───────────────────────────────────────────────────────────────────

// k (N/m), c (N·s/m) and m (kg), as the sampler reads them.
type SpringParams = Spring;

interface SpringResult {
  dampingRatio: number;    // ζ = c / (2√(km))
  naturalFreq: number;      // ω₀ = √(k/m), rad/s
  dampedFreq: number;       // ωd = ω₀√(1-ζ²), rad/s (underdamped only)
  overshoot: number;        // %: peak overshoot past equilibrium
  settleTime: number;       // ms: last exit from the 2% band
  riseTime: number;         // ms: 10 to 90% of the way
  restTime: number;         // ms: last exit from the 0.1% band
  classification: 'overdamped' | 'critically-damped' | 'underdamped';
  verdict: 'safe' | 'caution' | 'violation';
  reducedMotionRequired: boolean;
  peakAmplitude: number;    // max displacement from equilibrium
  peakTime: number;         // ms: when the peak occurs
}

// ── Verdict ─────────────────────────────────────────────────────────────────

// The reading comes from the sampler; the verdict thresholds are this page's
// policy and stay here.
function resultOf(r: SpringReading): SpringResult {
  const overshoot = r.overshootPct;

  // Verdict: is the overshoot visible enough to require reduced-motion?
  // Threshold: overshoot > 2% is perceptible; > 10% is clearly visible
  let verdict: SpringResult['verdict'];
  let reducedMotionRequired: boolean;

  if (!r.valid) {
    verdict = 'violation';
    reducedMotionRequired = false;
  } else if (overshoot > 10) {
    verdict = 'violation';
    reducedMotionRequired = true;
  } else if (overshoot > 2) {
    verdict = 'caution';
    reducedMotionRequired = true;
  } else {
    verdict = 'safe';
    reducedMotionRequired = false;
  }

  return {
    dampingRatio: r.zeta,
    naturalFreq: r.omega0,
    dampedFreq: r.omegaD,
    overshoot,
    settleTime: r.settleMs,
    riseTime: r.riseMs,
    restTime: r.restMs,
    classification: r.classification,
    verdict,
    reducedMotionRequired,
    peakAmplitude: 1 + overshoot / 100,
    peakTime: r.peakMs,
  };
}

// ── Preset springs ──────────────────────────────────────────────────────────

interface Preset {
  name: string;
  params: SpringParams;
  source: string;
}

interface ContractSpring {
  damping: number;
  response: number;
}

export interface ContractSprings {
  default: ContractSpring;
  momentum: ContractSpring;
}

// Eight presets, each with the source of its values (the button's title).
// The Designesy pair is built from the contract springs the page passes in,
// so this file never imports the contract. Material gives stiffness and a
// damping ratio; SwiftUI and the contract give a response and a damping
// ratio; react-spring and Motion give stiffness and damping directly.
function presetsFor(c: ContractSprings): Preset[] {
  return [
    {
      name: 'M3 Expressive',
      params: { stiffness: 380, damping: dampingForRatio(380, 0.8), mass: 1 },
      source: 'Material 3 Expressive default spatial spring: stiffness 380, damping ratio 0.8',
    },
    {
      name: 'M3 Standard',
      params: { stiffness: 700, damping: dampingForRatio(700, 0.9), mass: 1 },
      source: 'Material 3 Standard default spatial spring: stiffness 700, damping ratio 0.9',
    },
    {
      name: 'Designesy default',
      params: springFromResponse(c.default.damping, c.default.response),
      source: `Designesy contract default spring: damping ratio ${c.default.damping.toFixed(1)}, response ${c.default.response}s`,
    },
    {
      name: 'Designesy momentum',
      params: springFromResponse(c.momentum.damping, c.momentum.response),
      source: `Designesy contract momentum spring: damping ratio ${c.momentum.damping.toFixed(1)}, response ${c.momentum.response}s`,
    },
    {
      name: 'React Spring',
      params: { stiffness: 170, damping: 26, mass: 1 },
      source: 'react-spring config.default: tension 170, friction 26',
    },
    {
      name: 'iOS Bouncy',
      params: springFromResponse(0.7, 0.5),
      source: 'SwiftUI Spring.bouncy: duration 0.5s, bounce 0.3',
    },
    {
      name: 'Motion',
      params: { stiffness: 100, damping: 10, mass: 1 },
      source: 'Motion spring defaults: stiffness 100, damping 10, mass 1',
    },
    {
      name: 'Critically damped',
      params: { stiffness: 200, damping: 2 * Math.sqrt(200), mass: 1 },
      source: 'ζ = 1.0: the fastest settle without overshoot',
    },
  ];
}

// The reduced-motion model: a 150ms transform (the contract's
// --duration-quick) on the contract's ease-out, with no overshoot.
const REDUCED_MS = 150;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// ── Component ───────────────────────────────────────────────────────────────

// The verdict: a word, the title bar's short echo, and the one-line reason
// the side pane leads with. Its hue is the state token (spring-validator.css
// reads data-verdict). The reason names the threshold, never the live
// number, so the live region speaks only when the verdict changes.
const VERDICT: Record<SpringResult['verdict'], { word: string; detail: string; reason: string }> = {
  safe: {
    word: 'Pass',
    detail: 'no reduced-motion rule required',
    reason: 'Overshoot of 2% or less is under the contract\'s threshold. The contract requires no reduced-motion rule.',
  },
  caution: {
    word: 'Caution',
    detail: 'overshoot over 2%',
    reason: 'Overshoot over 2% crosses the contract\'s threshold. Add a reduced-motion rule.',
  },
  violation: {
    word: 'Violation',
    detail: 'overshoot requires suppression',
    reason: 'Overshoot over 10% crosses the contract\'s suppression threshold. Suppress it under reduced motion.',
  },
};

// What the overshoot readout says about its own value, on the verdict's
// thresholds, and the state it is tinted with: none and subtle sit inside
// the contract's limit, visible is Caution, large is Violation.
function overshootBand(pct: number): { label: string; tone: 'pass' | 'warn' | 'fail' } {
  if (pct < 0.5) return { label: 'none', tone: 'pass' };
  if (pct <= 2) return { label: 'subtle', tone: 'pass' };
  if (pct <= 10) return { label: 'visible', tone: 'warn' };
  return { label: 'large', tone: 'fail' };
}

/**
 * One instrument (design spec 2.2 rule 4, 3.1): the curve and the controls
 * that drive it read as one device split on the 7-line. From 64rem the face
 * (7 columns) holds the chart and the side pane holds the verdict (first, as
 * the answer), the parameters and the readouts; the title bar echoes the
 * verdict. Below 64rem the panes
 * stack, and the parameters and readouts sit on the shared 12-column module
 * (sliders span 4, tiles span 2), so every slider edge lands on a tile edge.
 * Layout lives in spring-validator.css; nothing here sets geometry inline,
 * so the edge probes read real classes.
 */
export function SpringValidator({ contractSprings }: { contractSprings: ContractSprings }) {
  const presets = useMemo(() => presetsFor(contractSprings), [contractSprings]);
  const [params, setParams] = useState<SpringParams>(() => presets[0].params);
  const [selectedPreset, setSelectedPreset] = useState<string>(() => presets[0].name);
  const [showReducedMotion, setShowReducedMotion] = useState(true);
  const uid = useId();

  const reading = useMemo(() => readSpring(params), [params]);
  const result = useMemo(() => resultOf(reading), [reading]);

  // The chart spans the whole exported curve (its rest point) and a quarter
  // past the settle point, from 500ms to 3s.
  const simDuration = useMemo(() => chartDomainMs(reading), [reading]);
  const simData = useMemo(() => sampleResponse(params, simDuration, 200), [params, simDuration]);
  const curve = useMemo(() => linearEasing(params, reading), [params, reading]);

  const handlePreset = useCallback((preset: Preset) => {
    setParams(preset.params);
    setSelectedPreset(preset.name);
  }, []);

  const handleParamChange = useCallback((key: keyof SpringParams, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setSelectedPreset('Custom');
  }, []);

  const verdict = VERDICT[result.verdict];
  const reducedMs = REDUCED_MS;
  const band = overshootBand(result.overshoot);
  const checks = checklistOf(result);

  // The verdict glow fires once when the verdict changes (never on first
  // paint: a page at rest shows no coloured light). Each change remounts the
  // glow layer under a new key, which restarts its one-shot animation. The
  // key is adjusted during render when the verdict differs from the last one
  // seen (React's pattern for state derived from a changed value).
  const [glow, setGlow] = useState({ verdict: result.verdict, key: 0 });
  if (glow.verdict !== result.verdict) {
    setGlow({ verdict: result.verdict, key: glow.key + 1 });
  }
  const glowKey = glow.key;

  return (
    <div className="spring-validator sv">
      {/* Presets: the command row over the instrument's face */}
      <div className="sv-presets" role="group" aria-labelledby={`${uid}-presets`}>
        <p className="sv-eyebrow" id={`${uid}-presets`}>
          Preset springs
        </p>
        <div className="sv-preset-row">
          {presets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="sv-preset"
              aria-pressed={selectedPreset === preset.name}
              onClick={() => handlePreset(preset)}
              title={preset.source}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <section className="sv-inst" aria-labelledby={`${uid}-title`} data-verdict={result.verdict}>
        <div className="sv-bar">
          <div className="sv-bar-face">
            <span className="sv-mark" aria-hidden="true">
              <i />
            </span>
            <h2 className="sv-title" id={`${uid}-title`}>
              Spring response
            </h2>
            <span className="sv-bar-pill">{selectedPreset}</span>
          </div>
          {/* The bar's echo of the verdict. The answer itself, and the one
              live region, lead the side pane below. */}
          <p className="sv-bar-state">
            <i className="sv-led" aria-hidden="true" />
            <span>
              <span className="sv-verdict">{verdict.word}</span>
              <span className="sv-verdict-detail"> · {verdict.detail}</span>
            </span>
          </p>
        </div>

        <div className="sv-body">
          <div className="sv-face">
            <div className="sv-face-head">
              <p className="sv-eyebrow">Displacement over time</p>
              <label className="sv-check">
                <input
                  type="checkbox"
                  checked={showReducedMotion}
                  onChange={(e) => setShowReducedMotion(e.target.checked)}
                />
                Show reduced-motion fallback
              </label>
            </div>
            <SpringChart
              data={simData}
              durationMs={simDuration}
              overshoot={result.overshoot}
              settleMs={result.settleTime}
              showReducedMotion={showReducedMotion}
              reducedDuration={reducedMs}
              verdict={result.verdict}
            />
            <p className="sv-note">
              {result.reducedMotionRequired ? (
                <>
                  This spring produces {result.overshoot.toFixed(1)}% overshoot. An
                  explicit <code>@media (prefers-reduced-motion: reduce)</code> rule
                  must suppress or replace this animation. Recommendation: replace
                  it with a {reducedMs}ms transition on the contract&apos;s ease-out
                  curve, as the snippet below does.
                </>
              ) : (
                <>
                  Damping ratio ζ = {result.dampingRatio.toFixed(3)} keeps overshoot
                  at 2% or less, under the contract&apos;s threshold, so the contract
                  requires no reduced-motion rule for this spring.
                </>
              )}
            </p>
          </div>

          <div className="sv-side">
            {/* The answer: the tool's one result, first in the side pane, in
                the state hue. */}
            <div className="sv-answer">
              {glowKey > 0 && <i className="sv-answer-glow" key={glowKey} aria-hidden="true" />}
              <div className="sv-answer-copy" aria-live="polite" aria-atomic="true">
                <p className="sv-answer-head">
                  <i className="sv-answer-led" aria-hidden="true" />
                  <span className="sr-only">Accessibility verdict: </span>
                  <span className="sv-answer-word">{verdict.word}</span>
                </p>
                <p className="sv-answer-reason">{verdict.reason}</p>
              </div>
            </div>

            <p className="sv-eyebrow">Parameters</p>
            <div className="sv-params">
              <ParamSlider
                label="Stiffness (k)"
                unit="N/m"
                value={params.stiffness}
                min={10}
                max={1000}
                step={10}
                onChange={(v) => handleParamChange('stiffness', v)}
              />
              <ParamSlider
                label="Damping (c)"
                unit="N·s/m"
                value={params.damping}
                min={0}
                max={100}
                step={0.5}
                onChange={(v) => handleParamChange('damping', v)}
              />
              <ParamSlider
                label="Mass (m)"
                unit="kg"
                value={params.mass}
                min={0.1}
                max={10}
                step={0.1}
                onChange={(v) => handleParamChange('mass', v)}
              />
            </div>

            <p className="sv-eyebrow">Readouts</p>
            {/* Six tiles always, so the module closes: an overdamped spring
                has no damped frequency, and its tile says so. */}
            <dl className="sv-metrics">
              {/* The tile labels are set in caps; ζ keeps its case (a capital
                  zeta reads as a Latin Z). */}
              <Metric
                label={<>Damping ratio (<span className="sv-greek">ζ</span>)</>}
                value={result.dampingRatio.toFixed(3)}
                hint={result.classification}
              />
              <Metric
                label="Overshoot"
                value={`${result.overshoot.toFixed(1)}%`}
                hint={band.label}
                tone={band.tone}
              />
              <Metric label="Settle time (2%)" value={formatMs(result.settleTime)} hint="to equilibrium" />
              <Metric label="Rise time" value={formatMs(result.riseTime)} hint="10 to 90%" />
              <Metric label="Natural freq" value={`${(result.naturalFreq / (2 * Math.PI)).toFixed(2)} Hz`} hint={`${result.naturalFreq.toFixed(1)} rad/s`} />
              {result.dampedFreq > 0 ? (
                <Metric label="Damped freq" value={`${(result.dampedFreq / (2 * Math.PI)).toFixed(2)} Hz`} hint={`${result.dampedFreq.toFixed(1)} rad/s`} />
              ) : (
                <Metric label="Damped freq" value="none" hint="no oscillation" />
              )}
            </dl>
          </div>
        </div>
      </section>

      {/* Accessibility checklist, in two groups. The reduced-motion rows
          are read from the verdict's own classification (checklistOf), so no
          row can argue with the answer; the motion budget is a separate
          bound and says so. The section carries the verdict too, so a row
          that fails under a Violation takes the fail hue the verdict shows. */}
      <section className="sv-checklist" aria-labelledby={`${uid}-checks`} data-verdict={result.verdict}>
        <h2 className="sv-checklist-title" id={`${uid}-checks`}>
          Compliance checklist
        </h2>
        <h3 className="sv-checks-head" id={`${uid}-checks-rm`}>
          Reduced motion <span className="sv-checks-scope">· follows the verdict</span>
        </h3>
        <ul className="sv-checks" aria-labelledby={`${uid}-checks-rm`}>
          {checks.reducedMotion.map((row) => (
            <ChecklistItem key={row.label} {...row} />
          ))}
        </ul>
        <h3 className="sv-checks-head" id={`${uid}-checks-budget`}>
          Motion budget <span className="sv-checks-scope">· outside the verdict</span>
        </h3>
        <ul className="sv-checks" aria-labelledby={`${uid}-checks-budget`}>
          {checks.budget.map((row) => (
            <ChecklistItem key={row.label} {...row} />
          ))}
        </ul>
      </section>

      {/* CSS output: a window whose title bar names it (figcaption). The code
          soft-wraps inside the window instead of scrolling past its edge, so
          the rim stays whole and nothing is cut mid-token on a phone. */}
      <figure className="sv-snippet">
        <figcaption className="sv-snippet-bar">
          CSS snippet with reduced-motion fallback
        </figcaption>
        <pre className="sv-snippet-code">
{snippetOf(result, curve)}
        </pre>
      </figure>

      {/* CTA */}
      <div className="sv-cta">
        <Link href="/contracts/motion" className="button primary">
          View Designesy motion contract →
        </Link>
        <Link href="/score" className="button ghost">
          Score your site →
        </Link>
        <span className="sv-cta-note">
          All computation is client-side; no data is sent to any server.
        </span>
      </div>
    </div>
  );
}

// ── CSS snippet ─────────────────────────────────────────────────────────────

const NO_CURVE: Record<'never' | 'too-long' | 'too-many-stops', string> = {
  never: 'This spring never comes to rest, so there is no curve to export',
  'too-long': 'This spring takes longer than 3 seconds to come to rest, so there is no curve to export',
  'too-many-stops': 'This curve needs more than 120 linear() stops to stay accurate, so there is no curve to export',
};

// The exported CSS: the spring as a linear() curve timed to its rest point.
// The fallback line comes first and carries a var(); the linear() line
// carries none, so a browser without linear() drops it while parsing and
// keeps the fallback. A var() inside it would only fail at computed-value
// time, which would discard both lines.
function snippetOf(r: SpringResult, curve: LinearResult): string {
  const cls = `.spring-${r.classification}`;
  const settle = Number.isFinite(r.settleTime) ? `within 2% at ${formatMs(r.settleTime)}` : 'never settles within 2%';
  const head = `  /* Damping ratio ζ = ${r.dampingRatio.toFixed(3)} · overshoot ${r.overshoot.toFixed(1)}% · ${settle} */`;
  const ease = `cubic-bezier(${EASE_OUT.join(', ')})`;
  const body = curve.ok
    ? [
        head,
        `  /* The curve runs to 0.1% of rest at ${curve.durationMs}ms, so it lands without a jump */`,
        `  transition: transform ${curve.durationMs}ms var(--ease-out, ${ease});`,
        `  transition: transform ${curve.durationMs}ms ${curve.easing};`,
      ]
    : [head, `  /* ${NO_CURVE[curve.reason]} */`];
  return [
    `${cls} {`,
    ...body,
    '}',
    '',
    '@media (prefers-reduced-motion: reduce) {',
    `  ${cls} {`,
    `    /* Reduced motion: a ${REDUCED_MS}ms ease-out with no overshoot, in place of the spring */`,
    `    transition: transform var(--duration-quick, ${REDUCED_MS}ms) var(--ease-out, ${ease});`,
    '  }',
    '}',
  ].join('\n');
}

// ── ParamSlider subcomponent ────────────────────────────────────────────────

function ParamSlider({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="sv-param">
      <label className="sv-param-head" htmlFor={id}>
        <span className="sv-param-label">{label}</span>
        <span className="sv-param-value">
          {`${value.toFixed(1)} `}<span className="sv-param-unit">{unit}</span>
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
        aria-valuetext={`${value.toFixed(1)} ${unit}`}
        className="sv-range"
        // --v fills the track up to the value. The 44 px box, thin track and
        // drawn handle live in globals.css (.sv-range): with appearance:none
        // and no thumb rule Chrome draws no handle at all, and a 4 px box
        // left the whole drag target 4 px tall.
        style={{ '--v': ((value - min) / (max - min)) * 100 } as CSSProperties}
      />
    </div>
  );
}

// ── Metric subcomponent ─────────────────────────────────────────────────────

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: ReactNode;
  value: string;
  hint?: string;
  /** Tints the hint with a state hue; the word itself names the state. */
  tone?: 'pass' | 'warn' | 'fail';
}) {
  return (
    <div className="sv-metric">
      <dt className="sv-metric-label">{label}</dt>
      <dd className="sv-metric-value">{value}</dd>
      {hint && (
        <dd className="sv-metric-hint" data-tone={tone}>
          {hint}
        </dd>
      )}
    </div>
  );
}

// ── Checklist ───────────────────────────────────────────────────────────────

type CheckState = 'pass' | 'fail' | 'na';
interface CheckRow {
  state: CheckState;
  label: string;
  detail: string;
}

/**
 * The checklist's rows, derived from the same result the verdict reads.
 * The reduced-motion rows are the verdict's own thresholds: overshoot over
 * 2% (reducedMotionRequired, Caution and up) and over 10% (Violation). The
 * @media row asked for a rule on every underdamped spring, so it warned
 * under a Safe verdict (k 200, c 28, m 1: zeta 0.990, 0.0% overshoot) and passed
 * under a Violation; now it is not applicable wherever the verdict needs no
 * rule, and met where it does, because the snippet this tool emits carries
 * the rule. The budget rows check the emitted CSS against bounds the verdict
 * does not cover, and are grouped apart so a miss there never reads as a
 * second verdict.
 */
function checklistOf(r: SpringResult): { reducedMotion: CheckRow[]; budget: CheckRow[] } {
  const required = r.reducedMotionRequired;
  return {
    reducedMotion: [
      {
        state: r.verdict === 'safe' ? 'pass' : 'fail',
        label: 'Overshoot is 2% or less (the contract\'s threshold)',
        detail: 'Above 2% overshoot, the contract requires a reduced-motion rule',
      },
      {
        state: required ? 'pass' : 'na',
        label: 'Visible overshoot has an explicit @media (prefers-reduced-motion: reduce) rule',
        detail: required
          ? 'Required above 2% overshoot: the CSS snippet carries the rule, so ship it with the spring'
          : r.classification === 'underdamped'
            ? 'Not required: overshoot is 2% or less, under the contract\'s threshold'
            : 'Not required: the spring does not oscillate',
      },
      {
        state: r.verdict === 'violation' ? 'fail' : 'pass',
        label: 'Overshoot ≤ 10% (the contract\'s suppression threshold)',
        detail: 'Above 10%, the contract requires suppressing the spring under reduced motion',
      },
    ],
    budget: [
      {
        // The rounded value the Settle tile shows, so the row and the tile agree.
        state: Math.round(r.settleTime) <= 300 ? 'pass' : 'fail',
        label: 'Settle time ≤ 300ms (UI animation bound)',
        detail: 'UI animation should stay at or below 300ms unless justified',
      },
      {
        state: 'pass',
        label: 'Spring uses transform/opacity only (no layout animation)',
        detail: 'Never animate width, height, margin, or padding; use transform and opacity',
      },
    ],
  };
}

const CHECK_MARK: Record<CheckState, { glyph: string; sr: string }> = {
  pass: { glyph: '✓', sr: 'Met: ' },
  fail: { glyph: '!', sr: 'Not met: ' },
  na: { glyph: '–', sr: 'Not applicable: ' },
};

function ChecklistItem({ state, label, detail }: CheckRow) {
  const mark = CHECK_MARK[state];
  return (
    <li className="sv-check-item" data-state={state}>
      <span className="sv-check-mark" aria-hidden="true">
        {mark.glyph}
      </span>
      <div>
        <p className="sv-check-label">
          <span className="sr-only">{mark.sr}</span>
          {label}
        </p>
        <p className="sv-check-detail">{detail}</p>
      </div>
    </li>
  );
}

// ── SpringChart subcomponent ────────────────────────────────────────────────

// Chart type is set on the 11px mono UI step: the viewBox is the measured
// width of the chart's box, so one user unit is one CSS pixel at every
// width. With a fixed 800-unit viewBox the labels rendered at 4.3px on a
// phone and 14.75px at 1440, sized by the container instead of the scale.
const CHART_FONT = 11;
// The mono face (Atkinson Hyperlegible Mono) advances 0.632em per glyph;
// the label fit test uses it with a little slack, as it did for Geist Mono's
// 0.6em (0.62).
const CHAR_W = CHART_FONT * 0.65;

type Pt = [number, number];
type Box = { x0: number; y0: number; x1: number; y1: number };

// The first candidate whose box clears every obstacle point (each point is
// inflated by the clearance), the plot frame, and the boxes already placed.
function placeLabel(
  candidates: { x: number; y: number; anchor: 'start' | 'end' }[],
  text: string,
  obstacles: Pt[],
  taken: Box[],
  frame: Box,
  clearance: number,
): { x: number; y: number; anchor: 'start' | 'end'; box: Box } {
  const w = text.length * CHAR_W;
  const boxOf = (c: { x: number; y: number; anchor: 'start' | 'end' }): Box => {
    const x0 = c.anchor === 'start' ? c.x : c.x - w;
    return { x0, y0: c.y - CHART_FONT * 0.8, x1: x0 + w, y1: c.y + CHART_FONT * 0.25 };
  };
  const clear = (b: Box) =>
    b.x0 >= frame.x0 && b.x1 <= frame.x1 && b.y0 >= frame.y0 && b.y1 <= frame.y1 &&
    obstacles.every(([px, py]) =>
      px < b.x0 - clearance || px > b.x1 + clearance || py < b.y0 - clearance || py > b.y1 + clearance) &&
    taken.every((t) => b.x1 < t.x0 || b.x0 > t.x1 || b.y1 < t.y0 || b.y0 > t.y1);
  for (const c of candidates) {
    const box = boxOf(c);
    if (clear(box)) return { ...c, box };
  }
  const last = candidates[candidates.length - 1];
  return { ...last, box: boxOf(last) };
}

// Dense points along a polyline (vertices plus midpoints), so a label box
// tested against points cannot slip between two of them.
function densify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    if (i + 1 < pts.length) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
      for (let s = 1; s < steps; s++) out.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
    }
  }
  return out;
}

function SpringChart({
  data,
  durationMs,
  overshoot,
  settleMs,
  showReducedMotion,
  reducedDuration,
  verdict,
}: {
  data: { t: number; x: number }[];
  durationMs: number;
  overshoot: number;
  settleMs: number;
  showReducedMotion: boolean;
  reducedDuration: number;
  verdict: 'safe' | 'caution' | 'violation';
}) {
  // The box's measured size; 640 x 244 is the first paint before
  // measurement. The CSS sizes the box (a 0.38 aspect floor, and in the
  // split instrument it grows to the side pane's height), and the svg fills
  // it absolutely, so the svg never feeds back into the box it measures.
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 244 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = size.w;
  const height = size.h;
  const padding = { top: 16, right: 28, bottom: 28, left: 36 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // The drawing clamps progress to -0.5..2, so a large overshoot stays on
  // the plot; the readouts never read clamped values.
  const drawn = data.map((d) => ({ t: d.t, x: Math.max(-0.5, Math.min(2, d.x)) }));

  // Y range: from 0 to max(1.5, peak amplitude + 0.1)
  const yMax = Math.max(1.5, Math.max(...drawn.map((d) => d.x)) + 0.1);
  const yMin = -0.1;

  const xScale = (t: number) => padding.left + (t / durationMs) * chartW;
  const yScale = (x: number) => padding.top + chartH - ((x - yMin) / (yMax - yMin)) * chartH;

  // Build path
  const linePts: Pt[] = drawn.map((d) => [xScale(d.t), yScale(d.x)]);
  const linePath = linePts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

  // Equilibrium line (y = 1)
  const eqY = yScale(1);

  // Reduced-motion line: the contract's ease-out from 0 to 1 over reducedDuration
  const reducedPts: Pt[] = [];
  if (showReducedMotion && reducedDuration < durationMs) {
    const reducedSamples = 50;
    for (let i = 0; i <= reducedSamples; i++) {
      const t = (i / reducedSamples) * reducedDuration;
      const progress = t / reducedDuration;
      const x = cubicBezierProgress(progress, EASE_OUT[0], EASE_OUT[1], EASE_OUT[2], EASE_OUT[3]);
      reducedPts.push([xScale(t), yScale(x)]);
    }
  }
  const reducedPath = reducedPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

  // Labels are placed against the curves, then drawn after them on a halo
  // of the face's own material, so no curve can run through a word (the
  // response used to overdraw "reduced-motion" into "educed-motion").
  // Labels may use the top padding (a peak sits near the top by design).
  const frame: Box = { x0: padding.left + 2, y0: 2, x1: width - padding.right - 2, y1: height - padding.bottom - 2 };
  const responseObstacles = densify(linePts);
  const taken: Box[] = [];

  const peak = drawn.reduce((max, d) => (d.x > max.x ? d : max), drawn[0]);
  let overshootLabel: { x: number; y: number; anchor: 'start' | 'end'; text: string } | null = null;
  if (overshoot > 2) {
    const text = `${overshoot.toFixed(1)}% overshoot`;
    const px = xScale(peak.t);
    const py = yScale(peak.x);
    const placed = placeLabel(
      [
        { x: px + 8, y: py - 8, anchor: 'start' },
        { x: px - 8, y: py - 8, anchor: 'end' },
        { x: px + 8, y: py + 18, anchor: 'start' },
        { x: width - padding.right - 4, y: yScale(yMax) + 12, anchor: 'end' },
        { x: width - padding.right - 4, y: yScale(0.6), anchor: 'end' },
      ],
      text,
      responseObstacles,
      taken,
      frame,
      3,
    );
    taken.push(placed.box);
    overshootLabel = { x: placed.x, y: placed.y, anchor: placed.anchor, text };
  }

  // The fallback's name stays on the fallback: every candidate is anchored
  // to the dashed curve's settle point (where it reaches 1.0), stepping out
  // around it. On a bouncy spring the response crosses that point too, and
  // the far corners of the plot used to win, 400px from the curve the word
  // names. If nothing near it is clear, the label still sits 6px above the
  // settle point on its halo, which keeps it legible over a crossing curve.
  let reducedLabel: { x: number; y: number; anchor: 'start' | 'end' } | null = null;
  let settlePoint: Pt | null = null;
  if (reducedPts.length) {
    const [ex, ey] = reducedPts[reducedPts.length - 1];
    settlePoint = [ex, ey];
    const near: { x: number; y: number; anchor: 'start' | 'end' }[] = [
      { x: ex + 6, y: ey - 6, anchor: 'start' },
      { x: ex - 6, y: ey - 6, anchor: 'end' },
      { x: ex + 6, y: ey + 16, anchor: 'start' },
      { x: ex - 6, y: ey + 16, anchor: 'end' },
      { x: ex + 6, y: ey - 20, anchor: 'start' },
      { x: ex - 6, y: ey - 20, anchor: 'end' },
      { x: ex + 6, y: ey + 30, anchor: 'start' },
      { x: ex - 6, y: ey + 30, anchor: 'end' },
    ];
    const placed = placeLabel(
      [...near, near[0]],
      'reduced-motion',
      [...responseObstacles, ...densify(reducedPts)],
      taken,
      frame,
      3,
    );
    taken.push(placed.box);
    reducedLabel = { x: placed.x, y: placed.y, anchor: placed.anchor };
  }

  return (
    <div className="sv-chart" ref={boxRef}>
      <svg
        className="sv-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Spring response chart showing ${overshoot.toFixed(1)}% overshoot, ${Number.isFinite(settleMs) ? `within 2% at ${formatMs(settleMs)}` : 'never settling within 2%'}, over ${durationMs.toFixed(0)}ms`}
      >
        {/* Grid lines */}
        {[0, 0.5, 1, 1.5].map((y) => (
          <line
            key={y}
            className={y === 1 ? 'sv-chart-eq' : 'sv-chart-grid'}
            x1={padding.left}
            x2={width - padding.right}
            y1={yScale(y)}
            y2={yScale(y)}
          />
        ))}

        {/* Reduced-motion fallback line */}
        {reducedPath && <path className="sv-chart-reduced" d={reducedPath} />}

        {/* Spring response line */}
        <path className="sv-chart-response" d={linePath} data-verdict={verdict} />

        {/* Where the fallback lands: its label hangs from this point. */}
        {settlePoint && (
          <circle className="sv-chart-settle" cx={settlePoint[0]} cy={settlePoint[1]} r={2.5} />
        )}

        {/* Labels, after the curves */}
        {[0, 0.5, 1, 1.5].map((y) => (
          <text key={y} className="sv-chart-label" x={padding.left - 8} y={yScale(y) + 4} textAnchor="end">
            {y.toFixed(1)}
          </text>
        ))}

        <text className="sv-chart-label" x={width - padding.right + 6} y={eqY + 4}>
          eq
        </text>

        {[0, durationMs / 2, durationMs].map((t, i) => (
          <text
            key={t}
            className="sv-chart-label"
            x={xScale(t)}
            y={height - padding.bottom + 18}
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
          >
            {t.toFixed(0)}ms
          </text>
        ))}

        {reducedLabel && (
          <text className="sv-chart-label sv-chart-label--reduced" x={reducedLabel.x} y={reducedLabel.y} textAnchor={reducedLabel.anchor}>
            reduced-motion
          </text>
        )}

        {overshootLabel && (
          <text
            className="sv-chart-label sv-chart-label--overshoot"
            x={overshootLabel.x}
            y={overshootLabel.y}
            textAnchor={overshootLabel.anchor}
            data-verdict={verdict}
          >
            {overshootLabel.text}
          </text>
        )}
      </svg>
    </div>
  );
}
