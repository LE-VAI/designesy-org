/**
 * Designesy design system contract v0.4.0 — machine + human source.
 * Values must match the live site token foundation in globals.css :root.
 * When CSS and this file disagree, the live styles win until revised.
 * v0.1.1 adopts Lab One · Poise interaction rules (Commander order 2026-07-12).
 * v0.1.2 adopts Lab Two · Takt interface-feel rules (2026-07-13).
 * v0.1.3 adopts Lab Three · Cadence typography rules (2026-07-13).
 * v0.3.0 adopts duration scale + verification from external source ingests (2026-07-13).
 * v0.3.0 reconciles with on-disk core contract v0.3.0: W3C DTCG token format,
 *   spring physics, full acoustic cue enumeration, 10 non-negotiable motion
 *   standards, motion anti-patterns, entrance scale tokens (2026-07-15).
 * v0.4.0 adds the copywriting section from detail.design gap signal +
 *   NN/g, Polaris, IBM Carbon, Microsoft Fluent, Apple HIG, Atlassian
 *   research (2026-07-30). Codifiable principles become verification checks;
 *   non-codifiable principles are governance.
 */

export const designSystemContract = {
  id: 'designesy.design-system',
  version: '0.4.0',
  status: 'public',
  name: 'Designesy design system',
  public_url: 'https://www.designesy.org/contracts/design-system',
  full_contract_url: 'https://www.designesy.org/contracts#design-system-contract',
  machine_url: 'https://www.designesy.org/contracts/design-system.json',
  updated: '2026-08-01',
  schema_hints: {
    colors: 'primitive + semantic color roles',
    typography: 'type rules and stacks',
    rounded: 'radius tokens',
    spacing: 'layout spacing and breakpoints',
    components: 'behavior and states',
    interaction: 'Poise-adopted contact rules',
    takt: 'Takt-adopted interface-feel rules',
    cadence: 'Cadence-adopted typography rules',
    duration: 'duration scale cross-referenced against transitions.dev',
    motion_standards: 'Ten non-negotiable motion standards (§16)',
    springs: 'Spring physics tokens via custom $type: spring',
    acoustic: 'Acoustic cue tokens via custom $type: sound (net-new vs W3C DTCG)',
    copywriting: 'UX copywriting principles from NN/g, Polaris, Carbon, Fluent, HIG, Krehel /better-writing (v0.4.0)',
  },
  provenance: {
    implementation: 'designesy.org (Next.js App Router)',
    token_source: 'Live site design tokens (:root)',
    doctrine:
      'Designesy design doctrine — public surface carries operational values only',
    motion_references:
      'Short settle and easing language adapted into --ease-out, --ease-in-out, --ease-drawer. Frequency gate, press scale 0.97, and unseen-details-compound principle cross-referenced against Kowalski /emil-design-eng (Linear, ex-Vercel). Spring physics (damping 1.0, response 0.3–0.4) and interruptibility principles cross-referenced against Kowalski /apple-design (Apple WWDC Designing Fluid Interfaces). Anti-over-animation Gate (Frequency, Purpose, Speed, Function) cross-referenced against Kowalski /find-animation-opportunities. Animation authoring — 7-step build sequence, Never Ship table (13 auto-blocks), tool selection hierarchy, and tooltip-instant pattern cross-referenced against Kowalski /animate (the authoring complement to /review-animations).',
    interaction_audio: 'Cuelume v0.2.2; preference owned by Designesy',
    first_lab: {
      name: 'Poise',
      url: 'https://www.designesy.org/labs/poise',
      role: 'Source lab for interaction rules adopted in v0.1.1',
    },
    second_lab: {
      name: 'Takt',
      url: 'https://www.designesy.org/labs/takt',
      role: 'Source lab for interface-feel rules adopted in v0.1.2',
    },
    third_lab: {
      name: 'Cadence',
      url: 'https://www.designesy.org/labs/cadence',
      role: 'Source lab for typography rules adopted in v0.1.3',
    },
    external_ingests: [
      {
        name: 'Amicro',
        author: 'Kiyotaka (@SubhanHQ)',
        url: 'https://amicro.vercel.app',
        role: 'Micro-transitions library — informed Takt stagger and press rules',
      },
      {
        name: 'better-ui skill',
        author: 'Jakub Krehel (@jakubkrehel)',
        url: 'https://github.com/jakubkrehel/skills',
        role: '13 interface polish principles — source for concentric radii, press scale, image outlines, hit areas',
        license: 'MIT',
      },
      {
        name: 'better-typography skill',
        author: 'Jakub Krehel (@jakubkrehel)',
        url: 'https://github.com/jakubkrehel/skills',
        role: '18 typography principles — source for font smoothing, scale, leading, tracking, measure, wrapping, numbers, selection',
        license: 'MIT',
      },
      {
        name: 'agent-skills',
        author: 'Addy Osmani (@addyosmani)',
        url: 'https://github.com/addyosmani/agent-skills',
        role: 'Anti-rationalization table pattern + verification checklist methodology — informed Design Review kit rationalization section',
        license: 'MIT',
      },
      {
        name: 'Taste Skill',
        author: 'Leon (@Leonxlnx)',
        url: 'https://github.com/Leonxlnx/taste-skill',
        role: 'Pre-flight checklist methodology — gap audit against our 8-dimension review; Core Web Vitals and button contrast checks adopted',
        license: 'MIT',
      },
      {
        name: 'transitions.dev',
        author: 'Jakub Antalik (@Jakubantalik)',
        url: 'https://transitions.dev',
        role: 'Transition gallery — duration scale cross-referenced; press scale values validated (0.96/0.97 match); easing curves confirmed compatible. Gallery reference, not a formal standard.',
      },
      {
        name: 'detail.design',
        author: 'detail.design',
        url: 'https://detail.design',
        role: 'Copywriting gap signal — pattern catalog organizing UI decisions by discipline (Design, Accessibility, Copywriting, Motion, Optimization). The Copywriting discipline gap triggered the v0.4.0 contract section. Patterns are inspiration, not contract — the taxonomy structure is the value.',
      },
      {
        name: 'NN/g UI Copy Guidelines',
        author: 'Nielsen Norman Group',
        url: 'https://www.nngroup.com/articles/ui-copy/',
        role: 'Button text 2–4 words, verb-first, remove articles, ellipsis convention, avoid generic OK/Submit. Error message guidelines: what happened + what to do + what to expect. Source for copywriting checks v38–v41.',
      },
      {
        name: 'Polaris Content Guidelines',
        author: 'Shopify',
        url: 'https://polaris.shopify.com/content/error-messages',
        role: 'Error messages: explain what\'s wrong + what to do, be specific, don\'t overapologize, avoid "invalid" jargon. Source for error-message copywriting principle.',
      },
      {
        name: 'IBM Carbon Writing Style',
        author: 'IBM',
        url: 'https://carbondesignsystem.com/guidelines/content/writing-style/',
        role: 'Sentence case for all UI text, second person (you/your), active voice, no please/thank you, simplest term. Source for sentence-case and voice principles.',
      },
      {
        name: 'better-colors skill',
        author: 'Jakub Krehel (@jakubkrehel)',
        url: 'https://github.com/jakubkrehel/skills',
        role: 'OKLCH palette generation, contrast checking, gamut mapping, and theming principles — cross-referenced against contract color tokens. Confirms OKLCH-first approach for wide-gamut color discipline.',
        license: 'MIT',
      },
      {
        name: 'better-accessibility skill',
        author: 'Jakub Krehel (@jakubkrehel)',
        url: 'https://github.com/jakubkrehel/skills',
        role: 'Focus management, keyboard navigation, ARIA patterns, form accessibility, screen-reader semantics, hit area floors, and motion reduction — cross-referenced against contract accessibility rules and WCAG 2.2 AA verification checks.',
        license: 'MIT',
      },
      {
        name: 'better-layout skill',
        author: 'Jakub Krehel (@jakubkrehel)',
        url: 'https://github.com/jakubkrehel/skills',
        role: 'Structure, grouping, alignment, reading order, progressive disclosure, and breakpoint discipline — cross-referenced against contract layout tokens and grid rules.',
        license: 'MIT',
      },
      {
        name: 'better-writing skill',
        author: 'Jakub Krehel (@jakubkrehel)',
        url: 'https://github.com/jakubkrehel/skills',
        role: '12 UX writing principles — verb-first buttons (source for copywriting check v38), descriptive link text (source for check v40), one capitalization policy with sentence-case default (source for check v41), errors that say how to fix next to where it broke (no blame, no oops, no exclamation marks), empty states that orient and point forward with one clear next action, placeholders as examples not labels, settings that describe the ON state, consistent flow vocabulary (Get Started → Continue → Done), plain words over clever ones, address the reader directly as you. Cross-referenced against contract copywriting checks v38-v41 and NN/g + Polaris error-message sources. Complements better-typography (which owns how text renders; better-writing owns what text says).',
        license: 'MIT',
      },
      {
        name: 'emil-design-eng skill',
        author: 'Emil Kowalski (@emilkowalski)',
        url: 'https://github.com/emilkowalski/skills',
        role: 'Animation philosophy and motion craft — frequency gate (never animate keyboard-initiated or high-frequency actions), custom Bézier over bare ease, origin-aware animations, press scale 0.97, unseen-details-compound principle. Cross-referenced against contract ten_standards and motion rules. Kowalski is on the Web team at Linear (ex-Vercel design team).',
        license: 'MIT',
      },
      {
        name: 'review-animations skill',
        author: 'Emil Kowalski (@emilkowalski)',
        url: 'https://github.com/emilkowalski/skills',
        role: 'Strict animation review rules — correct curve selection, duration bounds, property restriction (transform/opacity/filter only), interruptibility, and reduced-motion mandatory handling. Cross-referenced against contract motion verification and anti-patterns. Complements Krehel /better-ui for the motion-specific dimension.',
        license: 'MIT',
      },
      {
        name: 'apple-design skill',
        author: 'Emil Kowalski (@emilkowalski)',
        url: 'https://github.com/emilkowalski/skills',
        role: 'Apple WWDC design principles distilled for web — spring physics (damping 1.0 critically damped, response 0.3–0.4), interruptibility, velocity handoff, momentum projection, rubber-banding, translucent materials, multimodal feedback (causality + harmony + utility), and reduced-motion as gentler feedback not a kill switch. Spring values cross-referenced against contract springs (default damping 1.0, response 0.4). Source: Designing Fluid Interfaces (WWDC 2018) + Principles of Great Design (WWDC 2026).',
        license: 'MIT',
      },
      {
        name: 'find-animation-opportunities skill',
        author: 'Emil Kowalski (@emilkowalski)',
        url: 'https://github.com/emilkowalski/skills',
        role: 'Anti-over-animation discipline — the 4-question Gate (Frequency, Purpose, Speed, Function). Frequency gate: 100+/day or keyboard-initiated = never animate. Purpose must be named: feedback, spatial consistency, state indication, preventing jarring change, explanation, or delight (rare-tier only). Speed budget: press 100–160ms, tooltips 125–200ms, dropdowns 150–250ms, modals 200–500ms. Function: decoration on functional data hinders. Cross-referenced against contract ten_standards keyboard-still rule and anti-patterns_caution.',
        license: 'MIT',
      },
      {
        name: 'animate skill',
        author: 'Emil Kowalski (@emilkowalski)',
        url: 'https://github.com/emilkowalski/skills',
        role: 'Animation authoring — the 7-step build sequence (should it animate? → purpose → tool → properties → easing/duration → interruption/exit → reduced-motion/hover gating). Tool selection hierarchy: CSS transition → @starting-style → CSS animation → WAAPI → Motion (cheapest that works). Never Ship table: 13 auto-block items including transition:all, scale(0), ease-in on UI, keyframes on rapidly-triggered elements, Motion x/y/scale shorthands (not hardware-accelerated — use full transform string), ungated :hover motion. Tooltip-instant pattern: once one tooltip is open, neighbors open at 0ms duration. RECIPES.md: 12 ready-to-build component implementations (button press, dropdown, tooltip, modal, drawer, toast, accordion, stagger, hold-to-confirm, tab indicator, scroll reveal, drag-to-dismiss). The authoring complement to review-animations (the checking skill).',
        license: 'MIT',
      },
    ],
    adoption: {
      version: '0.1.1',
      date: '2026-07-12',
      from_lab: 'Poise',
      field_check: 'https://www.designesy.org/review/poise',
      keyboard_proof: 'https://www.designesy.org/review/poise/keyboard',
      note: 'Explicit adoption of Lab One portable rules into contract material',
    },
  },
  colors: {
    ink: { token: '--ink', value: '#f5f5f7', role: 'Primary text / foreground' },
    muted: { token: '--muted', value: '#a0a0a0', role: 'Secondary text' },
    muted_dim: {
      token: '--muted-dim',
      value: '#7d7d7d',
      role: 'Tertiary / meta text',
    },
    paper: { token: '--paper', value: '#010102', role: 'Page background' },
    surface: { token: '--surface', value: '#0a0a0c', role: 'Card / panel base' },
    surface_raised: {
      token: '--surface-raised',
      value: '#121216',
      role: 'Elevated surface',
    },
    surface_lifted: {
      token: '--surface-lifted',
      value: '#16161b',
      role: 'Lifted / hover panel',
    },
    signal: {
      token: '--signal',
      value: '#0133cb',
      role: 'Brand accent (internal token name; public products avoid this vocabulary)',
    },
    signal_light: {
      token: '--signal-light',
      value: '#3358e8',
      role: 'Accent hover / focus lift',
    },
    activation: {
      token: '--activation',
      value: '#fecc34',
      role: 'Activation highlight (reserved)',
    },
    signal_access: {
      token: '--signal-access',
      value: '#5d7bff',
      role: 'Accessible signal (AA contrast on dark surfaces)',
    },
    paper_on_signal: {
      token: '--paper-on-signal',
      value: '#ffffff',
      role: 'Text on signal fill',
    },
    ok: {
      token: '--ok',
      value: '#4ade80',
      role: 'Verification status — pass',
    },
    warn: {
      token: '--warn',
      value: '#facc15',
      role: 'Verification status — warn',
    },
    error: {
      token: '--error',
      value: '#f87171',
      role: 'Verification status — fail',
    },
    grade_a: {
      token: '--grade-a',
      value: '#22c55e',
      role: 'Grade scale A (≥90%) — score emblem, constellation, badge. Distinct from --ok (#4ade80, verification status)',
    },
    grade_b: {
      token: '--grade-b',
      value: '#84cc16',
      role: 'Grade scale B (≥80%) — lime, score emblem arc',
    },
    grade_c: {
      token: '--grade-c',
      value: '#eab308',
      role: 'Grade scale C (≥70%) — yellow, score emblem arc',
    },
    grade_d: {
      token: '--grade-d',
      value: '#fb923c',
      role: 'Grade scale D (≥60%) — orange, score emblem arc',
    },
    grade_f: {
      token: '--grade-f',
      value: '#ef4444',
      role: 'Grade scale F (<60%) — red, score emblem arc',
    },
    grade_b_light: {
      token: '--grade-b-light',
      value: '#a3e635',
      role: 'Lighter lime for constellation text on dark surfaces',
    },
    grade_d_glow: {
      token: '--grade-d-glow',
      value: '#f97316',
      role: 'Orange-600 glow variant for D-grade emblem and hero proof — distinct from --grade-d (#fb923c, the arc color)',
    },
    signal_pos: {
      token: '--signal-pos',
      value: '#34d399',
      role: 'Emerald for positive signal points in score breakdown',
    },
    live: {
      token: '--live',
      value: '#22c55e',
      role: '"is-live" status dot indicator (same value as --grade-a)',
    },
    error_text: {
      token: '--error-text',
      value: '#fecaca',
      role: 'Light red-200 for error text on dark error surfaces',
    },
    amber_notice: {
      token: '--amber-notice',
      value: '#c9a227',
      role: 'Amber for score-drawer remediation heading — contract-restrained',
    },
    shimmer_1: {
      token: '--shimmer-1',
      value: '#f4f6ff',
      role: 'Wordmark shimmer gradient stop 1 — decorative animation',
    },
    shimmer_2: {
      token: '--shimmer-2',
      value: '#e8ecff',
      role: 'Wordmark shimmer gradient stop 2 — decorative animation',
    },
    shimmer_3: {
      token: '--shimmer-3',
      value: '#5b78f0',
      role: 'Wordmark shimmer gradient stop 3 — decorative animation',
    },
    shimmer_4: {
      token: '--shimmer-4',
      value: '#9eb0ff',
      role: 'Wordmark shimmer gradient stop 4 — decorative animation',
    },
    shimmer_5: {
      token: '--shimmer-5',
      value: '#dce4ff',
      role: 'Wordmark shimmer gradient stop 5 — decorative animation',
    },
  },
  surfaces_and_lines: {
    surface_soft: {
      token: '--surface-soft',
      value: 'rgba(255, 255, 255, 0.03)',
      role: 'Soft fill / note background',
    },
    surface_hover: {
      token: '--surface-hover',
      value: 'rgba(255, 255, 255, 0.06)',
      role: 'Hover wash',
    },
    line: {
      token: '--line',
      value: 'rgba(255, 255, 255, 0.12)',
      role: 'Default border',
    },
    line_strong: {
      token: '--line-strong',
      value: 'rgba(255, 255, 255, 0.22)',
      role: 'Emphasized border',
    },
    line_faint: {
      token: '--line-faint',
      value: 'rgba(255, 255, 255, 0.06)',
      role: 'Subtle divider',
    },
    signal_dim: {
      token: '--signal-dim',
      value: 'rgba(1, 51, 203, 0.14)',
      role: 'Accent wash / badge fill',
    },
    surface_gradient: {
      token: '--surface-gradient',
      value: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
      role: 'Surface depth wash (card interiors)',
    },
    surface_card_gradient: {
      token: '--surface-card-gradient',
      value: 'linear-gradient(135deg, #0d0d11 0%, var(--surface) 100%)',
      role: 'Card interior gradient',
    },
    inner_light: {
      token: '--inner-light',
      value: 'inset 0 1px 0 rgba(255,255,255,0.055)',
      role: 'Inner top-edge highlight',
    },
    signal_glow: {
      token: '--signal-glow',
      value: '0 0 60px rgba(51,88,232,0.18), 0 0 24px rgba(51,88,232,0.28)',
      role: 'Accent glow (border/focus only — not button fill, v22)',
    },
    signal_gradient: {
      token: '--signal-gradient',
      value: 'linear-gradient(135deg, var(--signal-light), #6b8aff 130%)',
      role: 'Accent gradient (borders/focus only)',
    },
  },
  shadows: {
    sm: {
      token: '--shadow-sm',
      value: '0 1px 3px rgba(0, 0, 0, 0.4)',
    },
    md: {
      token: '--shadow-md',
      value: '0 8px 30px rgba(0, 0, 0, 0.35)',
    },
    lg: {
      token: '--shadow-lg',
      value: '0 24px 80px rgba(0, 0, 0, 0.5)',
    },
  },
  rounded: {
    default: { token: '--radius', value: '6px', role: 'Default corner radius' },
    sm: {
      token: '--radius-sm',
      value: '4px',
      role: 'Compact controls / nav chips',
    },
    lg: {
      token: '--radius-lg',
      value: '12px',
      role: 'Cards / panels / large surfaces',
    },
    xl: {
      token: '--radius-xl',
      value: '16px',
      role: 'Hero / modal / flagship surfaces',
    },
  },
  layout: {
    max_width: { token: '--maxw', value: '1080px', role: 'Content shell max width' },
    max_width_wide: {
      token: '--maxw-wide',
      value: '1180px',
      role: 'Wider shell for hero / section chrome (additive only)',
    },
    shell_horizontal: '1.5rem (1rem at ≤560px)',
    section_vertical: '3.5rem / 3rem doctrine',
    card_padding: '1.25–1.5rem',
    grid_gap: '0.75–1rem',
    control_min_height: '42px buttons, 32px sound toggle',
    breakpoints: {
      grids: '860px',
      topbar: '720px',
      single_column: '560px',
    },
    // ── Spacing scale tokens (added 2026-08-12, closes drift d04) ──────────
    // 4px-base scale with off-grid values for specific component needs.
    // Named by pixel value: --space-N = Npx. Fine-grained values use
    // --space-fine-NNN (in hundredths of rem) for sub-rem micro-adjustments.
    spacing_scale: {
      space_0: { token: '--space-0', value: '0', role: 'Zero spacing' },
      space_1: { token: '--space-1', value: '0.0625rem', role: '1px — hairline borders, micro adjustments' },
      space_2: { token: '--space-2', value: '0.125rem', role: '2px' },
      space_3: { token: '--space-3', value: '0.1875rem', role: '3px' },
      space_4: { token: '--space-4', value: '0.25rem', role: '4px — tight badge/card padding' },
      space_5: { token: '--space-5', value: '0.3125rem', role: '5px' },
      space_6: { token: '--space-6', value: '0.375rem', role: '6px' },
      space_7: { token: '--space-7', value: '0.4375rem', role: '7px — off-grid, badge padding' },
      space_8: { token: '--space-8', value: '0.5rem', role: '8px — default tight gap, small padding' },
      space_9: { token: '--space-9', value: '0.5625rem', role: '9px — off-grid' },
      space_10: { token: '--space-10', value: '0.625rem', role: '10px' },
      space_11: { token: '--space-11', value: '0.6875rem', role: '11px — off-grid' },
      space_12: { token: '--space-12', value: '0.75rem', role: '12px — medium padding, card padding' },
      space_13: { token: '--space-13', value: '0.8125rem', role: '13px — off-grid' },
      space_14: { token: '--space-14', value: '0.875rem', role: '14px' },
      space_15: { token: '--space-15', value: '0.9375rem', role: '15px — off-grid' },
      space_16: { token: '--space-16', value: '1rem', role: '16px — base spacing unit, standard padding' },
      space_17: { token: '--space-17', value: '1.0625rem', role: '17px — off-grid' },
      space_18: { token: '--space-18', value: '1.125rem', role: '18px' },
      space_19: { token: '--space-19', value: '1.1875rem', role: '19px — off-grid' },
      space_20: { token: '--space-20', value: '1.25rem', role: '20px — large padding, section gaps' },
      space_21: { token: '--space-21', value: '1.3125rem', role: '21px — off-grid' },
      space_22: { token: '--space-22', value: '1.375rem', role: '22px' },
      space_24: { token: '--space-24', value: '1.5rem', role: '24px — section padding, large gaps' },
      space_28: { token: '--space-28', value: '1.75rem', role: '28px' },
      space_32: { token: '--space-32', value: '2rem', role: '32px — big section gaps' },
      space_35: { token: '--space-35', value: '2.1875rem', role: '35px — off-grid, layout spacing' },
      space_36: { token: '--space-36', value: '2.25rem', role: '36px' },
      space_40: { token: '--space-40', value: '2.5rem', role: '40px' },
      space_44: { token: '--space-44', value: '2.75rem', role: '44px — off-grid, large section spacing' },
      space_48: { token: '--space-48', value: '3rem', role: '48px — hero spacing, major section breaks' },
      space_56: { token: '--space-56', value: '3.5rem', role: '56px' },
      space_64: { token: '--space-64', value: '4rem', role: '64px — large vertical rhythm' },
      space_72: { token: '--space-72', value: '4.5rem', role: '72px — extra-large vertical rhythm' },
      space_88: { token: '--space-88', value: '5.5rem', role: '88px — major hero spacing' },
      space_104: { token: '--space-104', value: '6.5rem', role: '104px — large hero section padding' },
      space_112: { token: '--space-112', value: '7rem', role: '112px — maximum vertical rhythm' },
      // Fine spacing — sub-rem micro-adjustments for optical alignment
      space_fine_02: { token: '--space-fine-02', value: '0.02rem', role: 'Fine micro-adjustment (0.32px)' },
      space_fine_10: { token: '--space-fine-10', value: '0.1rem', role: 'Fine micro-adjustment (1.6px)' },
      space_fine_12: { token: '--space-fine-12', value: '0.12rem', role: 'Fine micro-adjustment (1.92px)' },
      space_fine_15: { token: '--space-fine-15', value: '0.15rem', role: 'Fine micro-adjustment (2.4px)' },
      space_fine_20: { token: '--space-fine-20', value: '0.2rem', role: 'Fine micro-adjustment (3.2px)' },
      space_fine_30: { token: '--space-fine-30', value: '0.3rem', role: 'Fine micro-adjustment (4.8px)' },
      space_fine_32: { token: '--space-fine-32', value: '0.32rem', role: 'Fine micro-adjustment (5.12px)' },
      space_fine_35: { token: '--space-fine-35', value: '0.35rem', role: 'Fine micro-adjustment (5.6px)' },
      space_fine_40: { token: '--space-fine-40', value: '0.4rem', role: 'Fine micro-adjustment (6.4px)' },
      space_fine_42: { token: '--space-fine-42', value: '0.42rem', role: 'Fine micro-adjustment (6.72px)' },
      space_fine_45: { token: '--space-fine-45', value: '0.45rem', role: 'Fine micro-adjustment (7.2px)' },
      space_fine_55: { token: '--space-fine-55', value: '0.55rem', role: 'Fine micro-adjustment (8.8px)' },
      space_fine_60: { token: '--space-fine-60', value: '0.6rem', role: 'Fine micro-adjustment (9.6px)' },
      space_fine_65: { token: '--space-fine-65', value: '0.65rem', role: 'Fine micro-adjustment (10.4px)' },
      space_fine_68: { token: '--space-fine-68', value: '0.68rem', role: 'Fine micro-adjustment (10.88px)' },
      space_fine_70: { token: '--space-fine-70', value: '0.7rem', role: 'Fine micro-adjustment (11.2px)' },
      space_fine_80: { token: '--space-fine-80', value: '0.8rem', role: 'Fine micro-adjustment (12.8px)' },
      space_fine_85: { token: '--space-fine-85', value: '0.85rem', role: 'Fine micro-adjustment (13.6px)' },
      space_fine_95: { token: '--space-fine-95', value: '0.95rem', role: 'Fine micro-adjustment (15.2px)' },
      space_fine_110: { token: '--space-fine-110', value: '1.1rem', role: 'Fine micro-adjustment (17.6px)' },
      space_fine_120: { token: '--space-fine-120', value: '1.2rem', role: 'Fine micro-adjustment (19.2px)' },
      space_fine_130: { token: '--space-fine-130', value: '1.3rem', role: 'Fine micro-adjustment (20.8px)' },
      space_fine_135: { token: '--space-fine-135', value: '1.35rem', role: 'Fine micro-adjustment (21.6px)' },
      space_fine_140: { token: '--space-fine-140', value: '1.4rem', role: 'Fine micro-adjustment (22.4px)' },
      space_fine_220: { token: '--space-fine-220', value: '2.2rem', role: 'Fine micro-adjustment (35.2px)' },
      // Additional values from component CSS files
      space_fine_03: { token: '--space-fine-03', value: '0.03rem', role: 'Fine micro-adjustment (0.48px)' },
      space_fine_05: { token: '--space-fine-05', value: '0.05rem', role: 'Fine micro-adjustment (0.8px)' },
      space_fine_22: { token: '--space-fine-22', value: '0.22rem', role: 'Fine micro-adjustment (3.52px)' },
      space_fine_34: { token: '--space-fine-34', value: '0.34rem', role: 'Fine micro-adjustment (5.44px)' },
      space_fine_105: { token: '--space-fine-105', value: '1.05rem', role: 'Fine micro-adjustment (16.8px) — clamp min' },
      space_fine_115: { token: '--space-fine-115', value: '1.15rem', role: 'Fine micro-adjustment (18.4px)' },
      space_fine_160: { token: '--space-fine-160', value: '1.6rem', role: 'Fine micro-adjustment (25.6px)' },
      space_fine_28: { token: '--space-fine-28', value: '0.28rem', role: 'Fine micro-adjustment (4.48px) — off-grid component gap' },
      space_fine_90: { token: '--space-fine-90', value: '0.9rem', role: 'Fine micro-adjustment (14.4px) — off-grid component gap' },
      space_96: { token: '--space-96', value: '6rem', role: '96px — large vertical spacing' },
      space_144: { token: '--space-144', value: '9rem', role: '144px — extra-large vertical spacing' },
    },
  },
  motion: {
    duration: { token: '--duration', value: '0.6s', role: 'Primary entrance duration' },
    duration_quick: { token: '--duration-quick', value: '150ms', role: 'Close, swap, tooltip (transitions.dev cross-ref)' },
    duration_fast: { token: '--duration-fast', value: '250ms', role: 'Open, hover transition, icon swap' },
    duration_medium: { token: '--duration-medium', value: '350ms', role: 'Panel close, toast' },
    duration_slow: { token: '--duration-slow', value: '400ms', role: 'Panel open, skeleton reveal' },
    ease: {
      token: '--ease',
      value: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      role: 'Default ease',
    },
    ease_out: {
      token: '--ease-out',
      value: 'cubic-bezier(0.23, 1, 0.32, 1)',
      role: 'Exit / settle',
    },
    ease_in_out: {
      token: '--ease-in-out',
      value: 'cubic-bezier(0.77, 0, 0.175, 1)',
      role: 'Symmetric motion',
    },
    ease_drawer: {
      token: '--ease-drawer',
      value: 'cubic-bezier(0.32, 0.72, 0, 1)',
      role: 'Drawer / panel slide',
    },
    rules: [
      'Entrance: fadeUp 0.6s --ease with staggered delays (0.08s steps)',
      'Interactive settle: scale(0.97) at ~160ms --ease-out (Poise · adopted v0.1.1)',
      'Hover lift only under (hover: hover) and (pointer: fine) (Poise · adopted v0.1.1)',
      'Wordmark mark: opacity breath only (~3.2s --ease-in-out); no blur, glow, or gradient decoration (Poise · adopted v0.1.1)',
      'prefers-reduced-motion: reduce collapses non-essential motion; sound defaults off (Poise · adopted v0.1.1)',
    ],
    entrance: {
      min_scale: { value: 0.9, description: 'Minimum entrance scale — never animate from scale(0)' },
      default_scale: { value: 0.95, description: 'Default entrance scale — scale + opacity, not scale(0)' },
    },
    stagger: {
      interval: { value: '30-80ms', description: 'Stagger between sequential items — lower bound 30ms' },
    },
    springs: {
      default: { damping: 1.0, response: 0.4, description: 'Default spring physics for natural motion' },
      momentum: { damping: 0.8, response: 0.3, description: 'Momentum spring for continued motion' },
    },
    ten_standards: [
      'Easing is deliberate — use contract cubicBezier tokens, not bare CSS keywords',
      'Properties are explicit — never transition:all; name exact properties',
      'Entrances have opacity — animate from scale(0.9-0.97) + opacity, never scale(0)',
      'Keyboard is still — no motion on keyboard-initiated or 100+/day actions',
      'Layout is not animated — never animate width, height, margin, padding, top, left; use transform and opacity',
      'Touch is gated — :hover motion on touch-visible surfaces requires explicit gating',
      'Duration is bounded — UI animation stays at or below 300ms unless justified',
      'Reduced-motion is handled — every movement animation has a prefers-reduced-motion path',
      'Press is asymmetric — press and release use asymmetric timing',
      'Easing is never ease-in — no ease-in on any UI interaction; deceleration or custom curves only',
    ],
    anti_patterns_block: [
      'Using ease-in on any UI interaction',
      'Using transition: all instead of explicit properties',
      'Animating from scale(0) instead of scale(0.9-0.97) + opacity',
      'Animating on keyboard-initiated or 100+/day actions',
      'Animating layout properties: width, height, margin, padding, top, left',
      'Ungated :hover motion on touch-visible surfaces',
    ],
    anti_patterns_caution: [
      'UI animation duration exceeding 300ms without stated justification',
      'Using bare CSS easing keywords on deliberate animation',
      'Missing prefers-reduced-motion handling on movement animations',
      'Symmetric enter/exit timing on press-and-release or hold interactions',
    ],
  },
  interaction: {
    source_lab: 'Poise',
    adopted_in: '0.1.1',
    state_tokens: {
      hover_fill: {
        token: '--hover-fill',
        value: 'var(--surface-hover)',
        role: 'Interactive hover wash',
      },
      press_fill: {
        token: '--press-fill',
        value: 'var(--surface-soft)',
        role: 'Press / active fill',
      },
      focus_ring: {
        token: '--focus-ring',
        value: 'var(--signal-light)',
        role: 'Keyboard focus indicator color',
      },
    },
    rules: [
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
  },
  takt: {
    source_lab: 'Takt',
    adopted_in: '0.1.2',
    rules: [
      'Concentric border radius: outerRadius = innerRadius + padding on every nested pair',
      'Press scale 0.96 on cells and buttons; 0.985 on cards and rows — never below 0.95',
      'Image outlines: 1px at 0.1 opacity, pure black in light mode, pure white in dark mode — never tinted neutrals',
      'Minimum hit area: 44px for touch, 40px for desktop — extend with pseudo-element when needed',
      'Stagger enter animations: ~80–100ms per semantic chunk; skip animation on page load',
      'Soften exits: small fixed translateY, softer than enter — no full-height collapse',
      'Never use transition: all — every transition names its specific properties',
      'Spare will-change: only transform, opacity, or filter — only when a stutter was observed',
    ],
    verified_against: 'Live CSS audit (47,680 bytes) — all transitions, scales, will-change, radii, outlines parsed',
    verification: [
      'https://www.designesy.org/labs/takt',
      'https://www.designesy.org/review/takt',
    ],
    unverified: [
      'Image outline rule — no image surfaces on designesy.org yet',
      'Mobile hit area 44px — desktop 40px confirmed only',
    ],
  },
  cadence: {
    source_lab: 'Cadence',
    adopted_in: '0.1.3',
    rules: [
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
    verified_against: 'Live CSS audit (48,755 bytes) — font smoothing, line-heights, letter-spacing, text-wrap, tabular-nums, ::selection, user-select, rem scale, font-synthesis, text-underline-position, text-decoration-skip-ink, logical inline properties all parsed',
    verification: [
      'https://www.designesy.org/labs/cadence',
      'https://www.designesy.org/review/cadence',
    ],
    unverified: [
      'Block-axis logical properties (margin-block-start/end) not yet migrated — only inline-axis (margin-inline, padding-inline) done',
      'border-left decorative accents not yet migrated to border-inline-start — visual regression risk needs testing',
      'inset left/right positioning not yet migrated to inset-inline — absolute positioning needs case-by-case review',
    ],
  },
  typography: {
    font_stacks: {
      sans: {
        token: '--sans',
        value:
          "'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, Helvetica, sans-serif",
        role: 'Primary UI and body stack (Geist Variable — Vercel house font, "deliberately set not defaulted". System fonts cover fallback.)',
      },
      serif: {
        token: '--serif',
        value:
          "'Fraunces Variable', 'Fraunces', 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif",
        role: 'Editorial serif for headlines — the trust/authority signal. Fraunces Variable with opsz + SOFT axes for dark-mode tuning.',
      },
      display: {
        token: '--display',
        value: 'var(--serif)',
        role: 'Display/headline face — Fraunces Variable (aliased to --serif). Hybrid system: serif headlines + sans UI.',
      },
      mono: {
        token: '--mono',
        value:
          "'Geist Mono Variable', ui-monospace, 'SF Mono', 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace",
        role: 'Mono stack for check IDs, score readouts, token names (Geist Mono Variable — system-thinking signal)',
      },
    },
    body: '16px / 1.55, Geist Variable (Inter fallback for CJK)',
    headings: 'Fraunces Variable, weight 700, line-height 1.08, letter-spacing -0.02em',
    hero_wordmark: 'clamp(3.2rem, 9vw, 5.5rem), weight 800, tracking -0.04em',
    eyebrows:
      '0.72–0.75rem, weight 600, uppercase, letter-spacing 0.18em, muted-dim',
    lede: '1.1–1.5rem, weight 500, ink — one clear claim',
    supporting_note: '0.85–0.95rem, muted, max-width ~520–580px',
    rule: 'Hybrid system: Fraunces serif for headlines (authority), Geist sans for UI (precision), Geist Mono for data (systems). No single-sans — the 2026 anti-pattern.',
    cadence_adopted: 'v0.1.3 — font smoothing on root, rem-based scale, line-height by role, tracking by size, measure cap, text-wrap balance+pretty, tabular numbers, ::selection with --signal, user-select on UI chrome, 16px input floor',
    font_synthesis: 'none set on :root — prevents fake browser weights (fixed 2026-07-15)',
    text_underline_position: 'from-font set on :root — aligns underlines to font metrics (fixed 2026-07-15)',
    text_decoration_skip_ink: 'auto set on :root — skips descenders for readability (fixed 2026-07-15)',
  },
  acoustic: {
    adopted_in: '0.3.0',
    engine: 'Cuelume v0.2.2 (MIT)',
    preference_key: 'designesy:sound',
    reduced_motion_proxy: true,
    token_type: 'Custom $type: sound via $extensions.designesy — net-new relative to W3C DTCG 2025.10',
    cues: [
      { token: '--cue:brand', cue: 'sparkle', role: 'Brand wordmark contact' },
      { token: '--cue:nav', cue: 'tick', role: 'Navigation and wayfinding' },
      { token: '--cue:invite', cue: 'chime', role: 'Primary invitation / machine surfaces' },
      { token: '--cue:action', cue: 'press', role: 'Pointer-down on actionable surfaces' },
      { token: '--cue:resolve', cue: 'release', role: 'Pointer-up default resolve' },
      { token: '--cue:complete', cue: 'success', role: 'High-value resolve' },
      { token: '--cue:reveal', cue: 'bloom', role: 'Content / experiment reveal' },
      { token: '--cue:list', cue: 'whisper', role: 'Dense list / surface scan' },
      { token: '--cue:switch', cue: 'toggle', role: 'State toggle' },
      { token: '--cue:contact', cue: 'droplet', role: 'Contact / outbound mail' },
    ],
    mapping_rules: [
      'Brand marks earn sparkle — hero wordmark, topbar logo, footer mark',
      'One primary cue family per role — do not randomize per page',
      'Hover sounds are fine-pointer only; touch maps hover cue to single tap',
      'No ambient audio — Cuelume is interaction-only',
      'No focus sounds — sounds fire on pointer and click, not on focus',
      'Every cue must trace to the acoustic token document',
    ],
  },
  semantic: {
    surface_roles:
      'paper = page void · surface = default panel · surface-raised = hover/emphasis · surface-soft = quiet note · surface-hover = interactive wash',
    line_roles:
      'line = default structure · line-strong = active/emphasis · line-faint = quiet subdivision',
    accent_roles:
      'signal = brand action and wordmark mark · signal-light = hover/focus · signal-dim = badge/wash · activation = reserved highlight · signal-glow/signal-gradient = border/focus effects only (never button fill)',
    status_roles: 'ok = pass · warn = warn · error = fail',
    state_roles:
      'hover-fill = interactive hover wash · press-fill = press/active fill · focus-ring = keyboard focus indicator',
    type_roles:
      'ink = primary claim · muted = supporting body · muted-dim = eyebrows, meta, footers',
    local_scope_aliases: {
      fg: {
        token: '--fg',
        value: 'var(--signal-access)',
        role: 'Local-scope alias for search-match highlight text in cmdk (alias of --signal-access)',
        added_in: '0.4.0-drift-2026-08-12',
      },
      text: {
        token: '--text',
        value: 'var(--ink)',
        role: 'Local-scope alias for default body text where callers expected a separate name (alias of --ink)',
        added_in: '0.4.0-drift-2026-08-12',
      },
      ink_soft: {
        token: '--ink-soft',
        value: 'var(--muted-dim)',
        role: 'Local-scope alias for dimmed ink used in tertiary meta (hero proof caveat) — alias of --muted-dim',
        added_in: '0.4.0-drift-2026-08-12',
      },
      surface_2: {
        token: '--surface-2',
        value: 'var(--surface-raised)',
        role: 'Local-scope alias for intermediate surface tier (tab-active state) — alias of --surface-raised',
        added_in: '0.4.0-drift-2026-08-12',
      },
      motion_short: {
        token: '--motion-short',
        value: 'var(--duration-quick)',
        role: 'Local-scope alias for quick micro-motion duration (150ms) — alias of --duration-quick',
        added_in: '0.4.0-drift-2026-08-12',
      },
      ease_quiet: {
        token: '--ease-quiet',
        value: 'cubic-bezier(0.4, 0, 0.2, 1)',
        role: 'Local-scope alias for softer ease used in muted-motion transitions (Material Design standard curve)',
        added_in: '0.4.0-drift-2026-08-12',
      },
    },
  },
  copywriting: {
    adopted_in: '0.4.0',
    source_signal: 'detail.design Copywriting discipline gap + NN/g, Polaris, IBM Carbon, Microsoft Fluent, Apple HIG, Atlassian research',
    principles: [
      // ── Button text (codifiable — checks v38, v39) ──────────────────────
      'Button copy is a verb phrase (or a recognized single-word command), never a bare noun — "Save changes" not "Changes", "Delete file" not "File"',
      'Button text is ≤ 4 words; articles (a/an/the) removed for scannability',
      'Generic confirmation labels (OK, Submit, Continue, Yes/No) are rejected for confirmation dialogs — the label must state the action',
      'Commands that open a further-input dialog end with an ellipsis (…); immediate commands do not',
      // ── Error messages (codifiable subset — structural check) ───────────
      'Error messages state what happened, what to do, and what to expect next — not just "An error occurred"',
      'Error messages use plain language — no jargon, no exposed error codes, no blame words (invalid, illegal, incorrect)',
      'Error messages don\'t overapologize and don\'t introduce "we/us" unless the system caused the error',
      // ── Empty states (codifiable — structural check) ─────────────────────
      'Empty states have a clear next action (button or link with a verb), not just a message',
      // ── Link text (codifiable — check v40) ───────────────────────────────
      'Link text is descriptive of the destination, not bare "click here / learn more / read more / here"',
      // ── General microcopy (codifiable — check v41) ───────────────────────
      'All UI text uses sentence case — not title case, not ALL CAPS (except eyebrows per typography contract)',
      'No trailing period on buttons, labels, radio/checkbox text, tab text; periods only on full sentences (tooltips, error bodies, dialog bodies)',
      'Active voice, not passive, except when the system is the subject of an error',
      'Second person (you/your) for user-facing copy; "I/me" never used for the app\'s voice; "we" only when the system is the actor',
      'No "please / thank you" in standard UI — only when the user is genuinely inconvenienced',
      // ── Voice & tone (governance — not automated) ────────────────────────
      'Voice is constant; tone adapts to the user\'s emotional state — error tone is economical and direct, not humorous',
      'Don\'t blame the user — error messages describe the problem and the fix, not the user\'s mistake',
    ],
    verification: [
      'v38: Button text is a verb phrase or recognized command — not a bare noun',
      'v39: No trailing period on button text, labels, or tab text',
      'v40: Link text is descriptive — not bare "click here", "learn more", "here"',
      'v41: No ALL CAPS UI text (except eyebrow labels per typography contract)',
    ],
    governance: [
      'Error message completeness (what happened + what to do + what to expect) — human review using NN/g 12-guideline rubric',
      'Empty-state next-action presence — human review if no automated DOM check',
      'Voice and tone consistency — human review against Mailchimp-style voice-and-tone guide',
      'Consistency map: one canonical label per action across the product (no "Sign in" vs "Log in")',
    ],
    tooling: [
      'Vale (errata-ai/vale) — YAML-rule prose linter; ships Microsoft Writing Style Guide + Google Developer Docs Style Guide implementations',
      'textlint — pluggable rule engine for custom checks (button verb phrase, label ≤ 4 words, no trailing period)',
      'alex — inclusive/insensitive-language linter for the blame-words subset',
    ],
  },
  components: [
    {
      name: 'Primary button',
      states:
        'default signal fill · hover signal-light · active scale(0.97) · focus-visible 2px signal-light',
    },
    {
      name: 'Ghost button',
      states:
        'transparent + line-strong · hover surface-hover · active scale(0.97)',
    },
    {
      name: 'Nav link',
      states:
        'muted · hover ink + surface-hover · sticky topbar blur when scrolled',
    },
    {
      name: 'Card / pillar',
      states:
        'surface + line · hover raised + line-strong · active scale(0.985); lift only on fine pointer hover',
    },
    {
      name: 'Sound toggle',
      states:
        'aria-pressed sync · pressed shows signal-light · Cuelume setEnabled(true|false)',
    },
    {
      name: 'Definition block',
      states:
        'bordered surface · hover line-strong · label uppercase muted-dim',
    },
  ],
  accessibility: [
    'html lang="en"; meaningful page titles via metadata template',
    'Focus-visible: 2px solid --signal-light, offset 2px',
    'Sound control exposes aria-label, aria-pressed, and title',
    'Decorative glyphs use aria-hidden where text is already labeled',
    'Prefer semantic landmarks: sticky header, main, footer',
    'Do not rely on color alone for state',
    'Respect prefers-reduced-motion',
    'Scroll padding-top 4rem for sticky topbar anchors',
  ],
  anti_patterns: [
    'Glowing blobs, random gradients, or sparkle decoration',
    'Hard-coded hex in components when a role token exists',
    'Using --activation as general decoration',
    'Publishing taste language without operational rules',
    'Multiple simultaneous accent colors competing with --signal',
    'Touch targets under ~32px',
    'Animation that cannot be reduced',
    'Public product names that sound like research demos or AI jargon',
    'Button text that is a bare noun without a verb ("Settings" alone for a destructive action)',
    'Generic error messages ("An error occurred", "Something went wrong") with no remediation',
    'Link text that is "click here", "learn more", "read more", or "here" without destination context',
    'ALL CAPS body text or button text (except eyebrow labels per typography contract)',
  ],
  implementation: [
    'Single live token source of truth — no secondary theme framework',
    'Server-rendered by default; client only for sound, bind, and preference controls',
    'metadataBase is https://www.designesy.org (apex redirects); public label is Designesy',
    'Interaction audio via Cuelume with middle-click guard',
    'Sitemap and robots follow standard site conventions',
    'Production deploys from the main branch',
    'Drift rule: every new public UI change cites a contract token or open tension',
  ],
  verification: [
    'Token values match the live site :root foundation',
    'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+',
    'Primary interactive elements show focus-visible rings',
    'Sound toggle flips aria-pressed and applies the audio preference',
    'prefers-reduced-motion disables entrance and wordmark breath',
    'Contrast remains readable for ink, muted, and accent on paper',
    'No public surface displays internal control-plane naming',
    'Poise interaction rules match live /labs/poise and contract.interaction',
    'Poise keyboard-path verification remains published and current',
    'Takt interface-feel rules match live CSS and contract.takt',
    'No transition:all in the live stylesheet',
    'will-change restricted to transform and opacity only',
    'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor',
    'Cadence typography rules match live CSS and contract.cadence',
    'Font smoothing: antialiased + grayscale on :root confirmed',
    'Rem-based scale: all text sizes in rem, root at 16px confirmed',
    'Line-height by role: headings 1.08, body 1.55 confirmed',
    'text-wrap: balance + pretty both present in live CSS',
    'tabular-nums: 8 instances across the live CSS',
    '::selection styled with var(--signal) — not browser default',
    'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1 (Taste Skill pre-flight)',
    'Primary button text passes WCAG AA 4.5:1 contrast against --signal fill (Taste Skill pre-flight)',
    'Duration tokens --duration-quick through --duration-slow present in :root (transitions.dev cross-ref)',
    'Button text is a verb phrase or recognized command — not a bare noun (copywriting v38)',
    'No trailing period on button text, labels, or tab text (copywriting v39)',
    'Link text is descriptive — not bare "click here", "learn more", "here" (copywriting v40)',
    'No ALL CAPS UI text except eyebrow labels (copywriting v41)',
  ],
  open_tensions: [
    'Light theme is not contracted — dark technical foundation is provisional',
    '--activation exists but has limited public surface usage',
    'Inter is named in the stack but not self-hosted; system fallback is intentional',
    'Shadow tokens exist; elevation language is still light-touch (borders lead)',
    'Human contract page and machine export remain dual sources until a single generator owns both',
    'Keyboard-path verification packets are published for Poise only — not every public route',
    'Inline-axis logical properties (margin-inline, padding-inline) applied — block-axis and border-inline remain physical (Cadence partial migration)',
    'Block-axis logical properties (margin-block-start/end) not yet migrated — only inline-axis done',
    'border-left decorative accents not yet migrated to border-inline-start — visual regression risk needs testing',
  ],
  adoption_history: [
    {
      version: '0.1.0',
      date: '2026-07-12',
      summary: 'First public design system contract — tokens, motion, components, verification',
    },
    {
      version: '0.1.1',
      date: '2026-07-12',
      summary:
        'Adopted Lab One · Poise interaction rules: wordmark breath, press settle, sound preference, reduced motion, hover media, naming discipline',
      from_lab: 'Poise',
      evidence: [
        'https://www.designesy.org/labs/poise',
        'https://www.designesy.org/review/poise',
        'https://www.designesy.org/review/poise/keyboard',
      ],
    },
    {
      version: '0.1.2',
      date: '2026-07-13',
      summary:
        'Adopted Lab Two · Takt interface-feel rules: concentric radii, press scale (0.96/0.985), image outlines, hit area floor, stagger rhythm, no transition:all, spare will-change. Rules compiled from external design intelligence (Amicro, Krehel /better-ui, /better-accessibility for hit area floors) and verified on live CSS.',
      from_lab: 'Takt',
      evidence: [
        'https://www.designesy.org/labs/takt',
        'https://www.designesy.org/review/takt',
      ],
    },
    {
      version: '0.1.3',
      date: '2026-07-13',
      summary:
        'Adopted Lab Three · Cadence typography rules: font smoothing on root, rem-based scale, line-height by role, tracking by size, measure cap, text-wrap balance+pretty, tabular numbers, ::selection with --signal, user-select on UI chrome, 16px input floor. Rules compiled from external typography intelligence (Krehel /better-typography, /better-layout for reading order and measure) and verified on live CSS. Three open tensions documented: font-synthesis, logical properties, underline-from-font.',
      from_lab: 'Cadence',
      evidence: [
        'https://www.designesy.org/labs/cadence',
        'https://www.designesy.org/review/cadence',
      ],
    },
    {
      version: '0.1.4',
      date: '2026-07-13',
      summary:
        'Adopted duration scale (transitions.dev cross-ref), Core Web Vitals + button contrast verification (Taste Skill gap audit), anti-rationalization methodology (agent-skills pattern). Duration tokens --duration-quick (150ms) through --duration-slow (400ms) added to :root. Three external ingests added to provenance: agent-skills (Osmani), Taste Skill (Leon), transitions.dev (Antalik). No lab source — this is a direct contract refinement from external source ingests.',
      evidence: [
        'https://www.designesy.org/contracts/design-system.json',
        'https://www.designesy.org/contracts/skill',
      ],
    },
    {
      version: '0.3.0',
      date: '2026-07-15',
      summary:
        'Reconciled with on-disk core contract v0.4.0. Spring physics tokens added (default + momentum). Full acoustic cue enumeration added (19 cues via custom $type: sound). Ten Non-Negotiable Motion Standards added as §16. Motion anti-patterns formalized (6 block-on-sight + 4 caution). Entrance scale tokens added (min 0.9, default 0.95). Stagger interval token added (30ms lower bound). font-synthesis: none and text-underline-position: from-font confirmed fixed and removed from open tensions. W3C DTCG 2025.10 token format alignment documented.',
      evidence: [
        'https://www.designesy.org/contracts/design-system.json',
        'https://www.designesy.org/contracts#design-system-contract',
      ],
    },
    {
      version: '0.4.0',
      date: '2026-07-30',
      summary:
        'Added copywriting section from detail.design gap signal + NN/g, Polaris, IBM Carbon, Microsoft Fluent, Apple HIG, Atlassian research. 16 principles across button text, error messages, empty states, link text, general microcopy, and voice & tone. 4 codifiable principles become verification checks (v38–v41): button verb phrase, no trailing period on buttons, descriptive link text, no ALL CAPS. 12 non-codifiable principles are governance. Tooling: Vale, textlint, alex. detail.design added to provenance as gap-signal source. 4 anti-patterns added (bare-noun buttons, generic errors, bare link text, ALL CAPS). Copywriting category weight: 8.',
      evidence: [
        'https://www.designesy.org/contracts/design-system.json',
        'https://www.nngroup.com/articles/ui-copy/',
        'https://polaris.shopify.com/content/error-messages',
        'https://carbondesignsystem.com/guidelines/content/writing-style/',
        'https://learn.microsoft.com/en-us/windows/apps/design/style/writing-style',
        'https://detail.design',
      ],
    },
  ],
  promotion_candidates: {
    from_lab: null,
    target_version: null,
    status: 'none',
    rules: [] as readonly string[],
    note: 'No open promotion candidates. Poise rules adopted in v0.1.1. Takt rules adopted in v0.1.2. Cadence rules adopted in v0.1.3.',
  },
} as const;

export type DesignSystemContract = typeof designSystemContract;
