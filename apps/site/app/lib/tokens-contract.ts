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
  updated: '2026-07-28',
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
    schema_property: 'Files SHOULD declare $schema for editor validation',
  },
  verification: {
    checks: [
      { id: 't01', item: 'Every token has $type (direct or inherited)', pass: 'All tokens typed', fail: 'Any token missing type' },
      { id: 't02', item: 'Every token has $value', pass: 'All valued', fail: 'Any missing value' },
      { id: 't03', item: 'Semantic tokens have $description', pass: 'All described', warn: 'Primitive missing description' },
      { id: 't04', item: 'Color tokens use OKLCH or Display-P3', pass: 'New tokens OKLCH/P3', fail: 'New semantic uses bare hex', warn: 'Legacy hex in primitive' },
      { id: 't05', item: 'Custom types namespaced under $extensions.designesy.*', pass: 'Namespaced', fail: 'Bare custom type' },
      { id: 't06', item: 'Aliases resolve to valid typed tokens', pass: 'All resolve', fail: 'Dangling reference' },
      { id: 't07', item: '$schema property present', pass: 'Present', warn: 'Missing (no editor validation)' },
      { id: 't08', item: 'DTCG 2025.10 schema validation passes (Terrazzo tz check)', pass: 'Passes', fail: 'Schema violation' },
      { id: 't09', item: 'No type drift between themes (same token, different $type)', pass: 'Consistent', fail: 'Drift detected' },
      { id: 't10', item: 'Dimension units are px or rem only', pass: 'Valid units', fail: 'Invalid unit' },
    ],
    scoring: '10 checks. PASS=1, WARN=0.5, FAIL=0. Score = (points/10) × 100. A≥90, B≥80, C≥70, D≥60, F<60.',
    validation_tools: {
      primary: '@terrazzo/parser 2.4.0 — tz check [file]',
      secondary: 'ajv 8.20.0 + ajv-formats 3.0.1 against DTCG JSON Schema URL',
      designesy_specific: 't03, t04, t05, t09 require custom validator over DTCG schema',
    },
  },
  relationship_to_core: {
    '§8 Tokens': 'Format conformance layer — core defines tokens, this validates them',
    '§8.1 Color': 'Color-space rules — core uses legacy hex, this defines OKLCH migration path',
    '§6 Economy Is Intelligence': 'Fewer, stronger tokens',
    '§6 Systems Enable Freedom': 'Portable, validated tokens',
    '§17 Verification': 'Machine-checkable verification layer for tokens',
  },
  open_questions: [
    'DTCG custom types proposal: should spring and sound be proposed to W3C DTCG?',
    'Color migration timeline: when should §8.1 migrate from bare hex to structured OKLCH?',
    'Resolver support: should Designesy adopt DTCG 2025.10 resolvers?',
    'Multi-theme conformance: how should t09 handle intentional cross-theme type changes?',
    'Style Dictionary integration: switch from Terrazzo when style-dictionary achieves full 2025.10 support?',
  ],
} as const;