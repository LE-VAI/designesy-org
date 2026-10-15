// Own-contract problem codes and the engine's sentence for each (contract-mode spec
// §4.7). Messages go to the caller only and are never logged (section
// 13): every builder here takes a value through clipValue(), so at most 80
// characters of anything the caller sent come back.
//
// The page builds its own copy from the structured fields (path, line, value,
// ref, chain, reason, ...); `message` is the API's plain sentence for callers
// that read only that.

import { MAX_LINTER_MESSAGE_CHARS, MAX_VALUE_CHARS, MAX_CONTRACT_BYTES, MAX_TOKENS, MAX_DEPTH, MAX_ALIAS_HOPS, MIN_COLORS } from './limits';
import type { DropReason, Problem } from './types';

/** Codes that reject a contract (HTTP 422 unless listed in HTTP_STATUS). */
export const ERROR_CODES = [
  'FORMAT_UNKNOWN',
  'YAML_INVALID',
  'JSON_INVALID',
  'NO_TOKENS_FOUND',
  'TOKENS_IN_PROSE',
  'DUPLICATE_SECTION',
  'LINT_ERROR',
  'TOKEN_DROPPED',
  'VALUE_INVALID',
  'ALIAS_UNRESOLVED',
  'ALIAS_CYCLE',
  'ALIAS_TOO_DEEP',
  'TOO_DEEP',
  'TOO_MANY_TOKENS',
  'CONTRACT_TOO_COMPLEX',
  'TOO_FEW_COLORS',
  'NO_TYPE_STYLE',
  'TOKEN_MAP_INVALID',
  'CONTRACT_URL_UNREACHABLE',
  'contract_too_large',
] as const;

/** Codes carried with an accepted contract (HTTP 200, `ownContract.problems`). */
export const WARNING_CODES = [
  'NO_TYPE',
  'LEGACY_COLOR_STRING',
  'COLOR_SPACE_UNSUPPORTED',
  'DIMENSION_ROLE_UNKNOWN',
  'CONFUSABLE_NAME',
  'LINT_WARNING',
] as const;

/** Codes below the minimum scoreable contract, rather than parse failures. */
export const MINIMUM_CODES = new Set(['TOKENS_IN_PROSE', 'NO_TOKENS_FOUND', 'TOO_FEW_COLORS', 'NO_TYPE_STYLE']);

/** Non-422 statuses. Everything else in ERROR_CODES is 422. */
export const HTTP_STATUS: Record<string, number> = { contract_too_large: 413, body_too_large: 413, scope_conflict: 400, contract_shape: 400 };

export function statusOf(code: string): number {
  return HTTP_STATUS[code] ?? 422;
}

/** A value cut to 80 characters (the ellipsis counts), control characters made visible. */
export function clipValue(v: unknown): string {
  let s: string;
  if (typeof v === 'string') s = v;
  else if (v === null || v === undefined) s = String(v);
  else {
    try {
      s = JSON.stringify(v) ?? String(v);
    } catch {
      s = String(v);
    }
  }
  s = s.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return s.length > MAX_VALUE_CHARS ? `${s.slice(0, MAX_VALUE_CHARS - 1)}…` : s;
}

/** A sentence cut, if at all, at the last word boundary that fits, with "…" (never mid-word). */
export function clipWords(s: string, max = MAX_LINTER_MESSAGE_CHARS): string {
  const t = s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > 0 ? cut.slice(0, at) : cut).replace(/[\s,;:.(-]+$/, '')}…`;
}

function sizeWords(bytes: number): string {
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} bytes`;
}

const REASON_WORDS: Record<DropReason, string> = {
  alias_unresolved: 'its reference points to a token that does not exist',
  alias_cycle: 'its references loop',
  alias_wrong_type: 'its reference points to a token of another kind',
  value_not_scalar: 'it holds a list or a map where a value belongs',
  value_invalid: 'its value is not one scoring can read',
  unit_unsupported: 'its unit is not px, rem or em',
  unknown: 'the DESIGN.md format linter left it out',
};

const EXAMPLES: Record<string, string> = {
  color: '"#0A94FF" or "oklch(0.66 0.18 250)"',
  dimension: '"16px" or "1rem"',
  duration: '"200ms"',
  cubicBezier: '"cubic-bezier(0.2, 0, 0, 1)"',
};

/** Problem fields a builder takes; `value` may be any offending value (it is clipped to text). */
type Extra = Omit<Problem, 'code' | 'severity' | 'message' | 'value'> & { value?: unknown };

/** A linter sentence without its final full stop, so the template adds one. */
const noStop = (s: string) => s.replace(/\.+$/, '');

/** The word a VALUE_INVALID message uses for each value kind. */
const KIND_WORDS: Record<string, string> = { color: 'color', dimension: 'dimension', duration: 'duration', cubicBezier: 'curve', fontFamily: 'font family', typography: 'text style' };

