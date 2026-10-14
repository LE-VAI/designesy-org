// Own-contract intake: readContract(input) -> { ok, contract } or the problems
// that stop it (engine spec section 4). Next-free.
//
// Order: size (413) -> format -> the format's reader -> the minimum scoreable
// contract (owner decision D2) -> the token map (section 5.3) -> confusable
// names (section 4.5) -> the 1 s budget -> digest.

import { contractDigest } from './digest';
import { detectFormat } from './detect';
import { readDesignMd, type LintFn } from './design-md';
import { readDtcg } from './dtcg';
import { INTAKE_BUDGET_MS, MAX_CONTRACT_BYTES, MAX_TOKEN_MAP_ENTRIES, MIN_COLORS, MIN_TYPE_STYLES, TOKEN_MAP_NAME } from './limits';
import { confusableWarnings, problem } from './problems';
import type { ContractFormat, GroupName, OwnContract, ParsedContract, Problem } from './types';

export type { OwnContract, Problem } from './types';
export { detectFormat, readAsLabel } from './detect';

export interface ContractInput {
  content: string;
  format?: 'auto' | ContractFormat;
  tokenMap?: Record<string, string> | null;
  source?: { kind: 'inline' | 'url'; url?: string };
}

export interface IntakeOptions {
  /** The DESIGN.md format linter's lint(); loaded with loadLinter() when omitted. */
  lint?: LintFn;
  /** v36's per-string helper (the route passes its own), for CONFUSABLE_NAME warnings. */
  findConfusables?: (text: string) => Array<{ char: string; pos: number; ascii: string }>;
  /** Clock for the intake budget (tests pass a fake). */
  now?: () => number;
}

export type IntakeResult =
  | { ok: true; contract: OwnContract }
  | { ok: false; status: 413 | 422; problems: Problem[]; warnings: Problem[] };

