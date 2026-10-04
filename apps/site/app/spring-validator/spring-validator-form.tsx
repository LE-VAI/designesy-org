'use client';

// Spring physics validator — simulates spring motion and validates
// against accessibility/reduced-motion requirements.
//
// Physics model: damped harmonic oscillator
//   x(t) = e^(-ζω₀t) * [cos(ωd·t) + (ζ/√(1-ζ²))·sin(ωd·t)]  (underdamped)
//   where ω₀ = √(k/m), ζ = c/(2√(km)), ωd = ω₀√(1-ζ²)
//
// All computation is client-side.

import { useState, useMemo, useCallback, useRef, useEffect, useId, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import './spring-validator.css';

// ── Types ───────────────────────────────────────────────────────────────────

interface SpringParams {
  stiffness: number;   // k — N/m (spring constant)
  damping: number;     // c — damping coefficient
  mass: number;        // m — kg
}

interface SpringResult {
  dampingRatio: number;    // ζ = c / (2√(km))
  naturalFreq: number;      // ω₀ = √(k/m) — rad/s
  dampedFreq: number;       // ωd = ω₀√(1-ζ²) — rad/s (underdamped only)
  overshoot: number;        // % — peak overshoot past equilibrium
  settleTime: number;       // ms — time to stay within 2% of equilibrium
  riseTime: number;         // ms — time to first reach equilibrium
  classification: 'overdamped' | 'critically-damped' | 'underdamped';
  verdict: 'safe' | 'caution' | 'violation';
  reducedMotionRequired: boolean;
  peakAmplitude: number;    // max displacement from equilibrium
  peakTime: number;         // ms — when peak occurs
}

// ── Spring physics computation ──────────────────────────────────────────────

function computeSpring(p: SpringParams): SpringResult {
  const { stiffness: k, damping: c, mass: m } = p;

  // Guard against invalid inputs
  if (k <= 0 || m <= 0 || c < 0) {
    return {
      dampingRatio: NaN,
      naturalFreq: NaN,
      dampedFreq: NaN,
      overshoot: 0,
      settleTime: 0,
      riseTime: 0,
      classification: 'overdamped',
      verdict: 'violation',
      reducedMotionRequired: false,
      peakAmplitude: 0,
      peakTime: 0,
    };
  }

  const omega0 = Math.sqrt(k / m);              // natural frequency (rad/s)
  const zeta = c / (2 * Math.sqrt(k * m));       // damping ratio

  let classification: SpringResult['classification'];
  let overshoot = 0;
  let dampedFreq = 0;
  let peakTime = 0;
  let peakAmplitude = 1; // starts at 0, moves to 1 (equilibrium)

  if (zeta > 1) {
    classification = 'overdamped';
    // No overshoot — slow return to equilibrium
    // Approximate settle time: ~4/(ζ·ω₀ - ω₀·√(ζ²-1))
    const slowRoot = zeta * omega0 - omega0 * Math.sqrt(zeta * zeta - 1);
    peakAmplitude = 1;
  } else if (zeta === 1) {
    classification = 'critically-damped';
    // No overshoot — fastest return without oscillation
    peakAmplitude = 1;
  } else {
    // Underdamped (0 ≤ ζ < 1)
    classification = 'underdamped';
    dampedFreq = omega0 * Math.sqrt(1 - zeta * zeta);

    // Overshoot percentage: e^(-π·ζ/√(1-ζ²)) × 100
    overshoot = Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta)) * 100;

    // Peak time (first overshoot): π/ωd
    peakTime = (Math.PI / dampedFreq) * 1000; // convert to ms

    // Peak amplitude: 1 + overshoot/100
    peakAmplitude = 1 + overshoot / 100;
  }

  // Rise time (time to first cross equilibrium) — approx
  const riseTime = (Math.PI / (2 * omega0)) * 1000; // ms

  // Settle time (2% criterion) — approx 4/(ζ·ω₀) for underdamped
  let settleTime: number;
  if (zeta < 1) {
    settleTime = (4 / (zeta * omega0)) * 1000; // ms
  } else if (zeta === 1) {
    settleTime = (5.8 / omega0) * 1000; // critically damped ~5.8/ω₀
  } else {
    // Overdamped — slower
    settleTime = (4 / (zeta * omega0)) * 1000;
  }

  // Verdict: is the overshoot visible enough to require reduced-motion?
  // Threshold: overshoot > 2% is perceptible; > 10% is clearly visible
  let verdict: SpringResult['verdict'];
  let reducedMotionRequired: boolean;

  if (overshoot > 10) {
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
    dampingRatio: zeta,
    naturalFreq: omega0,
    dampedFreq,
    overshoot,
    settleTime,
    riseTime,
    classification,
    verdict,
    reducedMotionRequired,
    peakAmplitude,
    peakTime,
  };
}

// ── Spring simulation (for visualization) ───────────────────────────────────

