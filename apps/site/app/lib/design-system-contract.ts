/**
 * Designesy design system contract v0.1 — machine + human source.
 * Values must match the live site token foundation in globals.css :root.
 * When CSS and this file disagree, the live styles win until revised.
 */

export const designSystemContract = {
  id: 'designesy.design-system',
  version: '0.1.0',
  status: 'public',
  name: 'Designesy design system',
  public_url: 'https://designesy.org/contracts#design-system-contract',
  machine_url: 'https://designesy.org/contracts/design-system',
  updated: '2026-07-12',
  schema_hints: {
    colors: 'primitive + semantic color roles',
    typography: 'type rules and stacks',
    rounded: 'radius tokens',
    spacing: 'layout spacing and breakpoints',
    components: 'behavior and states',
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
      url: 'https://designesy.org/labs/poise',
      role: 'Source lab for interaction rules under review for adoption',
    },
  },
  colors: {
    ink: { token: '--ink', value: '#ffffff', role: 'Primary text / foreground' },
    muted: { token: '--muted', value: '#a0a0a0', role: 'Secondary text' },
    muted_dim: {
      token: '--muted-dim',
      value: '#6b6b6b',
      role: 'Tertiary / meta text',
    },
    paper: { token: '--paper', value: '#000000', role: 'Page background' },
    surface: { token: '--surface', value: '#0a0a0a', role: 'Card / panel base' },
    surface_raised: {
      token: '--surface-raised',
      value: '#111111',
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
      'Interactive settle: scale(0.97) at ~160ms --ease-out',
      'Hover lift only under (hover: hover) and (pointer: fine)',
      'Wordmark mark: opacity breath only (~3.2s --ease-in-out); no blur, glow, or gradient decoration',
      'prefers-reduced-motion: reduce collapses non-essential motion; sound defaults off',
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
  ],
  implementation: [
    'Single live token source of truth — no secondary theme framework',
    'Server-rendered by default; client only for sound, bind, and preference controls',
    'metadataBase is https://designesy.org; public label is Designesy',
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
  ],
  open_tensions: [
    'Light theme is not contracted — dark technical foundation is provisional',
    '--activation exists but has limited public surface usage',
    'Inter is named in the stack but not self-hosted; system fallback is intentional',
    'Shadow tokens exist; elevation language is still light-touch (borders lead)',
    'Human contract page and machine export remain dual sources until a single generator owns both',
  ],
  promotion_candidates: {
    from_lab: 'Poise',
    target_version: '0.1.1',
    status: 'candidate',
    rules: [
      'Wordmark mark may use opacity breath only; never blur, glow, or gradient decoration',
      'Interactive press settle: scale(0.97) at ~160ms with --ease-out',
      'Sound preference key designesy:sound; engine follows Designesy',
      'Reduced motion disables non-essential animation and defaults sound off',
      'Hover translation only under fine pointer + hover-capable media',
      'Public product names stay human and premium; internal token names may differ',
    ],
  },
} as const;

export type DesignSystemContract = typeof designSystemContract;
