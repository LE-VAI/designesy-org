'use client';

// Interactive Design Compliance Maturity self-assessment.
//
// 6 axes × 4 questions = 24 questions. Each answer = stage 1–4.
// A stage matrix (six axes, four stages) fills as you answer and carries
// the result. Shareable via URL hash (base64).
// CTA: "Score your compliance with Designesy" → /score (wording aligned
// 2026-09-24 with the destination page, which is named Score, not Verify).
//
// All state is client-side. No data is sent to any server.

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
// The step keys use the control surface's key (.eg-bar-go) on their own.
import '../lib/engine/command-bar.css';
import { bringIntoView, userJustActed } from '../lib/engine/bring-into-view';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';

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
    label: 'Token discipline',
    symbol: 'T',
    description: 'Are design tokens defined, structured, and enforced?',
    categories: 'tokens, spec',
    contractWeight: '13% of contract',
  },
  {
    id: 'motion',
    label: 'Motion consistency',
    symbol: 'M',
    description: 'Are duration, easing, and interaction feel tokenized and applied?',
    categories: 'motion, takt',
    contractWeight: '18% of contract',
  },
  {
    id: 'a11y',
    label: 'Accessibility readiness',
    symbol: 'A',
    description: 'WCAG conformance, focus visibility, reduced-motion tiering.',
    categories: 'accessibility, interaction',
    contractWeight: '21% of contract',
  },
  {
    id: 'platform',
    label: 'Platform fit',
    symbol: 'P',
    description: 'Core Web Vitals, responsive, interaction poise across devices.',
    categories: 'performance, responsive, poise',
    contractWeight: '16% of contract',
  },
  {
    id: 'identity',
    label: 'Identity and copy',
    symbol: 'I',
    description: 'Semantic landmarks, UX copy discipline, security hygiene.',
    categories: 'identity, copywriting, security',
    contractWeight: '19% of contract',
  },
  {
    id: 'verification',
    label: 'Verification maturity',
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
      { stage: 1, label: 'Hardcoded values in CSS, no custom properties' },
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
      { stage: 1, label: 'No, backgrounds are raw hex or rgb values' },
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
      { stage: 1, label: 'It isn’t: developers hardcode values as they go' },
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
      { stage: 1, label: 'No, tokens live only in CSS' },
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
      { stage: 1, label: 'No, all motion plays whatever the user prefers' },
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
      { stage: 1, label: 'No: will-change: all, or no will-change at all' },
      { stage: 2, label: 'will-change used but on non-composited properties' },
      { stage: 3, label: 'will-change restricted to transform/opacity on animated elements only' },
      { stage: 4, label: 'Linted in CI: will-change on non-composited properties is blocked' },
    ],
  },

  // ── Accessibility Readiness ──
  {
    id: 'a1',
    axis: 'a11y',
    prompt: 'How is color contrast verified?',
    answers: [
      { stage: 1, label: 'Eyeballed, with no automated check' },
      { stage: 2, label: 'Manual axe-core or browser extension checks during QA' },
      { stage: 3, label: 'APC contrast checks in CI (Lc 75 body min / Lc 90 preferred / Lc 60 non-body)' },
      { stage: 4, label: 'Automated WCAG 2.2 AA scan in CI + contrast tokens with computed Lc values' },
    ],
  },
  {
    id: 'a2',
    axis: 'a11y',
    prompt: 'Are :focus-visible rings declared?',
    answers: [
      { stage: 1, label: 'No focus styles: outline: none with nothing in its place' },
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
      { stage: 1, label: 'Not tracked: we find out from user complaints' },
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
      { stage: 1, label: 'No, browser defaults apply (fake bold and italic possible)' },
      { stage: 2, label: 'font-synthesis: none on body, but not on headings' },
      { stage: 3, label: 'font-synthesis: none + text-rendering: optimizeLegibility + font-smoothing' },
      { stage: 4, label: 'Full cadence stack in CI: font-synthesis, text-wrap, tabular-nums, selection styling, skip-ink' },
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
      { stage: 1, label: 'Inconsistent: “Click Here”, “Submit”, trailing periods, ALL CAPS' },
      { stage: 2, label: 'Mostly verb-phrase buttons, but some “Click Here” links remain' },
      { stage: 3, label: 'Verb-phrase buttons, no trailing periods, descriptive link text, no ALL CAPS' },
      { stage: 4, label: 'Copy linted in CI: button verbs, link text, trailing periods and ALL CAPS all enforced' },
    ],
  },
  {
    id: 'i3',
    axis: 'identity',
    prompt: 'Do you check for Unicode security (homoglyph) issues in token names?',
    answers: [
      { stage: 1, label: 'Never heard of it, so no checks' },
      { stage: 2, label: 'Aware of it but no automated check' },
      { stage: 3, label: 'UTS #39 confusable detection run during builds' },
      { stage: 4, label: 'UTS #39 confusable detection in CI blocks Cyrillic and Greek homoglyph shadowing' },
    ],
  },
  {
    id: 'i4',
    axis: 'identity',
    prompt: 'Do you serve a DESIGN.md spec file for AI coding tools?',
    answers: [
      { stage: 1, label: 'No DESIGN.md or equivalent spec file' },
      { stage: 2, label: 'A README or wiki page with some design guidelines' },
      { stage: 3, label: 'A DESIGN.md file at the repo root with tokens, components, motion specs' },
      { stage: 4, label: 'DESIGN.md, llms.txt and agent.json, so AI tools build from your system instead of around it' },
    ],
  },

  // ── Verification Maturity ──
  {
    id: 'v1',
    axis: 'verification',
    prompt: 'How do you verify design-system compliance?',
    answers: [
      { stage: 1, label: 'We don’t: “it looks right” is the bar' },
      { stage: 2, label: 'Manual design reviews before launch' },
      { stage: 3, label: 'Automated linter (stylelint, eslint) in CI for token usage' },
      { stage: 4, label: `Deterministic ${ENGINE_CHECK_COUNT}-check engine, Designesy or an equivalent, scores every shipped surface` },
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
      { stage: 4, label: 'Full cadence stack (12 checks) linted in CI: smoothing, rem, line-height, text-wrap, tabular-nums, selection, font-synthesis, skip-ink' },
    ],
  },
  {
    id: 'v3',
    axis: 'verification',
    prompt: 'Do you measure compliance drift over time?',
    answers: [
      { stage: 1, label: 'No, we have no baseline to drift from' },
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
      { stage: 1, label: 'No, they guess from the existing code' },
      { stage: 2, label: 'They can read the docs and ask in Slack' },
      { stage: 3, label: 'They can run npx <tool> locally to score their branch' },
      { stage: 4, label: 'CI runs the contract check on every PR and fails it when the score drops below the threshold' },
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

// The stage is the average answer rounded to the nearest whole stage, as the
// method on the page says. This used >= 25 / 50 / 75 bands, which sent every
// tie up a stage: an axis answered 3, 3, 3, 3 (score 75) read as stage 4,
// "Verified", and 2, 2, 2, 2 read as "Systematic".
function stageFromScore(score: number): 1 | 2 | 3 | 4 {
  return Math.min(4, Math.max(1, Math.round(score / 25))) as 1 | 2 | 3 | 4;
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

// ── Stage matrix ────────────────────────────────────────────────────────────
// Six axes, four stages each, drawn as one register per axis: the cells up to
// the axis's stage light in that stage's tone. Six values compared side by
// side, with one scale: the job a radar does badly (its area exaggerates the
// larger values, and the eye reads shape before position).

type Tone = 'fail' | 'warn' | 'pass';
const STAGE_TONE: Record<number, Tone> = { 1: 'fail', 2: 'warn', 3: 'pass', 4: 'pass' };

function StageMatrix({
  answers,
  current,
  onPick,
}: {
  answers: Record<string, number>;
  current?: number;
  onPick?: (axis: number) => void;
}) {
  return (
    <ol className="mt-matrix" aria-label="Stage per axis">
      {AXES.map((axis, i) => {
        const qs = QUESTIONS.filter((q) => q.axis === axis.id);
        const answered = qs.filter((q) => answers[q.id] !== undefined).length;
        const score = axisScore(answers, axis.id);
        const stage = answered ? stageFromScore(score) : 0;
        const label = answered
          ? `${axis.label}: stage ${stage}, ${STAGE_LABELS[stage]}, ${score} of 100${answered < 4 ? `, ${answered} of 4 answered` : ''}`
          : `${axis.label}: not answered`;
        const body = (
          <>
            <span className="mt-row-name">
              {axis.label}
              <small>{answered < 4 ? `${answered} of 4` : axis.contractWeight}</small>
            </span>
            <span className="mt-cells" aria-hidden="true">
              {[1, 2, 3, 4].map((s) => (
                <i key={s} className="mt-cell" data-tone={s <= stage ? STAGE_TONE[stage] : undefined} />
              ))}
            </span>
            <span className="mt-row-score">{answered ? score : ''}</span>
          </>
        );
        return (
          <li key={axis.id}>
            {onPick ? (
              <button
                type="button"
                className="mt-row"
                aria-current={current === i ? 'step' : undefined}
                aria-label={`${label}. Go to this axis.`}
                onClick={() => onPick(i)}
              >
                {body}
              </button>
            ) : (
              <div className="mt-row" role="img" aria-label={label}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const STAGE_READING: Record<number, (n: number) => string> = {
  4: (n) => `Verified: compliance is measured, enforced and tracked. Next, keep it there: run the ${n}-check engine against the live site on every release.`,
  3: () => 'Systematic: the foundations are in place and written down, and enforcement is still by hand. Most systems lose compliance in the gap between documented and enforced.',
  2: () => 'Emerging: practices exist, and none of them is enforced yet. Define the token layer and a reduced-motion block first; both pay off on every axis.',
  1: () => 'Ad-hoc: nothing is measured or enforced yet. Start with tokens: one surface variable and a duration scale at :root.',
};

export function MaturityAssessment() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<'quiz' | 'results'>('quiz');
  const [currentAxis, setCurrentAxis] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const handleAnswer = useCallback((questionId: string, stage: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: stage }));
  }, []);

  const axisQuestions = useMemo(() => QUESTIONS.filter((q) => q.axis === AXES[currentAxis]?.id), [currentAxis]);
  const axisAnsweredCount = axisQuestions.filter((q) => answers[q.id] !== undefined).length;
  const allAnswered = QUESTIONS.every((q) => answers[q.id] !== undefined);
  const totalAnswered = QUESTIONS.filter((q) => answers[q.id] !== undefined).length;
  const scores = useMemo(() => AXES.map((a) => axisScore(answers, a.id)), [answers]);
  const overall = useMemo(() => overallScore(answers), [answers]);

  // A step swaps its content in place, above wherever the visitor tapped:
  // on a phone the next axis's first question landed 800px above the screen,
  // and the result 400px above. Bring the new step's start into view and put
  // focus on its heading (a screen reader starts reading there), but not on
  // first load or when a shared result link opens on the result.
  const bench = useRef<HTMLDivElement | null>(null);
  const stepHeading = useRef<HTMLHeadingElement | null>(null);
  const shown = useRef({ axis: currentAxis, phase });
  useEffect(() => {
    const before = shown.current;
    shown.current = { axis: currentAxis, phase };
    if ((before.axis === currentAxis && before.phase === phase) || !userJustActed()) return;
    bringIntoView(bench.current);
    stepHeading.current?.focus({ preventScroll: true });
  }, [currentAxis, phase]);

  function showResults() {
    setPhase('results');
    const encoded = encodeAnswers(answers);
    if (encoded) window.history.replaceState(null, '', `#r=${encoded}`);
  }

  function restart() {
    setAnswers({});
    setPhase('quiz');
    setCurrentAxis(0);
    window.history.replaceState(null, '', window.location.pathname);
  }

  async function copyLink() {
    const encoded = encodeAnswers(answers);
    if (!encoded) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/maturity#r=${encoded}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard refused */
    }
  }

  // Arrow keys move and select within one question (APG radio group).
  function optionKeys(e: React.KeyboardEvent, q: Question, at: number) {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    let next = at;
    if (e.key in keys) next = (at + keys[e.key] + q.answers.length) % q.answers.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = q.answers.length - 1;
    else return;
    e.preventDefault();
    handleAnswer(q.id, q.answers[next].stage);
    const group = (e.currentTarget as HTMLElement).parentElement;
    (group?.children[next] as HTMLElement | undefined)?.focus();
  }

  const matrixPanel = (interactive: boolean) => (
    <section className="eg-inst mt-panel" aria-label="Maturity matrix">
      <div className="eg-inst-bar">
        <span className="eg-inst-app">
          <i className="eg-mark" aria-hidden="true"><i /></i>
          Maturity matrix
        </span>
        <span className="eg-inst-target" aria-hidden="true" />
        <span className="eg-inst-state">
          {totalAnswered} of {QUESTIONS.length} answered
        </span>
      </div>
      <div className="mt-panel-body">
        <StageMatrix answers={answers} current={interactive ? currentAxis : undefined} onPick={interactive ? setCurrentAxis : undefined} />
      </div>
      <div className="eg-legend">
        <ul aria-label="Stages">
          <li><i className="mt-cell" data-tone="fail" aria-hidden="true" />1 ad-hoc</li>
          <li><i className="mt-cell" data-tone="warn" aria-hidden="true" />2 emerging</li>
          <li><i className="mt-cell" data-tone="pass" aria-hidden="true" />3 systematic, 4 verified</li>
        </ul>
        <span>axis = average answer × 25</span>
      </div>
    </section>
  );

  if (phase === 'quiz') {
    const axis = AXES[currentAxis];
    return (
      <div className="eg-bench" ref={bench}>
        <div className="mt-grid">
          <section className="mt-quiz" aria-labelledby="mt-axis-h">
            <p className="mt-axis-meta">
              Axis {currentAxis + 1} of {AXES.length} · {axis.categories} · {axis.contractWeight}
            </p>
            {/* h2: the one heading inside the tool, directly under the page h1. */}
            <h2 className="eg-h2" id="mt-axis-h" tabIndex={-1} ref={stepHeading}>{axis.label}</h2>
            <p className="mt-axis-desc">{axis.description}</p>

            <ol className="mt-questions">
              {axisQuestions.map((q, qi) => {
                const selected = answers[q.id];
                const at = Math.max(0, q.answers.findIndex((a) => a.stage === selected));
                return (
                  <li className="mt-q" key={q.id}>
                    <p className="mt-q-prompt" id={`mt-q-${q.id}`}>
                      <span className="mt-q-num">{String(currentAxis * 4 + qi + 1).padStart(2, '0')}</span>
                      {q.prompt}
                    </p>
                    <div className="mt-options" role="radiogroup" aria-labelledby={`mt-q-${q.id}`}>
                      {q.answers.map((a, ai) => {
                        const on = selected === a.stage;
                        return (
                          <button
                            key={a.stage}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            tabIndex={ai === at ? 0 : -1}
                            className="mt-opt"
                            onClick={() => handleAnswer(q.id, a.stage)}
                            onKeyDown={(e) => optionKeys(e, q, ai)}
                          >
                            {/* The stage digit is decoration: the radio group already says
                                "option N of 4", and reading the digit made the name start "1 No". */}
                            <span className="mt-opt-stage" aria-hidden="true">{a.stage}</span>
                            <span>{a.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-nav">
              <button type="button" className="eg-share-btn" onClick={() => setCurrentAxis(currentAxis - 1)} disabled={currentAxis === 0}>
                Previous axis
              </button>
              {currentAxis < AXES.length - 1 ? (
                <button
                  type="button"
                  className="eg-bar-go"
                  onClick={() => setCurrentAxis(currentAxis + 1)}
                  aria-disabled={axisAnsweredCount < 4}
                  data-cuelume-press="tick"
                >
                  {axisAnsweredCount < 4 ? `Answer ${4 - axisAnsweredCount} more` : 'Next axis'}
                </button>
              ) : (
                <button
                  type="button"
                  className="eg-bar-go"
                  onClick={() => allAnswered && showResults()}
                  aria-disabled={!allAnswered}
                  data-cuelume-press="sparkle"
                >
                  {allAnswered ? 'See the matrix' : `${QUESTIONS.length - totalAnswered} questions left`}
                </button>
              )}
            </div>
          </section>

          <div className="mt-side">{matrixPanel(true)}</div>
        </div>
      </div>
    );
  }

  const overallStage = stageFromScore(overall);
  const answeredScores = scores.filter((s) => s > 0);
  const weakest = scores.indexOf(Math.min(...answeredScores));
  const strongest = scores.indexOf(Math.max(...scores));

  return (
    <div className="eg-bench" ref={bench}>
      <div className="mt-grid is-results">
        <div className="mt-side">{matrixPanel(false)}</div>
        <section className="mt-reading" aria-labelledby="mt-result-h">
          <span className="eg-label">Overall, self-assessed</span>
          <h2 className="mt-overall" id="mt-result-h" tabIndex={-1} ref={stepHeading}>
            <span className="eg-grade">{overall > 0 ? overall : 0}</span>
            <span className="mt-overall-stage">
              Stage {overallStage}, {STAGE_LABELS[overallStage].toLowerCase()}
            </span>
          </h2>
          <p className="eg-side-note">{STAGE_READING[overallStage](ENGINE_CHECK_COUNT)}</p>
          {answeredScores.length > 0 && (
            <dl className="eg-figs">
              <div>
                <dt>Strongest</dt>
                <dd>{scores[strongest]}<small> {AXES[strongest]?.label}</small></dd>
              </div>
              <div>
                <dt>Weakest</dt>
                <dd>{scores[weakest]}<small> {AXES[weakest]?.label}</small></dd>
              </div>
            </dl>
          )}
          <p className="eg-ref-note">
            Self-reported, so unverified. The {ENGINE_CHECK_COUNT}-check engine measures the live site against the same contract.
          </p>
          <div className="mt-actions">
            <Link href="/score" className="eg-bar-go" data-cuelume-press="sparkle">
              Score the live site
            </Link>
            <button type="button" className="eg-share-btn" onClick={copyLink} aria-live="polite">
              {copied ? 'Link copied' : 'Copy the result link'}
            </button>
            <button type="button" className="eg-share-btn" onClick={restart}>
              Start again
            </button>
          </div>
          <p className="eg-quiet">Computed in your browser. Nothing is sent anywhere.</p>
        </section>
      </div>
    </div>
  );
}
