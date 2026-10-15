// Every templated string on /score/contract, as pure builders (HANDOFF 10.2).
// The page renders these and never retypes a count, a score or a version:
// counts come from the result or the published formula, scores from
// verdict.ts fmtScore, problem sentences from the engine (own-contract
// problems.ts, the owner-approved O6 messages). Nothing here touches the DOM
// or React, so scripts/check-contract-copy.mjs runs each builder under Node.

import { detectFormat, readAsLabel } from '../../lib/own-contract/detect';
import { MAX_CONTRACT_BYTES, MIN_COLORS, MIN_TYPE_STYLES } from '../../lib/own-contract/limits';
import { fmtScore } from '../verdict';

// ── Static strings ─────────────────────────────────────────────────────────

export type Source = 'paste' | 'upload' | 'link';

export const SOURCE_HINT: Record<Source, string> = {
  paste: 'Paste a DESIGN.md file or a DTCG tokens.json. Up to 256 KB.',
  upload: 'Choose a .md or .json file. Up to 256 KB. It is read in this run only.',
  link: 'A public URL. A linked contract can be shared, because anyone with the link can run the same score again.',
};

export const PRIVACY_NOTE = 'Your contract is read for this run and then discarded. Designesy keeps only anonymous usage counts.';

/** The example in the paste well. It meets the minimum it sits above (3 colors, 1 text style). */
export const PASTE_PLACEHOLDER = [
  '---',
  'colors:',
  '  primary: "#1A5CFF"',
  '  ink: "#111418"',
  '  surface: "#FFFFFF"',
  'typography:',
  '  body:',
  '    fontFamily: Inter',
  '    fontSize: 16px',
  '---',
].join('\n');

export const TOKEN_MAP_PLACEHOLDER = '{ "colors.primary": "--brand", "spacing.md": "--gap-md" }';

/** The client's field errors (WIREFRAMES W1), in the order the fields sit. */
export const FIELD_ERROR = {
  urlEmpty: 'Enter the address of the page to score.',
  urlInvalid: 'Enter a public web address, like staging.example.com.',
  contractEmpty: 'Add your contract: paste it, upload a file, or link to it.',
  linkInvalid: 'Enter a public https address for your contract.',
  mapNotJson: 'The token map must be JSON, like { "colors.primary": "--brand" }.',
  fileType: 'Choose a .md or .json file.',
} as const;

export function fileTooLarge(bytes: number): string {
  return `This contract is ${Math.round(bytes / 1024)} KB. The limit is 256 KB.`;
}

export const ANNOUNCE = {
  running: (site: string) => `Scoring ${site} against your contract.`,
  finished: (seconds: string) => `Run finished in ${seconds} s.`,
  stopped: (seconds: string) => `Run stopped after ${seconds} s.`,
  rejected: 'Run stopped: your contract was not accepted.',
  editing: 'Inputs open for editing.',
} as const;

// ── Sizes and formats ──────────────────────────────────────────────────────

/** "8.0 KB": a file's size as the upload well names it. */
export function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function overLimit(bytes: number): boolean {
  return bytes > MAX_CONTRACT_BYTES;
}

/** The "Read as ..." words for a contract's text, from the same detector the
    engine's `format: auto` uses, or null when the text is empty. */
export function readAs(text: string): { label: string; known: boolean } | null {
  if (!text.trim()) return null;
  const label = readAsLabel(detectFormat(text));
  return label ? { label, known: true } : { label: 'Format not recognized yet', known: false };
}

/** The format the page names in the run summary and the rejected panel. */
export function formatWords(text: string): string | null {
  const d = detectFormat(text);
  if (d.format === 'design.md') return 'DESIGN.md';
  if (d.format === 'dtcg') return 'DTCG tokens';
  return null;
}

export function howWord(source: Source): 'pasted' | 'uploaded' | 'linked' {
  return source === 'paste' ? 'pasted' : source === 'upload' ? 'uploaded' : 'linked';
}