/** Scripts named in CONFUSABLE_NAME, tested in order (fixed patterns, never built from input). */
const SCRIPTS: Array<[string, RegExp]> = [
  ['Cyrillic', /\p{Script=Cyrillic}/u],
  ['Greek', /\p{Script=Greek}/u],
  ['Armenian', /\p{Script=Armenian}/u],
  ['Cherokee', /\p{Script=Cherokee}/u],
  ['Hebrew', /\p{Script=Hebrew}/u],
  ['Arabic', /\p{Script=Arabic}/u],
  ['Han', /\p{Script=Han}/u],
  ['Hiragana', /\p{Script=Hiragana}/u],
  ['Katakana', /\p{Script=Katakana}/u],
  ['Hangul', /\p{Script=Hangul}/u],
  ['Latin', /\p{Script=Latin}/u],
];

/** The Unicode script of one character ("Fullwidth Latin" for the U+FF01 to U+FF5E block). */
export function scriptOf(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  for (const [name, re] of SCRIPTS) {
    if (re.test(ch)) return name === 'Latin' && cp >= 0xff01 && cp <= 0xff5e ? 'Fullwidth Latin' : name;
  }
  return 'Common';
}

/**
 * One CONFUSABLE_NAME warning per lookalike character in `name`, from v36's
 * per-string helper: the character, its script, its code point (hex), its
 * 1-based position in the name (counted in characters), and its Latin
 * counterpart when the confusable table names one.
 */