/** Load the linter lazily, the way v37 does, so the module stays importable without it. */
export async function loadLinter(): Promise<LintFn> {
  const mod = (await import('@google/design.md/linter')) as unknown as { lint: LintFn };
  return mod.lint;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Paths a token map key may name: every token, plus a type style's fields. */
function mappablePaths(p: ParsedContract): Set<string> {
  const out = new Set<string>();
  const all = [...p.colors, ...p.radii, ...p.spacing, ...p.sizes, ...p.durations, ...p.easings, ...p.families];
  for (const t of all) out.add(t.path);
  for (const s of p.typography) {
    out.add(s.path);
    for (const f of ['fontSize', 'lineHeight', 'fontFamily', 'letterSpacing']) out.add(`${s.path}.${f}`);
  }
  return out;
}

export function declaredStats(p: ParsedContract): OwnContract['stats'] {
  const own = <T extends { nested?: boolean }>(list: T[]) => list.filter((t) => !t.nested);
  const faces = new Set<string>();
  for (const f of p.families) if (f.families[0]) faces.add(f.families[0].toLowerCase());
  const typeSizes = p.typography.filter((s) => s.fontSize).length;
  const byGroup: Record<GroupName, number> = {
    colors: own(p.colors).length,
    typography: p.typography.length,
    radii: own(p.radii).length,
    spacing: own(p.spacing).length,
    sizes: own(p.sizes).length,
    durations: own(p.durations).length,
    easings: own(p.easings).length,
  };
  // Coverage's "declared": colors, faces, type sizes, radii, spacing, sizes,
  // durations and easings (engine spec 5.4).
  const declared = byGroup.colors + faces.size + typeSizes + byGroup.radii + byGroup.spacing + byGroup.sizes + byGroup.durations + byGroup.easings;
  return { declared, byGroup };
}

/**
 * Line endings normalised once, at the boundary: CRLF and a lone CR become LF.
 * A file saved on Windows or classic Mac OS then reads to the same model,
 * problems and digest as the same file with LF, and line numbers still match
 * what the author's editor shows (every line break stays one line break).
 */
export function normalizeLineEndings(text: string): string {
  return text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;
}

export async function readContract(input: ContractInput, opts: IntakeOptions = {}): Promise<IntakeResult> {
  const now = opts.now ?? (() => Date.now());
  const started = now();
  // The size limit and the reported size are the bytes the caller sent.
  const bytes = byteLength(input.content);
  const text = normalizeLineEndings(input.content);
  if (bytes > MAX_CONTRACT_BYTES) {
    return { ok: false, status: 413, problems: [problem('contract_too_large', { count: bytes, limit: MAX_CONTRACT_BYTES })], warnings: [] };
  }

  let format: ContractFormat | null = input.format && input.format !== 'auto' ? input.format : detectFormat(text).format;
  if (!format) return { ok: false, status: 422, problems: [problem('FORMAT_UNKNOWN')], warnings: [] };

  const outcome = format === 'design.md' ? readDesignMd(text, opts.lint ?? (await loadLinter())) : readDtcg(text);
  const warnings = [...outcome.warnings];
  if (outcome.errors.length || !outcome.parsed) {
    return { ok: false, status: 422, problems: outcome.errors, warnings };
  }
  const p = outcome.parsed;
  format = p.format;

  // ── Minimum scoreable contract ──
  const errors: Problem[] = [];
  const colorCount = p.colors.filter((c) => !c.nested).length;
  if (colorCount < MIN_COLORS) errors.push(problem('TOO_FEW_COLORS', { count: colorCount }));
  const styled = p.typography.filter((s) => s.families?.length && s.fontSize).length;
  const dtcgSplit = format === 'dtcg' && p.families.length > 0 && p.typography.some((s) => s.fontSize);
  if (styled < MIN_TYPE_STYLES && !dtcgSplit) errors.push(problem('NO_TYPE_STYLE', { count: styled }));

  // ── Token map: the contract's own, then the request's (the request wins) ──
  const tokenMap = new Map<string, string>(p.declaredTokenMap);
  if (input.tokenMap) for (const k of Object.keys(input.tokenMap)) tokenMap.set(k, input.tokenMap[k]);
  if (tokenMap.size > MAX_TOKEN_MAP_ENTRIES) {
    errors.push(problem('TOKEN_MAP_INVALID', { count: tokenMap.size, limit: MAX_TOKEN_MAP_ENTRIES }));
  } else {
    const known = mappablePaths(p);
    for (const [k, v] of tokenMap) {
      if (!known.has(k)) errors.push(problem('TOKEN_MAP_INVALID', { key: k }));
      else if (typeof v !== 'string' || !TOKEN_MAP_NAME.test(v)) errors.push(problem('TOKEN_MAP_INVALID', { key: k, value: String(v) }));
    }
  }
  if (errors.length) return { ok: false, status: 422, problems: errors, warnings };

  // ── Confusable names (v36's helper over every path and mapped variable) ──
  if (opts.findConfusables) {
    const names = new Set<string>([...mappablePaths(p), ...tokenMap.values()]);
    for (const name of names) {
      const hits = opts.findConfusables(name);
      warnings.push(...confusableWarnings(name, hits));
    }
  }

  if (now() - started > INTAKE_BUDGET_MS) {
    return { ok: false, status: 422, problems: [problem('CONTRACT_TOO_COMPLEX', { limit: INTAKE_BUDGET_MS })], warnings };
  }

  // Mapped tokens carry their variable.
  const withVar = <T extends { path: string; cssVar?: string }>(t: T): T => (tokenMap.has(t.path) ? { ...t, cssVar: tokenMap.get(t.path) } : t);
  const model = {
    format,
    colors: p.colors.map(withVar),
    typography: p.typography.map(withVar),
    families: p.families.map(withVar),
    radii: p.radii.map(withVar),
    spacing: p.spacing.map(withVar),
    sizes: p.sizes.map(withVar),
    durations: p.durations.map(withVar),
    easings: p.easings.map(withVar),
    pairs: p.pairs,
    aliases: p.aliases,
    omitted: p.omitted,
    tokenMap,
  };
  const contract: OwnContract = {
    ...model,
    formatVersion: p.formatVersion,
    name: p.name,
    source: { kind: input.source?.kind ?? 'inline', ...(input.source?.url ? { url: input.source.url } : {}), bytes },
    digest: contractDigest(model),
    problems: warnings,
    stats: declaredStats(p),
    linter: p.linter,
  };
  return { ok: true, contract };
}
