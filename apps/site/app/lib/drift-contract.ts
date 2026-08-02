/**
 * Designesy Drift Contract v0.1.0 — machine-readable form.
 * Sibling contract governing AI-generated UI drift detection.
 * Source: Designesy research 2026-08-01 (Superdesign, DLS Lead, Codexical).
 *
 * The four documented 2026 drift failure modes:
 *   1. Token fabrication — using token names that don't exist in the declared contract
 *   2. Within-session drift — spacing/color values changing across pages in one session
 *   3. Between-session amnesia — values from a previous session not reused
 *   4. Silent breaking changes — values changed without version bump
 *
 * This is the machine export. The human page is at /contracts/drift.
 */

export const driftContract = {
  id: 'designesy.drift',
  version: '0.1.0',
  status: 'provisional',
  name: 'Designesy Drift Contract',
  kind: 'contract' as const,
  public_url: 'https://www.designesy.org/contracts/drift',
  machine_url: 'https://www.designesy.org/contracts/drift.json',
  updated: '2026-08-01',
  purpose:
    'Drift is the named 2026 design-system crisis: AI-generated UI drifts off-contract in four documented ways. This contract defines the checks that detect drift deterministically from compiled CSS, not from prose advice.',
  source_authority: {
    primary: 'Designesy design intelligence research 2026-08-01',
    drift_modes: 'Superdesign / DLS Lead / Codexical — four-mode drift taxonomy',
    scale_signal: 'OverlayQA — ~160 visual issues per AI-generated app (Jason Arbon, 1000+ checks)',
    drift_rate: 'Figma 2025 — 23% design-system drift in 8 weeks without formal review vs 4% with it',
    internal: 'designesy-core.v0.4.0 — extends token + motion verification to drift detection',
  },
  conformance: {
    four_drift_modes: [
      { mode: 'token_fabrication', description: 'var() references to custom properties not declared in :root — the model invents token names that look real but have no definition' },
      { mode: 'within_session_drift', description: 'Same semantic value (spacing, color, radius) uses different raw values across pages within a single build session' },
      { mode: 'between_session_amnesia', description: 'Values established in a previous session are not reused — the model re-derives from scratch and produces a different result' },
      { mode: 'silent_breaking_changes', description: 'Token values changed without version bump — downstream consumers inherit the change without signal' },
    ],
    detection_method:
      'Fetch the URL HTML + all linked CSS. Extract :root custom property declarations and all var() references. Compare declared tokens against referenced tokens. Measure value variance across declarations for spacing, color, radius, shadow, and timing.',
  },
  verification: {
    checks: [
      { id: 'd01', item: 'Token registry declared — :root has ≥5 custom properties', pass: 'Token registry found with N custom properties', fail: 'No :root custom property declarations detected — the site has no token system' },
      { id: 'd02', item: 'No fabricated tokens — all var() references resolve to :root declarations', pass: 'All var() references resolve', fail: 'N var() references to undeclared custom properties — token fabrication detected', warn: '1-2 undeclared references (may be third-party or fallback chains)' },
      { id: 'd03', item: 'Inline color values minimized — raw hex/rgb replaced by token references', pass: '≤5 inline color values found (N color tokens available)', fail: '>20 inline color values — color system bypassed', warn: '6-20 inline color values — partial token adoption' },
      { id: 'd04', item: 'Spacing values cluster on a scale — padding/margin values follow a system', pass: 'Spacing values cluster on ≤6 distinct steps', fail: '>15 distinct spacing values — no spacing scale', warn: '7-15 distinct spacing values — loose scale' },
      { id: 'd05', item: 'Color values consistent — same semantic role uses the same value', pass: 'Color values consistent across declarations', fail: 'Same semantic color used with N different raw values — color drift', warn: '2-3 variants of a semantic color detected' },
      { id: 'd06', item: 'Font-family consistent — single font stack or documented system', pass: '≤2 distinct font-family stacks', fail: '>4 distinct font-family stacks — typography drift', warn: '3-4 distinct font-family stacks' },
      { id: 'd07', item: 'Border-radius values cluster — consistent radii or documented scale', pass: 'Border-radius values cluster on ≤4 distinct radii', fail: '>8 distinct border-radius values — radius drift', warn: '5-8 distinct border-radius values' },
      { id: 'd08', item: 'Shadow values consistent — shadow tokens or inline', pass: '≤3 distinct box-shadow values', fail: '>6 distinct box-shadow values — shadow drift', warn: '4-6 distinct box-shadow values' },
      { id: 'd09', item: 'Transition duration/easing consistent — motion tokens or scattered', pass: 'Transition durations cluster on ≤4 distinct values', fail: '>8 distinct transition durations — motion drift', warn: '5-8 distinct transition durations' },
      { id: 'd10', item: 'Z-index values within a sane range — no chaos', pass: 'All z-index values within 0-100', fail: 'Z-index values exceed 100 or scatter across >10 levels — stacking chaos', warn: 'Z-index values reach 50-100' },
      { id: 'd11', item: 'Undeclared custom property ratio — % of var() calls with no :root definition', pass: '<5% undeclared var() references', fail: '>20% undeclared — widespread token fabrication', warn: '5-20% undeclared — moderate fabrication' },
      { id: 'd12', item: 'Token alias chains resolve — var(--x, var(--y)) chains don\'t dangle', pass: 'All alias chains resolve to a declared value', fail: 'N alias chains reference undeclared tokens — dangling references', warn: '1-2 dangling alias chains' },
    ],
    scoring: '12 checks. PASS=1, WARN=0.5, FAIL=0. Score = (points/12) × 100. A≥90, B≥80, C≥70, D≥60, F<60.',
    validation_tools: {
      primary: 'Designesy drift engine — CSS extraction + var() reference analysis',
      method: 'Fetch HTML + linked CSS, extract :root declarations and var() calls, compute variance',
      browser_only: 'None — all 12 checks are static CSS/HTML analysis, no browser needed',
    },
  },
  relationship_to_core: {
    '§8 Tokens': 'Drift extends token verification from format conformance (tokens contract) to usage conformance',
    '§6 Economy Is Intelligence': 'Fewer, stronger tokens = less drift surface',
    '§6 Systems Enable Freedom': 'A declared token system is the freedom boundary; drift is the violation',
  },
  open_questions: [
    'Between-session amnesia (mode 3) requires historical snapshots — the current engine detects within-page drift only',
    'Silent breaking changes (mode 4) require version tracking — the current engine detects the current state only',
    'Cross-page drift (mode 2) requires crawling multiple pages — the current engine analyzes the single fetched URL',
    'The engine may flag third-party CSS (analytics, embeds) as fabricated tokens — a suppression list may be needed',
  ],
} as const;