export function confusableWarnings(name: string, hits: Array<{ char: string; pos: number; ascii?: string }>): Problem[] {
  return hits.map((h) => warning('CONFUSABLE_NAME', {
    path: name,
    char: h.char,
    script: scriptOf(h.char),
    codePoint: (h.char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0'),
    position: [...name.slice(0, h.pos)].length + 1,
    ...(h.ascii ? { latin: h.ascii } : {}),
  }));
}

/** Build an error problem with the engine's sentence for its code. */
export function problem(code: string, extra: Extra = {}): Problem {
  return { code, severity: 'error', message: messageFor(code, extra), ...withClippedValue(extra) };
}

/** Build a warning (carried with an accepted contract). */
export function warning(code: string, extra: Extra = {}): Problem {
  return { code, severity: 'warning', message: messageFor(code, extra), ...withClippedValue(extra) };
}

function withClippedValue(extra: Extra): Omit<Problem, 'code' | 'severity' | 'message'> {
  const out: Omit<Problem, 'code' | 'severity' | 'message'> = { ...extra, value: undefined };
  if (extra.value === undefined) delete out.value;
  else out.value = clipValue(extra.value);
  if (out.ref !== undefined) out.ref = clipValue(out.ref);
  if (out.key !== undefined) out.key = clipValue(out.key);
  if (out.chain) out.chain = out.chain.map((p) => clipValue(p));
  if (out.linterMessage !== undefined) out.linterMessage = clipWords(String(out.linterMessage));
  return out;
}

/** The linter's sentence for a lint problem: whole, or cut at a word boundary. */
function lintWords(p: Extra | Problem): string {
  return p.linterMessage !== undefined ? clipWords(String(p.linterMessage)) : '';
}

export function messageFor(code: string, p: Extra | Problem): string {
  const path = p.path ? clipValue(p.path) : 'A token';
  const value = p.value !== undefined ? clipValue(p.value) : '';
  switch (code) {
    case 'FORMAT_UNKNOWN':
      return 'We could not tell whether this is a DESIGN.md or a DTCG file. Choose the format and run it again.';
    case 'YAML_INVALID':
      return `Line ${p.line ?? '?'}: the front matter is not valid YAML (${value || 'parser error'}). Fix that line and run it again.`;
    case 'JSON_INVALID':
      return `The file is not valid JSON: ${value || 'parser error'} (line ${p.line ?? '?'}, column ${p.column ?? '?'}).`;
    case 'NO_TOKENS_FOUND':
      return 'No tokens found. A DESIGN.md keeps its tokens in YAML front matter between --- lines.';
    case 'TOKENS_IN_PROSE':
      // The fixed sentence. The counts, line ranges and
      // front-matter keys ride as fields (colorRows, colorLines, typeRows,
      // typeLines, keys) for the page's second paragraph.
      return 'Your DESIGN.md lists tokens in tables. Scoring reads tokens from YAML front matter, as the DESIGN.md format defines them. Move the values into colors, typography, rounded and spacing groups at the top of the file.';
    case 'DUPLICATE_SECTION':
      return `The heading "${clipValue(p.heading ?? '')}" appears twice. The DESIGN.md format allows each section once, so merge the two and run it again.`;
    case 'LINT_ERROR':
      return `${path}: ${noStop(lintWords(p)) || 'linter error'}. The DESIGN.md format's linter rejects this, so scoring can't read the file as written.`;
    case 'LINT_WARNING':
      return `${path}: ${noStop(lintWords(p)) || 'linter warning'} (a warning from the DESIGN.md format's linter; scoring went ahead).`;
    case 'TOKEN_DROPPED':
      return `${path} is declared, but its value didn't survive reading (${REASON_WORDS[p.reason ?? 'unknown']}), so it was left out. Give it a literal value or a reference that resolves, then run it again.`;
    case 'VALUE_INVALID':
      return `${path}: "${value}" is not a valid ${KIND_WORDS[p.kind ?? ''] ?? p.kind ?? 'value'}.${p.kind && EXAMPLES[p.kind] ? ` Use a form like ${EXAMPLES[p.kind]}.` : ''}`;
    case 'ALIAS_UNRESOLVED':
      return `${path}: the reference ${p.ref ?? ''} points to a token that doesn't exist. Check the name, or declare that token.`;
    case 'ALIAS_CYCLE':
      return `${path}: its references loop back to itself (${(p.chain ?? []).join(' -> ')}). Point one of them at a literal value.`;
    case 'ALIAS_TOO_DEEP':
    case 'TOO_DEEP':
      return `${path}: this file nests groups or chains references more deeply than scoring allows (${p.limit ?? (code === 'TOO_DEEP' ? MAX_DEPTH : MAX_ALIAS_HOPS)} levels). Flatten it and run it again.`;
    case 'TOO_MANY_TOKENS':
      return `Your contract declares ${p.count ?? 'more than ' + MAX_TOKENS} tokens. Scoring reads up to ${(p.limit ?? MAX_TOKENS).toLocaleString('en-US')} at once. Score the part your pages use, or split the file.`;
    case 'CONTRACT_TOO_COMPLEX':
      return 'This contract took longer than 1 second to read. Remove unused tokens or long reference chains and run it again.';
    case 'TOO_FEW_COLORS':
      return `Your contract declares ${p.count ?? 0} ${p.count === 1 ? 'color that resolves' : 'colors that resolve'} to a value. Scoring needs at least ${MIN_COLORS}.`;
    case 'NO_TYPE_STYLE':
      return 'Add at least one text style with both a font family and a font size.';
    case 'TOKEN_MAP_INVALID':
      if (p.key !== undefined && p.value === undefined) return `Token map: "${clipValue(p.key)}" is not a token in your contract. Use a path from your file, like colors.primary.`;
      if (p.count !== undefined) return `Token map: ${p.count} entries. Scoring reads up to ${p.limit ?? 500}.`;
      return `Token map: "${value}" is not a CSS variable name. Names start with -- (for example --color-primary).`;
    case 'CONTRACT_URL_UNREACHABLE': {
      const why =
        p.why === 'http_error' ? `the server answered HTTP ${p.status ?? 'error'}`
          : p.why === 'timeout' ? 'the request timed out'
            : p.why === 'content_type' ? 'the file type is not one scoring reads'
              : p.why === 'too_large' ? 'the read was cut off'
                : p.why === 'blocked' ? 'the address is not a public web address'
                  : 'the request failed at the network level';
      // The approved additions, by reason.
      const add =
        p.why === 'http_error' && (p.status === 401 || p.status === 403) ? ' Check the link opens without signing in.'
          : p.why === 'too_large' ? ' The file is larger than 256 KB.'
            : p.why === 'content_type' ? ` It served ${value || 'another type'}; use a text or JSON file.`
              : '';
      return `We could not fetch your contract from ${p.url ? clipValue(p.url) : 'that address'}: ${why}.${add}`;
    }
    case 'contract_too_large':
      return `This contract is ${sizeWords(p.count ?? MAX_CONTRACT_BYTES + 1)}. Scoring reads contracts up to 256 KB. Remove unused tokens or score part of it.`;
    case 'body_too_large':
      return 'This request is larger than 300 KB. Send the contract by link instead of pasting it.';
    case 'scope_conflict':
      return 'Send either `scope: "contract"` or a contract in the request, not both.';
    case 'NO_TYPE':
      // Fixed wording, asserted by scripts/check-own-contract.mjs.
      return `${path} has no $type, so it was skipped: the DTCG format doesn't let scoring guess a type. Add "$type": "color" (or "dimension", "duration", and so on) to the token or its group.`;
    case 'LEGACY_COLOR_STRING':
      return `${path} uses an older colour string. It was read as ${value}. The 2025.10 format prefers a colour object.`;
    case 'COLOR_SPACE_UNSUPPORTED':
      return `${path} uses the ${clipValue(p.space ?? 'unknown')} colour space, which scoring can't compare yet. This colour was left out of the colour checks.`;
    case 'DIMENSION_ROLE_UNKNOWN':
      return `${path}: scoring couldn't tell what this size is for (spacing, radius or type), so it isn't used in role-specific checks.`;
    case 'CONFUSABLE_NAME':
      // Fixed wording, asserted by scripts/check-own-contract.mjs. The Latin
      // clause is dropped when the confusable table names no Latin counterpart
      // for the character.
      return `${path} contains a lookalike character: "${p.char ?? ''}" (${p.script ?? 'Unknown'}, U+${p.codePoint ?? '????'}) at position ${p.position ?? '?'}${p.latin ? `, where a Latin "${p.latin}" is expected` : ''}. Retype the name so it uses only the characters you mean.`;
    default:
      return `${path}: ${value || code}`;
  }
}
