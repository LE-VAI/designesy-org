/**
 * Designesy Graph — public read-only provenance chain.
 * The Graph shows how sources become shipped work through the Designesy pipeline.
 * Source: docs/designesy/03-architecture.md (Graph layer definition)
 *
 * This is the public surface of the internal Graph. It shows the chain
 * without internal paths or control-plane naming.
 */
export const graph = {
  version: '0.1',
  description:
    'The living knowledge tree: how sources become shipped work through the Designesy pipeline.',
  chain: [
    {
      stage: 'Source',
      description:
        'Observed material — external design intelligence, prior work, real artifacts.',
      public_examples: [
        'External design intelligence research (W3C DTCG, Apple HIG, Material 3)',
        'Cuelume interaction sound library',
        'Transitions.dev motion reference',
        'Better-ui and better-typography agent skills',
      ],
    },
    {
      stage: 'Observation',
      description:
        'What was noticed. The raw finding before it becomes a claim.',
      public_examples: [
        'No existing tool compiles principles into verifiable contracts',
        'W3C DTCG 2025.10 does not define acoustic tokens',
        'Press feedback at scale(0.97) feels physical; scale(0) feels broken',
      ],
    },
    {
      stage: 'Claim',
      description: 'A stated position derived from observation.',
      public_examples: [
        'Motion is structural communication, not ornament',
        'Acoustic tokens should be first-class design contract material',
        'If the response is louder than the action, it fails',
      ],
    },
    {
      stage: 'Tension',
      description: 'An open problem or unresolved conflict.',
      public_examples: [
        'Block-axis logical properties not yet migrated',
        'Dual-source risk: human page and machine export can drift',
        'Font-synthesis, logical properties, underline-from-font open tensions',
      ],
    },
    {
      stage: 'Principle',
      description: 'A working rule that resolves a tension.',
      public_examples: [
        'Purpose earns form',
        'Economy is intelligence',
        'Responsibility is a design material',
      ],
    },
    {
      stage: 'Pattern',
      description: 'A reusable approach derived from principles.',
      public_examples: [
        'Labs compile into contracts: experiment, review, adopt, version',
        'Field checks verify live CSS against contract rules',
        'Case studies document shipped work with outcomes, including underperformance',
      ],
    },
    {
      stage: 'Contract Rule',
      description: 'An enforceable, tokenized rule adopted into the design system.',
      public_examples: [
        'Press settle: scale(0.97) at ~160ms with ease-out',
        'Concentric border radius: outerRadius = innerRadius + padding',
        'Rem-based scale: every text size is a rem multiple of the 16px root',
      ],
    },
    {
      stage: 'Token / Component / Behavior',
      description: 'The machine-readable expression of a contract rule.',
      public_examples: [
        '--ease-out: cubic-bezier(0.23, 1, 0.32, 1)',
        '--cue:action: press (Cuelume engine)',
        'shape.radius.default: 6px',
      ],
    },
    {
      stage: 'Verification Artifact',
      description: 'Proof that the rule is live and working.',
      public_examples: [
        'Field check · Poise (pass with notes)',
        'Field check · Takt (pass with notes, 47,680 bytes CSS audited)',
        'Field check · Cadence (pass with notes, 48,755 bytes CSS audited)',
        'Keyboard path verification',
      ],
    },
    {
      stage: 'Shipped Work',
      description: 'Real artifacts produced using the contract.',
      public_examples: [
        'designesy.org (live, v0.4.0, 12 packages, 5 machine exports)',
        'Tile — interactive series composer (617 views on X)',
        'Compile — principle compiler (built, pending hosting)',
        'Continuity — founder narrative (shipped, underperformed, failure documented)',
      ],
    },
  ],
  note: 'The Graph prevents design knowledge from becoming anonymous taste. Every shipped artifact should trace backwards through this chain to a source.',
} as const;