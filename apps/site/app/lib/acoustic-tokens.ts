/**
 * Designesy acoustic token system — the sound parallel to the visual token system.
 * Source: docs/acoustic-tokens.md (v0.1.1, 2026-07-12)
 * Engine: Cuelume v0.1.0 (MIT)
 *
 * This data module is the single source of truth for acoustic tokens.
 * The /acoustic-tokens page and /acoustic-tokens.json route both read from here.
 */
export const acousticTokens = {
  version: '0.2.0',
  updated: '2026-08-08',
  engine: 'Cuelume v0.2.2 (MIT) + cuelume-extend v0.2.0',
  engine_repo: 'https://github.com/Danilaa1/cuelume',
  engine_npm: 'https://www.npmjs.com/package/cuelume',
  description:
    'Designesy acoustic token system — the sound parallel to the visual token system. No sound appears on a Designesy surface without a token name and a rationale here.',
  standards_context: {
    w3c_dtgc_2025_10:
      'The W3C Design Tokens Format Module 2025.10 does not define acoustic/audio token types. Designesy acoustic tokens are net-new relative to the canonical standard.',
    proposed_type:
      'Designesy declares $type: sound with $extensions.designesy namespacing per the DTCG extension convention. This format may be proposed to the W3C DTCG as a future token type contribution.',
    reference_format:
      '{"$value":"tick","$type":"sound","$description":"Navigation hover","$extensions":{"designesy":{"engine":"cuelume","role":"nav"}}}',
  },
  tokens: [
    {
      token: '--cue:brand',
      cuelume_cue: 'sparkle',
      character: 'Bright playful accent',
      interaction_role: 'Brand wordmark contact',
      where_used:
        'Hero wordmark, topbar logo, footer mark, Open field card hover',
    },
    {
      token: '--cue:nav',
      cuelume_cue: 'tick',
      character: 'Crisp instant tick',
      interaction_role: 'Navigation and wayfinding',
      where_used: 'Topbar nav links, surface footer links, secondary CTAs',
    },
    {
      token: '--cue:invite',
      cuelume_cue: 'chime',
      character: 'Soft default chime',
      interaction_role: 'Primary invitation / machine surfaces',
      where_used: 'Primary hero CTA hover, kit field card, machine footer links',
    },
    {
      token: '--cue:action',
      cuelume_cue: 'press',
      character: 'Dull muted knock',
      interaction_role: 'Pointer-down on actionable surfaces',
      where_used: 'Buttons, field cards, surface cards',
    },
    {
      token: '--cue:resolve',
      cuelume_cue: 'release',
      character: 'Brighter springy tick',
      interaction_role: 'Pointer-up default resolve',
      where_used: 'Most buttons and cards',
    },
    {
      token: '--cue:complete',
      cuelume_cue: 'success',
      character: 'Warm three-note confirmation',
      interaction_role: 'High-value resolve',
      where_used: 'Primary Open CTA release, Open/Kit field card release',
    },
    {
      token: '--cue:reveal',
      cuelume_cue: 'bloom',
      character: 'Warm slow swell',
      interaction_role: 'Content / experiment reveal',
      where_used: 'Pillar cards, Lab field card hover',
    },
    {
      token: '--cue:list',
      cuelume_cue: 'whisper',
      character: 'Breathy quiet swell',
      interaction_role: 'Dense list / surface scan',
      where_used: 'Surface cards, principle rails, dense lists',
    },
    {
      token: '--cue:switch',
      cuelume_cue: 'toggle',
      character: 'Mechanical click-clack',
      interaction_role: 'State toggle',
      where_used: 'Sound preference button',
    },
    {
      token: '--cue:contact',
      cuelume_cue: 'droplet',
      character: 'Soft dismissive droplet',
      interaction_role: 'Contact / outbound mail',
      where_used: 'Footer mail, privacy mail',
    },
    // ── Extended cues (cuelume-extend.ts v0.2.0, 2026-08-08) ──────────
    {
      token: '--cue:error',
      cuelume_cue: 'error',
      character: 'Low descending two-note buzz',
      interaction_role: 'Error / corrective feedback',
      where_used: 'Copy failure, not-found page, error page',
    },
    {
      token: '--cue:warning',
      cuelume_cue: 'warning',
      character: 'Single medium triangle tone',
      interaction_role: 'Heads up, not blocking',
      where_used: 'Score warnings, form validation notices',
    },
    {
      token: '--cue:info',
      cuelume_cue: 'info',
      character: 'Brief high sine blip',
      interaction_role: 'Informational notice',
      where_used: 'Non-blocking status updates',
    },
    {
      token: '--cue:blocked',
      cuelume_cue: 'blocked',
      character: 'Two low square pulses, lowpass-filtered',
      interaction_role: 'Cannot proceed',
      where_used: 'Blocked operations, access denied',
    },
    {
      token: '--cue:retry',
      cuelume_cue: 'retry',
      character: 'Rising sine pair',
      interaction_role: 'Try again invitation',
      where_used: 'Retryable failures, timeout recovery',
    },
    {
      token: '--cue:processing',
      cuelume_cue: 'processing-start / processing-stop',
      character: 'Low triangle pulse loop, 500ms interval, gain 0.025',
      interaction_role: 'Analysis in progress (state loop)',
      where_used: 'Score engine running checks, audit processing',
    },
    {
      token: '--cue:check-pass',
      cuelume_cue: 'check-pass',
      character: 'Brief 880Hz sine blip, 40ms',
      interaction_role: 'One verification check passed',
      where_used: 'Score engine per-check feedback (reserved for future)',
    },
    {
      token: '--cue:check-fail',
      cuelume_cue: 'check-fail',
      character: 'Soft 220→110Hz triangle thud, 60ms',
      interaction_role: 'One verification check failed',
      where_used: 'Score engine per-check feedback (reserved for future)',
    },
    {
      token: '--cue:grade-reveal',
      cuelume_cue: 'grade-reveal',
      character: 'Grade-mapped arpeggio: A+ ascending 4-note + harmonics with large-room reverb; A ascending 4-note with small-room reverb; B ascending pair; C neutral single; D descending pair; F single low note',
      interaction_role: 'Score grade reveal — the hero acoustic moment',
      where_used: 'Score page grade animation completion, report page grade display',
    },
  ],
  reserved: [
    {
      cuelume_cue: 'chime',
      notes:
        'Also the library default hover fallback. Used intentionally for invite/machine surfaces.',
    },
    {
      cuelume_cue: 'droplet',
      notes: 'Used for mail/contact. Still reserved for future dismiss/collapse UI.',
    },
  ],
  mapping_rules: [
    'Brand marks earn sparkle. Hero wordmark, topbar logo, and footer mark are brand contact — not generic nav ticks.',
    'One primary cue family per role. Nav stays tick. Brand stays sparkle. Dense lists stay whisper. Do not randomize per page without updating this document.',
    'Hover sounds are fine-pointer only upstream. On coarse/touch pointers, Designesy binder maps the same hover cue to a single tap.',
    'Press/release on touch. Designesy binder plays the same cues on touch/pen pointerdown/pointerup.',
    'Toggle sounds fire via preference hook. The sound button does not use data-cuelume-toggle.',
    'No ambient audio. Cuelume is interaction-only. No background music, no mood beds, no loading sounds.',
    'Preference is user-owned. Designesy stores the sound preference in localStorage under designesy:sound.',
    'Audio unlock on first real cue. Mobile Safari keeps AudioContext suspended until a user gesture.',
    'Every cue must trace to this document. If a sound appears in the markup without a token here, it is a contract violation.',
  ],
  accessibility: {
    reduced_motion_sound_off:
      'prefers-reduced-motion: reduce is treated as an acoustic-reduction proxy. The user can still enable sound manually via the toggle.',
    no_focus_sounds:
      'Sounds fire on pointer and click events, not on focus. Screen reader users navigate by focus and are not bombarded with hover cues.',
    toggle_keyboard_accessible:
      'The sound toggle button uses aria-pressed and plays via the preference hook on click (includes keyboard activation).',
    silent_fallback:
      'If Web Audio is blocked or unavailable, all sounds become no-ops. No errors, no degradation of visual experience.',
    volume_not_adjustable:
      'Cuelume synthesizes at fixed gain levels tuned for subtlety. If a user finds sounds too loud, they can mute via the toggle.',
  },
  provenance: {
    library: 'cuelume@0.1.0 (MIT, Daniel Belyi)',
    npm: 'https://www.npmjs.com/package/cuelume',
    repo: 'https://github.com/Danilaa1/cuelume',
    installed: '2026-07-11 in designesy-org/apps/site',
    visual_token_system: 'DESIGN.md section 7',
    haptic_sibling: 'docs/haptic-tokens.md (web-haptics, press/tap only, default on when supported)',
    version_history: {
      '0.1.0': 'Initial cue set: tick, press, release, bloom, whisper, toggle, success',
      '0.1.1':
        'Brand sparkle, invite chime, complete success, contact droplet variety pass',
      '0.2.0':
        'Extended cues: error, warning, info, blocked, retry, processing loop, check-pass/fail, grade-reveal arpeggios. Cuelume-extend v0.2.0 with ConvolverNode reverb for A/A+ grades.',
    },
  },
} as const;