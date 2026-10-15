// Own-contract mode: the normalized contract model (contract-mode spec §3.1).
//
// A team's own DESIGN.md or DTCG 2025.10 token file is read into this one
// model, so binding, the fidelity checks and the digest never branch on the
// format the team wrote. Next-free and import-free: the npm CLI can import
// this module later instead of copying it.

export type ContractFormat = 'design.md' | 'dtcg';
export type GroupName = 'colors' | 'typography' | 'radii' | 'spacing' | 'sizes' | 'durations' | 'easings';

/** 8-bit sRGB plus alpha (0 to 1). */
export interface Rgba8 { r: number; g: number; b: number; a: number }

export interface Dimension {
  value: number;
  unit: 'px' | 'rem' | 'em';
  /** px as is, rem times 16, em null (its size depends on context). */
  px: number | null;
}

export interface TokenBase {
  /** As written: 'colors.primary' (DESIGN.md) or 'color.brand.500' (DTCG). */
  path: string;
  /** Path of the referenced token when the value is a reference. */
  aliasOf?: string;
  /** DTCG $deprecated. */
  deprecated?: boolean;
  /** From $extensions["org.designesy"].cssVar or the token map. */
  cssVar?: string;
  /**
   * Declared inside another token (a component's literal pair color, radius
   * or padding; a DTCG border or shadow color): a declared value for the
   * membership checks, but not a token of its own, so the minimum contract and
   * the declared count leave it out.
   */
  nested?: boolean;
}

export interface ColorToken extends TokenBase {
  kind: 'color';
  rgba: Rgba8;
  hex: string;
  original: string;
}
export interface DimensionToken extends TokenBase { kind: 'dimension'; dim: Dimension }
export type LineHeight = { kind: 'ratio'; value: number } | { kind: 'length'; dim: Dimension };
export type TypeRole = 'heading' | 'body' | 'label' | 'code' | 'other';
export interface TypeStyle extends TokenBase {
  kind: 'typography';
  role: TypeRole;
  /** The first entry is the face; the rest are accepted fallbacks. */
  families?: string[];
  fontSize?: Dimension;
  fontWeight?: number;
  lineHeight?: LineHeight;
  letterSpacing?: Dimension;
  /** Four-character OpenType tags, lowercase, e.g. ['tnum']. */
  features?: string[];
}
export interface FamilyToken extends TokenBase { kind: 'fontFamily'; families: string[] }
export interface SizeToken extends DimensionToken { interactive: boolean }
export interface DurationToken extends TokenBase { kind: 'duration'; ms: number }
export interface EasingToken extends TokenBase { kind: 'cubicBezier'; points: [number, number, number, number] }
export interface ContrastPair {
  /** Contract path of the text color (or the component field holding a literal). */
  text: string;
  background: string;
  role: 'primary-action' | 'component';
  largeText: boolean;
  /** Where the pair is declared: 'components.button-primary', 'org.designesy.pairs.0'. */
  source: string;
}
export interface Alias { from: string; to: string }

/**
 * Why a declared token did not reach the resolved model (TOKEN_DROPPED). A
 * closed list, one entry per code path that can drop a token:
 *   alias_unresolved   the value is a reference to a token that does not exist
 *   alias_cycle        the value's references loop back to it
 *   alias_wrong_type   the value references a token of another kind
 *   value_not_scalar   the value is a list, a map or empty where a value belongs
 *   value_invalid      the value is not a color, dimension, duration or curve
 *   unit_unsupported   a dimension in a unit scoring cannot compare (pt, %, vw...)
 *   unknown            the linter left the token out for a reason it did not state
 */
export const DROP_REASONS = [
  'alias_unresolved',
  'alias_cycle',
  'alias_wrong_type',
  'value_not_scalar',
  'value_invalid',
  'unit_unsupported',
  'unknown',
] as const;
export type DropReason = (typeof DROP_REASONS)[number];

