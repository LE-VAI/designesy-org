/**
 * Designesy Report Contract v0.1.0 — machine-readable form.
 * The synthesis capstone — one URL in, three engines fired in parallel,
 * one unified design-intelligence report with a composite grade.
 *
 * Report is the top of the dynasty arc:
 *   /score (audit) → /drift (regression) → /readiness (machine-readiness)
 *   → /guardrails (prevention) → /monitor (continuous) → /compare (diff)
 *   → /report (synthesis)
 *
 * Source: Designesy design intelligence research 2026-08-02.
 *
 * This is the machine export. The human page is at /contracts/report.
 */

export const reportContract = {
  id: 'designesy.report',
  version: '0.1.0',
  status: 'provisional',
  name: 'Designesy Report Contract',
  kind: 'contract' as const,
  public_url: 'https://www.designesy.org/contracts/report',
  machine_url: 'https://www.designesy.org/contracts/report.json',
  updated: '2026-08-02',
  purpose:
    'Report is the synthesis capstone: fetch one URL, run score + drift + readiness in parallel, and produce a unified design-intelligence report with a single composite grade. One input, one output, one grade — the most shareable surface in the dynasty. Where /score answers "how good is this design", /drift answers "is AI breaking it", and /readiness answers "can agents use it", /report answers all three at once.',
  source_authority: {
    primary: 'Designesy design intelligence research 2026-08-02',
    composition: 'Weighted synthesis of three independent Designesy engines — /score (40-check audit), /drift (12-check drift radar), /readiness (10-check AI readiness). Each engine is independently validated; report composes their results.',
    weighting: 'Composite score = score × 0.5 + drift × 0.3 + readiness × 0.2. Score is weighted highest because it is the broadest quality measure; drift is second because AI-generated UI drift is the 2026 crisis; readiness is third because machine-readiness is emergent and still maturing.',
    shareability: 'Report is designed as the share hook — "here is your design-intelligence report" is more compelling than "run these six tools". One grade, one URL, one page.',
    url_gap: 'No competitor synthesizes audit + drift + readiness into a single composite report from a live URL — the designesy pattern.',
  },
  conformance: {
    method:
      'Fetch the target URL once. Fire /api/score, /api/drift, and /api/readiness in parallel (Promise.all). Each engine independently fetches the URL, extracts CSS + tokens, and runs its own checks. Collect the three results. Compute a composite score using the weighted formula: score × 0.5 + drift × 0.3 + readiness × 0.2. Derive a composite grade from the composite score. Aggregate all checks across the three engines into a single check list. Surface the three sub-scores, the composite score, the composite grade, and the full check inventory.',
    weighting: [
      { dimension: 'score', weight: 0.5, description: '40-check design-intelligence audit — the broadest quality measure (tokens, typography, motion, accessibility, anti-generic, runtime)' },
      { dimension: 'drift', weight: 0.3, description: '12-check AI-generated UI drift radar — token fabrication, value variance, off-contract patterns' },
      { dimension: 'readiness', weight: 0.2, description: '10-check AI readiness — machine-readable tokens, llms.txt, agent.json, MCP, DESIGN.md, sitemap' },
    ],
    composite_formula: 'compositeScore = round(score × 0.5 + drift × 0.3 + readiness × 0.2). compositeGrade from compositeScore: A≥90, B≥80, C≥70, D≥60, F<60.',
    synthesis_checks: 62,
  },
  verification: {
    checks: [
      { id: 'rp01', item: 'Target URL fetched and validated', pass: 'URL is a public http(s) URL and was accepted by the guard', fail: 'URL is invalid, private, or blocked by the SSRF guard' },
      { id: 'rp02', item: 'Score engine completed — 40-check audit ran', pass: 'Score engine returned a result with a score and grade', fail: 'Score engine failed or timed out — the audit did not complete', warn: 'Score engine returned but with SKIP checks — partial result' },
      { id: 'rp03', item: 'Drift engine completed — 12-check drift radar ran', pass: 'Drift engine returned a result with a score and grade', fail: 'Drift engine failed or timed out — the drift radar did not complete' },
      { id: 'rp04', item: 'Readiness engine completed — 10-check readiness probe ran', pass: 'Readiness engine returned a result with a score and grade', fail: 'Readiness engine failed or timed out — the readiness probe did not complete' },
      { id: 'rp05', item: 'Composite score computed — weighted synthesis', pass: 'Composite score computed from all three sub-scores using the weighting formula', fail: 'Composite score could not be computed — one or more sub-scores are missing', warn: 'Composite score computed from partial results — one or more engines returned no score' },
      { id: 'rp06', item: 'Composite grade derived', pass: 'Composite grade derived from the composite score (A–F)', fail: 'Composite grade could not be derived — composite score is missing' },
      { id: 'rp07', item: 'Check inventory aggregated — all checks across engines collected', pass: 'All checks from score, drift, and readiness collected into a single inventory', fail: 'Check aggregation failed — engine results are malformed' },
      { id: 'rp08', item: 'Report is coherent — no engine contradicts the composite', pass: 'No engine score is more than 30 points from the composite — the grade is defensible', fail: 'One or more engine scores are more than 30 points from the composite — the grade is not defensible', warn: 'One engine score is 20–30 points from the composite — the grade is borderline' },
    ],
    scoring: '8 synthesis checks (rp01–rp08). The composite score is NOT derived from these checks — it is the weighted average of the three sub-engine scores. These checks verify the synthesis itself ran correctly. PASS=1, WARN=0.5, FAIL=0. Composite grade: A≥90, B≥80, C≥70, D≥60, F<60.',
    validation_tools: {
      primary: 'Designesy report engine — parallel /score + /drift + /readiness with weighted synthesis',
      method: 'Fire three internal API calls in parallel, collect results, compute composite score, derive composite grade, aggregate checks',
      browser_only: 'None — all checks are server-side API composition, no browser needed',
    },
  },
  relationship_to_core: {
    'designesy.org /score': 'Report runs /score as its primary sub-engine (weight 0.5) — the 40-check audit is the backbone of the composite',
    'designesy.org /drift': 'Report runs /drift as its second sub-engine (weight 0.3) — drift radar feeds the composite',
    'designesy.org /readiness': 'Report runs /readiness as its third sub-engine (weight 0.2) — readiness feeds the composite',
    'designesy.org /guardrails': 'Report does not run guardrails — guardrails emits a build contract, not a score; it is a companion, not a sub-engine',
    'designesy.org /monitor': 'Report is a single-point snapshot; /monitor tracks the snapshot over time',
    'designesy.org /compare': 'Report scores one URL; /compare diffs two — report is the input to compare',
    '§6 Economy Is Intelligence': 'One report replaces three separate scans — fewer steps, clearer signal',
  },
  open_questions: [
    'The weighting (0.5/0.3/0.2) is a design decision, not a measured optimum — it may need tuning as the three engines mature at different rates',
    'Report fires three internal API calls, each of which fetches the target URL independently — the target site sees three fetches per report, which may trigger rate limits on strict origins',
    'The coherence check (rp08) flags divergence but does not resolve it — a site that scores A on tokens but F on drift gets a C composite, which may mislead',
    'Report does not include guardrails or monitor — a future v0.2 could add a 4th weight for guardrail conformance',
    'The composite grade is a single letter — it hides the sub-engine grades; the report UI must surface all three alongside the composite',
  ],
} as const;