/** The page the run reads, as the target pill and the steps name it: host and path, no scheme. */
export function siteKey(url: string): string {
  return url.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/** A public web address the engine can read (the same test the house bar applies, simplified to a host with a dot). */
export function looksLikeSite(raw: string): boolean {
  const s = raw.trim().replace(/^https?:\/\//i, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(s);
}

export function looksLikeContractUrl(raw: string): boolean {
  return /^https:\/\/[^\s/]+\.[^\s/]+/i.test(raw.trim());
}

/** Elapsed seconds as the announcements say them: one decimal. */
export function seconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

// ── Running ────────────────────────────────────────────────────────────────

export type StepState = 'waiting' | 'running' | 'done';
export type Step = { label: string; state: StepState; word: string; text: string };

/** The run's four steps. POST /api/score answers once, so the steps cannot
    advance one by one: they run together and resolve together when the
    answer lands (owner decision O4), never as simulated progress. */
export function steps(site: string, state: 'running' | 'done' | 'rejected'): Step[] {
  const s = state === 'rejected' ? 'waiting' : state;
  const word = state === 'running' ? 'running' : state === 'done' ? 'done' : 'not run';
  return [
    { label: 'Contract', state: state === 'rejected' ? 'done' : s, word: state === 'rejected' ? 'read' : word, text: 'Reading your contract' },
    { label: 'Site', state: s, word, text: site },
    { label: 'Coverage', state: s, word, text: 'Locating your tokens' },
    { label: 'Scores', state: s, word, text: 'Scoring fidelity and baseline' },
  ];
}

// ── Problems (422) ─────────────────────────────────────────────────────────

export type ContractProblem = {
  code: string;
  message: string;
  severity?: 'error' | 'warning';
  path?: string;
  line?: number;
  column?: number;
  count?: number;
  colorRows?: number;
  colorLines?: [number, number];
  typeRows?: number;
  typeLines?: [number, number];
  keys?: string[];
  /** The linter also flagged this path; its row is merged into this one. */
  linterFinding?: boolean;
  [field: string]: unknown;
};

/** Codes below the minimum scoreable contract, rather than parse failures (engine problems.ts MINIMUM_CODES). */
const MINIMUM = new Set(['TOKENS_IN_PROSE', 'NO_TOKENS_FOUND', 'TOO_FEW_COLORS', 'NO_TYPE_STYLE']);

export function isMinimumCode(code: string): boolean {
  return MINIMUM.has(code);
}

/** Problems in the order their fields sit in the file: by line, then column;
    a problem with no line (the file as a whole) keeps the engine's order and
    comes first, since it concerns everything after it. */
export function inFieldOrder<T extends { line?: number; column?: number }>(problems: T[]): T[] {
  return problems
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const la = typeof a.p.line === 'number' ? a.p.line : -1;
      const lb = typeof b.p.line === 'number' ? b.p.line : -1;
      if (la !== lb) return la - lb;
      const ca = typeof a.p.column === 'number' ? a.p.column : 0;
      const cb = typeof b.p.column === 'number' ? b.p.column : 0;
      return ca - cb || a.i - b.i;
    })
    .map((x) => x.p);
}

/** The panel's lead under its heading, by kind and count. */
export function problemsIntro(problems: { code: string }[]): string {
  const n = problems.length;
  const minimum = n > 0 && problems.every((p) => MINIMUM.has(p.code));
  if (minimum) {
    return n === 1
      ? 'The site was not scored. One problem in your contract leaves it below the minimum, so there is nothing to compare the page with.'
      : `The site was not scored. ${n} problems in your contract leave it below the minimum, so there is nothing to compare the page with.`;
  }
  return n === 1
    ? 'The site was not scored. Fix this problem in your contract and run it again.'
    : `The site was not scored. Fix these ${n} problems in your contract and run it again.`;
}

export function problemsSub(n: number): string {
  return n === 1 ? 'Fix this problem' : `Fix these ${n} problems`;
}

/** Where a problem sits, when the engine said: "line 4, column 7". */
export function problemWhere(p: { line?: number; column?: number }): string | null {
  if (typeof p.line !== 'number') return null;
  return typeof p.column === 'number' ? `line ${p.line}, column ${p.column}` : `line ${p.line}`;
}