export interface Problem {
  code: string;
  severity: 'error' | 'warning';
  /** Token path as written in the file. */
  path?: string;
  line?: number;
  column?: number;
  /** The engine's sentence. Carries at most 80 characters of any value. */
  message: string;
  /** The offending value, cut to 80 characters with an ellipsis. */
  value?: string;
  /** ALIAS_UNRESOLVED, TOKEN_DROPPED: the reference as written. */
  ref?: string;
  /** ALIAS_CYCLE: the loop as an ordered list of token paths, first path repeated last. */
  chain?: string[];
  /** TOKEN_DROPPED: why the token did not reach the resolved model. */
  reason?: DropReason;
  /** VALUE_INVALID, NO_TYPE, DIMENSION_ROLE_UNKNOWN: the kind of value expected or found. */
  kind?: string;
  /** DUPLICATE_SECTION: the heading as written. */
  heading?: string;
  /** TOKEN_MAP_INVALID: the map key at fault. */
  key?: string;
  /** Counts the message is built from (TOO_FEW_COLORS, TOO_MANY_TOKENS, size codes). */
  count?: number;
  limit?: number;
  /** TOKENS_IN_PROSE: what the tables hold and what the front matter holds. */
  colorRows?: number;
  colorLines?: [number, number];
  typeRows?: number;
  typeLines?: [number, number];
  keys?: string[];
  /** COLOR_SPACE_UNSUPPORTED. */
  space?: string;
  /** CONFUSABLE_NAME: the lookalike character, its script, its code point (hex, no prefix), its 1-based position in the name, and the Latin letter expected (absent when the table names none). */
  char?: string;
  script?: string;
  /** Hex, upper case, at least four digits ("0430"); the message shows it as U+0430. */
  codePoint?: string;
  position?: number;
  latin?: string;
  /** CONTRACT_URL_UNREACHABLE: the contract URL and the reason class. */
  url?: string;
  why?: 'network' | 'timeout' | 'http_error' | 'content_type' | 'too_large' | 'blocked';
  status?: number;
  /** LINT_ERROR, LINT_WARNING: the linter's rule id. */
  rule?: string;
  /** LINT_ERROR, LINT_WARNING: the linter's own sentence, whole (cut at a word
      boundary only past MAX_LINTER_MESSAGE_CHARS). Never the offending value:
      that is `value`, cut to 80 characters. */
  linterMessage?: string;
  /** A structured problem (VALUE_INVALID, TOKEN_DROPPED, ALIAS_*) whose path the
      linter also flagged: the linter's row is merged into this one. */
  linterFinding?: boolean;
}

export interface OwnContract {
  format: ContractFormat;
  /** DESIGN.md front matter `version`; DTCG "2025.10" when $schema says so. */
  formatVersion: string | null;
  /** DESIGN.md `name`; DTCG root $description or null. */
  name: string | null;
  source: { kind: 'inline' | 'url'; url?: string; bytes: number };
  /** sha256 hex of the canonical model (section 11.2). */
  digest: string;
  colors: ColorToken[];
  typography: TypeStyle[];
  /** Every declared face, from type styles and standalone fontFamily tokens. */
  families: FamilyToken[];
  radii: DimensionToken[];
  spacing: DimensionToken[];
  sizes: SizeToken[];
  durations: DurationToken[];
  easings: EasingToken[];
  pairs: ContrastPair[];
  aliases: Alias[];
  /** Contract path to CSS custom property, validated (section 5.3). */
  tokenMap: Map<string, string>;
  omitted: Array<{ group: string; reason?: string }>;
  /** Warnings only, once the contract is accepted. */
  problems: Problem[];
  stats: { declared: number; byGroup: Record<GroupName, number> };
  /** DESIGN.md only: the linter that read it. */
  linter: LinterTotals | null;
}

/** What a format reader hands to the shared intake (no digest, source or map yet). */
export type ParsedContract = Omit<OwnContract, 'digest' | 'source' | 'tokenMap' | 'stats' | 'problems'> & {
  /** Token map declared inside the contract ($extensions["org.designesy"].tokenMap). */
  declaredTokenMap: Map<string, string>;
};

export interface ReadOutcome {
  /** Errors stop intake; warnings ride along with an accepted contract. */
  errors: Problem[];
  warnings: Problem[];
  parsed: ParsedContract | null;
  /** DESIGN.md: the linter's own totals for the file, as it reported them,
      whether or not the contract was accepted (null when it did not run). */
  linter?: LinterTotals | null;
}

/** The DESIGN.md format linter's own totals, exactly as it reported them: the
    provenance line on the page cites these, never a count of shown rows. */
export interface LinterTotals {
  package: '@google/design.md';
  version: string;
  errors: number;
  warnings: number;
  infos: number;
}