function simulateSpring(p: SpringParams, durationMs: number, samples: number): { t: number; x: number }[] {
  const { stiffness: k, damping: c, mass: m } = p;
  const omega0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));

  const points: { t: number; x: number }[] = [];
  const dt = (durationMs / 1000) / samples;

  for (let i = 0; i <= samples; i++) {
    const t = i * dt;
    let x: number;

    if (zeta >= 1) {
      // Overdamped or critically damped: no oscillation
      if (zeta > 1) {
        const r1 = -zeta * omega0 + omega0 * Math.sqrt(zeta * zeta - 1);
        const r2 = -zeta * omega0 - omega0 * Math.sqrt(zeta * zeta - 1);
        // x(t) = 1 + (r2/(r1-r2))·e^(r1·t) - (r1/(r1-r2))·e^(r2·t)
        x = 1 + (r2 / (r1 - r2)) * Math.exp(r1 * t) - (r1 / (r1 - r2)) * Math.exp(r2 * t);
      } else {
        // Critically damped: x(t) = 1 - (1 + ω₀·t)·e^(-ω₀·t)
        x = 1 - (1 + omega0 * t) * Math.exp(-omega0 * t);
      }
    } else {
      // Underdamped
      const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
      // x(t) = 1 - e^(-ζω₀t)·[cos(ωd·t) + (ζ/√(1-ζ²))·sin(ωd·t)]
      x = 1 - Math.exp(-zeta * omega0 * t) * (Math.cos(omegaD * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(omegaD * t));
    }

    points.push({ t: t * 1000, x: Math.max(-0.5, Math.min(2, x)) });
  }

  return points;
}

// ── Preset springs ──────────────────────────────────────────────────────────

const PRESETS: { name: string; params: SpringParams; source: string }[] = [
  {
    name: 'M3 Default',
    params: { stiffness: 200, damping: 28, mass: 1 },
    source: 'Material 3 Expressive · default spring',
  },
  {
    name: 'M3 Momentum',
    params: { stiffness: 300, damping: 24, mass: 1 },
    source: 'Material 3 Expressive · momentum spring',
  },
  {
    name: 'iOS Snappy',
    params: { stiffness: 300, damping: 30, mass: 1 },
    source: 'iOS default spring (approx)',
  },
  {
    name: 'iOS Gentle',
    params: { stiffness: 120, damping: 20, mass: 1 },
    source: 'iOS gentle spring (approx)',
  },
  {
    name: 'Framer Motion',
    params: { stiffness: 170, damping: 26, mass: 1 },
    source: 'Framer Motion default',
  },
  {
    name: 'Bouncy (risky)',
    params: { stiffness: 400, damping: 10, mass: 1 },
    source: 'High overshoot, a likely vestibular trigger',
  },
  {
    name: 'Critically damped',
    params: { stiffness: 200, damping: 28.28, mass: 1 },
    source: 'ζ = 1.0: fastest settle, no overshoot',
  },
  {
    name: 'Designesy contract',
    params: { stiffness: 250, damping: 31.6, mass: 1 },
    source: 'Designesy default spring (damping=1.0, response=0.4)',
  },
];

// ── Component ───────────────────────────────────────────────────────────────

// The verdict: a word, the title bar's short echo, and the one-line reason
// the side pane leads with. Its hue is the state token (spring-validator.css
// reads data-verdict). The reason names the threshold, never the live
// number, so the live region speaks only when the verdict changes.
const VERDICT: Record<SpringResult['verdict'], { word: string; detail: string; reason: string }> = {
  safe: {
    word: 'Safe',
    detail: 'no reduced-motion concern',
    reason: 'Overshoot of 2% or less is imperceptible. No reduced-motion rule needed.',
  },
  caution: {
    word: 'Caution',
    detail: 'minor overshoot',
    reason: 'Overshoot over 2% is perceptible. Add a reduced-motion rule.',
  },
  violation: {
    word: 'Violation',
    detail: 'overshoot requires suppression',
    reason: 'Overshoot over 10% is a vestibular trigger. Suppress it under reduced motion.',
  },
};

// What the overshoot readout says about its own value, on the verdict's
// thresholds, and the state it is tinted with: none and subtle sit inside
// Safe, visible is Caution, vestibular risk is Violation.
function overshootBand(pct: number): { label: string; tone: 'pass' | 'warn' | 'fail' } {
  if (pct < 0.5) return { label: 'none', tone: 'pass' };
  if (pct <= 2) return { label: 'subtle', tone: 'pass' };
  if (pct <= 10) return { label: 'visible', tone: 'warn' };
  return { label: 'vestibular risk', tone: 'fail' };
}

