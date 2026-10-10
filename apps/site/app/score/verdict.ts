// Words and numbers for a score result: the one-line verdict, the empty-run
// state, the plain names, the score format, the category tone, and a plain
// reading of raw CSS evidence. Pure functions with no imports, so
// scripts/check-score-verdict.mjs and scripts/check-results-language.mjs run
// them under Node as they ship. Every result surface (the score form on / and
// /score/{lovable,v0,bolt}, the four-engine view on /score, the report) takes
// its words and formats from here, so one value reads one way everywhere.

export type VerdictInput = {
  total?: number;
  fail?: number;
  warn?: number;
  /** Set by /api/score when the target could not be fetched at all. */
  unreachable?: boolean;
  unreachableDetail?: string;
  categoryScores?: Record<string, { score: number | null; fail?: number; weight?: number }>;
  /** The run's checks, so the verdict can name where the failures are. */
  checks?: { category: string; status: string }[];
};

// Visitor-facing category names. The engine keys stay technical in the API,
// the MCP and /methodology (cadence, takt, poise, semantic, identity, spec).
export const CATEGORIES: { key: string; label: string }[] = [
  { key: 'tokens', label: 'Tokens' },
  { key: 'responsive', label: 'Responsive' },
  { key: 'interaction', label: 'Interaction' },
  { key: 'poise', label: 'Control polish' },
  { key: 'motion', label: 'Motion' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'identity', label: 'Page basics' },
  { key: 'takt', label: 'Interface feel' },
  { key: 'cadence', label: 'Typography' },
  { key: 'performance', label: 'Performance' },
  { key: 'semantic', label: 'Color roles' },
  { key: 'copywriting', label: 'Copywriting' },
  { key: 'security', label: 'Security' },
  { key: 'spec', label: 'DESIGN.md' },
];

/** A category key's display label; keys outside the list read capitalised. */
export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label || key.charAt(0).toUpperCase() + key.slice(1);
}

// The category filter's chips come from the checks the engine evaluated,
// never from the fixed list above alone: a v0 run carried 'copywriting' and
// 'spec' cards that no chip could reach, so the chips summed to 36 of 42.
// Known categories keep the list's order; any other key follows in the order
// it first appears. The counts always sum to the number of checks.
export function categoryChips(checks: { category: string }[]): { key: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of checks) counts.set(c.category, (counts.get(c.category) || 0) + 1);
  const known = CATEGORIES.map((c) => c.key).filter((k) => counts.has(k));
  const extra = [...counts.keys()].filter((k) => !CATEGORIES.some((c) => c.key === k));
  return [...known, ...extra].map((key) => ({ key, label: categoryLabel(key), count: counts.get(key) || 0 }));
}

// ── Scores ─────────────────────────────────────────────────────────────────

/** An overall score: one decimal, always ("67.9", "70.0"), printed with "/100"
    beside it and never "%": the score is a weighted contract score, not the
    share of checks passed (stripe.com scores 67.9 with 18 of 31 passed). */
export function fmtScore(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

/** A category score: a whole number ("88"). */
export function fmtCategory(n: number): string {
  return String(Math.round(n));
}

export type Tone = 'pass' | 'warn' | 'fail' | 'none';

/** One three-step rule for a category's score, on the grade thresholds: 80
    and up passes, 60 to 79 needs work, under 60 fails (lib/data/cohort.ts
    scoreTone draws the leaderboard on the same steps). */
export function categoryTone(score: number | null | undefined): Tone {
  if (score === null || score === undefined || Number.isNaN(score)) return 'none';
  return score >= 80 ? 'pass' : score >= 60 ? 'warn' : 'fail';
}

/** A check's status, as the same three steps (none for checks not scored). */
export function statusTone(status: string): Tone {
  return status === 'PASS' ? 'pass' : status === 'WARN' ? 'warn' : status === 'FAIL' ? 'fail' : 'none';
}

/** The engine's grade bands (computeGrade in api/score/route.ts), lowest first. */
export const GRADE_BANDS: { grade: string; from: number; to: number }[] = [
  { grade: 'F', from: 0, to: 60 },
  { grade: 'D', from: 60, to: 70 },
  { grade: 'C', from: 70, to: 80 },
  { grade: 'B', from: 80, to: 90 },
  { grade: 'A', from: 90, to: 100 },
];

/** Where a score sits on the grade scale, 0 to 1. F (under 60) takes the
    first third of the strip, so the four bands above it have room for their
    labels; D to A share the other two thirds, a sixth each. */
export function scalePosition(score: number): number {
  const s = Math.max(0, Math.min(100, score));
  return s < 60 ? (s / 60) * (1 / 3) : 1 / 3 + ((s - 60) / 40) * (2 / 3);
}

// ── Status words ───────────────────────────────────────────────────────────
// One word per status on every surface. The engine's statuses stay in the API.

/** A status as a label: pills and filter tabs. */
export const STATUS_LABEL: Record<string, string> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  WARN: 'Needs work',
  MANUAL: 'Needs a browser run',
  SKIP: 'Does not apply',
};

