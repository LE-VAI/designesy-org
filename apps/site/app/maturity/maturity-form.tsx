'use client';

// Interactive Design Compliance Maturity self-assessment.
//
// 6 axes × 4 questions = 24 questions. Each answer = stage 1–4.
// Radar chart renders the result. Shareable via URL hash (base64).
// CTA: "Verify your compliance with Designesy" → /score.
//
// All state is client-side. No data is sent to any server.

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';

// ── Types ───────────────────────────────────────────────────────────────────

type Stage = 0 | 1 | 2 | 3 | 4; // 0 = unanswered

interface Axis {
  id: string;
  label: string;
  symbol: string;
  description: string;
  categories: string;
  contractWeight: string;
}

interface Question {
  id: string;
  axis: string;
  prompt: string;
  answers: { stage: 1 | 2 | 3 | 4; label: string }[];
}

// ── Data: 6 axes ────────────────────────────────────────────────────────────

const AXES: Axis[] = [
  {
    id: 'tokens',
    label: 'Token Discipline',
    symbol: 'T',
    description: 'Are design tokens defined, structured, and enforced?',
    categories: 'tokens, spec',
    contractWeight: '13% of contract',
  },
  {
    id: 'motion',
    label: 'Motion Consistency',
    symbol: 'M',
    description: 'Are duration, easing, and interaction feel tokenized and applied?',
    categories: 'motion, takt',
    contractWeight: '18% of contract',
  },
  {
    id: 'a11y',
    label: 'Accessibility Readiness',
    symbol: 'A',
    description: 'WCAG conformance, focus visibility, reduced-motion tiering.',
    categories: 'accessibility, interaction',
    contractWeight: '21% of contract',
  },
  {
    id: 'platform',
    label: 'Platform Fit',
    symbol: 'P',
    description: 'Core Web Vitals, responsive, interaction poise across devices.',
    categories: 'performance, responsive, poise',
    contractWeight: '16% of contract',
  },
  {
    id: 'identity',
    label: 'Identity & Copy',
    symbol: 'I',
    description: 'Semantic landmarks, UX copy discipline, security hygiene.',
    categories: 'identity, copywriting, security',
    contractWeight: '19% of contract',
  },
  {
    id: 'verification',
    label: 'Verification Maturity',
    symbol: 'V',
    description: 'Is compliance measured deterministically, or by vibes?',
    categories: 'cadence, self-measurement',
    contractWeight: '18% of contract + the moat',
  },
];

// ── Data: 24 questions (4 per axis) ─────────────────────────────────────────