// A settle time is infinite when damping is zero; say so instead of
// rendering "Infinityms".
function fmtMs(ms: number): string {
  return Number.isFinite(ms) ? `${ms.toFixed(0)}ms` : 'never';
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
export function SpringValidator() {
  const [params, setParams] = useState<SpringParams>({ stiffness: 200, damping: 28, mass: 1 });
  const [selectedPreset, setSelectedPreset] = useState<string>('M3 Default');
  const [showReducedMotion, setShowReducedMotion] = useState(true);
  const uid = useId();

  const result = useMemo(() => computeSpring(params), [params]);

  // Simulate for chart — duration based on settle time, capped at 2000ms
  const simDuration = useMemo(() => Math.min(Math.max(result.settleTime * 1.5, 500), 2000), [result.settleTime]);
  const simData = useMemo(() => simulateSpring(params, simDuration, 200), [params, simDuration]);

  const handlePreset = useCallback((preset: typeof PRESETS[0]) => {
    setParams(preset.params);
    setSelectedPreset(preset.name);
  }, []);

  const handleParamChange = useCallback((key: keyof SpringParams, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setSelectedPreset('Custom');
  }, []);

  const verdict = VERDICT[result.verdict];
  const reducedMs = Math.min(result.settleTime, 150);
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
          {PRESETS.map((preset) => (
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
                  with a linear or ease-out transition at {reducedMs.toFixed(0)}ms.
                </>
              ) : (
                <>
                  Damping ratio ζ = {result.dampingRatio.toFixed(3)} produces no
                  perceptible overshoot. This spring is safe for vestibular
                  sensitivity without explicit reduced-motion suppression.
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
              <Metric label="Settle time (2%)" value={fmtMs(result.settleTime)} hint="to equilibrium" />
              <Metric label="Rise time" value={fmtMs(result.riseTime)} hint="to equilibrium" />
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
{`.spring-${result.classification} {
  /* Damping ratio: ζ = ${result.dampingRatio.toFixed(3)} · Overshoot: ${result.overshoot.toFixed(1)}% */
  transition: transform ${fmtMs(result.settleTime)} cubic-bezier(0.2, 0, 0, 1);
}

@media (prefers-reduced-motion: reduce) {
  .spring-${result.classification} {
    /* Suppress overshoot: linear or ease-out at ${reducedMs.toFixed(0)}ms */
    transition: transform ${reducedMs.toFixed(0)}ms ease-out;
  }
}`}
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
          {value.toFixed(1)} <span className="sv-param-unit">{unit}</span>
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
 * under a Safe verdict (M3 Default: zeta 0.990, 0.0% overshoot) and passed
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
        label: 'Spring does not produce perceptible overshoot (>2%)',
        detail: 'If overshoot > 2%, the spring is visible to vestibular-sensitive users',
      },
      {
        state: required ? 'pass' : 'na',
        label: 'Visible overshoot has an explicit @media (prefers-reduced-motion: reduce) rule',
        detail: required
          ? 'Required above 2% overshoot: the CSS snippet carries the rule, so ship it with the spring'
          : r.classification === 'underdamped'
            ? 'Not required: overshoot of 2% or less is imperceptible'
            : 'Not required: the spring does not oscillate',
      },
      {
        state: r.verdict === 'violation' ? 'fail' : 'pass',
        label: 'Overshoot ≤ 10% (not a vestibular trigger)',
        detail: 'Overshoot > 10% is clearly visible and likely triggers discomfort',
      },
    ],
    budget: [
      {
        state: r.settleTime <= 300 ? 'pass' : 'fail',
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
// Geist Mono advances about 0.6em per glyph; the label fit test uses it.
const CHAR_W = CHART_FONT * 0.62;

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
  showReducedMotion,
  reducedDuration,
  verdict,
}: {
  data: { t: number; x: number }[];
  durationMs: number;
  overshoot: number;
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

  // Y range: from 0 to max(1.5, peak amplitude + 0.1)
  const yMax = Math.max(1.5, Math.max(...data.map((d) => d.x)) + 0.1);
  const yMin = -0.1;

  const xScale = (t: number) => padding.left + (t / durationMs) * chartW;
  const yScale = (x: number) => padding.top + chartH - ((x - yMin) / (yMax - yMin)) * chartH;

  // Build path
  const linePts: Pt[] = data.map((d) => [xScale(d.t), yScale(d.x)]);
  const linePath = linePts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

  // Equilibrium line (y = 1)
  const eqY = yScale(1);

  // Reduced-motion line (ease-out curve from 0 to 1, capped at reducedDuration)
  const reducedPts: Pt[] = [];
  if (showReducedMotion && reducedDuration < durationMs) {
    const reducedSamples = 50;
    for (let i = 0; i <= reducedSamples; i++) {
      const t = (i / reducedSamples) * reducedDuration;
      const progress = t / reducedDuration;
      // Ease-out: 1 - (1-p)³
      const x = 1 - Math.pow(1 - progress, 3);
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

  const peak = data.reduce((max, d) => (d.x > max.x ? d : max), data[0]);
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
        aria-label={`Spring response chart showing ${overshoot.toFixed(1)}% overshoot over ${durationMs.toFixed(0)}ms`}
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