/** A status as the heading over its group of checks. */
export const STATUS_GROUP: Record<string, string> = {
  FAIL: 'Failed',
  WARN: 'Needs work',
  MANUAL: 'Needs a browser run',
  SKIP: 'Does not apply',
  PASS: 'Passed',
};

/** "1 failed", "3 need work", "1 needs a browser run", "10 do not apply". */
export function statusCount(status: string, n: number): string {
  const one = n === 1;
  switch (status) {
    case 'PASS': return `${n} passed`;
    case 'FAIL': return `${n} failed`;
    case 'WARN': return `${n} ${one ? 'needs' : 'need'} work`;
    case 'MANUAL': return `${n} ${one ? 'needs' : 'need'} a browser run`;
    case 'SKIP': return `${n} ${one ? 'does' : 'do'} not apply`;
    default: return `${n} ${status.toLowerCase()}`;
  }
}

/** The words after the number, for a tile that sets the number apart. */
export function statusCountWords(status: string, n: number): string {
  return statusCount(status, n).slice(String(n).length + 1);
}

/** A category's line under its name: only what needs attention. */
export function attentionLine(c: { score: number | null; fail?: number; warn?: number; manual?: number; skip?: number }): string {
  if (c.score === null) return `Not measured: ${c.manual ? 'needs a browser run' : 'does not apply'}`;
  const parts: string[] = [];
  if (c.fail) parts.push(statusCount('FAIL', c.fail));
  if (c.warn) parts.push(statusCount('WARN', c.warn));
  if (c.manual) parts.push(statusCount('MANUAL', c.manual));
  return parts.length ? parts.join(' · ') : 'All passed';
}

/** The rules a run was scored under, by their visitor names (the API keeps
    scope=universal and scope=contract). */
export function scopeLabel(scope: string | undefined): string {
  return scope === 'contract' ? 'Strict rules' : 'Standard rules';
}

// ── Verdict ────────────────────────────────────────────────────────────────

// A run that read nothing is not a score. The API answers ok with total 0
// when the site refused the fetch (lovable.dev returns 403 to every
// candidate URL), and zero checks also means zero fails, so the verdict
// below used to call that "Strong conformance" above a 0% ring.
export function isEmptyRun(r: VerdictInput): boolean {
  return r.unreachable === true || (r.total ?? 0) === 0;
}

