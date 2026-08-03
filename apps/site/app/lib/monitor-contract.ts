/**
 * Designesy Monitor Contract v0.1.0 — machine-readable form.
 * Sibling contract governing continuous design-drift monitoring.
 * Source: Into Design Systems 2026 (Morales Achiardi / Enara),
 *          Design Systems Collective 2026, Lollypop agentic governance,
 *          Designesy research 2026-08-01.
 *
 * The monitor layer turns every prior snapshot surface (/score, /drift,
 * /readiness, /guardrails) into a watched series. It is the temporal layer:
 * "Did this site's design legitimacy hold since the last check?"
 *
 * Every existing designesy surface is a snapshot. The 2026 industry is
 * explicit that the next layer is temporal — "weekly audits at cents per
 * report, drift detection without dedicated headcount" (Into Design Systems
 * 2026). The arc's next word is persistence.
 *
 * This is the machine export. The human page is at /contracts/monitor.
 */

export const monitorContract = {
  id: 'designesy.monitor',
  version: '0.1.0',
  status: 'provisional',
  name: 'Designesy Monitor Contract',
  kind: 'contract' as const,
  public_url: 'https://www.designesy.org/contracts/monitor',
  machine_url: 'https://www.designesy.org/contracts/monitor.json',
  updated: '2026-08-01',
  purpose:
    'Monitor is the continuous-governance layer: re-score a URL on a cadence, store snapshots, compute drift deltas against the baseline, and surface regressions before they compound. Every prior designesy surface is a snapshot — monitor turns them into a watched series.',
  source_authority: {
    primary: 'Designesy design intelligence research 2026-08-01',
    temporal_gap: 'Into Design Systems 2026 — "weekly audits at cents per report, drift detection without dedicated headcount"',
    drift_shape: 'Design Systems Collective 2026 (Enara) — "the system surfaces the shape of how drift happens, the only way to stop it before it compounds"',
    compounding: 'Lollylop 2026 — "visual bugs are invisible to code reviews, every sprint adds a little more, drift catches it before it compounds"',
    competitor_lane: 'Designesy 2026 scan — no competitor combines URL-scoped production fetch + design-token-aware checks + scheduled cadence + trend-over-time',
  },
  conformance: {
    monitoring_model:
      'Register a URL + cadence (daily/weekly/monthly). On each run, re-execute the 12 drift checks (d01-d12) and store a snapshot. Compute deltas against the first-run baseline: score delta, new violations, resolved violations, token-set mutations, and trend slope across the last 3 runs. Alert when score degrades beyond a threshold or when new violations appear.',
    snapshot_structure: [
      { field: 'url', description: 'The watched URL' },
      { field: 'timestamp', description: 'ISO 8601 run timestamp' },
      { field: 'score', description: '0-100 drift score at this run' },
      { field: 'grade', description: 'A-F letter grade' },
      { field: 'checks', description: 'Array of 12 CheckResult objects (d01-d12)' },
      { field: 'tokensExtracted', description: 'Number of :root custom properties found' },
    ],
    cadence_options: [
      { cadence: 'daily', description: 'Re-scan every 24 hours — for active redesigns' },
      { cadence: 'weekly', description: 'Re-scan every 7 days — the industry default ("weekly audits")' },
      { cadence: 'monthly', description: 'Re-scan every 30 days — for stable production sites' },
    ],
    alert_triggers: [
      { trigger: 'score-degradation', description: 'Score dropped > N points since the previous run (default threshold: 5)' },
      { trigger: 'new-violation', description: 'A check that was PASS/WARN in the previous run is now FAIL' },
      { trigger: 'token-mutation', description: 'Tokens added, removed, or renamed since the baseline (silent breaking changes — drift mode 4)' },
      { trigger: 'grade-drop', description: 'Letter grade fell (e.g. A → B) since the previous run' },
    ],
    alert_delivery: {
      method: 'Email via Resend (transactional email service)',
      trigger: 'When any alert condition fires AND the monitor request includes an email address AND RESEND_API_KEY is set as a Vercel env var',
      from: 'monitor@designesy.org',
      format: 'HTML email with score, delta, alert details, and link to full report',
      fallback: 'Without email or key, alerts are surfaced in-UI only (graceful degradation — no feature loss)',
    },
  },
  verification: {
    checks: [
      { id: 'm01', item: 'Schedule registered — URL + cadence recorded', pass: 'Monitor registered with cadence and alert target', fail: 'No monitor registered — the URL is not being watched' },
      { id: 'm02', item: 'Last run fresh — ran within the cadence window', pass: 'Last run is within the cadence window', fail: 'Last run is stale — the monitor may have stopped', warn: 'Last run is near the edge of the cadence window' },
      { id: 'm03', item: 'Drift delta vs baseline — score change since first run', pass: 'Score is stable or improved vs baseline', fail: 'Score degraded significantly vs baseline', warn: 'Score slipped slightly vs baseline' },
      { id: 'm04', item: 'Drift trend slope — 3-run trajectory', pass: 'Trend is flat or improving over the last 3 runs', fail: 'Trend is regressing over the last 3 runs', warn: 'Trend is flat but score is low' },
      { id: 'm05', item: 'New violations since last run — checks that newly fail', pass: 'No new violations since the previous run', fail: 'N checks newly failed since the previous run', warn: '1 check newly warned since the previous run' },
      { id: 'm06', item: 'Resolved since last run — checks that newly pass', pass: 'N checks newly passed since the previous run — the system is healing', fail: 'No checks resolved since the previous run', warn: '1 check improved from FAIL to WARN' },
      { id: 'm07', item: 'Score degradation threshold — alert if score drops > N points', pass: 'Score drop within threshold since previous run', fail: 'Score dropped beyond the alert threshold — alert fired' },
      { id: 'm08', item: 'Token-set mutation — tokens added/removed/renamed since baseline', pass: 'Token set is stable vs baseline', fail: 'Token set mutated — tokens added, removed, or renamed (silent breaking changes)', warn: '1-2 token changes since baseline' },
      { id: 'm09', item: 'Contract version drift — the site own DTCG/agent.json changed since last run', pass: 'No contract version change detected', fail: 'Contract version changed since last run — verify the change is intentional', warn: 'Contract metadata changed (not version)' },
      { id: 'm10', item: 'Alert delivered — email fired on threshold breach', pass: 'Alert delivered to the registered email address via Resend', fail: 'Alert could not be delivered — check the email address or RESEND_API_KEY', warn: 'Alert surfaced in-UI only — no email provided or Resend key not set' },
    ],
    scoring: '10 checks. PASS=1, WARN=0.5, FAIL=0. Score = (points/10) × 100. A≥90, B≥80, C≥70, D≥60, F<60. Note: the monitor score reflects governance health (is the watch working, is the site stable), not design quality — design quality is the /score surface.',
    validation_tools: {
      primary: 'Designesy monitor engine — scheduled re-scan + snapshot storage + delta computation',
      method: 'Re-run the 12 drift checks on cadence, store snapshots, compute deltas vs baseline and previous run, fire alerts on threshold breach',
      browser_only: 'None — all checks are static CSS analysis + snapshot diffing, no browser needed',
    },
  },
  relationship_to_core: {
    'designesy.org /drift': 'Monitor is /drift + a scheduler + a snapshot store + delta computation — the temporal layer over the drift radar',
    'designesy.org /score': 'Score is the onboarding run; monitor is the retention loop',
    'designesy.org /guardrails': 'Guardrails emits the fix; monitor verifies the fix held',
    '§6 Systems Enable Freedom': 'A watched system is the freedom boundary maintained over time',
  },
  open_questions: [
    'Snapshot storage is client-side (localStorage) in v0.1.0 — production monitoring needs server-side persistence (database or KV store)',
    'Email alerting (m10) requires RESEND_API_KEY env var + verified sending domain (monitor@designesy.org) — without the key, alerts surface in-UI only',
    'Scheduled cadence (daily/weekly/monthly) requires a cron runner (Vercel Cron Jobs) — v0.1.0 monitors on manual trigger only',
    'Cross-page drift (drift mode 2) requires crawling multiple pages — the monitor currently watches the single registered URL',
    'The 3-run trend slope (m04) needs 3 snapshots — the first 2 runs will show insufficient data',
    'Contract version drift (m09) probes for agent.json version field — not all sites expose one',
  ],
} as const;