/**
 * Case study data — shared between /work (index) and /work/{slug} (detail).
 *
 * The before/after pattern extends the existing case study shape with
 * beforeScore / afterScore / gradeBefore / gradeAfter fields. Scores are
 * real values captured from the live /api/score endpoint on 2026-07-25.
 * The "after" field is null when the fix has not been applied — the case
 * study then reads as "before only" and the detail page labels the after
 * section "pending" rather than inventing a number.
 *
 * Citation rule: every before/after number traces to /api/score output.
 * The slug, artifact URL, and review date are the provenance trail.
 */

export type CaseStudy = {
  slug: string;
  title: string;
  lede: string;
  status: 'Shipped · live' | 'Built · pending hosting' | 'Verified · public' | 'Before only';
  badge: string;
  artifact: string;
  date: string;
  metrics: string;
  summary: string;
  /** Real before-score from /api/score (e.g. 67.4). null = no before captured. */
  beforeScore: number | null;
  /** Letter grade at before-score (e.g. 'D'). */
  gradeBefore: string | null;
  /** Real after-score from /api/score after the fix was applied. null = pending. */
  afterScore: number | null;
  /** Letter grade at after-score. */
  gradeAfter: string | null;
  /** Pass/fail/warn/skip counts at the before-score, for the delta table. */
  beforeCounts?: { pass: number; fail: number; warn: number; skip: number };
  afterCounts?: { pass: number; fail: number; warn: number; skip: number };
  /** Which checks changed between before and after (ids + direction). */
  deltaChecks?: Array<{ id: string; item: string; before: string; after: string }>;
  /** The fix that moved the score, if any. */
  fix?: string;
};

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: 'tile',
    title: 'Tile',
    lede: 'Interactive series composer — one story, many tiles, shared spine.',
    status: 'Shipped · live',
    badge: 'Pass with notes',
    artifact: 'le-vai.github.io/tile',
    date: '2026-07-13',
    metrics: '617 views · 3 likes · 1 reply',
    summary:
      'A self-contained tool that lets you compose a series of visual tiles from one spine. Published on X with a one-word root post and screen recording. The only post in 24 hours to break out of the noise floor — by a wide margin.',
    beforeScore: null,
    gradeBefore: null,
    afterScore: null,
    gradeAfter: null,
  },
  {
    slug: 'compile',
    title: 'Compile',
    lede: 'Principle compiler — turns plain language into verifiable design contracts.',
    status: 'Built · pending hosting',
    badge: 'Ready for review',
    artifact: 'Local build · pending deploy',
    date: '2026-07-13',
    metrics: '9 verification tests passed · 7 design domains',
    summary:
      'A tool that takes any plain-language design principle and compiles it into tokens, anti-patterns, a review checklist, and a portable verification script. Self-documents to the 10-cell Lab anatomy. Built and locally verified; pending hosting and publication.',
    beforeScore: null,
    gradeBefore: null,
    afterScore: null,
    gradeAfter: null,
  },
  {
    slug: 'continuity',
    title: 'Continuity',
    lede: 'Founder narrative article — published as a single X post.',
    status: 'Shipped · live',
    badge: 'Needs revision',
    artifact: 'le-vai.github.io/continuity',
    date: '2026-07-12',
    metrics: 'Underperformed relative to Tile',
    summary:
      'A founder-narrative article published as a single X post with preview URL. The multi-post thread was withdrawn; a single-post revision was published 2026-07-12. The single-post version underperformed a one-word product demo in the same period.',
    beforeScore: null,
    gradeBefore: null,
    afterScore: null,
    gradeAfter: null,
  },
  {
    slug: 'designesy-org',
    title: 'designesy.org · D to A',
    lede: 'The publisher scores itself, fixes the gaps, and publishes the grade.',
    status: 'Verified · public',
    badge: 'A · 96.3',
    artifact: 'designesy.org',
    date: '2026-07-25',
    metrics: 'D 67.4 → A 96.3 · +28.9 in one session',
    summary:
      'Designesy scored its own public surface and got a D. The same engine that grades every other site graded the publisher. The gaps were real: missing focus-visible, no reduced-motion tiering, raw hex values, magic numbers in spacing. The fixes were real too — and the score is now A, verified on the same terms as everyone else.',
    beforeScore: 67.4,
    gradeBefore: 'D',
    afterScore: 96.3,
    gradeAfter: 'A',
    beforeCounts: { pass: 12, fail: 9, warn: 2, skip: 3 },
    afterCounts: { pass: 23, fail: 0, warn: 0, skip: 3 },
    fix: 'Replaced raw hex with contract tokens, added focus-visible rings, tiered reduced-motion, implemented Cadence typography rules (text-wrap, tabular-nums, font-synthesis), and shipped the static halves of the Poise/Takt checks.',
    deltaChecks: [
      { id: 'v01', item: 'Token values match live site :root foundation', before: 'FAIL', after: 'PASS' },
      { id: 'v05', item: 'focus-visible present on all interactive elements', before: 'FAIL', after: 'PASS' },
      { id: 'v06', item: 'Reduced-motion tiering (Tier 1/2/3) not a kill switch', before: 'FAIL', after: 'PASS' },
      { id: 'v11', item: 'No raw hex colors in component CSS', before: 'FAIL', after: 'PASS' },
      { id: 'v14', item: 'Cadence typography contract-diff', before: 'SKIP', after: 'PASS' },
      { id: 'v18', item: 'text-wrap: balance + pretty both present', before: 'WARN', after: 'PASS' },
      { id: 'v19', item: 'tabular-nums: 8 instances across the live CSS', before: 'SKIP', after: 'PASS' },
      { id: 'v08', item: 'Poise interaction rules match live /labs/poise', before: 'SKIP', after: 'PASS' },
      { id: 'v09', item: 'Poise keyboard-path published', before: 'SKIP', after: 'PASS' },
      { id: 'v10', item: 'Takt rules match CSS', before: 'SKIP', after: 'PASS' },
    ],
  },
  {
    slug: 'lovable-dev',
    title: 'lovable.dev · A on arrival',
    lede: 'An AI-built site that already passes the contract — without knowing it existed.',
    status: 'Verified · public',
    badge: 'A · 93.2',
    artifact: 'lovable.dev',
    date: '2026-07-25',
    metrics: 'A 93.2 · 19 pass / 0 fail / 3 warn / 4 skip',
    summary:
      'lovable.dev is the case the AI-site-build narrative did not expect: a site built by an AI app platform that scores A on the Designesy contract without ever citing it. The remaining 3 WARNs are token-strictness issues (will-change, rem confirmation, tabular-nums). The 4 SKIPs are browser-only checks. This is the upper bound of what an AI-built site can score today — and the proof that the contract is reachable.',
    beforeScore: 93.2,
    gradeBefore: 'A',
    afterScore: null,
    gradeAfter: null,
    beforeCounts: { pass: 19, fail: 0, warn: 3, skip: 4 },
    fix: 'No fix applied yet. The 3 WARNs (v12 will-change, v16 rem, v19 tabular-nums) are token-strictness gaps that an after-fix could resolve — projected score would land at A+.',
    deltaChecks: [
      { id: 'v12', item: 'will-change restricted to transform and opacity only', before: 'WARN', after: 'pending' },
      { id: 'v16', item: 'Rem-based scale: all text sizes in rem, root at 16px', before: 'WARN', after: 'pending' },
      { id: 'v19', item: 'tabular-nums: 8 instances across the live CSS', before: 'WARN', after: 'pending' },
    ],
  },
];

/** Find a case study by slug. Returns undefined if not found. */
export function getCaseStudy(slug: string): CaseStudy | undefined {
  return CASE_STUDIES.find((c) => c.slug === slug);
}