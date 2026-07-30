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
  updated: '2026-07-30',
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
    copywriting: 'UX copywriting principles from NN/g, Polaris, Carbon, Fluent, HIG (v0.4.0)',
  },
  provenance: {
    implementation: 'designesy.org (Next.js App Router)',
    token_source: 'Live site design tokens (:root)',
    doctrine:
      'Designesy design doctrine — public surface carries operational values only',
    motion_references:
      'Short settle and easing language adapted into --ease-out, --ease-in-out, --ease-drawer',
    interaction_audio: 'Cuelume v0.1.0; preference owned by Designesy',
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
        role: 'Motion token library — duration scale cross-referenced; press scale values validated (0.96/0.97 match); easing curves confirmed compatible',
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
  },
  layout: {
    max_width: { token: '--maxw', value: '1080px', role: 'Content shell max width' },
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
    body: '16px / 1.55, system stack (-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Arial, Helvetica, sans-serif)',
    headings: 'weight 700, line-height 1.08, letter-spacing -0.02em',
    hero_wordmark: 'clamp(3.2rem, 9vw, 5.5rem), weight 800, tracking -0.04em',
    eyebrows:
      '0.72–0.75rem, weight 600, uppercase, letter-spacing 0.18em, muted-dim',
    lede: '1.1–1.5rem, weight 500, ink — one clear claim',
    supporting_note: '0.85–0.95rem, muted, max-width ~520–580px',
    rule: 'Never invent decorative display fonts for public UI; system stack is the contract',
    cadence_adopted: 'v0.1.3 — font smoothing on root, rem-based scale, line-height by role, tracking by size, measure cap, text-wrap balance+pretty, tabular numbers, ::selection with --signal, user-select on UI chrome, 16px input floor',
    font_synthesis: 'none set on :root — prevents fake browser weights (fixed 2026-07-15)',
    text_underline_position: 'from-font set on :root — aligns underlines to font metrics (fixed 2026-07-15)',
    text_decoration_skip_ink: 'auto set on :root — skips descenders for readability (fixed 2026-07-15)',
  },
  acoustic: {
    engine: 'Cuelume v0.1.0 (MIT)',
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
      'signal = brand action and wordmark mark · signal-light = hover/focus · signal-dim = badge/wash · activation = reserved highlight',
    type_roles:
      'ink = primary claim · muted = supporting body · muted-dim = eyebrows, meta, footers',
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
        'Adopted Lab Two · Takt interface-feel rules: concentric radii, press scale (0.96/0.985), image outlines, hit area floor, stagger rhythm, no transition:all, spare will-change. Rules compiled from external design intelligence (Amicro, Krehel /better-ui) and verified on live CSS.',
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
        'Adopted Lab Three · Cadence typography rules: font smoothing on root, rem-based scale, line-height by role, tracking by size, measure cap, text-wrap balance+pretty, tabular numbers, ::selection with --signal, user-select on UI chrome, 16px input floor. Rules compiled from external typography intelligence (Krehel /better-typography) and verified on live CSS. Three open tensions documented: font-synthesis, logical properties, underline-from-font.',
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
        'Reconciled with on-disk core contract v0.3.0. Spring physics tokens added (default + momentum). Full acoustic cue enumeration added (10 cues via custom $type: sound). Ten Non-Negotiable Motion Standards added as §16. Motion anti-patterns formalized (6 block-on-sight + 4 caution). Entrance scale tokens added (min 0.9, default 0.95). Stagger interval token added (30ms lower bound). font-synthesis: none and text-underline-position: from-font confirmed fixed and removed from open tensions. W3C DTCG 2025.10 token format alignment documented.',
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
