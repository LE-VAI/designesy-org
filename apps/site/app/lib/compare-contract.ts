/**
 * Designesy Compare Contract v0.1.0 — machine-readable form.
 * Sibling contract governing cross-site / cross-version design-token comparison.
 * Source: Adobe token-diff-generator, Tokens Studio diff + codemod,
 *          mint-ds diff, designlang diff_designs,
 *          Designesy research 2026-08-01.
 *
 * Compare fetches two URLs, extracts their :root token systems, and
 * produces a structured diff: tokens added, removed, renamed (heuristic),
 * value-changed, scale-stop-changed, contrast-drift-per-pair, structure
 * delta, and score delta (runs /score on both and diffs).
 *
 * The 2026 token-diff ecosystem is mature at the file level but thin at
 * the URL/contract level. Designesy's premise is URL-scoped contract
 * scoring — compare extends that to URL-scoped contract diffing.
 *
 * This is the machine export. The human page is at /contracts/compare.
 */

export const compareContract = {
  id: 'designesy.compare',
  version: '0.1.0',
  status: 'provisional',
  name: 'Designesy Compare Contract',
  kind: 'contract' as const,
  public_url: 'https://www.designesy.org/contracts/compare',
  machine_url: 'https://www.designesy.org/contracts/compare.json',
  updated: '2026-08-02',
  purpose:
    'Compare is the diff engine: fetch two URLs, extract their :root token systems, and produce a structured diff. "What actually changed between our old token system and the new one?" — answered deterministically from live production URLs, not from file uploads. Also serves as the diff engine inside /monitor (m08 token-set mutation).',
  source_authority: {
    primary: 'Designesy design intelligence research 2026-08-02',
    file_level: 'Adobe token-diff-generator v2.5.3 — detects added/deleted/renamed/deprecated/updated across schema versions',
    hosted: 'Tokens Studio diff + codemod — upload two token files, get a diff + ast-grep migration',
    slug_level: 'designlang diff_designs MCP tool — compares two DESIGN.md brand slugs at the color-token level',
    url_gap: 'No competitor fetches two live URLs, extracts their token contracts, and diffs the contracts — the designesy pattern',
  },
  conformance: {
    diff_method:
      'Fetch both URLs, extract all CSS + :root custom properties from each. Parse token names and values. Compare the two token maps: tokens present in A but not B (added), present in B but not A (removed), present in both with different values (value-changed). Heuristic rename detection: tokens with similar names (Levenshtein distance ≤ 2) and different values are flagged as potential renames. Scale analysis: compare the distinct value sets for spacing, radius, and color to detect scale-stop changes. Optionally run /score on both URLs to compute a score delta.',
    diff_dimensions: [
      { dimension: 'token-added', description: 'Tokens present in URL A but not in URL B — new tokens introduced' },
      { dimension: 'token-removed', description: 'Tokens present in URL B but not in URL A — tokens deleted' },
      { dimension: 'token-renamed', description: 'Tokens with similar names (Levenshtein ≤ 2) but different values — heuristic rename detection' },
      { dimension: 'token-value-changed', description: 'Same token name, different value between A and B — the core drift signal' },
      { dimension: 'scale-stop-changed', description: 'Spacing/radius/color scale steps added or removed — the system grew or shrank' },
      { dimension: 'contrast-drift-per-pair', description: 'For color tokens present in both: did the contrast ratio against a reference background change?' },
      { dimension: 'structure-delta', description: 'Token count, category distribution, and naming convention changes — structural health of the system' },
      { dimension: 'score-delta', description: 'If /score is run on both URLs: the score and grade difference between the two sites' },
    ],
  },
  verification: {
    checks: [
      { id: 'c01', item: 'Both URLs fetched — HTML + CSS extracted from both targets', pass: 'Both URLs fetched successfully with CSS content', fail: 'One or both URLs could not be fetched — check accessibility' },
      { id: 'c02', item: 'Token extraction — :root custom properties captured from both', pass: 'Tokens extracted from both URLs (A: N, B: M)', fail: 'No :root custom properties found in one or both URLs — nothing to compare', warn: 'One URL has significantly fewer tokens than the other — may indicate an incomplete token system' },
      { id: 'c03', item: 'Token-set diff computed — added, removed, value-changed', pass: 'Diff computed: N added, M removed, K value-changed', fail: 'Could not compute diff — token maps are empty or malformed' },
      { id: 'c04', item: 'Rename detection — heuristic name-similarity matching', pass: 'Rename candidates identified (or no renames detected)', fail: 'Rename detection failed — token name parsing error' },
      { id: 'c05', item: 'Scale diff — spacing/radius/color scale-stop comparison', pass: 'Scale diff computed for spacing, radius, and color', fail: 'Could not compute scale diff — insufficient value data' },
      { id: 'c06', item: 'Structure delta — token count and category distribution', pass: 'Structure delta computed (count, categories, naming)', fail: 'Could not compute structure delta — token parsing incomplete' },
      { id: 'c07', item: 'Contrast drift — color pair contrast comparison', pass: 'Contrast drift computed for shared color tokens', fail: 'No shared color tokens between A and B — cannot compute contrast drift', warn: 'Few shared color tokens — contrast drift is partial' },
      { id: 'c08', item: 'Score delta — /score run on both URLs, delta computed', pass: 'Score delta computed (A: score, B: score, delta: diff)', fail: 'Could not run /score on one or both URLs', warn: 'Score delta computed but one or both scores are low — diff may be less meaningful' },
    ],
    scoring: '8 checks. PASS=1, WARN=0.5, FAIL=0. Score = (points/8) × 100. A≥90, B≥80, C≥70, D≥60, F<60. Note: the compare score reflects diff completeness (did the engine produce a full diff), not design quality — design quality is the /score surface. The diff result itself is the product; the score is secondary.',
    validation_tools: {
      primary: 'Designesy compare engine — dual-URL fetch + token extraction + set diff + scale analysis',
      method: 'Fetch both URLs, extract :root tokens, compute set diff (added/removed/renamed/value-changed), compare scales, run /score on both for score delta',
      browser_only: 'None — all checks are static CSS analysis + set operations, no browser needed',
    },
  },
  relationship_to_core: {
    'designesy.org /drift': 'Compare is the diff engine — /drift detects drift in one site, /compare detects drift between two',
    'designesy.org /monitor': 'Compare is the m08 engine — token-set mutation detection reuses the compare diff',
    'designesy.org /score': 'Score delta (c08) runs /score on both URLs and diffs — compare is the only surface that runs score twice',
    '§6 Economy Is Intelligence': 'Fewer tokens = simpler diff = clearer migration path',
  },
  open_questions: [
    'Rename detection (c04) is heuristic — Levenshtein distance ≤ 2 may produce false positives for short token names',
    'Contrast drift (c07) uses WCAG contrast ratio against a fixed reference background — teams with multiple themes need per-theme comparison',
    'Score delta (c08) runs /score on both URLs, which doubles the fetch time — caching is essential',
    'The diff does not detect semantic drift — same value but different role (e.g. --primary changed from blue to red but the role is still "primary")',
    'Cross-origin token comparison may surface third-party CSS tokens (analytics, embeds) as part of the diff — a suppression list may be needed',
  ],
} as const;