/** TOKENS_IN_PROSE's second paragraph, from the counts and line ranges the engine returns. */
export function proseDetail(p: ContractProblem): string | null {
  if (p.code !== 'TOKENS_IN_PROSE' || !p.colorRows || !p.colorLines) return null;
  const rows = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const colors = `${rows(p.colorRows, 'color row', 'color rows')} under Colors (${lines(p.colorLines)})`;
  const type = p.typeRows && p.typeLines ? ` and ${rows(p.typeRows, 'text style', 'text styles')} under Typography (${lines(p.typeLines)})` : '';
  const keys = (p.keys ?? []).filter(Boolean);
  const tail = keys.length ? ` The front matter holds only ${listWords(keys)}.` : ' There is no front matter.';
  return `Found ${colors}${type}.${tail}`;
}

function lines([a, b]: [number, number]): string {
  return a === b ? `line ${a}` : `lines ${a} to ${b}`;
}

export function listWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export type MinimumRow = { ok: boolean | null; text: string; found: string };

/** "What scoring needs", read from the problems the engine returned: a
    requirement a problem names is not met; one no problem names is met. */
export function minimumRows(problems: ContractProblem[]): MinimumRow[] {
  const has = (c: string) => problems.find((p) => p.code === c);
  const prose = has('TOKENS_IN_PROSE');
  const none = has('NO_TOKENS_FOUND');
  const parseFail = problems.some((p) => !MINIMUM.has(p.code));
  const few = has('TOO_FEW_COLORS');
  const noType = has('NO_TYPE_STYLE');
  const empty = !!(prose || none);
  return [
    { ok: !(parseFail || empty), text: 'Parses with no tokens left out', found: prose ? 'not met: tables' : none ? 'not met: no tokens' : parseFail ? 'not met' : 'met' },
    { ok: !(few || empty), text: `${MIN_COLORS} or more colors in front matter`, found: few ? `${few.count ?? 0} found` : empty ? '0 found' : 'met' },
    { ok: !(noType || empty), text: `${MIN_TYPE_STYLES} text style with a family and a size`, found: noType || empty ? '0 found' : 'met' },
    { ok: null, text: 'Radius, spacing, components, motion', found: 'optional' },
  ];
}

/** The line "Edit contract" puts the caret on: the first table row of a prose
    contract, else the first problem that names a line. */
export function caretLine(problems: ContractProblem[]): number | null {
  const prose = problems.find((p) => p.code === 'TOKENS_IN_PROSE');
  if (prose?.colorLines) return prose.colorLines[0];
  const lined = inFieldOrder(problems).find((p) => typeof p.line === 'number');
  return lined?.line ?? null;
}

/** The character offset of the start of a 1-based line in a text. */
export function lineOffset(text: string, line: number): number {
  let pos = 0;
  const rows = text.split('\n');
  for (let i = 0; i < line - 1 && i < rows.length; i++) pos += rows[i].length + 1;
  return pos;
}

function cells(row: string): string[] {
  return row.split('|').slice(1, -1).map((c) => c.trim());
}

const isTableRow = (l: string) => /^\s*\|/.test(l) && !/^\s*\|\s*:?-{3,}/.test(l);

/** The header row of the table a data row sits in (the nearest table line above the separator). */
function headerFor(rows: string[], first: number): string[] | null {
  for (let i = first - 2; i >= 0; i--) {
    if (!/^\s*\|/.test(rows[i])) return null;
    if (/^\s*\|\s*:?-{3,}/.test(rows[i])) return i > 0 && isTableRow(rows[i - 1]) ? cells(rows[i - 1]) : null;
  }
  return null;
}

/** A YAML scalar as the rewrite writes it: quoted when it carries anything YAML reads specially. */
function scalar(v: string): string {
  return /^[A-Za-z][A-Za-z0-9 ._-]*$/.test(v) || /^\d+(\.\d+)?(px|rem|em)?$/.test(v) ? v : JSON.stringify(v);
}

/**
 * TOKENS_IN_PROSE: the first rows of the contract's own tables, written as
 * front matter, read from the text the visitor pasted or uploaded (a linked
 * contract's text never reaches the page, so it gets no rewrite). Built from
 * the line ranges the engine returned; null when those lines are not tables.
 */
