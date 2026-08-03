/**
 * Designesy Motion Contract v0.1.0 — machine-readable form.
 * Sibling contract governing Lottie spec v1.0.1 + Designesy §16 motion conformance.
 * Source: D:\DESIGNESY\docs\designesy\contracts\designesy-motion.v0.md
 *
 * This is the machine export. The human page is at /contracts/motion.
 * The contract markdown is the source of truth; this JSON is derived.
 */

export const motionContract = {
  id: 'designesy.motion',
  version: '0.1.0',
  status: 'provisional',
  name: 'Designesy Motion Contract',
  kind: 'contract' as const,
  public_url: 'https://www.designesy.org/contracts/motion',
  machine_url: 'https://www.designesy.org/contracts/motion.json',
  full_contract_path: 'D:\\DESIGNESY\\docs\\designesy\\contracts\\designesy-motion.v0.md',
  updated: '2026-07-28',
  purpose:
    'Motion is structural communication, not ornament. If motion files are malformed or violate the non-negotiable standards, they degrade trust, clarity, and usability.',
  source_authority: {
    primary: 'Lottie Animation Community Specification v1.0.1 (2025-06-26)',
    json_schema: 'https://lottie.github.io/lottie-spec/1.0.1/specs/schema/',
    schema_format: 'JSON Schema Draft 2020-12',
    repo: 'https://github.com/lottie/lottie-spec',
    internal: 'designesy-core.v0.3.md §7 (Motion Stance), §16 (Ten Non-Negotiable Motion Standards)',
    reference_validator: 'ajv 8.20.0 (draft 2020-12 via ajv/dist/2020) + ajv-formats 3.0.1',
  },
  conformance: {
    lottie_format: {
      validation_setup: 'new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv); fetch schema from lottie-spec URL; compile; validate',
      warning: 'Draft 2020-12 is NOT backwards compatible — cannot mix with other JSON Schema drafts in same ajv instance',
      required_fields: {
        v: 'string — Bodymovin version (e.g. "5.12.0"), NOT the spec version',
        fr: 'number — Frame rate (fps)',
        ip: 'number — In point (start frame)',
        op: 'number — Out point (end frame)',
        w: 'integer — Width in pixels',
        h: 'integer — Height in pixels',
        layers: 'array — Layers (array of Layer objects)',
      },
      optional_fields: ['assets', 'nm', 'ddd', 'fonts', 'chars', 'markers', 'meta', 'slots'],
      spec_version: '10001 (encodes 1.0.1) — in schema $version, not in file',
    },
    deprecated_versions: {
      bodymovin_4x: 'Flag as deprecated — recommend re-export with LAC-spec-compliant exporter',
      pre_1_0: 'Pre-1.0 schema shapes are legacy — flag files that predate spec formalization',
    },
    reduced_motion: {
      requirement: 'Every motion-bearing artifact MUST have a prefers-reduced-motion path (Designesy §16.8)',
      markers: 'markers array defines named sections (e.g. "intro", "loop", "outro") — players select shorter/calmer segment',
      slots: 'slots object (1.0.1 feature) — "reduced-motion" slot can swap aggressive animations for static/minimal',
      external_wrapper: 'If Lottie cannot contain reduced-motion variant, embedding page MUST gate with prefers-reduced-motion media query',
      conformance: 'markers array with reduced-motion marker OR slots object with override OR documented external handling',
    },
    ten_non_negotiable: [
      { num: 1, rule: 'Easing is deliberate', detail: 'Use contract cubicBezier tokens, not bare CSS keywords' },
      { num: 2, rule: 'Properties are explicit', detail: 'Never transition:all. Name exact properties.' },
      { num: 3, rule: 'Entrances have opacity', detail: 'Animate from scale(0.9-0.97) + opacity, never scale(0)' },
      { num: 4, rule: 'Keyboard is still', detail: 'No motion on keyboard-initiated or high-frequency interactions' },
      { num: 5, rule: 'Layout is not animated', detail: 'Never animate width/height/margin/padding/top/left. Use transform/opacity.' },
      { num: 6, rule: 'Touch is gated', detail: ':hover motion on touch surfaces requires explicit gating' },
      { num: 7, rule: 'Duration is bounded', detail: 'UI animation ≤ 300ms unless justified' },
      { num: 8, rule: 'Reduced-motion is handled', detail: 'Every animation has prefers-reduced-motion path' },
      { num: 9, rule: 'Press is asymmetric', detail: 'Press and release use asymmetric timing' },
      { num: 10, rule: 'Easing is never ease-in', detail: 'No ease-in. Deceleration (ease-out) or custom curves only.' },
    ],
  },
  verification: {
    checks: [
      { id: 'm01', item: 'Lottie file validates against LAC v1.0.1 JSON Schema', pass: 'Schema valid', fail: 'Schema violation' },
      { id: 'm02', item: 'Required fields present (v, fr, ip, op, w, h, layers)', pass: 'All present', fail: 'Any missing' },
      { id: 'm03', item: 'No deprecated Bodymovin version (v: "4.x")', pass: 'v >= "5.x"', fail: 'v: "4.x"' },
      { id: 'm04', item: 'markers array present (reduced-motion support)', pass: 'Present', fail: 'Missing' },
      { id: 'm05', item: 'meta object present (attribution, author, description)', pass: 'Present', warn: 'Missing (attribution gap)' },
      { id: 'm06', item: 'prefers-reduced-motion path documented (§3.4)', pass: 'Documented', fail: 'Not handled', warn: 'External wrapper noted' },
      { id: 'm07', item: 'Easing uses deliberate curves (§16.1, §16.10)', pass: 'Custom curves', fail: 'ease/linear/ease-in' },
      { id: 'm08', item: 'Duration ≤ 300ms for UI motion (§16.7)', pass: '<= 300ms', fail: '> 300ms without justification' },
      { id: 'm09', item: 'No layout-property animation (§16.5)', pass: 'transform/opacity only', fail: 'width/height/margin/padding/top/left' },
      { id: 'm10', item: 'No motion on keyboard-initiated actions (§16.4)', pass: 'Still', fail: 'Motion on keyboard' },
    ],
    scoring: '10 checks. PASS=1, WARN=0.5, FAIL=0. Score = (points/10) × 100. A≥90, B≥80, C≥70, D≥60, F<60.',
    validation_tools: {
      primary: 'ajv 8.20.0 + ajv-formats 3.0.1 against LAC v1.0.1 JSON Schema URL',
      secondary: 'Custom Designesy §16 checker (m07-m10) — parses CSS/GSAP/Lottie keyframes',
    },
  },
  relationship_to_core: {
    '§7 Motion Stance': 'Posture layer — this contract is format conformance over that posture',
    '§16 Ten Non-Negotiable Motion Standards': 'Restated with Lottie-specific interpretation',
    '§16.8 Reduced-motion': 'Lottie-specific reduced-motion implementation',
    '§17 Verification': 'Motion verification layer',
  },
  open_questions: [
    'Raw schema URL verification: is it lottie.schema.json appended to the schema path?',
    'Reduced-motion marker convention: should Designesy establish "reduced"/"calm"/"static" name?',
    'GSAP scope: should this contract cover GSAP timeline validation or a separate contract?',
    'HyperFrames scope: does the HyperFrames quality gate handle HyperFrames independently?',
    'Lottie spec stability: should validator warn when file uses features outside approved subset?',
  ],
} as const;