/**
 * Designesy Guardrails Contract v0.1.0 — machine-readable form.
 * Sibling contract governing AI-build guardrail emission.
 * Source: DLS Lead "tokens are a contract, not a library",
 *          davekurian "tokens are types" (dev.to),
 *          Designesy research 2026-08-01.
 *
 * The guardrail emitter ingests a design system and emits a frozen,
 * machine-readable build contract + lint config for AI coding agents.
 *
 * This is the machine export. The human page is at /contracts/guardrails.
 */

export const guardrailsContract = {
  id: 'designesy.guardrails',
  version: '0.1.0',
  status: 'provisional',
  name: 'Designesy Guardrails Contract',
  kind: 'contract' as const,
  public_url: 'https://www.designesy.org/contracts/guardrails',
  machine_url: 'https://www.designesy.org/contracts/guardrails.json',
  updated: '2026-08-01',
  purpose:
    'Guardrails are the product layer: ingest a design system, emit a frozen build contract for AI coding agents — the file the agent reads, plus the lint config that enforces it. "Tokens are a contract, not a library."',
  source_authority: {
    primary: 'Designesy research 2026-08-01',
    contract_shift: 'DLS Lead — "treat the design system as an API, not a library... CI fails if either side breaks the agreement"',
    types_not_suggestions: 'davekurian (dev.to) — "tokens are types... you\'re removing the off-brand options from the API it consumes"',
    adoption_signal: 'zeroheight 2026 — token adoption 84% (up from 56%), but 40% still sync tokens by hand',
  },
  conformance: {
    output_bundle: [
      { component: 'tokens', description: 'Frozen DTCG-format token file extracted from the site :root — the single source of truth for colors, spacing, typography, motion' },
      { component: 'lintConfig', description: 'Stylelint config object generated from tokens — allowed-values rules, color-no-hex, declaration-property-value-allowed-list' },
      { component: 'agentRules', description: 'Markdown rules file (AGENTS.md format) with token allowlist, composition rules, and anti-patterns for AI coding agents' },
      { component: 'componentContract', description: 'Allowed component prop patterns derived from the token system — what props agents can use with which token values' },
      { component: 'antiPatterns', description: 'What NOT to do — inline values, fabricated tokens, off-system colors, magic numbers' },
    ],
    emission_method:
      'Fetch the URL, extract all CSS + :root custom properties, parse token values into DTCG format, generate lint rules from the allowed values, emit the AGENTS.md rules file, derive component contract patterns.',
  },
  verification: {
    checks: [
      { id: 'g01', item: 'Token extraction — :root custom properties captured', pass: 'N tokens extracted and converted to DTCG format', fail: 'No :root custom properties found — nothing to guardrail' },
      { id: 'g02', item: 'Lint config generated — Stylelint rules from token values', pass: 'Stylelint config with N rules generated', fail: 'Could not generate lint rules — insufficient token data' },
      { id: 'g03', item: 'Agent rules emitted — AGENTS.md format with token allowlist', pass: 'AGENTS.md rules file generated with N token references', fail: 'Could not generate agent rules' },
      { id: 'g04', item: 'Component contract derived — allowed prop patterns', pass: 'Component contract with N patterns generated', fail: 'Could not derive component patterns — no tokens to derive from' },
      { id: 'g05', item: 'Anti-patterns documented — what NOT to do', pass: 'Anti-pattern list generated from detected inline values', fail: 'No anti-patterns detected — possible if the site has no inline values' },
    ],
    scoring: '5 checks. PASS=1, FAIL=0. Score = (points/5) × 100. A≥90, B≥80, C≥70, D≥60, F<60. Note: the guardrail emitter is an output generator, not a scoring engine — the score reflects emission completeness, not design quality.',
    validation_tools: {
      primary: 'Designesy guardrails engine — CSS extraction + token-to-lint transformation',
      method: 'Fetch HTML + CSS, extract :root tokens, generate DTCG tokens, Stylelint config, AGENTS.md, component contract',
      browser_only: 'None — all checks are static CSS analysis + generation, no browser needed',
    },
  },
  relationship_to_core: {
    '§6 Economy Is Intelligence': 'Fewer tokens = simpler guardrails = less drift surface',
    '§6 Systems Enable Freedom': 'A frozen build contract is the freedom boundary for AI agents',
    'designesy.org itself': 'Designesy guardrails its own system — the SKILL.md and contracts are the guardrail output',
  },
  open_questions: [
    'The component contract (g04) is heuristic — it infers patterns from token names, not from actual component code',
    'The lint config targets Stylelint — teams using Lightning CSS or Biome need a different config format',
    'The agent rules file uses AGENTS.md format — teams using Cursor .cursorrules or Claude CLAUDE.md need format adaptation',
    'The emitter does not verify that the guardrail file actually prevents drift — that requires running the lint against AI output',
  ],
} as const;