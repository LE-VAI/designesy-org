'use client';

// Spring physics validator — simulates spring motion and validates
// against accessibility/reduced-motion requirements.
//
// Physics model: damped harmonic oscillator
//   x(t) = e^(-ζω₀t) * [cos(ωd·t) + (ζ/√(1-ζ²))·sin(ωd·t)]  (underdamped)
//   where ω₀ = √(k/m), ζ = c/(2√(km)), ωd = ω₀√(1-ζ²)
//
// All computation is client-side.

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';

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
    source: 'Material 3 Expressive — default spring',
  },
  {
    name: 'M3 Momentum',
    params: { stiffness: 300, damping: 24, mass: 1 },
    source: 'Material 3 Expressive — momentum spring',
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
    source: 'High overshoot — likely vestibular trigger',
  },
  {
    name: 'Critically damped',
    params: { stiffness: 200, damping: 28.28, mass: 1 },
    source: 'ζ = 1.0 — fastest settle, no overshoot',
  },
  {
    name: 'Designesy contract',
    params: { stiffness: 250, damping: 31.6, mass: 1 },
    source: 'Designesy default spring (damping=1.0, response=0.4)',
  },
];

// ── Component ───────────────────────────────────────────────────────────────

export function SpringValidator() {
  const [params, setParams] = useState<SpringParams>({ stiffness: 200, damping: 28, mass: 1 });
  const [selectedPreset, setSelectedPreset] = useState<string>('M3 Default');
  const [showReducedMotion, setShowReducedMotion] = useState(true);

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

  // Verdict colors
  const verdictColor = result.verdict === 'safe' ? 'var(--ok)' : result.verdict === 'caution' ? 'var(--warn)' : 'var(--error)';
  const verdictBg = result.verdict === 'safe' ? 'var(--ok)' : result.verdict === 'caution' ? 'var(--warn)' : 'var(--error)';

  return (
    <div className="spring-validator">
      {/* Presets */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.5rem' }}>
          Preset springs
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => handlePreset(preset)}
              style={{
                padding: '0.35rem 0.75rem',
                background: selectedPreset === preset.name ? 'var(--signal)' : 'var(--surface)',
                color: selectedPreset === preset.name ? 'var(--paper)' : 'var(--muted)',
                border: `1px solid ${selectedPreset === preset.name ? 'var(--signal)' : 'var(--line)'}`,
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 500,
              }}
              title={preset.source}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Parameter sliders */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
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

      {/* Verdict banner */}
      <div style={{
        padding: '1.25rem 1.5rem',
        background: 'var(--surface)',
        border: `1px solid ${verdictBg}`,
        borderLeft: `4px solid ${verdictBg}`,
        borderRadius: '8px',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '1rem',
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 200px' }}>
          <p style={{
            fontSize: '0.7rem',
            color: 'var(--muted-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '0 0 0.25rem',
          }}>
            Accessibility verdict
          </p>
          <p style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: verdictColor,
            margin: 0,
            textTransform: 'capitalize',
          }}>
            {result.verdict === 'safe' && '✓ Safe — no reduced-motion concern'}
            {result.verdict === 'caution' && '⚠ Caution — minor overshoot'}
            {result.verdict === 'violation' && '✗ Violation — overshoot requires suppression'}
          </p>
          {result.reducedMotionRequired && (
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.5rem 0 0', maxWidth: '60ch' }}>
              This spring produces {result.overshoot.toFixed(1)}% overshoot. An
              explicit <code style={{ fontSize: '0.75rem' }}>@media (prefers-reduced-motion: reduce)</code> rule
              must suppress or replace this animation. Recommendation: replace
              with a linear or ease-out transition at {Math.min(result.settleTime, 150).toFixed(0)}ms.
            </p>
          )}
          {!result.reducedMotionRequired && (
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.5rem 0 0', maxWidth: '60ch' }}>
              Damping ratio ζ = {result.dampingRatio.toFixed(3)} produces no
              perceptible overshoot. This spring is safe for vestibular
              sensitivity without explicit reduced-motion suppression.
            </p>
          )}
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '0.75rem',
        marginBottom: '2rem',
      }}>
        <Metric label="Damping ratio (ζ)" value={result.dampingRatio.toFixed(3)} hint={result.classification} />
        <Metric label="Overshoot" value={`${result.overshoot.toFixed(1)}%`} hint={result.overshoot > 0 ? 'visible' : 'none'} />
        <Metric label="Settle time (2%)" value={`${result.settleTime.toFixed(0)}ms`} hint="to equilibrium" />
        <Metric label="Rise time" value={`${result.riseTime.toFixed(0)}ms`} hint="to equilibrium" />
        <Metric label="Natural freq" value={`${(result.naturalFreq / (2 * Math.PI)).toFixed(2)} Hz`} hint={`${result.naturalFreq.toFixed(1)} rad/s`} />
        {result.dampedFreq > 0 && (
          <Metric label="Damped freq" value={`${(result.dampedFreq / (2 * Math.PI)).toFixed(2)} Hz`} hint={`${result.dampedFreq.toFixed(1)} rad/s`} />
        )}
      </div>

      {/* Spring response chart */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Spring response — displacement over time
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showReducedMotion}
              onChange={(e) => setShowReducedMotion(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Show reduced-motion fallback
          </label>
        </div>
        <SpringChart
          data={simData}
          durationMs={simDuration}
          overshoot={result.overshoot}
          showReducedMotion={showReducedMotion}
          reducedDuration={Math.min(result.settleTime, 150)}
          verdict={result.verdict}
        />
      </div>

      {/* Accessibility checklist */}
      <div style={{
        padding: '1.25rem 1.5rem',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: '8px',
        marginBottom: '1.5rem',
      }}>
        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.75rem' }}>
          Reduced-motion compliance checklist
        </p>
        <ChecklistItem
          checked={result.reducedMotionRequired === false}
          label="Spring does not produce perceptible overshoot (>2%)"
          detail="If overshoot > 2%, the spring is visible to vestibular-sensitive users"
        />
        <ChecklistItem
          checked={result.classification !== 'underdamped' || result.reducedMotionRequired}
          label="Underdamped springs have explicit @media (prefers-reduced-motion: reduce) rule"
          detail="Underdamped springs MUST be suppressed or replaced under reduced-motion"
        />
        <ChecklistItem
          checked={result.settleTime <= 300}
          label="Settle time ≤ 300ms (UI animation bound)"
          detail="UI animation should stay at or below 300ms unless justified"
        />
        <ChecklistItem
          checked={result.overshoot <= 10}
          label="Overshoot ≤ 10% (not a vestibular trigger)"
          detail="Overshoot > 10% is clearly visible and likely triggers discomfort"
        />
        <ChecklistItem
          checked={true}
          label="Spring uses transform/opacity only (no layout animation)"
          detail="Never animate width, height, margin, padding — use transform and opacity"
        />
      </div>

      {/* CSS output */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.5rem' }}>
          CSS snippet — with reduced-motion fallback
        </p>
        <pre style={{
          padding: '1.25rem',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          color: 'var(--ink)',
          fontFamily: 'var(--mono, ui-monospace, "SF Mono", Menlo, monospace)',
          fontSize: '0.8rem',
          lineHeight: 1.6,
          overflow: 'auto',
          margin: 0,
        }}>
{`.spring-${result.classification} {
  /* Damping ratio: ζ = ${result.dampingRatio.toFixed(3)} · Overshoot: ${result.overshoot.toFixed(1)}% */
  transition: transform ${result.settleTime.toFixed(0)}ms cubic-bezier(0.2, 0, 0, 1);
}

@media (prefers-reduced-motion: reduce) {
  .spring-${result.classification} {
    /* Suppress overshoot — linear or ease-out at ${Math.min(result.settleTime, 150).toFixed(0)}ms */
    transition: transform ${Math.min(result.settleTime, 150).toFixed(0)}ms ease-out;
  }
}`}
        </pre>
      </div>

      {/* CTA */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <Link
          href="/contracts/motion"
          className="button primary"
          style={{ fontSize: '0.85rem' }}
        >
          View Designesy motion contract →
        </Link>
        <Link
          href="/score"
          className="button ghost"
          style={{ fontSize: '0.85rem' }}
        >
          Score your site →
        </Link>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted-dim)', marginLeft: 'auto' }}>
          All computation is client-side — no data sent to any server.
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
  return (
    <div>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '0.85rem', color: 'var(--ink)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {value.toFixed(1)} <span style={{ color: 'var(--muted-dim)', fontSize: '0.7rem' }}>{unit}</span>
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          height: '4px',
          background: 'var(--line)',
          borderRadius: '2px',
          outline: 'none',
          appearance: 'none',
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

// ── Metric subcomponent ─────────────────────────────────────────────────────

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{
      padding: '0.75rem 1rem',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: '8px',
    }}>
      <p style={{ fontSize: '0.65rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' }}>
        {label}
      </p>
      <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      {hint && (
        <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', margin: '0.15rem 0 0' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ── ChecklistItem subcomponent ──────────────────────────────────────────────

function ChecklistItem({ checked, label, detail }: { checked: boolean; label: string; detail: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.6rem', alignItems: 'flex-start' }}>
      <span style={{
        flexShrink: 0,
        width: '1.2rem',
        height: '1.2rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.7rem',
        fontWeight: 700,
        borderRadius: '3px',
        border: `1px solid ${checked ? 'var(--ok)' : 'var(--warn)'}`,
        color: checked ? 'var(--ok)' : 'var(--warn)',
        background: 'var(--paper)',
        marginTop: '0.1rem',
      }}>
        {checked ? '✓' : '!'}
      </span>
      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink)', margin: 0, fontWeight: 500 }}>
          {label}
        </p>
        <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', margin: '0.15rem 0 0' }}>
          {detail}
        </p>
      </div>
    </div>
  );
}

// ── SpringChart subcomponent ────────────────────────────────────────────────

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
  const width = 800;
  const height = 240;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Y range: from 0 to max(1.5, peak amplitude + 0.1)
  const yMax = Math.max(1.5, Math.max(...data.map((d) => d.x)) + 0.1);
  const yMin = -0.1;

  const xScale = (t: number) => padding.left + (t / durationMs) * chartW;
  const yScale = (x: number) => padding.top + chartH - ((x - yMin) / (yMax - yMin)) * chartH;

  // Build path
  const linePath = data.map((d, i) =>
    `${i === 0 ? 'M' : 'L'} ${xScale(d.t).toFixed(2)} ${yScale(d.x).toFixed(2)}`
  ).join(' ');

  // Equilibrium line (y = 1)
  const eqY = yScale(1);

  // Reduced-motion line (ease-out curve from 0 to 1, capped at reducedDuration)
  let reducedPath = '';
  if (showReducedMotion && reducedDuration < durationMs) {
    const reducedData: { t: number; x: number }[] = [];
    const reducedSamples = 50;
    for (let i = 0; i <= reducedSamples; i++) {
      const t = (i / reducedSamples) * reducedDuration;
      const progress = t / reducedDuration;
      // Ease-out: 1 - (1-p)³
      const x = 1 - Math.pow(1 - progress, 3);
      reducedData.push({ t, x });
    }
    reducedPath = reducedData.map((d, i) =>
      `${i === 0 ? 'M' : 'L'} ${xScale(d.t).toFixed(2)} ${yScale(d.x).toFixed(2)}`
    ).join(' ');
  }

  const verdictColor = verdict === 'safe' ? 'var(--ok)' : verdict === 'caution' ? 'var(--warn)' : 'var(--error)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--line)' }}
      role="img"
      aria-label={`Spring response chart showing ${overshoot.toFixed(1)}% overshoot over ${durationMs.toFixed(0)}ms`}
    >
      {/* Grid lines */}
      {[0, 0.5, 1, 1.5].map((y) => (
        <line
          key={y}
          x1={padding.left}
          x2={width - padding.right}
          y1={yScale(y)}
          y2={yScale(y)}
          stroke="var(--line)"
          strokeWidth={1}
          strokeDasharray={y === 1 ? '0' : '4 4'}
        />
      ))}

      {/* Y-axis labels */}
      {[0, 0.5, 1, 1.5].map((y) => (
        <text
          key={y}
          x={padding.left - 8}
          y={yScale(y) + 4}
          fill="var(--muted-dim)"
          fontSize={10}
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
        >
          {y.toFixed(1)}
        </text>
      ))}

      {/* Equilibrium label */}
      <text
        x={width - padding.right + 5}
        y={eqY + 4}
        fill="var(--muted-dim)"
        fontSize={9}
        fontFamily="ui-monospace, monospace"
      >
        eq
      </text>

      {/* X-axis labels */}
      {[0, durationMs / 2, durationMs].map((t) => (
        <text
          key={t}
          x={xScale(t)}
          y={height - padding.bottom + 16}
          fill="var(--muted-dim)"
          fontSize={10}
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
        >
          {t.toFixed(0)}ms
        </text>
      ))}

      {/* Reduced-motion fallback line */}
      {showReducedMotion && reducedPath && (
        <>
          <path
            d={reducedPath}
            fill="none"
            stroke="var(--muted-dim)"
            strokeWidth={2}
            strokeDasharray="4 3"
            opacity={0.6}
          />
          <text
            x={xScale(reducedDuration / 2)}
            y={yScale(0.15)}
            fill="var(--muted-dim)"
            fontSize={9}
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
          >
            reduced-motion
          </text>
        </>
      )}

      {/* Spring response line */}
      <path
        d={linePath}
        fill="none"
        stroke={verdictColor}
        strokeWidth={2.5}
        className="spring-response-line"
      />

      {/* Overshoot annotation */}
      {overshoot > 2 && (
        <text
          x={xScale(data.reduce((max, d) => d.x > max.x ? d : max).t)}
          y={yScale(data.reduce((max, d) => d.x > max.x ? d : max).x) - 8}
          fill={verdictColor}
          fontSize={10}
          textAnchor="middle"
          fontWeight={600}
          fontFamily="ui-monospace, monospace"
        >
          {overshoot.toFixed(1)}% overshoot
        </text>
      )}
    </svg>
  );
}