const QUESTIONS: Question[] = [
  // ── Token Discipline ──
  {
    id: 't1',
    axis: 'tokens',
    prompt: 'How are your design tokens defined?',
    answers: [
      { stage: 1, label: 'Hardcoded values in CSS — no custom properties' },
      { stage: 2, label: 'Some CSS custom properties for colors/spacing' },
      { stage: 3, label: 'Structured token system (primitive → semantic → component layers)' },
      { stage: 4, label: 'W3C DTCG format tokens with $type, $value, $description' },
    ],
  },
  {
    id: 't2',
    axis: 'tokens',
    prompt: 'Do you ship a --paper or root surface token at :root?',
    answers: [
      { stage: 1, label: 'No — backgrounds are raw hex/rgb values' },
      { stage: 2, label: 'Yes, a single --bg or --color-bg variable' },
      { stage: 3, label: 'Yes, with a full surface elevation scale (paper → surface → elevated)' },
      { stage: 4, label: 'Yes, with structured OKLCH color space + component-level tokens' },
    ],
  },
  {
    id: 't3',
    axis: 'tokens',
    prompt: 'How is token drift prevented?',
    answers: [
      { stage: 1, label: 'It isn’t — developers hardcode values ad-hoc' },
      { stage: 2, label: 'Code review catches raw values manually' },
      { stage: 3, label: 'Stylelint or CSS linter flags raw hex/magic numbers' },
      { stage: 4, label: 'CI gate blocks PRs that introduce off-token values' },
    ],
  },
  {
    id: 't4',
    axis: 'tokens',
    prompt: 'Do you serve a machine-readable token file (JSON, W3C DTCG)?',
    answers: [
      { stage: 1, label: 'No — tokens live only in CSS' },
      { stage: 2, label: 'A JSON export exists but is generated manually' },
      { stage: 3, label: 'A build step emits tokens.json from source of truth' },
      { stage: 4, label: 'W3C DTCG tokens.json served at a stable URL + dtcg.json endpoint' },
    ],
  },

  // ── Motion Consistency ──
  {
    id: 'm1',
    axis: 'motion',
    prompt: 'How are motion durations defined?',
    answers: [
      { stage: 1, label: 'Random ms values scattered across components' },
      { stage: 2, label: 'A few common values (200ms, 300ms) used semi-consistently' },
      { stage: 3, label: 'A duration token scale (--dur-1 through --dur-6) at :root' },
      { stage: 4, label: '6+ named duration tokens + 4+ easing tokens with cubic-bezier values' },
    ],
  },
  {
    id: 'm2',
    axis: 'motion',
    prompt: 'Do you ship a prefers-reduced-motion block?',
    answers: [
      { stage: 1, label: 'No — all motion plays regardless of user preference' },
      { stage: 2, label: 'A global kill switch that disables all animation' },
      { stage: 3, label: 'Tiered: removes large motion, softens small motion ≤200ms' },
      { stage: 4, label: '3-tier reduced-motion (remove / soften / keep) with per-component data-motion attrs' },
    ],
  },
  {
    id: 'm3',
    axis: 'motion',
    prompt: 'Are press interactions tuned with transform/opacity only?',
    answers: [
      { stage: 1, label: 'Press states use background-color or border changes' },
      { stage: 2, label: 'Some use transform: scale, but values are inconsistent' },
      { stage: 3, label: 'Press scales above 0.95 floor, ease-out timing, transform only' },
      { stage: 4, label: 'Named takt tiers (0.96 cells, 0.985 cards, 0.995 surfaces) + stagger delays' },
    ],
  },
  {
    id: 'm4',
    axis: 'motion',
    prompt: 'Do you restrict will-change to transform and opacity?',
    answers: [
      { stage: 1, label: 'No — will-change: all or no will-change declarations' },
      { stage: 2, label: 'will-change used but on non-composited properties' },
      { stage: 3, label: 'will-change restricted to transform/opacity on animated elements only' },
      { stage: 4, label: 'Linted in CI — will-change on non-composited props is blocked' },
    ],
  },

  // ── Accessibility Readiness ──
  {
    id: 'a1',
    axis: 'a11y',
    prompt: 'How is color contrast verified?',
    answers: [
      { stage: 1, label: 'Eyeballed — no automated check' },
      { stage: 2, label: 'Manual axe-core or browser extension checks during QA' },
      { stage: 3, label: 'APC contrast checks in CI (Lc 60/75/90 thresholds)' },
      { stage: 4, label: 'Automated WCAG 2.2 AA scan in CI + contrast tokens with computed Lc values' },
    ],
  },
  {
    id: 'a2',
    axis: 'a11y',
    prompt: 'Are :focus-visible rings declared?',
    answers: [
      { stage: 1, label: 'No focus styles — outline: none with no replacement' },
      { stage: 2, label: 'Basic :focus styles, but not :focus-visible differentiated' },
      { stage: 3, label: ':focus-visible rings with visible contrast on all interactive elements' },
      { stage: 4, label: ':focus-visible rings + keyboard-path documentation + forced-colors readiness' },
    ],
  },
  {
    id: 'a3',
    axis: 'a11y',
    prompt: 'How are heading hierarchy and landmarks structured?',
    answers: [
      { stage: 1, label: 'No consistent heading order; divs for layout sections' },
      { stage: 2, label: 'h1–h3 used, but order skips levels on some pages' },
      { stage: 3, label: 'Single h1, no skipped levels, main/header/nav landmarks on all pages' },
      { stage: 4, label: 'Landmarks + heading audit in CI + skip-to-content link + ARIA labels verified' },
    ],
  },
  {
    id: 'a4',
    axis: 'a11y',
    prompt: 'What touch-target and input-font standards do you enforce?',
    answers: [
      { stage: 1, label: 'No minimum touch target; inputs use browser-default font size' },
      { stage: 2, label: '44px touch targets on mobile; 16px input font on most forms' },
      { stage: 3, label: '44px+ touch targets everywhere; 16px input font floor enforced' },
      { stage: 4, label: 'Touch-target + input-font + button-text contrast all linted in CI' },
    ],
  },

  // ── Platform Fit ──
  {
    id: 'p1',
    axis: 'platform',
    prompt: 'How are Core Web Vitals tracked?',
    answers: [
      { stage: 1, label: 'Not tracked — we find out from user complaints' },
      { stage: 2, label: 'PageSpeed Insights checked manually before launches' },
      { stage: 3, label: 'LCP/INP/CLS monitored in production with alerting' },
      { stage: 4, label: 'CWV budgets enforced in CI; regressions block deployment' },
    ],
  },
  {
    id: 'p2',
    axis: 'platform',
    prompt: 'How do you test responsive behavior?',
    answers: [
      { stage: 1, label: 'We check a couple of breakpoints in dev tools' },
      { stage: 2, label: 'Manual testing at 375/720/1080px before launch' },
      { stage: 3, label: 'Container queries + viewport overflow checks at 4+ widths' },
      { stage: 4, label: 'Automated viewport overflow scan in CI across 375/720/860/1080px' },
    ],
  },
  {
    id: 'p3',
    axis: 'platform',
    prompt: 'How is interaction poise (hover, press, sound) handled?',
    answers: [
      { stage: 1, label: 'No hover states on touch devices; press states are inconsistent' },
      { stage: 2, label: '@media (hover: hover) guards on some components' },
      { stage: 3, label: 'Hover guards on all interactive elements + press settle scales' },
      { stage: 4, label: 'Hover guards + press scales + sound toggle (aria-pressed) + haptics with reduced-motion tiering' },
    ],
  },
  {
    id: 'p4',
    axis: 'platform',
    prompt: 'Do you ship font-synthesis and text-rendering controls?',
    answers: [
      { stage: 1, label: 'No — browser defaults apply (fake bold/italic possible)' },
      { stage: 2, label: 'font-synthesis: none on body, but not on headings' },
      { stage: 3, label: 'font-synthesis: none + text-rendering: optimizeLegibility + font-smoothing' },
      { stage: 4, label: 'Full cadence stack: font-synthesis, text-wrap, tabular-nums, selection styling, skip-ink — all in CI' },
    ],
  },

  // ── Identity & Copy ──
  {
    id: 'i1',
    axis: 'identity',
    prompt: 'How is semantic HTML and document identity handled?',
    answers: [
      { stage: 1, label: 'divs everywhere; title/meta description missing on some pages' },
      { stage: 2, label: 'h1 and title on all pages, but meta descriptions inconsistent' },
      { stage: 3, label: 'h1, title, meta description, main/header/nav on all pages' },
      { stage: 4, label: 'Landmarks + meta + Open Graph + AI-disclosure readiness (EU AI Act Art 50)' },
    ],
  },
  {
    id: 'i2',
    axis: 'identity',
    prompt: 'How disciplined is your UX copy (buttons, links, labels)?',
    answers: [
      { stage: 1, label: 'Inconsistent — “Click Here”, “Submit”, trailing periods, ALL CAPS' },
      { stage: 2, label: 'Mostly verb-phrase buttons, but some “Click Here” links remain' },
      { stage: 3, label: 'Verb-phrase buttons, no trailing periods, descriptive link text, no ALL CAPS' },
      { stage: 4, label: 'Copy linted in CI — button verbs, link text, no trailing periods, no ALL CAPS enforced' },
    ],
  },
  {
    id: 'i3',
    axis: 'identity',
    prompt: 'Do you check for Unicode security (homoglyph) issues in token names?',
    answers: [
      { stage: 1, label: 'Never heard of it — no checks' },
      { stage: 2, label: 'Aware of it but no automated check' },
      { stage: 3, label: 'UTS #39 confusable detection run during builds' },
      { stage: 4, label: 'UTS #39 confusable detection in CI — blocks Cyrillic/Greek homoglyph shadowing' },
    ],
  },
  {
    id: 'i4',
    axis: 'identity',
    prompt: 'Do you serve a DESIGN.md spec file for AI coding tools?',
    answers: [
      { stage: 1, label: 'No — no DESIGN.md or equivalent spec file' },
      { stage: 2, label: 'A README or wiki page with some design guidelines' },
      { stage: 3, label: 'A DESIGN.md file at the repo root with tokens, components, motion specs' },
      { stage: 4, label: 'DESIGN.md + llms.txt + agent.json — AI tools build from your system, not around it' },
    ],
  },

  // ── Verification Maturity ──
  {
    id: 'v1',
    axis: 'verification',
    prompt: 'How do you verify design-system compliance?',
    answers: [
      { stage: 1, label: 'We don’t — “it looks right” is the bar' },
      { stage: 2, label: 'Manual design reviews before launch' },
      { stage: 3, label: 'Automated linter (stylelint, eslint) in CI for token usage' },
      { stage: 4, label: 'Deterministic 40-check engine scores every shipped surface — designesy or equivalent' },
    ],
  },
  {
    id: 'v2',
    axis: 'verification',
    prompt: 'How is typography rendering discipline (cadence) enforced?',
    answers: [
      { stage: 1, label: 'No font-smoothing, rem units, or text-wrap declarations' },
      { stage: 2, label: 'rem units for font sizes, but no smoothing or text-wrap' },
      { stage: 3, label: 'font-smoothing + rem sizes + line-height + text-wrap: balance' },
      { stage: 4, label: 'Full cadence stack (12 checks) linted in CI — smoothing, rem, line-height, text-wrap, tabular-nums, selection, font-synthesis, skip-ink' },
    ],
  },
  {
    id: 'v3',
    axis: 'verification',
    prompt: 'Do you measure compliance drift over time?',
    answers: [
      { stage: 1, label: 'No — we have no baseline to drift from' },
      { stage: 2, label: 'Occasional audits, but no continuous tracking' },
      { stage: 3, label: 'Weekly automated re-score with delta badges (up/down/flat)' },
      { stage: 4, label: 'Continuous drift monitoring + alerting + trend dashboards + regression gates' },
    ],
  },
  {
    id: 'v4',
    axis: 'verification',
    prompt: 'Can a new developer verify their work against the design contract?',
    answers: [
      { stage: 1, label: 'No — they guess based on existing code' },
      { stage: 2, label: 'They can read the docs and ask in Slack' },
      { stage: 3, label: 'They can run npx <tool> locally to score their branch' },
      { stage: 4, label: 'CI runs the contract check on every PR — fails if score drops below threshold' },
    ],
  },
];

