/**
 * Designesy Monitor Contract v0.1.5 — machine-readable form.
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
  version: '0.1.5',
  status: 'provisional',
  name: 'Designesy Monitor Contract',
  kind: 'contract' as const,
  public_url: 'https://www.designesy.org/contracts/monitor',
  machine_url: 'https://www.designesy.org/contracts/monitor.json',
  updated: '2026-10-23',
  purpose:
    'Monitor is the governance layer over time: each call re-runs the drift checks on a URL and compares the result with the history the caller passes in, computing deltas against the first snapshot (the baseline) and the one before, so a regression shows on the run it lands. Nothing is scheduled, and the server keeps no history of its own (each result is cached for 24 hours); /monitor keeps the history in your browser.',
  source_authority: {
    primary: 'Designesy design intelligence research 2026-08-01',
    temporal_gap: 'Into Design Systems 2026: "Weekly audits at cents per report. Drift detection without dedicated headcount."',
    drift_shape: 'Cristian Morales Achiardi, Design Systems Collective 2026: "It surfaces the shape of how drift happens, which is the only way to stop it before it compounds."',
    competitor_lane: 'URL-scoped production fetch + design-token-aware checks + trend over the history the caller supplies',
  },
  conformance: {
    monitoring_model:
      'Each call re-executes the 12 drift checks (d01-d12) on the URL and returns a snapshot; the caller keeps it and passes the earlier snapshots back as history on the next call. Deltas are computed against the first snapshot in that history (the baseline): score delta, new violations, resolved violations, token-set mutations, and trend slope across the last 3 runs. Alert when score degrades beyond a threshold or when new violations appear.',
    snapshot_structure: [
      { field: 'url', description: 'The watched URL' },
      { field: 'timestamp', description: 'ISO 8601 run timestamp' },
      { field: 'score', description: '0-100 drift score at this run' },
      { field: 'grade', description: 'A-F letter grade' },
      { field: 'checks', description: 'Array of 12 CheckResult objects (d01-d12)' },
      { field: 'tokensExtracted', description: 'Number of :root custom properties found' },
    ],
    cadence_options: [
      { cadence: 'daily', description: 'Re-scan every 24 hours: for active redesigns' },
      { cadence: 'weekly', description: 'Re-scan every 7 days: the industry default ("weekly audits")' },
      { cadence: 'monthly', description: 'Re-scan every 30 days: for stable production sites' },
    ],
    alert_triggers: [
      { trigger: 'score-degradation', description: 'Score dropped > N points since the previous run (default threshold: 5)' },
      { trigger: 'new-violation', description: 'A check that was PASS/WARN in the previous run is now FAIL' },
      { trigger: 'token-mutation', description: 'Tokens added, removed, or renamed since the baseline (silent breaking changes: drift mode 4)' },
      { trigger: 'grade-drop', description: 'Letter grade fell (e.g. A → B) since the previous run' },
    ],
    alert_delivery: {
      method: 'In the result: alerts[] lists every alert condition that fired on the run, and /monitor shows them with the run',
      email: 'Retired in 0.1.5: the monitor sends no email under any setting, and an email field in a request is accepted and ignored; no address is returned',
    },
  },
  verification: {
    checks: [
      { id: 'm01', item: 'History supplied: the request carries earlier runs to compare against (nothing is scheduled or stored server-side)', pass: 'At least one earlier run supplied', fail: 'n/a', na: 'No history: drift needs a previous run; a first run sets the baseline and is not scored here' },
      { id: 'm02', item: 'Last run fresh: the newest supplied run is within the cadence window (the request names daily, weekly or monthly; weekly by default)', pass: 'Newest run is within one cadence window', fail: 'Newest run is more than two cadence windows old (the watch may have stopped)', warn: 'Newest run is between one and two cadence windows old (a run was missed)', na: 'No history, or no usable timestamp on the newest run: nothing to measure the gap from' },
      { id: 'm03', item: 'Drift delta vs baseline: score change since first run', pass: 'Score is stable or improved vs baseline', fail: 'Score degraded significantly vs baseline', warn: 'Score slipped slightly vs baseline' },
      { id: 'm04', item: 'Drift trend slope: 3-run trajectory', pass: 'Trend is flat or improving over the last 3 runs', fail: 'Trend is regressing over the last 3 runs', warn: 'Trend is flat but score is low' },
      { id: 'm05', item: 'New violations since last run: checks that newly fail', pass: 'No new violations since the previous run', fail: 'N checks newly failed since the previous run', warn: '1 check newly warned since the previous run' },
      { id: 'm06', item: 'Resolved since last run: checks that newly pass', pass: 'N checks newly passed since the previous run (the system is healing)', fail: 'No checks resolved since the previous run', warn: '1 check improved from FAIL to WARN' },
      { id: 'm07', item: 'Score degradation threshold: alert if score drops > N points', pass: 'Score drop within threshold since previous run', fail: 'Score dropped beyond the alert threshold (alert fired)' },
      { id: 'm08', item: 'Token-set mutation: tokens added/removed/renamed since baseline', pass: 'Token set is stable vs baseline', fail: 'Token set mutated; tokens added, removed, or renamed (silent breaking changes)', warn: '1-2 token changes since baseline' },
      { id: 'm09', item: 'Contract version drift: the design contract version this run is scored against (the version designesy_score reports) changed since last run', pass: 'No contract version change detected', fail: 'Contract version changed since last run (verify the change is intentional)', warn: 'Contract metadata changed (not version)' },
      { id: 'm10', item: 'Alert delivered: retired in 0.1.5. Alerts are returned in the result (alerts[]), and the monitor sends no email', pass: 'n/a: m10 is not scored', fail: 'n/a: m10 never fails', na: 'Every run: alerts are returned in the response; email delivery was retired' },
    ],
    scoring: '10 checks. PASS=1, WARN=0.5, FAIL=0; SKIP is not scored: m10 on every run (email delivery was retired in 0.1.5), and m01 and m02 on a first run. Score = (points / scored checks) × 100. A≥90, B≥80, C≥70, D≥60, F<60. Note: the monitor score reflects governance health (is the watch working, is the site stable) rather than design quality, which is the /score surface.',
    validation_tools: {
      primary: 'Designesy monitor engine: on-demand re-scan + caller-supplied history + delta computation',
      method: 'Re-run the 12 drift checks on each call, compute deltas vs the baseline and the previous run in the history passed in, fire alerts on threshold breach',
      browser_only: 'None: all checks are static CSS analysis + snapshot diffing, no browser needed',
    },
  },
  relationship_to_core: {
    'designesy.org /drift': 'Monitor is /drift + caller-supplied history + delta computation: the temporal layer over the drift radar',
    'designesy.org /score': 'Score is the onboarding run; monitor is the retention loop',
    'designesy.org /guardrails': 'Guardrails emits the fix; monitor verifies the fix held',
    '§6 Systems Enable Freedom': 'A watched system is the freedom boundary maintained over time',
  },
  open_questions: [
    'Snapshot storage is client-side (localStorage) in v0.1.0: production monitoring needs server-side persistence (database or KV store)',
    'Alert delivery past the response: since 0.1.5 the monitor sends no email and m10 is not scored. A caller that wants a notification runs the monitor on its own schedule and forwards alerts[]; mail from the monitor would need a recipient who confirmed it, and the server keeps no addresses',
    'Scheduled cadence (daily/weekly/monthly) requires a cron runner (Vercel Cron Jobs): v0.1.0 monitors on manual trigger only',
    'Cross-page drift (drift mode 2) requires crawling multiple pages: the monitor checks the single URL it is given',
    'The 3-run trend slope (m04) needs 3 snapshots: the first 2 runs will show insufficient data',
    'Contract version drift (m09) reports the design contract version a run is scored against; snapshots do not record it yet, so a change between runs is stated rather than compared (until v0.1.1 m09 read the scanned site agent.json version, which on designesy.org is the catalog version)',
  ],
} as const;