/**
 * Designesy Tokens Contract v0.1.0 — machine-readable form.
 * Sibling contract governing W3C DTCG 2025.10 token-format conformance.
 * Source: internal contract markdown (not for public distribution).
 *
 * This is the machine export. The human page is at /contracts/tokens.
 * The contract markdown is the source of truth; this JSON is derived.
 */

export const tokensContract = {
  id: 'designesy.tokens',
  version: '0.1.0',
  status: 'provisional',
  name: 'Designesy Tokens Contract',
  kind: 'contract' as const,
  public_url: 'https://www.designesy.org/contracts/tokens',
  machine_url: 'https://www.designesy.org/contracts/tokens.json',
  updated: '2026-08-30',
  purpose:
    'Token-format conformance is the foundation of portable design intelligence. If tokens are not structurally valid, every downstream tool inherits the rot.',
  source_authority: {
    primary: 'W3C Design Tokens Format Module 2025.10 (CG-FINAL, 2025-10-28)',
    color_module: 'W3C Design Tokens Color Module 2025.10 (CG-FINAL, 2025-10-28)',
    json_schema: 'https://www.designtokens.org/schemas/2025.10/format.json',
    resolver_schema: 'https://www.designtokens.org/schemas/2025.10/resolver.json',
    internal: 'designesy-core.v0.3.md §8 Tokens',
    reference_validator: '@terrazzo/parser 2.4.0',
    secondary_validator: 'style-dictionary 5.5.0 (partial DTCG 2025.10 support)',
  },
  conformance: {
    required_token_properties: {
      $value: 'required — single-valued; ranges in $extensions.designesy.range',
      $type: 'required — direct, inherited from parent group, or via alias. Tools MUST NOT infer type from value.',
      $description: 'recommended — required on semantic tokens, optional on primitives',
      $extensions: 'optional — custom data, keys MUST be namespaced (e.g. $extensions.designesy.*)',
    },
    standard_dtcg_types: ['color', 'dimension', 'fontFamily', 'duration', 'cubicBezier', 'number', 'boolean'],
    custom_designesy_types: [
      { type: 'spring', extension_key: '$extensions.designesy.spring', description: 'Physics-based motion (stiffness, damping, mass)' },
      { type: 'sound', extension_key: '$extensions.designesy.sound', description: 'Acoustic cue (frequency, waveform, duration, envelope)' },
    ],
    color_spaces: {
      mandatory_for_new: ['oklch'],
      permitted: ['oklch', 'display-p3', 'srgb'],
      legacy_form: 'bare hex string (e.g. "#010102") — valid DTCG, SHOULD migrate to structured OKLCH',
      new_semantic_tokens_must_use: 'OKLCH or Display-P3',
    },
    dimension_rules: {
      units: ['px', 'rem'],
      object_form: '{ "value": number, "unit": "px" | "rem" }',
      rem_based: 'Designesy uses rem-based dimensions (root 16px). Px permitted for sub-pixel, shadows, borders.',
    },
    schema_property: 'Files MUST declare $schema per the designesy validator (engine check t01 fails files without it) — stricter than the DTCG spec, which marks it SHOULD',
  },
  verification: {
    // Check IDs and order match the designesy_tokens_score engine exactly
    // (api/mcp route — t01…t10). The engine reads checks[N].item positionally,
    // so this array must never be reordered or renumbered ahead of it.
    // This document is the CONTRACT (rules), not a DTCG token file — a token
    // file that passes all 10 lives at /export/dtcg (the contract's live export).
    checks: [
      { id: 't01', item: '$schema declaration present and pointing at designtokens.org', pass: 'Present, designtokens.org', warn: 'Present but non-canonical', fail: 'Missing — no editor validation' },
      { id: 't02', item: 'Token groups present (top-level non-$ keys)', pass: 'Groups found', fail: 'No token groups' },
      { id: 't03', item: 'Every token has $type (direct or inherited)', pass: 'All tokens typed', warn: 'Partial typing', fail: 'Any token missing type' },
      { id: 't04', item: 'Every token has $value', pass: 'All valued', fail: 'Any missing value' },
      { id: 't05', item: 'Color tokens use structured {colorSpace, components} format, not bare hex', pass: 'No bare hex', warn: 'Mixed structured and bare hex', fail: 'All bare hex' },
      { id: 't06', item: '$type values are DTCG 2025.10 standard types', pass: 'All standard', warn: 'Non-standard types present (custom — see t07)', fail: 'No tokens typed' },
      { id: 't07', item: 'Custom types namespaced (dot-prefix, e.g. designesy.spring via $extensions.designesy.*)', pass: 'All namespaced', warn: 'Bare custom type names', fail: 'n/a' },
      { id: 't08', item: 'Dimension units are valid CSS length units (px, rem preferred)', pass: 'All valid', warn: 'Partial', fail: 'Invalid units' },
      { id: 't09', item: 'Token naming hierarchy — tokens organized into nested groups', pass: 'Groups with hierarchy', warn: 'Flat token set', fail: 'No tokens' },
      { id: 't10', item: 'No deprecated pre-2025.10 patterns (bare hex colors, bare number dimensions, $ref syntax)', pass: 'Clean', warn: 'Deprecated patterns found', fail: 'n/a' },
    ],
    scoring: '10 checks. PASS counts toward score; WARN and FAIL do not (WARN=0, matching the engine — not 0.5). Score = (PASS / checks run) × 100 — SKIP still counts in the denominator. A≥90, B≥80, C≥70, D≥60, F<60.',
    validation_tools: {
      primary: '@terrazzo/parser 2.4.0 — tz check [file]',
      secondary: 'ajv 8.20.0 + ajv-formats 3.0.1 against DTCG JSON Schema URL',
      designesy_specific: 't05, t07, t09, t10 require custom validator over DTCG schema',
    },
    documented_not_engine_wired: {
      note: 'Deeper conformance rules this contract declares that designesy_tokens_score does not yet check. Listed here so the gap is explicit, not hidden — an unwired check presented as enforced is the same failure as a Semantic category with zero checks.',
      checks: [
        'Semantic tokens have $description — recommended, required on semantic tokens; custom validator needed',
        'Color tokens use OKLCH or Display-P3 (mandatory for new semantic tokens) — color-space check not wired',
        'Aliases resolve to valid typed tokens — resolver validation not wired',
        'Full DTCG 2025.10 JSON Schema validation via @terrazzo/parser (tz check) — external, not wired',
        'No type drift between themes — multi-theme comparison not wired',
      ],
    },
  },
  relationship_to_core: {
    '§8 Tokens': 'Format conformance layer — core defines tokens, this validates them',
    '§8.1 Color': 'Color-space rules — core uses legacy hex, this defines OKLCH migration path',
    '§6 Economy Is Intelligence': 'Fewer, stronger tokens',
    '§6 Systems Enable Freedom': 'Portable, validated tokens',
    '§17 Verification': 'Machine-checkable verification layer for tokens',
    'live_export': 'The DTCG export (/export/dtcg) is generated from the design-system contract v0.4.0 and scores 90% (Grade A) on designesy_tokens_score — 9 PASS, 1 WARN (namespaced custom types designesy.spring/sound/cubicBezier, correct per t07; verified 2026-08-30).',
  },
  open_questions: [
    'DTCG custom types proposal: should spring and sound be proposed to W3C DTCG?',
    'Color migration timeline: when should §8.1 migrate from bare hex to structured OKLCH?',
    'Resolver support: should Designesy adopt DTCG 2025.10 resolvers?',
    'Multi-theme conformance: how should t09 handle intentional cross-theme type changes?',
    'Style Dictionary integration: switch from Terrazzo when style-dictionary achieves full 2025.10 support?',
  ],
} as const;