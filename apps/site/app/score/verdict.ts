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
  categoryScores?: Record<string, { score: number | null }>;
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
];

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

// ── Evidence ──────────────────────────────────────────────────────────────
// The anti-slop detector cites its evidence verbatim. Font names, hex values
// and buzzwords read fine as they are; a declaration block lifted from
// minified CSS does not ({content:"";background:linear-gradient(105deg,…),
// cut mid-token), so it is described in words and kept behind a disclosure.

const RAW_CSS = /[{};]/;

export function isRawCss(item: string): boolean {
  return RAW_CSS.test(item);
}

/** One declaration block in words: "Linear gradient on a pseudo-element, animated". */
export function describeCss(raw: string): string {
  const gradient = raw.match(/\b(linear|radial|conic)-gradient/i);
  let what = gradient ? `${gradient[1].toLowerCase()} gradient`
    : /\bbackground(?:-image)?\s*:\s*url\(/i.test(raw) ? 'background image'
    : /\bbox-shadow\s*:/i.test(raw) ? 'shadow'
    : /\bbackdrop-filter\s*:/i.test(raw) ? 'backdrop blur'
    : 'a CSS rule';
  if (/\bcontent\s*:/i.test(raw)) what += ' on a pseudo-element';
  const parts = [what];
  if (/\bposition\s*:\s*(?:absolute|fixed)/i.test(raw) && /\binset\s*:\s*0\b/i.test(raw)) parts.push('covering its box');
  if (/\banimation(?:-name)?\s*:/i.test(raw)) parts.push('animated');
  if (/\bmask(?:-image)?\s*:/i.test(raw)) parts.push('masked');
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type EvidenceReading = {
  /** Evidence that reads as it is: names, values, counts. */
  plain: string[];
  /** Declaration blocks, shown only behind the disclosure. */
  raw: string[];
  /** The raw blocks in words, deduplicated; empty when there are none. */
  summary: string;
};

export function readEvidence(items: string[]): EvidenceReading {
  const plain: string[] = [];
  const raw: string[] = [];
  for (const item of items) (isRawCss(item) ? raw : plain).push(item);
  const described = [...new Set(raw.map(describeCss))];
  return { plain, raw, summary: described.join(' · ') };
}
