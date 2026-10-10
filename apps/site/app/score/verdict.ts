// Words for a score result: the one-line verdict, the empty-run state, and a
// plain reading of raw CSS evidence. Pure functions with no imports, so
// scripts/check-score-verdict.mjs runs them under Node as they ship.

export type VerdictInput = {
  total?: number;
  fail?: number;
  warn?: number;
  /** Set by /api/score when the target could not be fetched at all. */
  unreachable?: boolean;
  unreachableDetail?: string;
  categoryScores?: Record<string, { score: number | null; fail?: number; weight?: number }>;
};

export const CATEGORIES: { key: string; label: string }[] = [
  { key: 'tokens', label: 'Tokens' },
  { key: 'responsive', label: 'Responsive' },
  { key: 'interaction', label: 'Interaction' },
  { key: 'poise', label: 'Poise' },
  { key: 'motion', label: 'Motion' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'identity', label: 'Identity' },
  { key: 'takt', label: 'Takt' },
  { key: 'cadence', label: 'Cadence' },
  { key: 'performance', label: 'Performance' },
  { key: 'semantic', label: 'Semantic' },
  { key: 'copywriting', label: 'Copywriting' },
  { key: 'spec', label: 'Spec' },
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

// Strongest / weakest scored categories for the hero meta line.
export function topCategories(r: VerdictInput, mode: 'best' | 'worst'): { label: string; score: number | null } {
  const entries = Object.entries(r.categoryScores || {}).filter(([, v]) => v.score !== null);
  if (entries.length === 0) return { label: '', score: null };
  const sorted = entries.sort((a, b) => (mode === 'best' ? (b[1].score! - a[1].score!) : (a[1].score! - b[1].score!)));
  const [key, val] = sorted[0];
  const label = CATEGORIES.find((c) => c.key === key)?.label
    || key.charAt(0).toUpperCase() + key.slice(1);
  return { label, score: val.score };
}

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

// Verdict line: PSI "Core Web Vitals Assessment: Passed" pattern. The
// one-line human verdict leads, in words not color, before the number.
export function verdictLine(r: VerdictInput): string {
  if (isEmptyRun(r)) {
    return 'Could not read this site: no checks ran, so no score is reported.';
  }
  const total = r.total ?? 0;
  const fails = r.fail ?? 0;
  if (fails === 0 && (r.warn ?? 0) <= Math.max(1, Math.floor(total * 0.15))) {
    return 'Strong conformance: this design system reads as engineered rather than assembled.';
  }
  if (fails > 0) {
    const worst = topCategories(r, 'worst');
    return `${fails} contract ${fails === 1 ? 'violation' : 'violations'}${worst.label ? `, weakest in ${worst.label}` : ''}.`;
  }
  return 'Partial conformance: passes the floor, but the contract sees warnings the eye forgives.';
}

// The sentence the report's live region reads when a run lands, in the
// approved words: "Contract score D, 67.9 out of 100. 1 failed check, in
// Accessibility." The categories named are those with a failed check, most
// failures first (then the heavier weight).
export function resultAnnouncement(r: VerdictInput & { grade?: string | null; score?: number | null }): string {
  const value = (Math.round((r.score ?? 0) * 10) / 10).toFixed(1);
  const head = `Contract score ${r.grade ?? 'F'}, ${value} out of 100.`;
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
