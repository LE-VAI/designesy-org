/**
 * Designesy Accessibility Contract v0.1.0 — machine-readable form.
 * Sibling contract governing axe-core 4.12.1 + WCAG 2.2 AA accessibility verification.
 * Source: D:\DESIGNESY\docs\designesy\contracts\designesy-a11y.v0.md
 *
 * This is the machine export. The human page is at /contracts/a11y.
 * The contract markdown is the source of truth; this JSON is derived.
 */

export const a11yContract = {
  id: 'designesy.a11y',
  version: '0.1.0',
  status: 'provisional',
  name: 'Designesy Accessibility Contract',
  kind: 'contract' as const,
  public_url: 'https://www.designesy.org/contracts/a11y',
  machine_url: 'https://www.designesy.org/contracts/a11y.json',
  full_contract_path: 'D:\\DESIGNESY\\docs\\designesy\\contracts\\designesy-a11y.v0.md',
  updated: '2026-07-28',
  purpose:
    'Accessibility is structural — it shapes the first version, not the last audit. This contract makes that principle machine-checkable.',
  source_authority: {
    primary: 'axe-core 4.12.1 (Deque Systems)',
    wcag: 'W3C WCAG 2.2 (W3C Recommendation, 2023-10-05)',
    act_rules: 'W3C Accessibility Conformance Testing — act-rules.github.io',
    internal: 'designesy-core.v0.3.md §6 (Inclusion Is Structural), §17 (Verification)',
    browser_driver: '@axe-core/playwright 4.12.1',
    cli: '@axe-core/cli 4.12.1 — axe ruleset --wcag22 exports ruleset JSON',
  },
  conformance: {
    level: 'WCAG 2.2 Level AA (includes all A and AA from WCAG 2.0, 2.1, 2.2)',
    axe_tag: 'wcag22aa (includes wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22a, wcag22aa)',
    ruleset_export_command: 'axe ruleset --wcag22 designesy-a11y-ruleset.json',
    rules_in_scope: '~75+ rules covering color contrast, keyboard, ARIA, forms, headings, landmarks, language, motion, target size',
    brand_customization: {
      branding: { brand: 'designesy', application: 'designesy-a11y' },
      checks: [
        { id: 'color-contrast', options: { contrastRatio: { normal: { expected: 4.5 }, large: { expected: 3.0 } } } },
        { id: 'has-lang', options: { attributes: ['lang', 'xml:lang', 'hreflang'] } },
      ],
      rules: [
        { id: 'color-contrast', enabled: true },
        { id: 'region', enabled: false, reason: 'Designesy uses semantic landmarks directly' },
        { id: 'target-size', enabled: true, reason: 'WCAG 2.2 new rule — 24x24px minimum' },
      ],
      disableOtherRules: false,
    },
    runtime: {
      browser_execution: '@axe-core/playwright runs axe in real Chromium browser via Playwright (primary, complete path)',
      static_reference: 'Exported ruleset JSON is a pure-data artifact — usable for contracts/docs without running axe',
      server_side: 'axe cannot run server-side without a DOM. jsdom lacks layout — visual rules incomplete. Use Playwright headless.',
    },
    provenance_chain: 'axe rule → ACT rule ID → WCAG success criterion → WCAG principle → remediation hint',
  },
  verification: {
    checks: [
      { id: 'a01', item: 'No WCAG 2.2 AA violations (axe-core wcag22aa ruleset)', pass: '0 violations', fail: 'Any violation' },
      { id: 'a02', item: 'Color contrast passes AA 4.5:1 (normal), 3:1 (large)', pass: 'All pass', fail: 'Any fail' },
      { id: 'a03', item: 'Keyboard navigation: tab order, focus-visible, no keyboard traps', pass: 'All pass', fail: 'Any fail' },
      { id: 'a04', item: 'ARIA correctness: roles, labels, required children', pass: 'All pass', fail: 'Any fail' },
      { id: 'a05', item: 'Form labels and error identification', pass: 'All pass', fail: 'Any fail', na: 'No forms' },
      { id: 'a06', item: 'Heading hierarchy (h1 → h2 → h3, no skipped levels)', pass: 'Correct', fail: 'Skipped level' },
      { id: 'a07', item: 'Landmarks present (main, nav, footer)', pass: 'Present', fail: 'Missing' },
      { id: 'a08', item: 'Target Size Minimum 2.5.8 (24x24px or spacing exception)', pass: 'All pass', fail: 'Any fail' },
      { id: 'a09', item: 'Focus Not Obscured 2.4.11 (focused element not hidden)', pass: 'All pass', fail: 'Any fail' },
      { id: 'a10', item: 'prefers-reduced-motion disables animations (core §16.8)', pass: 'Present', fail: 'Missing' },
      { id: 'a11', item: 'No ATLAS naming on public surfaces (brand boundary)', pass: 'Clean', fail: 'Found' },
    ],
    scoring: '11 checks. PASS=1, WARN=0.5, FAIL=0, N/A=excluded. Score = (points/applicable) × 100. A≥90, B≥80, C≥70, D≥60, F<60.',
    validation_tools: {
      primary: "@axe-core/playwright 4.12.1 — AxeBuilder({ page }).withTags(['wcag2a','wcag21aa','wcag22aa']).analyze()",
      cli: "@axe-core/cli — axe --tags wcag2a,wcag21aa,wcag22aa <url>",
      designesy_specific: 'a10, a11 require custom validator in ATLAS adapter',
    },
  },
  relationship_to_core: {
    '§6 Inclusion Is Structural': 'Machine-checkable expression of that principle',
    '§6 Affordance Should Be Felt': 'a03, a09 — keyboard focus and focus-visible are affordance verification',
    '§8.1 Color tokens': 'a02 — contrast verification against token color values',
    '§17 Verification': 'Accessibility verification layer',
    '§16.8 Reduced-motion': 'a10 — verifies the motion contract reduced-motion requirement',
  },
  open_questions: [
    'Server-side execution: CDP (existing infrastructure) vs Playwright (axe native driver)?',
    'AAA targeting: which WCAG 2.2 AAA criteria should Designesy target selectively?',
    'BridgePCA: adopt as contrast algorithm, or keep WCAG 2.2 with documented deviation?',
    'Accessibility floor: raise from 60% to 70%?',
    'Second-source triangulation: run IBM Equal Access Checker alongside axe?',
  ],
} as const;