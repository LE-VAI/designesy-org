/**
 * Designesy Labs — machine-readable data for the three published labs.
 * Source: design-system-contract.ts adopted sections + lab page content.
 *
 * Each lab is a design experiment that compiled into contract rules.
 * This module provides the machine export for each lab.
 */
export const labs = {
  poise: {
    id: 'poise',
    kind: 'lab',
    number: 'One',
    title: 'Poise',
    version: '0.1',
    status: 'live',
    adopted_in_contract: '0.1.1',
    thesis: 'Make contact feel intentional without spectacle.',
    principle: 'If the response is louder than the action, it fails.',
    human_url: 'https://www.designesy.org/labs/poise',
    machine_url: 'https://www.designesy.org/labs/poise.json',
    contract_rules: [
      'Wordmark mark may use opacity breath only; never blur, glow, or gradient decoration',
      'Interactive press settle: scale(0.97) at ~160ms with --ease-out',
      'Sound preference key designesy:sound; Designesy owns preference; audio engine only applies it',
      'Reduced motion disables non-essential animation and defaults sound off',
      'Hover translation only under fine pointer + hover-capable media',
      'Public product names stay human and premium; internal token names may differ',
      'If the response is louder than the action, it fails',
    ],
    verification: [
      'https://www.designesy.org/labs/poise',
      'https://www.designesy.org/review/poise',
      'https://www.designesy.org/review/poise/keyboard',
    ],
    field_check: {
      outcome: 'pass with notes',
      url: 'https://www.designesy.org/review/poise',
    },
  },
  takt: {
    id: 'takt',
    kind: 'lab',
    number: 'Two',
    title: 'Takt',
    version: '0.1',
    status: 'live',
    adopted_in_contract: '0.1.2',
    thesis: 'Interface feel — concentric radii, press scale, image outlines, hit areas, stagger rhythm.',
    principle: 'Feel is structure: radius, scale, outline, hit area, and timing are design decisions, not afterthoughts.',
    human_url: 'https://www.designesy.org/labs/takt',
    machine_url: 'https://www.designesy.org/labs/takt.json',
    contract_rules: [
      'Concentric border radius: outerRadius = innerRadius + padding on every nested pair',
      'Press scale 0.96 on cells and buttons; 0.985 on cards and rows — never below 0.95',
      'Image outlines: 1px at 0.1 opacity, pure black in light mode, pure white in dark mode — never tinted neutrals',
      'Minimum hit area: 44px for touch, 40px for desktop — extend with pseudo-element when needed',
      'Stagger enter animations: ~80–100ms per semantic chunk; skip animation on page load',
      'Soften exits: small fixed translateY, softer than enter — no full-height collapse',
      'Never use transition: all — every transition names its specific properties',
      'Spare will-change: only transform, opacity, or filter — only when a stutter was observed',
    ],
    verified_against:
      'Live CSS audit (47,680 bytes) — all transitions, scales, will-change, radii, outlines parsed',
    verification: [
      'https://www.designesy.org/labs/takt',
      'https://www.designesy.org/review/takt',
    ],
    unverified: [
      'Image outline rule — no image surfaces on designesy.org yet',
      'Mobile hit area 44px — desktop 40px confirmed only',
    ],
    field_check: {
      outcome: 'pass with notes',
      url: 'https://www.designesy.org/review/takt',
    },
  },
  cadence: {
    id: 'cadence',
    kind: 'lab',
    number: 'Three',
    title: 'Cadence',
    version: '0.1',
    status: 'live',
    adopted_in_contract: '0.1.3',
    thesis: 'Text rhythm — font smoothing, rem scale, line-height by role, tracking by size, measure, text-wrap, tabular numbers, selection.',
    principle: 'Typography is the interface. Every typographic decision is a structural decision.',
    human_url: 'https://www.designesy.org/labs/cadence',
    machine_url: 'https://www.designesy.org/labs/cadence.json',
    contract_rules: [
      'Font smoothing on root: -webkit-font-smoothing: antialiased + -moz-osx-font-smoothing: grayscale',
      'Rem-based scale: every text size is a rem multiple of the 16px root — never px',
      'Line-height by role: headings 1.05–1.1, body 1.5–1.6, display 1 — never a single global line-height',
      'Tracking by size: negative for headings (-0.02 to -0.04em), positive for labels (0.03–0.18em), zero for body',
      'Cap the measure: body text 520–580px max, layout shell 1080px — text wider than 75ch loses readers',
      'Wrap deliberately: text-wrap: balance on headings, text-wrap: pretty on body',
      'Tabular numbers: font-variant-numeric: tabular-nums for all data, stats, and numerical tables',
      'Selection: ::selection styled with a token color — never default browser blue',
      'user-select: none on UI chrome (buttons, labels, meta) — body text stays selectable',
      '16px input floor on mobile — inputs never below 16px to avoid iOS auto-zoom',
      'No decorative display fonts: system stack is the contract for public UI',
    ],
    verified_against:
      'Live CSS audit (48,755 bytes) — font smoothing, line-heights, letter-spacing, text-wrap, tabular-nums, ::selection, user-select, rem scale, font-synthesis, text-underline-position, text-decoration-skip-ink, logical inline properties all parsed',
    verification: [
      'https://www.designesy.org/labs/cadence',
      'https://www.designesy.org/review/cadence',
    ],
    unverified: [
      'Block-axis logical properties (margin-block-start/end) not yet migrated — only inline-axis done',
      'border-left decorative accents not yet migrated to border-inline-start — visual regression risk needs testing',
      'inset left/right positioning not yet migrated to inset-inline — absolute positioning needs case-by-case review',
    ],
    field_check: {
      outcome: 'pass with notes',
      url: 'https://www.designesy.org/review/cadence',
    },
  },
} as const;