export function proseRewrite(text: string, p: ContractProblem): string | null {
  if (p.code !== 'TOKENS_IN_PROSE' || !p.colorLines) return null;
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  const take = ([a, b]: [number, number]) => rows.slice(a - 1, b).filter(isTableRow).map(cells);
  const colors = take(p.colorLines).filter((c) => c.length >= 2 && c[0] && c[1]).slice(0, 3);
  if (!colors.length) return null;
  const nameLine = /^---\n([\s\S]*?)\n---/.exec(rows.join('\n'))?.[1].split('\n').find((l) => /^name:\s*\S/.test(l));
  const name = nameLine ? nameLine.replace(/^name:\s*/, '').replace(/^["']|["']$/g, '') : 'Your design system';
  const out = ['---', `name: ${scalar(name)}`, 'colors:', ...colors.map((c) => `  ${c[0]}: ${JSON.stringify(c[1])}`)];
  if (p.typeLines) {
    const type = take(p.typeLines);
    const head = headerFor(rows, p.typeLines[0])?.map((h) => h.toLowerCase()) ?? [];
    const col = (re: RegExp) => head.findIndex((h) => re.test(h));
    const fam = col(/famil|^font$|typeface/);
    const size = col(/size/);
    const lh = col(/line/);
    const body = type.find((r) => r[0]?.toLowerCase() === 'body') ?? type[0];
    if (body && fam > 0 && size > 0 && body[fam] && body[size]) {
      out.push('typography:', `  ${body[0] || 'body'}:`, `    fontFamily: ${scalar(body[fam])}`, `    fontSize: ${scalar(body[size])}`);
      if (lh > 0 && body[lh]) out.push(`    lineHeight: ${scalar(body[lh])}`);
    }
  }
  out.push('---');
  return out.join('\n');
}

export type LinterTotals = { package?: string; version: string; errors: number; warnings: number; infos?: number };

/**
 * The provenance line (brand D75): "Linted with @google/design.md {version}:
 * {e} errors, {w} warnings", from the linter's OWN totals as the engine
 * returns them, never a count of the rows the page shows. Where linter
 * findings were merged into structured problems (VALUE_INVALID,
 * TOKEN_DROPPED, ALIAS_*, each marked linterFinding), the line says how many
 * shown rows absorbed them. Null only when the linter never read the file
 * (a DTCG file, a link that was not fetched, an unknown format).
 */
export function lintLine(linter: LinterTotals | null | undefined, problems: { linterFinding?: unknown }[] = []): { version: string; counts: string; absorbed: string } | null {
  if (!linter || typeof linter.errors !== 'number' || typeof linter.warnings !== 'number') return null;
  const n = problems.filter((p) => p.linterFinding === true).length;
  return {
    version: linter.version,
    counts: `${countWords(linter.errors, 'error', 'errors')}, ${countWords(linter.warnings, 'warning', 'warnings')}`,
    absorbed: n ? ` (shown above as ${countWords(n, 'problem', 'problems')})` : '',
  };
}

/** The provenance line as plain text (the gate reads it back). */
export function lintText(l: { version: string; counts: string; absorbed: string }): string {
  return `Linted with @google/design.md ${l.version}: ${l.counts}${l.absorbed}.`;
}

export function countWords(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ── Request errors (W10) ───────────────────────────────────────────────────

export type RequestFailure = { status: number; code?: string; retryAfter?: number; error?: string };

/** The W10 card's title and message for a request that got no result: one
    title per failure, each naming what failed and what to do next. */
export function requestError(f: RequestFailure, site: string): { title: string; message: string } {
  if (f.status === 0) return { title: 'Could not reach the scoring server', message: 'Check your connection and run it again. Nothing was scored.' };
  if (f.status === 429) {
    const s = f.retryAfter;
    const when = typeof s === 'number' && s > 0 ? `in ${s} ${s === 1 ? 'second' : 'seconds'}` : 'in a minute';
    return { title: 'Too many runs', message: `Too many runs from this network. Try again ${when}.` };
  }
  if (f.status === 413) {
    return { title: 'Contract too large', message: f.error || 'This contract is larger than 256 KB. Remove unused tokens or split the file.' };
  }
  if (f.status === 400 && f.code === 'scope_conflict') {
    return { title: 'Not run', message: 'scope "contract" scores against the Designesy contract and cannot be combined with your own contract. Remove scope or set it to "universal".' };
  }
  if (f.status === 400) return { title: 'Not run', message: f.error || 'The engine could not read this request. Reload the page and run it again.' };
  if (f.status === 502) return { title: `Could not reach ${site || 'the site'}`, message: f.error || `The scoring engine stopped without a result (HTTP 502). Run it again in a minute.` };
  return { title: 'Could not reach the scoring server', message: f.error || `The scoring engine stopped without a result (HTTP ${f.status}). Run it again in a minute.` };
}

// ── The landing (verdict line) ─────────────────────────────────────────────

export type LayerResult = {
  score: number | null;
  grade: string | null;
  scored: number;
  total: number;
  ceilingApplied?: boolean;
  ceilingReason?: string | null;
  uncappedScore?: number | null;
  nullReason?: { code: string; detail?: string } | null;
};

export type CheckResult = { id: string; status: string; layer?: string };

/** A check's title as a clause after a colon: its first letter lowered, unless it opens on an acronym. */
export function clause(title: string): string {
  return /^[A-Z][A-Z]/.test(title) ? title : title.charAt(0).toLowerCase() + title.slice(1);
}

/**
 * The verdict line's words (owner decisions O5, 2026-10-09 and 2026-10-14):
 * the lead from the fidelity checks, the tail from the baseline's failures.
 * titles maps a check id to its title (fidelity from the published formula,
 * baseline from its contractTitle).
 */
export function verdictWords(fidelity: LayerResult, baseline: LayerResult, checks: CheckResult[], titles: Record<string, string>, ceilings: Record<string, number>): string {
  const fid = checks.filter((c) => c.layer === 'fidelity' || /^f\d\d$/.test(c.id));
  const base = checks.filter((c) => !(c.layer === 'fidelity' || /^f\d\d$/.test(c.id)));
  const fails = fid.filter((c) => c.status === 'FAIL');
  const warns = fid.filter((c) => c.status === 'WARN');
  const what = (id: string) => clause(titles[id] ?? id);
  let lead: string;
  if (fails.length === 0 && warns.length === 0) lead = 'The page follows your contract. Every scored check passed.';
  else if (fails.length === 0) lead = `The page follows your contract. ${warns.length} ${warns.length === 1 ? 'check needs' : 'checks need'} work.`;
  else if (fails.length === 1) {
    const cap = fidelity.ceilingApplied ? ceilings[fails[0].id] : undefined;
    lead = `The page follows most of your contract. One check failed: ${what(fails[0].id)}${cap ? `, which caps fidelity at ${cap}` : ''}.`;
  } else lead = `The page follows most of your contract. ${fails.length} checks failed, starting with ${what(fails[0].id)}.`;
  const bfails = base.filter((c) => c.status === 'FAIL');
  const tail = !bfails.length ? ''
    : bfails.length === 1 ? ` The baseline also has 1 failing check: ${what(bfails[0].id)}.`
      : ` The baseline also has ${bfails.length} failing checks, starting with ${what(bfails[0].id)}.`;
  return lead + tail;
}

/** The verdict line's hidden prefix: both numbers, in words, before the sentence. */
export function verdictPrefix(fidelity: LayerResult, baseline: LayerResult): string {
  const layer = (name: string, l: LayerResult) => (l.score === null || l.grade === null ? `${name}: no score.` : `${name} ${fmtScore(l.score)}, grade ${l.grade}.`);
  return `${layer('Contract fidelity', fidelity)} ${layer('Baseline', baseline)} `;
}

export function verdictFidelityNull(baseline: LayerResult): string {
  return baseline.score === null || baseline.grade === null
    ? 'Fidelity has no score for this page, because too few of your checks could run.'
    : `Fidelity has no score for this page, because too few of your checks could run. The baseline is ${fmtScore(baseline.score)}, grade ${baseline.grade}.`;
}

export const VERDICT_UNREACHABLE = 'Could not read this site, so neither number has a score. Your contract was read and is valid.';