// The reason line for the empty-run state: the API's own account when it
// gave one (it names the HTTP status or the timeout), otherwise the plain
// fact that nothing ran.
export function emptyRunReason(r: VerdictInput, url: string): string {
  const detail = r.unreachableDetail?.trim();
  if (detail) return detail;
  return `The engine reached ${url || 'the site'} but found no CSS it could check, so no checks ran. No score is reported for a page the engine could not read.`;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

// Verdict line: PSI "Core Web Vitals Assessment: Passed" pattern. The
// one-line human verdict, in words not color. A failing run names where its
// failures are (the categories of its failed checks) rather than the
// "weakest" category, which tied on most runs (stripe.com: Accessibility and
// Color roles both at 50).
export function verdictLine(r: VerdictInput): string {
  if (isEmptyRun(r)) {
    return 'Could not read this site: no checks ran, so no score is reported.';
  }
  const total = r.total ?? 0;
  const fails = r.fail ?? 0;
  const warns = r.warn ?? 0;
  if (fails === 0 && warns <= Math.max(1, Math.floor(total * 0.15))) {
    return 'Strong conformance: this design system reads as engineered rather than assembled.';
  }
  if (fails > 0) {
    const where = [...new Set((r.checks || []).filter((c) => c.status === 'FAIL').map((c) => categoryLabel(c.category)))];
    const head = `${fails} failed ${fails === 1 ? 'check' : 'checks'}${where.length ? `, in ${joinWords(where)}` : ''}`;
    return warns > 0 ? `${head}, and ${warns} that ${warns === 1 ? 'needs' : 'need'} work.` : `${head}.`;
  }
  return `No failed checks. ${statusCount('WARN', warns)}.`;
}

// The sentence the report's live region reads when a run lands, in the
// approved words: "Contract score D, 67.9 out of 100. 1 failed check, in
// Accessibility." The categories named are those with a failed check, most
// failures first (then the heavier weight).
export function resultAnnouncement(r: VerdictInput & { grade?: string | null; score?: number | null }): string {
  const head = `Contract score ${r.grade ?? 'F'}, ${fmtScore(r.score ?? 0)} out of 100.`;
  const fails = r.fail ?? 0;
  if (fails === 0) return `${head} No failed checks.`;
  const where = Object.entries(r.categoryScores ?? {})
    .filter(([, c]) => (c.fail ?? 0) > 0)
    .sort(([, a], [, b]) => (b.fail ?? 0) - (a.fail ?? 0) || (b.weight ?? 0) - (a.weight ?? 0))
    .map(([key]) => categoryLabel(key));
  const count = `${fails} failed ${fails === 1 ? 'check' : 'checks'}`;
  if (where.length === 0) return `${head} ${count}.`;
  if (where.length === 1) return `${head} ${count}, in ${where[0]}.`;
  if (where.length === 2) return `${head} ${count}, in ${where[0]} and ${where[1]}.`;
  return `${head} ${count} across ${where.length} categories, most in ${where[0]}.`;
}

// ── Evidence ──────────────────────────────────────────────────────────────
// The anti-slop detector cites its evidence verbatim. Font names, hex values
// and buzzwords read fine as they are; a declaration block lifted from
// minified CSS does not ({content:"";background:linear-gradient(105deg,…),
// cut mid-token), so it is described in words and kept behind a disclosure.

const RAW_CSS = /[{};]/;

export function isRawCss(item: string): boolean {
  return RAW_CSS.test(item);
}

type CssReading = {
  /** What the block paints, singular ('linear gradient') and plural. */
  one: string;
  many: string;
  pseudo: boolean;
  /** Qualities, each with its singular and plural wording. */
  traits: { one: string; many: string }[];
};

function readCss(raw: string): CssReading {
  const gradient = raw.match(/\b(linear|radial|conic)-gradient/i);
  const [one, many] = gradient ? [`${gradient[1].toLowerCase()} gradient`, `${gradient[1].toLowerCase()} gradients`]
    : /\bbackground(?:-image)?\s*:\s*url\(/i.test(raw) ? ['background image', 'background images']
    : /\bbox-shadow\s*:/i.test(raw) ? ['shadow', 'shadows']
    : /\bbackdrop-filter\s*:/i.test(raw) ? ['backdrop blur', 'backdrop blurs']
    : ['a CSS rule', 'CSS rules'];
  const traits: CssReading['traits'] = [];
  if (/\bposition\s*:\s*(?:absolute|fixed)/i.test(raw) && /\binset\s*:\s*0\b/i.test(raw)) traits.push({ one: 'covering its box', many: 'covering their boxes' });
  if (/\banimation(?:-name)?\s*:/i.test(raw)) traits.push({ one: 'animated', many: 'animated' });
  if (/\bmask(?:-image)?\s*:/i.test(raw)) traits.push({ one: 'masked', many: 'masked' });
  return { one, many, pseudo: /\bcontent\s*:/i.test(raw), traits };
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One declaration block in words: "Linear gradient on a pseudo-element, animated". */
export function describeCss(raw: string): string {
  const r = readCss(raw);
  const what = r.pseudo ? `${r.one} on a pseudo-element` : r.one;
  return sentenceCase([what, ...r.traits.map((t) => t.one)].join(', '));
}

// Several blocks of one kind read as a count, never the same phrase twice:
// "2 linear gradients on pseudo-elements, 1 animated", where listing each
// block said "Linear gradient on a pseudo-element, animated · Linear gradient
// on a pseudo-element". A kind with one block reads as describeCss does.
function describeCssGroup(raws: string[]): string {
  if (raws.length === 1) return describeCss(raws[0]);
  const readings = raws.map(readCss);
  const { many, pseudo } = readings[0];
  const n = readings.length;
  const head = `${n} ${pseudo ? `${many} on pseudo-elements` : many}`;
  const tally = new Map<string, { one: string; many: string; k: number }>();
  for (const r of readings) {
    for (const t of r.traits) {
      const seen = tally.get(t.one);
      if (seen) seen.k += 1;
      else tally.set(t.one, { ...t, k: 1 });
    }
  }
  const tail = [...tally.values()].map((t) =>
    t.k === n ? `${n === 2 ? 'both' : 'all'} ${t.many}` : `${t.k} ${t.k === 1 ? t.one : t.many}`,
  );
  return [head, ...tail].join(', ');
}

export type EvidenceReading = {
  /** Evidence that reads as it is: names, values, counts. */
  plain: string[];
  /** Declaration blocks, shown only behind the disclosure. */
  raw: string[];
  /** The raw blocks in words, one phrase per kind with a count; empty when there are none. */
  summary: string;
};

export function readEvidence(items: string[]): EvidenceReading {
  const plain: string[] = [];
  const raw: string[] = [];
  for (const item of items) (isRawCss(item) ? raw : plain).push(item);
  // Group by what the block paints (and whether a pseudo-element carries
  // it), keeping the order each kind first appears.
  const groups = new Map<string, string[]>();
  for (const block of raw) {
    const r = readCss(block);
    const key = `${r.one}|${r.pseudo}`;
    const list = groups.get(key);
    if (list) list.push(block);
    else groups.set(key, [block]);
  }
  const summary = [...groups.values()].map(describeCssGroup).join(' · ');
  return { plain, raw, summary };
}