// ── Stage labels ────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<number, string> = {
  1: 'Ad-hoc',
  2: 'Emerging',
  3: 'Systematic',
  4: 'Verified',
};

const STAGE_COLORS: Record<number, string> = {
  1: 'var(--error)',
  2: 'var(--warn)',
  3: 'var(--signal)',
  4: 'var(--ok)',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function axisScore(answers: Record<string, number>, axisId: string): number {
  const axisQuestions = QUESTIONS.filter((q) => q.axis === axisId);
  const answered = axisQuestions.filter((q) => answers[q.id] !== undefined);
  if (answered.length === 0) return 0;
  const sum = answered.reduce((acc, q) => acc + (answers[q.id] || 0), 0);
  return Math.round((sum / answered.length) * 25); // 1-4 → 25-100
}

function overallScore(answers: Record<string, number>): number {
  const scores = AXES.map((a) => axisScore(answers, a.id)).filter((s) => s > 0);
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function stageFromScore(score: number): 1 | 2 | 3 | 4 {
  if (score >= 75) return 4;
  if (score >= 50) return 3;
  if (score >= 25) return 2;
  return 1;
}

function encodeAnswers(answers: Record<string, number>): string {
  try {
    return btoa(JSON.stringify(answers));
  } catch {
    return '';
  }
}

function decodeAnswers(hash: string): Record<string, number> | null {
  try {
    const clean = hash.replace(/^#/, '').replace(/^r=/, '');
    return JSON.parse(atob(clean));
  } catch {
    return null;
  }
}

// ── Maturity radar (SVG) ───────────────────────────────────────────────────
// Distinct from lib/radar-chart.tsx (site-vs-cohort comparison). This is a
// self-assessment radar: 6 axes, stage labels with colors, ring numbers,
// no cohort overlay. Purpose-built for the maturity quiz result view.

function MaturityRadar({ scores }: { scores: number[] }) {
  const size = 320;
  const center = size / 2;
  const maxRadius = 120;
  const axesCount = AXES.length;
  const angleStep = (2 * Math.PI) / axesCount;

  // Grid rings at 25, 50, 75, 100
  const rings = [25, 50, 75, 100];

  // Axis label positions
  const axisPoints = AXES.map((_, i) => {
    const angle = i * angleStep - Math.PI / 2;
    return {
      x: center + Math.cos(angle) * (maxRadius + 28),
      y: center + Math.sin(angle) * (maxRadius + 28),
      angle,
    };
  });

  // Data polygon
  const dataPoints = scores.map((score, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const radius = (score / 100) * maxRadius;
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  });

  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Maturity radar: ${AXES.map((a, i) => `${a.label} ${scores[i] || 0}`).join(', ')}`}
    >
      {/* Grid rings */}
      {rings.map((ring) => {
        const r = (ring / 100) * maxRadius;
        const points = AXES.map((_, i) => {
          const angle = i * angleStep - Math.PI / 2;
          return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
        }).join(' ');
        return (
          <polygon
            key={ring}
            points={points}
            fill="none"
            stroke="var(--line)"
            strokeWidth="1"
            opacity={ring === 100 ? 0.5 : 0.25}
          />
        );
      })}

      {/* Axis lines */}
      {AXES.map((_, i) => {
        const angle = i * angleStep - Math.PI / 2;
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + Math.cos(angle) * maxRadius}
            y2={center + Math.sin(angle) * maxRadius}
            stroke="var(--line)"
            strokeWidth="1"
            opacity="0.3"
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={polygonPoints}
        fill="var(--signal)"
        fillOpacity="0.15"
        stroke="var(--signal)"
        strokeWidth="2"
        style={{ transition: 'all 0.4s var(--ease, cubic-bezier(0.22,0.61,0.36,1))' }}
      />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="4"
          fill="var(--signal)"
          stroke="var(--paper)"
          strokeWidth="2"
          style={{ transition: 'all 0.4s var(--ease, cubic-bezier(0.22,0.61,0.36,1))' }}
        />
      ))}

      {/* Axis labels */}
      {AXES.map((axis, i) => {
        const pos = axisPoints[i];
        const score = scores[i] || 0;
        const stage = stageFromScore(score);
        const anchor = Math.abs(pos.x - center) < 10 ? 'middle' : pos.x > center ? 'start' : 'end';
        return (
          <g key={axis.id}>
            <text
              x={pos.x}
              y={pos.y - 6}
              textAnchor={anchor}
              style={{ fontSize: '0.7rem', fontWeight: 600, fill: 'var(--ink)' }}
            >
              {axis.label}
            </text>
            <text
              x={pos.x}
              y={pos.y + 8}
              textAnchor={anchor}
              style={{ fontSize: '0.65rem', fill: STAGE_COLORS[stage] }}
            >
              {score > 0 ? `${score} · ${STAGE_LABELS[stage]}` : '—'}
            </text>
          </g>
        );
      })}

      {/* Stage ring labels */}
      {rings.map((ring) => {
        const r = (ring / 100) * maxRadius;
        return (
          <text
            key={ring}
            x={center + 4}
            y={center - r + 3}
            style={{ fontSize: '0.55rem', fill: 'var(--muted-dim)' }}
          >
            {ring}
          </text>
        );
      })}
    </svg>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function MaturityAssessment() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<'quiz' | 'results'>('quiz');
  const [currentAxis, setCurrentAxis] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Load from URL hash on mount
  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    if (typeof window !== 'undefined' && window.location.hash) {
      const decoded = decodeAnswers(window.location.hash);
      if (decoded && Object.keys(decoded).length > 0) {
        setAnswers(decoded);
        setPhase('results');
      }
    }
  }, [loaded]);

  // Update URL hash when results are shown
  const updateHash = useCallback((a: Record<string, number>) => {
    if (typeof window !== 'undefined' && phase === 'results') {
      const encoded = encodeAnswers(a);
      if (encoded) {
        window.history.replaceState(null, '', `#r=${encoded}`);
      }
    }
  }, [phase]);

  const handleAnswer = useCallback((questionId: string, stage: number) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: stage };
      return next;
    });
  }, []);

  const axisQuestions = useMemo(
    () => QUESTIONS.filter((q) => q.axis === AXES[currentAxis]?.id),
    [currentAxis]
  );

  const axisAnsweredCount = useMemo(
    () => axisQuestions.filter((q) => answers[q.id] !== undefined).length,
    [axisQuestions, answers]
  );

  const allAnswered = useMemo(
    () => QUESTIONS.every((q) => answers[q.id] !== undefined),
    [answers]
  );

  const totalAnswered = useMemo(
    () => QUESTIONS.filter((q) => answers[q.id] !== undefined).length,
    [answers]
  );

  const scores = useMemo(
    () => AXES.map((a) => axisScore(answers, a.id)),
    [answers]
  );

  const overall = useMemo(() => overallScore(answers), [answers]);

  function handleNext() {
    if (currentAxis < AXES.length - 1) {
      setCurrentAxis(currentAxis + 1);
    }
  }

  function handlePrev() {
    if (currentAxis > 0) {
      setCurrentAxis(currentAxis - 1);
    }
  }

  function handleSeeResults() {
    setPhase('results');
    updateHash(answers);
  }

  function handleRestart() {
    setAnswers({});
    setPhase('quiz');
    setCurrentAxis(0);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  // ── Quiz phase ─────────────────────────────────────────────────────────────

  if (phase === 'quiz') {
    const axis = AXES[currentAxis];
    const progress = ((currentAxis + (axisAnsweredCount / 4)) / AXES.length) * 100;

    return (
      <div className="maturity-assessment">
        {/* Progress bar */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Axis {currentAxis + 1} of {AXES.length}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted-dim)' }}>
              {totalAnswered} of {QUESTIONS.length} answered
            </span>
          </div>
          <div style={{ height: '3px', background: 'var(--line)', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'var(--signal)',
                transition: 'width 0.3s var(--ease, cubic-bezier(0.22,0.61,0.36,1))',
              }}
            />
          </div>
        </div>

        {/* Axis header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '2rem',
          padding: '1.25rem 1.5rem',
          background: 'var(--surface)',
          borderRadius: 'var(--radius, 12px)',
          border: '1px solid var(--line)',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '10px',
            background: 'var(--signal)',
            color: 'var(--paper)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {axis.symbol}
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.25rem' }}>
              {axis.label}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
              {axis.description} · <span style={{ color: 'var(--muted-dim)' }}>{axis.contractWeight}</span>
            </p>
          </div>
        </div>

        {/* Questions */}
        <div className="row-stack" role="list">
          {axisQuestions.map((q, qi) => {
            const selected = answers[q.id];
            return (
              <div
                key={q.id}
                className="row"
                role="listitem"
                style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem' }}
              >
                <span className="row-index">{String(currentAxis * 4 + qi + 1).padStart(2, '0')}</span>
                <span className="row-body" style={{ width: '100%' }}>
                  <span className="row-title" style={{ display: 'block', marginBottom: '0.75rem' }}>
                    {q.prompt}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                    {q.answers.map((a) => {
                      const isSelected = selected === a.stage;
                      return (
                        <button
                          key={a.stage}
                          onClick={() => handleAnswer(q.id, a.stage)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.7rem 1rem',
                            background: isSelected ? 'var(--signal)' : 'var(--surface)',
                            color: isSelected ? 'var(--paper)' : 'var(--ink)',
                            border: `1px solid ${isSelected ? 'var(--signal)' : 'var(--line)'}`,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            textAlign: 'left',
                            transition: 'all 0.2s var(--ease, cubic-bezier(0.22,0.61,0.36,1))',
                            width: '100%',
                          }}
                          className="maturity-option"
                        >
                          <span style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '6px',
                            background: isSelected ? 'var(--paper)' : 'var(--line)',
                            color: isSelected ? 'var(--signal)' : 'var(--muted-dim)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}>
                            {a.stage}
                          </span>
                          <span>{a.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </span>
              </div>
            );
          })}
        </div>

        {/* Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '2rem',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={handlePrev}
            disabled={currentAxis === 0}
            className="button ghost"
            style={{ fontSize: '0.85rem', opacity: currentAxis === 0 ? 0.4 : 1, cursor: currentAxis === 0 ? 'default' : 'pointer' }}
          >
            ← Previous axis
          </button>

          {currentAxis < AXES.length - 1 ? (
            <button
              onClick={handleNext}
              disabled={axisAnsweredCount < 4}
              className="button primary"
              style={{ fontSize: '0.85rem', opacity: axisAnsweredCount < 4 ? 0.5 : 1 }}
            >
              Next axis →
            </button>
          ) : (
            <button
              onClick={handleSeeResults}
              disabled={!allAnswered}
              className="button primary"
              style={{ fontSize: '0.85rem', opacity: !allAnswered ? 0.5 : 1 }}
              data-cuelume-press="sparkle"
              data-firework="true"
            >
              See results →
            </button>
          )}
        </div>

        {/* Axis quick-nav */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginTop: '1.5rem',
          flexWrap: 'wrap',
        }}>
          {AXES.map((a, i) => {
            const aScore = axisScore(answers, a.id);
            const isComplete = QUESTIONS.filter((q) => q.axis === a.id).every((q) => answers[q.id] !== undefined);
            return (
              <button
                key={a.id}
                onClick={() => setCurrentAxis(i)}
                style={{
                  padding: '0.4rem 0.75rem',
                  background: i === currentAxis ? 'var(--signal)' : 'var(--surface)',
                  color: i === currentAxis ? 'var(--paper)' : 'var(--muted)',
                  border: `1px solid ${i === currentAxis ? 'var(--signal)' : isComplete ? 'var(--ok)' : 'var(--line)'}`,
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.2s var(--ease, cubic-bezier(0.22,0.61,0.36,1))',
                }}
                title={a.label}
              >
                {a.symbol}{isComplete && ' ✓'}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Results phase ──────────────────────────────────────────────────────────

  const overallStage = stageFromScore(overall);
  const weakestAxis = scores.indexOf(Math.min(...scores.filter((s) => s > 0)));
  const strongestAxis = scores.indexOf(Math.max(...scores));

  return (
    <div className="maturity-results">
      {/* Overall score + radar */}
      <div style={{
        display: 'flex',
        gap: '2.5rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: '2rem',
        padding: '1.5rem',
        background: 'var(--surface)',
        borderRadius: 'var(--radius, 12px)',
        border: '1px solid var(--line)',
      }}>
        <MaturityRadar scores={scores} />

        <div style={{ flex: '1 1 300px' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.5rem' }}>
            Overall compliance maturity
          </p>
          <p style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--ink)', margin: '0 0 0.25rem' }}>
            {overall > 0 ? overall : '—'}<span style={{ fontSize: '1rem', color: 'var(--muted-dim)' }}>/100</span>
          </p>
          <p style={{
            fontSize: '1rem',
            fontWeight: 600,
            color: STAGE_COLORS[overallStage],
            margin: '0 0 1rem',
          }}>
            Stage {overallStage} — {STAGE_LABELS[overallStage]}
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
            {overall >= 75
              ? 'Your design system is in the Verified stage — compliance is measured, enforced, and continuously tracked. The next step is ensuring no drift: run the deterministic 40-check engine against your live site.'
              : overall >= 50
              ? 'Your design system is Systematic — the foundations are in place but not yet enforced deterministically. The gap between “documented” and “enforced” is where most systems lose compliance.'
              : overall >= 25
              ? 'Your design system is Emerging — some practices exist but they are not yet systematic or enforced. The highest-leverage move is defining the token layer and adding a reduced-motion block.'
              : 'Your design system is in the Ad-hoc stage — compliance is not yet measured or enforced. Start with tokens: define a --paper surface variable and a duration scale at :root.'}
          </p>

          {scores.some((s) => s > 0) && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              <div style={{
                padding: '0.6rem 1rem',
                background: 'var(--paper)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
              }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' }}>
                  Strongest axis
                </p>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ok)', margin: 0 }}>
                  {AXES[strongestAxis]?.label} · {scores[strongestAxis]}/100
                </p>
              </div>
              <div style={{
                padding: '0.6rem 1rem',
                background: 'var(--paper)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
              }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' }}>
                  Weakest axis
                </p>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--error)', margin: 0 }}>
                  {AXES[weakestAxis]?.label} · {scores[weakestAxis]}/100
                </p>
              </div>
            </div>
          )}

          {/* CTA: Verify with Designesy */}
          <Link
            href="/score"
            className="button primary"
            style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            data-cuelume-press="sparkle"
            data-firework="true"
          >
            Verify your compliance with Designesy →
          </Link>
        </div>
      </div>

      {/* Per-axis breakdown */}
      <div className="row-stack" role="list" style={{ marginTop: '1.5rem' }}>
        {AXES.map((axis, i) => {
          const score = scores[i];
          const stage = stageFromScore(score);
          const axisQuestions = QUESTIONS.filter((q) => q.axis === axis.id);
          const answeredCount = axisQuestions.filter((q) => answers[q.id] !== undefined).length;

          return (
            <div
              key={axis.id}
              className="row"
              role="listitem"
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}
            >
              <span className="row-index">{axis.symbol}</span>
              <span className="row-body" style={{ width: '100%' }}>
                <span className="row-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span>{axis.label}</span>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: STAGE_COLORS[stage],
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    {answeredCount > 0 ? `${score} · ${STAGE_LABELS[stage]}` : 'Not answered'}
                  </span>
                </span>
                <span className="row-meta">
                  {axis.description} · <span style={{ color: 'var(--muted-dim)' }}>{axis.categories}</span>
                </span>
                {/* Mini bar */}
                <div style={{ height: '4px', background: 'var(--line)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.5rem', width: '100%' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${score}%`,
                      background: STAGE_COLORS[stage],
                      transition: 'width 0.6s var(--ease, cubic-bezier(0.22,0.61,0.36,1))',
                    }}
                  />
                </div>
              </span>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginTop: '2rem',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              const encoded = encodeAnswers(answers);
              if (encoded) {
                navigator.clipboard?.writeText(`${window.location.origin}/maturity#r=${encoded}`);
              }
            }
          }}
          className="button ghost"
          style={{ fontSize: '0.85rem' }}
          data-cuelume-hover="tick"
          data-cuelume-press="tick"
        >
          Copy share link
        </button>
        <button
          onClick={handleRestart}
          className="button ghost"
          style={{ fontSize: '0.85rem' }}
        >
          Retake assessment
        </button>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted-dim)', marginLeft: 'auto' }}>
          Results are computed in your browser and never sent to a server.
        </span>
      </div>

      {/* Privacy note */}
      <p style={{ fontSize: '0.75rem', color: 'var(--muted-dim)', marginTop: '1.5rem', textAlign: 'center' }}>
        This is a self-assessment — your answers are self-reported, not verified.
        For a deterministic score, run the 40-check engine at{' '}
        <Link href="/score" style={{ color: 'var(--signal)' }}>/score</Link>.
      </p>
    </div>
  );
}