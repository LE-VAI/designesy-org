/**
 * Designesy Labs — machine-readable data for the four published labs.
 * Source: design-system-contract.ts adopted sections + lab page content.
 * For Takt and Cadence, verified_against follows each lab page's Verification
 * section, and unverified carries a row for each rule that section marks fail.
 * Both are newer than the contract's copy.
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
    thesis: 'Interface feel: concentric radii, press scale, image outlines, hit areas, stagger rhythm.',
    principle: 'Feel is structure: radius, scale, outline, hit area, and timing are design decisions from the start.',
    human_url: 'https://www.designesy.org/labs/takt',
    machine_url: 'https://www.designesy.org/labs/takt.json',
    contract_rules: [
      'Concentric border radius: outerRadius = innerRadius + padding on every nested pair',
      'Press scale 0.96 on cells and buttons and 0.985 on cards and rows, never below 0.95',
      'Image outlines: 1px at 0.1 opacity, pure black in light mode, pure white in dark mode (never tinted neutrals)',
      'Minimum hit area: 44px for touch, 40px for desktop (extend with pseudo-element when needed)',
      'Stagger enter animations: ~80 to 100ms per semantic chunk; skip animation on page load',
      'Soften exits: small fixed translateY, softer than enter (no full-height collapse)',
      'Never use transition: all (every transition names its specific properties)',
      'Spare will-change: only transform, opacity, or filter (only when a stutter was observed)',
    ],
    verified_against:
      'The shipped CSS, checked on 2026-11-20 against the rules in the Verification section of the lab page (the field check audited a 47,680-byte stylesheet in July 2026). Pass: concentric radii, all nav links at 40px or more, the stagger demo (four bars, 100ms apart), and the rule against transition: all. Fail: press scale, skip animation on page load, and will-change. Each failed rule has a row under unverified.',
    verification: [
      'https://www.designesy.org/labs/takt',
      'https://www.designesy.org/review/takt',
    ],
    unverified: [
      'Image outline rule: no image surfaces on designesy.org yet',
      'Mobile hit area 44px unverified; desktop 40px confirmed',
      'Press scale fails (checked 2026-11-20). Seven values ship, from 0.995 down to 0.9: check-grid cells press at 0.992, and the small cells on the score page press at 0.9, under the 0.95 floor',
      'Skip animation on page load fails on the lab page (checked 2026-11-20). The header rises and each section fades up once on load',
      'will-change fails (checked 2026-11-20). It stays on for the scroll progress bar, the nav drawer at 720px and below, and the check mark of a checked cell',
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
    thesis: 'Text rhythm: font smoothing, rem scale, line-height by role, tracking by size, measure, text-wrap, tabular numbers, selection.',
    principle: 'Typography is the interface. Every typographic decision is a structural decision.',
    human_url: 'https://www.designesy.org/labs/cadence',
    machine_url: 'https://www.designesy.org/labs/cadence.json',
    contract_rules: [
      'Font smoothing on root: -webkit-font-smoothing: antialiased + -moz-osx-font-smoothing: grayscale',
      'Rem-based scale: every text size is a rem multiple of the 16px root (never px)',
      'Line-height by role: headings 1.05 to 1.1, body 1.5 to 1.6, display 1 (never a single global line-height)',
      'Tracking by size: negative for headings (-0.02 to -0.04em), positive for labels (0.03 to 0.18em), zero for body',
      'Cap the measure: body text 520 to 580px max, layout shell 1080px (text wider than 75ch loses readers)',
      'Wrap deliberately: text-wrap: balance on headings, text-wrap: pretty on body',
      'Tabular numbers: font-variant-numeric: tabular-nums for all data, stats, and numerical tables',
      'Selection: ::selection styled with a token color (never default browser blue)',
      'user-select: none on UI chrome (buttons, labels, meta); body text stays selectable',
      '16px input floor on mobile: inputs never below 16px to avoid iOS auto-zoom',
      'Three faces, no decorative display fonts: Fraunces for headlines, Schibsted Grotesk for interface and reading, Atkinson Hyperlegible Mono for data (amended from the v0.1.3 system-stack rule; the mono face changed in v0.4.5)',
    ],
    verified_against:
      'The shipped CSS, checked on 2026-11-20 against the rules in the Verification section of the lab page (the field check audited a 48,755-byte stylesheet in July 2026). Pass: rem scale, text-wrap, tabular-nums, ::selection, user-select, font-synthesis, text-underline-position, text-decoration-skip-ink, and logical inline properties. Pass with notes: font smoothing (set on body, where the rule names the root), line-height (1.08 on section headings, 1.55 on body, 1.02 on the page title), and tracking by size (checked again on 2026-11-24). Fail: the measure, block-axis logical properties, and border-inline-start. Each failed rule has a row under unverified. Tracking by size: body text is at zero. Counted by value, 8 of the 204 letter-spacing values in the site stylesheets sit outside every range the rule names. Five reach the screen: -0.005em on the input fields and action buttons on the home page and the tool pages, -0.015em on the step titles and -0.01em on the sample logo on the home page, and 0.02em on the contract readout labels wherever the readout pair is narrower than 416px. Three are overridden or unused. Eleven subheads on the contracts page carry -0.005em in their markup. The Studio and Back pill labels sit at zero to match each other, where the rule asks 0.03em or more for a label. Ten heading styles sit at zero: nine at 16px or smaller, and the 20px card titles on three work pages. Some 12.8px labels sit at zero, the Orb lab slider labels among them, and the Copy button on the lab pages carries 0.03em at 16px. The report app and the share card images set -0.01em on large text and sit outside this count.',
    verification: [
      'https://www.designesy.org/labs/cadence',
      'https://www.designesy.org/review/cadence',
    ],
    unverified: [
      'Block-axis logical properties fail (checked 2026-11-20). Partly migrated: padding-block and margin-block are in use, and most block margins and padding are still physical',
      'border-inline-start fails (checked 2026-11-20). It is used once, and the border-left accents are not yet migrated: visual regression risk needs testing',
      'inset left/right positioning partly migrated to inset-inline: absolute positioning needs case-by-case review',
      'Measure fails (checked 2026-11-20). Lab page notes are capped at 660px, about 90 characters a line, and the page shell at 1180px to 1560px. The rule asks 520 to 580px and a 1080px shell',
    ],
    field_check: {
      outcome: 'pass with notes',
      url: 'https://www.designesy.org/review/cadence',
    },
  },
  acoustics: {
    id: 'acoustics',
    kind: 'lab',
    number: 'Four',
    title: 'Acoustics',
    version: '0.1',
    status: 'live',
    adopted_in_contract: '0.3.0',
    thesis: 'Interaction sound as a token system: nineteen cues, nineteen roles, one documented engine.',
    principle: 'If the sound is louder than the action it confirms, it fails.',
    human_url: 'https://www.designesy.org/labs/acoustics',
    machine_url: 'https://www.designesy.org/labs/acoustics.json',
    contract_rules: [
      'Every sound maps to a named token (--cue:role). No unmapped sounds anywhere.',
      'One primary cue family per role. Nav stays tick. Brand stays sparkle. Do not randomize.',
      'Sound is opt-in via a single toggle; store preference in localStorage; default off when prefers-reduced-motion.',
      'Hover sounds fire on fine-pointer only. On touch, map the same hover cue to a single tap.',
      'No focus sounds. Sounds fire on pointer and click, never on focus events.',
      'No ambient audio: interaction-only. No background music, no loading sounds, no mood beds.',
      'Silent fallback when Web Audio is blocked. No errors, no visual degradation.',
      'Reduced motion is an acoustic-reduction proxy. The user can still enable sound manually.',
      'Every cue must trace to a token document. A sound in the markup without a token is a contract violation.',
    ],
    verification: [
      'https://www.designesy.org/labs/acoustics',
      'https://www.designesy.org/acoustic-tokens',
      'https://www.designesy.org/acoustic-tokens.json',
    ],
    engine: 'Cuelume v0.2.2 (MIT, Daniel Belyi)',
    field_check: {
      outcome: 'pass with notes',
      url: 'https://www.designesy.org/review/acoustics',
    },
  },
} as const;