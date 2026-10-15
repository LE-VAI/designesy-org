import { NextResponse, after } from 'next/server';
import { recordUsage, scoreClientOf, scoreContractKey } from '../../lib/usage';
import { unstable_cache } from 'next/cache';
import { normalizeInputUrl, isValidUrl, safeFetch } from '../../lib/url-guard';
import { currentScoreMissGate } from '../../lib/score-miss-gate';
import { buildReceipt } from '../../lib/receipt';
import { CONTRACT_VERSION } from '../../lib/design-system-contract';
import { handleOwnContract } from '../../lib/own-contract/api';
import { clientKey } from '../../lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Scope system: contract vs universal ─────────────────────────────────────
// The score engine has two scope modes that control how absence (a feature is
// not present on the scored site) is treated:
//
//   scope=contract  (default for designesy.org self-scoring)
//     - Every check active. Absence of a feature = WARN or FAIL.
//     - This is the strictest mode: the contract's patterns are mandatory.
//     - Used when scoring designesy.org itself (we should follow our own rules).
//
//   scope=universal  (default for external sites)
//     - Tier 2 checks (optional features) → SKIP on absence instead of WARN.
//       A site without sound, font-synthesis, or text-wrap isn't "broken" —
//       it just doesn't use that pattern. If the feature IS present, it's
//       verified normally (violation → WARN/FAIL as usual).
//     - Tier 3 checks (contract-specific tokens) → SKIP on absence instead of
//       WARN/FAIL. A site without --paper or --signal isn't failing — it just
//       uses different token names. If tokens ARE present, they're verified.
//     - Tier 1 checks (universal accessibility/semantics) stay as-is. A site
//       without :focus-visible or prefers-reduced-motion IS broken — those are
//       WCAG 2.2 AA requirements, not Designesy preferences.
//
// The filter runs AFTER all checks execute, as a post-processing step. It
// inspects each check's status + detail string to determine if the result is
// an "absence" outcome (feature not present) vs a "violation" outcome (feature
// present but wrong). Only absence outcomes are converted to SKIP. This means
// no check function needs to be modified — the filter is a single function.

export type ScoreScope = 'contract' | 'universal';

// Tier 2: optional features — SKIP on absence when scope=universal.
// These are Designesy-specific polish patterns, not universal requirements.
// If the feature IS present and wrong, the original WARN/FAIL stands.
const TIER2_ABSENCE_PATTERNS: Array<{ id: string; absenceMatch: RegExp }> = [
  // v08 Poise interaction CSS — Designesy-specific interaction patterns
  { id: 'v08', absenceMatch: /^missing:/ },
  // v10 Takt feel CSS — Designesy-specific feel patterns
  { id: 'v10', absenceMatch: /^missing:/ },
  // v13 press scale — optional interaction polish (not a WCAG requirement)
  { id: 'v13', absenceMatch: /^no press-scale|only scale\(0\)|no press-scale \(scale/ },
  // v14 Cadence umbrella: Designesy Cadence taste. It sat in Tier 1 through
  // engine 1.0.0, where scope=universal WARNed external sites for not adopting
  // Cadence. Every v14 WARN names the missing rules, so every WARN is an absence.
  { id: 'v14', absenceMatch: /^missing:/ },
  // v15 font-smoothing — platform-specific polish, not a universal requirement
  { id: 'v15', absenceMatch: /missing complete font-smoothing/ },
  // v18 text-wrap balance + pretty: Designesy Cadence taste, Tier 1 until engine
  // 1.1.0. The check only detects the two values, so its WARN always means one
  // or both are absent; the pattern matches that detail exactly.
  { id: 'v18', absenceMatch: /^balance=(?:true|false) pretty=(?:true|false)$/ },
  // v19 tabular-nums — optional numeric typography refinement
  { id: 'v19', absenceMatch: /^only \d+ instances/ },
  // v20 ::selection styled — cosmetic brand surface, not a universal requirement
  { id: 'v20', absenceMatch: /^no ::selection rule found/ },
  // v23 duration tokens — Designesy contract-specific token set
  { id: 'v23', absenceMatch: /^only \d+\/5 duration tokens|no.*duration tokens/i },
  // v28 reading width — only applicable to prose-heavy sites
  { id: 'v28', absenceMatch: /^no max-width in ch units/ },
  // x01 font-synthesis — optional typography refinement
  { id: 'x01', absenceMatch: /^no font-synthesis rule/ },
  // x02 text-underline-position — optional underline refinement
  { id: 'x02', absenceMatch: /^no text-underline-position rule/ },
  // x03 text-decoration-skip-ink — optional underline refinement
  { id: 'x03', absenceMatch: /^no text-decoration-skip-ink rule/ },
];

// Tier 3: contract-specific tokens — SKIP all non-PASS when scope=universal.
// These checks verify Designesy's specific token naming convention. A site
// with different token names (e.g. --bg instead of --paper) shouldn't fail.
// If the tokens ARE present and wrong (e.g. bad contrast), that's a real
// violation that stands even in universal scope.
const TIER3_CONTRACT_ONLY = new Set([
  'v01', // --paper token (Designesy naming convention)
  'v22', // --signal token contrast (Designesy naming convention)
  'v29', // token layering (Designesy architecture expectation)
]);

// v04 sound toggle is handled specially: it's MANUAL in static mode (no
// penalty) and WARN in browser-audit mode when no sound toggle is found.
// The browser audit route (audit/route.ts) handles scope-awareness for v04.

function applyScopeFilter(
  checks: CheckResult[],
  scope: ScoreScope
): CheckResult[] {
  if (scope === 'contract') return checks; // no filtering

  return checks.map((c) => {
    // Tier 3: contract-specific token checks — SKIP any non-PASS result
    // when the feature is absent (no tokens to verify against).
    if (TIER3_CONTRACT_ONLY.has(c.id)) {
      if (c.status === 'FAIL' || c.status === 'WARN') {
        return {
          ...c,
          status: 'SKIP',
          detail: `${c.detail} (skipped: scope=universal; this check verifies Designesy-specific token naming, and the site may use different token names)`,
        };
      }
      return c;
    }

    // Tier 2: optional features — SKIP only on absence patterns
    const tier2 = TIER2_ABSENCE_PATTERNS.find((t) => t.id === c.id);
    if (tier2 && (c.status === 'WARN' || c.status === 'FAIL')) {
      if (tier2.absenceMatch.test(c.detail)) {
        return {
          ...c,
          status: 'SKIP',
          detail: `${c.detail} (skipped: scope=universal; this feature is optional and not present on this site)`,
        };
      }
      // If the pattern doesn't match, it's a real violation — keep as-is
    }

    return c;
  });
}

// Auto-detect scope: designesy.org gets contract scope (self-scoring),
// everything else gets universal scope (fair to external sites).
export function autoDetectScope(targetUrl: string): ScoreScope {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    if (host === 'designesy.org' || host === 'www.designesy.org') {
      return 'contract';
    }
  } catch {
    // ignore URL parse errors — default to universal
  }
  return 'universal';
}

// ── Score cache ─────────────────────────────────────────────────────────────
// Score results are stable for ~24h (sites don't redesign daily) and the
// full check run + target-site fetch is expensive (3-8s cold). unstable_cache
// persists results across requests on Vercel's Data Cache, keyed automatically
// by the targetUrl argument. Tag 'score' allows future revalidation via
// revalidateTag. Both the POST handler and the OG image route import `scoreUrl`
// and share this cache — so scoring a site once makes the OG card for that URL
// instant too. Repeat scores for the same URL drop from ~3-8s to <50ms.
const SCORE_TTL_SECONDS = 60 * 60 * 24; // 24h

// ── Rate limiting (in-memory) ──────────────────────────────────────────────
// Pro Plan: lifted from 20/hr to 100/hr. Results are cached 24h via
// unstable_cache, so the effective throughput is much higher — repeat
// scores for the same URL hit the Data Cache and cost nothing.
//
// HONEST SCOPE — this limiter does NOT enforce on Vercel. `hits` is a
// module-level Map, and Fluid compute runs many serverless instances, each with
// its own copy. A caller's requests are spread across instances, so the counter
// never reaches 100 on any single one. Measured 2026-09-16: 105 consecutive
// requests from one IP, zero 429s.
//
// It is kept as a same-instance burst damper (it does blunt a tight loop that
// happens to land on one instance) and as a correct limiter for a single-process
// deployment. Real cross-instance enforcement is the Edge layer's job — see
// middleware.ts. If you are relying on THIS for abuse protection, you are not
// protected; verify with /api/admin/limiter-health instead.

const RATE_LIMIT = 100; // requests per hour per IP (Pro Plan)
const RATE_WINDOW = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// ── URL Normalization & Validation ─────────────────────────────────────────
// Shared hardened guard in app/lib/url-guard.ts — imported above and re-
// exported here for backwards compatibility with app/score/opengraph-image.tsx,
// which imports from '../api/score/route'. The live badge
// (app/lib/badge/live-badge-route.ts) imports the guard directly.

export { normalizeInputUrl, isValidUrl };

// ── Linear-time scanning, shared by both engine copies (engine 1.5.1) ──────
// Each helper below returns exactly what the regular expression it replaced
// returned: the same matches at the same indexes with the same groups, or the
// same string after the same replace. The replaced patterns retried from every
// candidate start and rescanned the rest of the run each time, so their cost
// grew with the square (one url() pattern with the cube) of a long run of the
// right characters on a fetched page. These read each run once.
// test/linear-scan.test.mjs runs every helper against the pattern it replaced,
// over the fixture pages and generated input, and times each on 100 KB.

/** JavaScript's \s: WhiteSpace and LineTerminator code units. */
function isJsSpace(c: number): boolean {
  return c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a)
    || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
}

/** The index after the run of \s that starts at `i`. */
function wsEnd(s: string, i: number): number {
  while (i < s.length && isJsSpace(s.charCodeAt(i))) i++;
  return i;
}

/** A regex match as the helpers report it: start, matched text, groups. */
type ScanMatch = { index: number; text: string; groups: Array<string | undefined> };

/**
 * Spans of OPEN[\s\S]*?CLOSE, global and leftmost, as [start, end, ...] pairs.
 * `open` matches a fixed-length opener, `close` the closer; both global. A
 * closer is looked for once per opener, and when there is none after one
 * opener there is none after any later one, so the scan stops there.
 */
function lazyBlockSpans(text: string, open: RegExp, close: RegExp): number[] {
  const spans: number[] = [];
  let pos = 0;
  for (;;) {
    open.lastIndex = pos;
    const o = open.exec(text);
    if (!o) break;
    close.lastIndex = o.index + o[0].length;
    const c = close.exec(text);
    if (!c) break;
    spans.push(o.index, c.index + c[0].length);
    pos = c.index + c[0].length;
  }
  return spans;
}

/** `text` with each [start, end) span replaced by `rep`. */
function replaceSpans(text: string, spans: number[], rep: string): string {
  if (spans.length === 0) return text;
  const parts: string[] = [];
  let last = 0;
  for (let k = 0; k < spans.length; k += 2) {
    parts.push(text.slice(last, spans[k]), rep);
    last = spans[k + 1];
  }
  parts.push(text.slice(last));
  return parts.join('');
}

/** html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '') */
function withoutScriptsAndStyles(html: string): string {
  const noScripts = replaceSpans(html, lazyBlockSpans(html, /<script/gi, /<\/script>/gi), '');
  return replaceSpans(noScripts, lazyBlockSpans(noScripts, /<style/gi, /<\/style>/gi), '');
}

/** css.replace(/\/\*[\s\S]*?\*\//g, rep) */
function withoutCssComments(css: string, rep: string): string {
  return replaceSpans(css, lazyBlockSpans(css, /\/\*/g, /\*\//g), rep);
}

/** text.replace(/<[^>]*>/g, rep), or /<[^>]+>/g when `nonEmpty`. */
function withoutTags(text: string, rep: string, nonEmpty: boolean): string {
  const spans: number[] = [];
  let pos = 0;
  for (;;) {
    const lt = text.indexOf('<', pos);
    if (lt < 0) break;
    if (nonEmpty && text.charCodeAt(lt + 1) === 62) { pos = lt + 1; continue; }
    const gt = text.indexOf('>', lt + 1);
    if (gt < 0) break;
    spans.push(lt, gt + 1);
    pos = gt + 1;
  }
  return replaceSpans(text, spans, rep);
}

/**
 * Matches of <TAG[^>]*>([\s\S]*?)<\/TAG> (global): `open` matches `<TAG`,
 * `close` the closing tag, both global. groups[0] is the content.
 */
function elementMatches(html: string, open: RegExp, close: RegExp): ScanMatch[] {
  const out: ScanMatch[] = [];
  let pos = 0;
  for (;;) {
    open.lastIndex = pos;
    const o = open.exec(html);
    if (!o) break;
    const gt = html.indexOf('>', o.index + o[0].length);
    if (gt < 0) break;
    close.lastIndex = gt + 1;
    const c = close.exec(html);
    if (!c) break;
    const end = c.index + c[0].length;
    out.push({ index: o.index, text: html.slice(o.index, end), groups: [html.slice(gt + 1, c.index)] });
    pos = end;
  }
  return out;
}

/**
 * Matches of <NAME[^>]*ATTR[^>]*>([\s\S]*?)CLOSE (global). `open` matches `<`
 * and as much of the name as must precede the attribute; `attr` and `close`
 * are global. An opener whose tag holds no ATTR rules out every opener before
 * the same `>`; one with no CLOSE after it rules out every later one.
 */
function roleElementMatches(html: string, open: RegExp, attr: RegExp, close: RegExp): ScanMatch[] {
  const out: ScanMatch[] = [];
  let pos = 0;
  let attrFrom = -1;
  let attrAt = -1;
  for (;;) {
    open.lastIndex = pos;
    const o = open.exec(html);
    if (!o) break;
    const gt = html.indexOf('>', o.index + 1);
    if (gt < 0) break;
    const from = o.index + o[0].length;
    if (!(attrFrom >= 0 && from >= attrFrom && from <= attrAt)) {
      attr.lastIndex = from;
      const a = attr.exec(html);
      attrFrom = from;
      attrAt = a ? a.index : Infinity;
    }
    if (attrAt >= gt) { pos = gt + 1; continue; }
    close.lastIndex = gt + 1;
    const c = close.exec(html);
    if (!c) break;
    const end = c.index + c[0].length;
    out.push({ index: o.index, text: html.slice(o.index, end), groups: [html.slice(gt + 1, c.index)] });
    pos = end;
  }
  return out;
}

/** v41: matches of /<(button|a|label|td|th|p|li|h[1-6])\s([^>]*?)>([\s\S]*?)<\/\1>/gi, groups [tag, attrs, content]. */
function capsElementMatches(html: string): ScanMatch[] {
  const out: ScanMatch[] = [];
  const open = /<(button|a|label|td|th|p|li|h[1-6])\s/gi;
  const closers: Record<string, RegExp> = {};
  const noCloserFrom: Record<string, number> = {};
  let gtFrom = -1;
  let gtAt = -1;
  let pos = 0;
  for (;;) {
    open.lastIndex = pos;
    const o = open.exec(html);
    if (!o) break;
    const from = o.index + o[0].length;
    if (!(gtFrom >= 0 && from >= gtFrom && from <= gtAt)) {
      gtFrom = from;
      gtAt = html.indexOf('>', from);
    }
    if (gtAt < 0) break;
    const tag = o[1].toLowerCase();
    if (noCloserFrom[tag] !== undefined && gtAt + 1 >= noCloserFrom[tag]) { pos = o.index + 1; continue; }
    const close = closers[tag] ?? (closers[tag] = new RegExp(`</${tag}>`, 'gi'));
    close.lastIndex = gtAt + 1;
    const c = close.exec(html);
    if (!c) { noCloserFrom[tag] = gtAt + 1; pos = o.index + 1; continue; }
    const end = c.index + c[0].length;
    out.push({ index: o.index, text: html.slice(o.index, end), groups: [o[1], html.slice(from, gtAt), html.slice(gtAt + 1, c.index)] });
    pos = end;
  }
  return out;
}

/**
 * /NAME[^"']*NEEDLE[^"']*["']/i.test(attrs), where `name` (global) matches
 * the attribute name, `=` and its opening quote, and `needle` (global) holds
 * no quote: true when NEEDLE sits wholly inside one quoted value that closes.
 */
function quotedAttrHas(attrs: string, name: RegExp, needle: RegExp): boolean {
  let pos = 0;
  let needleFrom = -1;
  let needleAt = -1;
  for (;;) {
    name.lastIndex = pos;
    const n = name.exec(attrs);
    if (!n) return false;
    const from = n.index + n[0].length;
    let q = from;
    while (q < attrs.length && attrs[q] !== '"' && attrs[q] !== "'") q++;
    if (q >= attrs.length) return false;
    if (!(needleFrom >= 0 && from >= needleFrom && from <= needleAt)) {
      needle.lastIndex = from;
      const m = needle.exec(attrs);
      needleFrom = from;
      needleAt = m ? m.index : Infinity;
    }
    if (needleAt < q) return true;
    pos = n.index + 1;
  }
}
/** The first match of a global regex at or after `from`, remembered while later queries fall before it. */
function nextMatchFinder(text: string, re: RegExp): (from: number) => number {
  let memoFrom = -1;
  let memoAt = -1;
  return (from: number): number => {
    if (!(memoFrom >= 0 && from >= memoFrom && from <= memoAt)) {
      re.lastIndex = from;
      const m = re.exec(text);
      memoFrom = from;
      memoAt = m ? m.index : Infinity;
    }
    return memoAt;
  };
}

/** Start positions of every match of a global regex, ascending. */
function matchStarts(text: string, re: RegExp): number[] {
  const out: number[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push(m.index);
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

/**
 * Matches of START[^{]*\{[^}]*BODY (global): after each start, the rule body
 * from the first `{` to the first `}` must hold BODY, and the match ends where
 * BODY last matches in it (the greedy [^}]*). `next(from, lastEnd)` returns the
 * first start at or after `from` whose prelude reaches a `{` (brace -1 when no
 * later start can), or null; it is told where the previous match ended because
 * some starts reach back before their first character. `lead` (global) finds
 * where BODY can begin and `body` is BODY, sticky. Starts that share a body's
 * `}` share its answer, so each body is read once. `first` stops at one match.
 */
function ruleBodyScan(
  css: string,
  next: (from: number, lastEnd: number) => { index: number; brace: number } | null,
  lead: RegExp,
  body: RegExp,
  first: boolean,
): ScanMatch[] {
  const out: ScanMatch[] = [];
  const leads = matchStarts(css, lead);
  let ptr = 0;
  let pos = 0;
  let lastEnd = 0;
  let deadUntil = -1;
  for (;;) {
    const st = next(pos, lastEnd);
    if (!st || st.brace < 0) break;
    const b = st.brace;
    if (b < deadUntil) { pos = b + 1; continue; }
    let c = css.indexOf('}', b + 1);
    if (c < 0) c = css.length;
    deadUntil = c;
    while (ptr < leads.length && leads[ptr] <= b) ptr++;
    let end = ptr;
    while (end < leads.length && leads[end] <= c) end++;
    let hit: RegExpExecArray | null = null;
    for (let k = end - 1; k >= ptr && !hit; k--) {
      body.lastIndex = leads[k];
      hit = body.exec(css);
    }
    ptr = end;
    if (!hit) { pos = b + 1; continue; }
    const stop = hit.index + hit[0].length;
    out.push({ index: st.index, text: css.slice(st.index, stop), groups: hit.slice(1) });
    if (first) break;
    pos = stop;
    lastEnd = stop;
  }
  return out;
}

/** next() for ruleBodyScan when the start is a plain pattern (global) followed by [^{]*\{. */
function bracedStarts(css: string, start: RegExp): (from: number) => { index: number; brace: number } | null {
  const brace = nextMatchFinder(css, /\{/g);
  return (from: number) => {
    start.lastIndex = from;
    const m = start.exec(css);
    if (!m) return null;
    const b = brace(m.index + m[0].length);
    return { index: m.index, brace: b === Infinity ? -1 : b };
  };
}

/** next() for v27's floor rule: input\s*(?:,[^{]*)?\{ */
function inputFloorStarts(css: string): (from: number) => { index: number; brace: number } | null {
  const start = /input/gi;
  const brace = nextMatchFinder(css, /\{/g);
  return (from: number) => {
    for (let at = from; ;) {
      start.lastIndex = at;
      const m = start.exec(css);
      if (!m) return null;
      const p = wsEnd(css, m.index + 5);
      if (css.charCodeAt(p) === 123) return { index: m.index, brace: p };
      if (css.charCodeAt(p) === 44) {
        const b = brace(p + 1);
        return { index: m.index, brace: b === Infinity ? -1 : b };
      }
      at = m.index + 1;
    }
  };
}

/** A LineTerminator code unit, where ^ matches under the m flag. */
function isLineTerminator(c: number): boolean {
  return c === 10 || c === 13 || c === 0x2028 || c === 0x2029;
}

/**
 * next() for v24's selector start (?:^|[,}\s])\s*(?:button|a\b|...) with the m
 * flag: a keyword counts when the space before it begins on a line start, a
 * space, a comma or a closing brace at or after the previous match's end.
 */
function touchTargetStarts(css: string): (from: number, lastEnd: number) => { index: number; brace: number } | null {
  const keyword = /button|a\b|input|textarea|select|\[role\s*=\s*["']?button["']?\]|\.btn|\.button|\.chip|\.tab|\.nav-link/gi;
  const brace = nextMatchFinder(css, /\{/g);
  return (from: number, lastEnd: number) => {
    for (let at = from; ;) {
      keyword.lastIndex = at;
      const k = keyword.exec(css);
      if (!k) return null;
      const q = k.index;
      let w = q;
      while (w > lastEnd && isJsSpace(css.charCodeAt(w - 1))) w--;
      let index = -1;
      if (w - 1 >= lastEnd && (css.charCodeAt(w - 1) === 44 || css.charCodeAt(w - 1) === 125)) index = w - 1;
      else if (w < q) index = w;
      else if (q >= lastEnd && (q === 0 || isLineTerminator(css.charCodeAt(q - 1)))) index = q;
      if (index < 0) { at = q + 1; continue; }
      const b = brace(q + k[0].length);
      return { index, brace: b === Infinity ? -1 : b };
    }
  };
}

/** next() for O-motion's breath keyframes: @keyframes\s+[^{]*breath[^{]*\{ */
function breathKeyframeStarts(css: string): (from: number) => { index: number; brace: number } | null {
  const start = /@keyframes/gi;
  const brace = nextMatchFinder(css, /\{/g);
  const breath = nextMatchFinder(css, /breath/gi);
  return (from: number) => {
    for (let at = from; ;) {
      start.lastIndex = at;
      const m = start.exec(css);
      if (!m) return null;
      const after = m.index + m[0].length;
      if (!isJsSpace(css.charCodeAt(after))) { at = m.index + 1; continue; }
      const b = brace(after);
      if (b === Infinity) return { index: m.index, brace: -1 };
      if (breath(after + 1) < b) return { index: m.index, brace: b };
      at = b + 1;
    }
  };
}

/**
 * /START[^{]*X/i.test(css): X (global, no `{`) begins in the prelude between
 * a start and the first `{` after it. Only the first start of each prelude
 * needs reading; later ones see less of it.
 */
function preludeHas(css: string, start: RegExp, x: RegExp): boolean {
  const brace = nextMatchFinder(css, /\{/g);
  const found = nextMatchFinder(css, x);
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) return false;
    const after = m.index + m[0].length;
    const b = brace(after);
    if (found(after) < b) return true;
    if (b === Infinity) return false;
    pos = b + 1;
  }
}

/**
 * Matches of START[^{]*X[^{]*\{ (global): X's last match in the prelude before
 * the first `{` after the start; the match runs to that `{`. `lead` (global)
 * finds where X can begin, `x` is X, sticky.
 */
function preludeMatches(css: string, start: RegExp, lead: RegExp, x: RegExp): ScanMatch[] {
  const out: ScanMatch[] = [];
  const leads = matchStarts(css, lead);
  let ptr = 0;
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) break;
    const after = m.index + m[0].length;
    const b = css.indexOf('{', after);
    if (b < 0) break;
    while (ptr < leads.length && leads[ptr] < after) ptr++;
    let end = ptr;
    while (end < leads.length && leads[end] < b) end++;
    let hit: RegExpExecArray | null = null;
    for (let k = end - 1; k >= ptr && !hit; k--) {
      x.lastIndex = leads[k];
      hit = x.exec(css);
    }
    ptr = end;
    if (hit) out.push({ index: m.index, text: css.slice(m.index, b + 1), groups: hit.slice(1) });
    pos = b + 1;
  }
  return out;
}

/** css.replace(/@media[^{]*\{[^@]*?\}\s*\}/gi, '') */
function withoutMediaBlocks(css: string): string {
  const start = /@media/gi;
  const spans: number[] = [];
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) break;
    const b = css.indexOf('{', m.index + m[0].length);
    if (b < 0) break;
    let end = -1;
    for (let k = b + 1; k < css.length; k++) {
      const ch = css.charCodeAt(k);
      if (ch === 64) break;
      if (ch === 125) {
        const t = wsEnd(css, k + 1);
        if (css.charCodeAt(t) === 125) { end = t + 1; break; }
      }
    }
    if (end < 0) { pos = b + 1; continue; }
    spans.push(m.index, end);
    pos = end;
  }
  return replaceSpans(css, spans, '');
}

/** css.replace(/@keyframes\s+[^{]+\{[^@]*?\}/gi, '') */
function withoutKeyframesBlocks(css: string): string {
  const start = /@keyframes/gi;
  const spans: number[] = [];
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) break;
    const after = m.index + m[0].length;
    if (!isJsSpace(css.charCodeAt(after))) { pos = m.index + 1; continue; }
    const b = css.indexOf('{', after);
    if (b < 0) break;
    if (b < after + 2) { pos = m.index + 1; continue; }
    let end = -1;
    for (let k = b + 1; k < css.length; k++) {
      const ch = css.charCodeAt(k);
      if (ch === 64) break;
      if (ch === 125) { end = k + 1; break; }
    }
    if (end < 0) { pos = b + 1; continue; }
    spans.push(m.index, end);
    pos = end;
  }
  return replaceSpans(css, spans, '');
}

/** css.match(/::selection\s*\{[^}]*\}/gi) */
function selectionRules(css: string): string[] | null {
  const start = /::selection/gi;
  const out: string[] = [];
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) break;
    const b = wsEnd(css, m.index + m[0].length);
    if (css.charCodeAt(b) !== 123) { pos = m.index + 1; continue; }
    const c = css.indexOf('}', b + 1);
    if (c < 0) break;
    out.push(css.slice(m.index, c + 1));
    pos = c + 1;
  }
  return out.length ? out : null;
}

/** The matches css.replace(/(font-size\s*:\s*)(var\([^;{}]*\))/gi, fn) hands fn: groups [lead, value]. */
function fontSizeVarMatches(css: string): ScanMatch[] {
  const start = /font-size/gi;
  const varAt = /var\(/iy;
  const out: ScanMatch[] = [];
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) break;
    const colon = wsEnd(css, m.index + m[0].length);
    if (css.charCodeAt(colon) !== 58) { pos = m.index + 1; continue; }
    const v = wsEnd(css, colon + 1);
    varAt.lastIndex = v;
    if (!varAt.test(css)) { pos = m.index + 1; continue; }
    let r = v + 4;
    while (r < css.length) {
      const ch = css.charCodeAt(r);
      if (ch === 59 || ch === 123 || ch === 125) break;
      r++;
    }
    let close = r - 1;
    while (close >= v + 4 && css.charCodeAt(close) !== 41) close--;
    if (close >= v + 4) {
      out.push({ index: m.index, text: css.slice(m.index, close + 1), groups: [css.slice(m.index, v), css.slice(v, close + 1)] });
    }
    // Every later start before r ends at the same r and finds no ')' after this one.
    pos = r;
  }
  return out;
}

/** Matches of /([^{}]+)\{([^{}]*)\}/g: groups [prelude, body]. */
function cssRuleBlocks(css: string): ScanMatch[] {
  const out: ScanMatch[] = [];
  const n = css.length;
  const braceAt = (k: number): boolean => {
    const ch = css.charCodeAt(k);
    return ch === 123 || ch === 125;
  };
  for (let pos = 0; pos < n;) {
    let b = pos;
    while (b < n && !braceAt(b)) b++;
    if (b === n) break;
    if (b === pos || css.charCodeAt(b) === 125) { pos = b + 1; continue; }
    let c = b + 1;
    while (c < n && !braceAt(c)) c++;
    if (c === n) break;
    if (css.charCodeAt(c) === 123) { pos = b + 1; continue; }
    out.push({ index: pos, text: css.slice(pos, c + 1), groups: [css.slice(pos, b), css.slice(b + 1, c)] });
    pos = c + 1;
  }
  return out;
}

/** Matches of /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi: groups [path]. */
function cssUrlMatches(css: string): ScanMatch[] {
  const start = /url\(/gi;
  const urlAt = /url\(/iy;
  const out: ScanMatch[] = [];
  const n = css.length;
  const isQuote = (c: number): boolean => c === 34 || c === 39;
  // First quote or ')' at or after `from`.
  const stopAt = (from: number): number => {
    let k = from;
    while (k < n) {
      const ch = css.charCodeAt(k);
      if (ch === 34 || ch === 39 || ch === 41) break;
      k++;
    }
    return k;
  };
  // ['"]?\s*\) at a quote or ')': the index after it, or -1.
  const tailEnd = (r: number): number => {
    if (r >= n) return -1;
    if (css.charCodeAt(r) === 41) return r + 1;
    const t = wsEnd(css, r + 1);
    return css.charCodeAt(t) === 41 ? t + 1 : -1;
  };
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) break;
    const p0 = m.index + m[0].length;
    const p1 = wsEnd(css, p0);
    let hit = -1;
    let from = -1;
    let to = -1;
    // All the leading space, then the quote after it taken, then not taken.
    if (p1 < n && isQuote(css.charCodeAt(p1))) {
      const r = stopAt(p1 + 1);
      const e = r > p1 + 1 ? tailEnd(r) : -1;
      if (e >= 0) { hit = e; from = p1 + 1; to = r; }
    }
    if (hit < 0) {
      const r = stopAt(p1);
      const e = r > p1 ? tailEnd(r) : -1;
      if (e >= 0) { hit = e; from = p1; to = r; }
    }
    // Less leading space: the path starts on a space and runs to the same stop.
    if (hit < 0 && p1 > p0) {
      const r = stopAt(p1 - 1);
      const e = tailEnd(r);
      if (e >= 0) { hit = e; from = p1 - 1; to = r; }
    }
    if (hit >= 0) {
      out.push({ index: m.index, text: css.slice(m.index, hit), groups: [css.slice(from, to)] });
      pos = hit;
      continue;
    }
    // A later url( before the first quote or ')' after this one reads the same
    // stop and fails the same way, unless only space separates it from a
    // quote at that stop: that one can take the quote and must be tried.
    const r1 = stopAt(p0);
    if (r1 >= n) break;
    let w = r1;
    while (w > p0 && isJsSpace(css.charCodeAt(w - 1))) w--;
    urlAt.lastIndex = w - 4;
    pos = w - 4 > m.index && urlAt.test(css) ? w - 4 : r1;
  }
  return out;
}

/** css.match(/(?:^|\})[^{}]*\{[^}]*background-clip\s*:\s*text[^}]*\}/gi) || [] */
function gradientClipRules(css: string): string[] {
  const found = nextMatchFinder(css, /background-clip\s*:\s*text/gi);
  const out: string[] = [];
  const n = css.length;
  let pos = 0;
  for (let first = true; ;) {
    let i: number;
    let from: number;
    if (first) {
      first = false;
      i = 0;
      from = css.charCodeAt(0) === 125 ? 1 : 0;
    } else {
      i = css.indexOf('}', pos);
      if (i < 0) break;
      from = i + 1;
    }
    let b = from;
    while (b < n && css.charCodeAt(b) !== 123 && css.charCodeAt(b) !== 125) b++;
    if (b >= n) break;
    if (css.charCodeAt(b) === 125) { pos = b; continue; }
    const c = css.indexOf('}', b + 1);
    if (c < 0) break;
    if (found(b + 1) < c) { out.push(css.slice(i, c + 1)); pos = c + 1; } else pos = c;
  }
  return out;
}

/**
 * block.match(/linear-gradient\(([\s\S]+)\)\s*;?\s*background-size|linear-gradient\(([^;]+)\)/i):
 * groups [args before background-size, args before the first ';'].
 */
function linearGradientArgs(block: string): ScanMatch | null {
  const start = /linear-gradient\(/gi;
  const size = /background-size/iy;
  const n = block.length;
  // The last ')' followed by \s*;?\s*background-size anywhere in the block.
  let tailParen = -1;
  let tailStop = -1;
  for (let p = block.lastIndexOf(')'); p >= 0; p = p > 0 ? block.lastIndexOf(')', p - 1) : -1) {
    let t = wsEnd(block, p + 1);
    if (block.charCodeAt(t) === 59) t = wsEnd(block, t + 1);
    size.lastIndex = t;
    if (size.test(block)) { tailParen = p; tailStop = t + 15; break; }
  }
  let semiFor = -1;
  let semi = -1;
  let parenFor = -1;
  let paren = -1;
  for (let m = start.exec(block); m; m = start.exec(block)) {
    const a = m.index + m[0].length;
    if (tailParen >= a + 1) {
      return { index: m.index, text: block.slice(m.index, tailStop), groups: [block.slice(a, tailParen), undefined] };
    }
    if (!(semiFor >= 0 && a >= semiFor && a <= semi)) {
      semiFor = a;
      semi = block.indexOf(';', a);
      if (semi < 0) semi = n;
    }
    // The last ')' before that ';' and after this opener: the same for every
    // opener before the ';', so it is looked for once and only as far back as
    // the first of them.
    if (parenFor !== semi) {
      parenFor = semi;
      paren = semi - 1;
      while (paren >= a + 1 && block.charCodeAt(paren) !== 41) paren--;
    }
    if (paren >= a + 1) {
      return { index: m.index, text: block.slice(m.index, paren + 1), groups: [undefined, block.slice(a, paren)] };
    }
  }
  return null;
}

/** css.match(/grid-template-columns[^}]*repeat\s*\(\s*(?:auto-fit|auto-fill|\d+)/gi) || [] */
function gridRepeatRules(css: string): string[] {
  const start = /grid-template-columns/gi;
  const x = /repeat\s*\(\s*(?:auto-fit|auto-fill|\d+)/iy;
  const leads = matchStarts(css, /repeat/gi);
  const out: string[] = [];
  let ptr = 0;
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) break;
    const after = m.index + m[0].length;
    let c = css.indexOf('}', after);
    if (c < 0) c = css.length;
    while (ptr < leads.length && leads[ptr] < after) ptr++;
    let end = ptr;
    while (end < leads.length && leads[end] < c) end++;
    let hit: RegExpExecArray | null = null;
    for (let k = end - 1; k >= ptr && !hit; k--) {
      x.lastIndex = leads[k];
      hit = x.exec(css);
    }
    ptr = end;
    if (hit) out.push(css.slice(m.index, hit.index + hit[0].length));
    if (c >= css.length) break;
    pos = c + 1;
  }
  return out;
}

/**
 * html.match(/(?:<button|<a[^>]*class[^>]*(?:btn|cta|primary|action))[^>]*>[\s\S]{0,200}(?:[\p{Emoji_Presentation}]|[\p{Emoji}]\uFE0F)/giu)
 */
function emojiCtaMatches(html: string): string[] | null {
  const n = html.length;
  const start = /<button|<a/giu;
  const cls = nextMatchFinder(html, /class/giu);
  const word = nextMatchFinder(html, /btn|cta|primary|action/giu);
  const gt = nextMatchFinder(html, />/g);
  const emoji = /[\p{Emoji_Presentation}]|[\p{Emoji}]\uFE0F/gu;
  const emojiAt: number[] = [];
  const emojiEnd: number[] = [];
  for (let e = emoji.exec(html); e; e = emoji.exec(html)) { emojiAt.push(e.index); emojiEnd.push(e.index + e[0].length); }
  // End of the match for the content after `>` at g: the last emoji that
  // starts within 200 code points of it, or -1.
  const tail = (g: number): number => {
    let w = g + 1;
    for (let k = 0; k < 200 && w < n; k++) {
      const c = html.charCodeAt(w);
      w += c >= 0xd800 && c <= 0xdbff && w + 1 < n && html.charCodeAt(w + 1) >= 0xdc00 && html.charCodeAt(w + 1) <= 0xdfff ? 2 : 1;
    }
    let lo = 0;
    let hi = emojiAt.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (emojiAt[mid] <= w) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return best >= 0 && emojiAt[best] >= g + 1 ? emojiEnd[best] : -1;
  };
  const out: string[] = [];
  let tailFor = -1;
  let tailStop = -1;
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(html);
    if (!m) break;
    const g = gt(m.index + 1);
    if (g === Infinity) break;
    if (tailFor !== g) { tailFor = g; tailStop = tail(g); }
    if (tailStop < 0) { pos = g + 1; continue; }
    let ok = m[0].length === 7;
    if (!ok) {
      const c = cls(m.index + 2);
      ok = c < g && word(c + 5) < g;
    }
    if (!ok) { pos = m.index + 1; continue; }
    out.push(html.slice(m.index, tailStop));
    pos = tailStop;
  }
  return out.length ? out : null;
}

/** key.replace(/(\.\d*?)0+(?=\D|$)/g, '$1') */
function withoutTrailingDecimalZeros(key: string): string {
  const parts: string[] = [];
  let last = 0;
  for (let i = key.indexOf('.'); i >= 0;) {
    let d = i + 1;
    while (d < key.length && key.charCodeAt(d) >= 48 && key.charCodeAt(d) <= 57) d++;
    let z = d;
    while (z > i + 1 && key.charCodeAt(z - 1) === 48) z--;
    if (z < d) { parts.push(key.slice(last, z)); last = d; }
    i = key.indexOf('.', d);
  }
  parts.push(key.slice(last));
  return parts.join('');
}

/** /prefers-reduced-motion[\s\S]{0,200}\*\s*\{[^}]*animation\s*:\s*none/i.test(css) */
function hasBlanketMotionKill(css: string): boolean {
  const start = /prefers-reduced-motion/gi;
  const kill = nextMatchFinder(css, /animation\s*:\s*none/gi);
  const close = nextMatchFinder(css, /\}/g);
  let checked = -1;
  for (let m = start.exec(css); m; m = start.exec(css)) {
    const from = m.index + m[0].length;
    const to = Math.min(css.length - 1, from + 200);
    // A `*` reads the same whichever start reaches it, so each is read once.
    for (let q = Math.max(from, checked + 1); q <= to; q++) {
      if (css.charCodeAt(q) !== 42) continue;
      const b = wsEnd(css, q + 1);
      if (css.charCodeAt(b) !== 123) continue;
      if (kill(b + 1) < close(b + 1)) return true;
    }
    if (to > checked) checked = to;
  }
  return false;
}

/** html.match(/<svg[^>]*viewBox=/gi) || [] */
function svgViewBoxTags(html: string): string[] {
  const start = /<svg/gi;
  const leads = matchStarts(html, /viewBox=/gi);
  const gt = nextMatchFinder(html, />/g);
  const out: string[] = [];
  let ptr = 0;
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(html);
    if (!m) break;
    const after = m.index + m[0].length;
    const g = Math.min(gt(after), html.length);
    while (ptr < leads.length && leads[ptr] < after) ptr++;
    let end = ptr;
    while (end < leads.length && leads[end] < g) end++;
    if (end > ptr) {
      const k = leads[end - 1];
      out.push(html.slice(m.index, k + 8));
      pos = k + 8;
      ptr = end;
      continue;
    }
    if (g >= html.length) break;
    pos = g + 1;
  }
  return out;
}

/** html.match(/<symbol[^>]*>/gi) || [] */
function symbolTags(html: string): string[] {
  const start = /<symbol/gi;
  const out: string[] = [];
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(html);
    if (!m) break;
    const g = html.indexOf('>', m.index + m[0].length);
    if (g < 0) break;
    out.push(html.slice(m.index, g + 1));
    pos = g + 1;
  }
  return out;
}

/** A [\w-] code unit (\w without the u flag). */
function isNameChar(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 45;
}

/** The index after the run of [\w-] that starts at `i`. */
function nameEnd(s: string, i: number): number {
  while (i < s.length && isNameChar(s.charCodeAt(i))) i++;
  return i;
}

/** css.match(/--[\w-]+\s*:/g) || [] */
function customPropertyDecls(css: string): string[] {
  const out: string[] = [];
  for (let pos = 0; ;) {
    const i = css.indexOf('--', pos);
    if (i < 0) break;
    const r = nameEnd(css, i + 2);
    if (r === i + 2) { pos = i + 1; continue; }
    const t = wsEnd(css, r);
    if (css.charCodeAt(t) === 58) { out.push(css.slice(i, t + 1)); pos = t + 1; continue; }
    // Every later `--` inside the same name ends at the same r and fails too.
    pos = r;
  }
  return out;
}

/** Matches of /--([\w-]+)\s*:\s*([^;]+?)(?:;|$)/g: groups [name, value]. */
function customPropertyValues(block: string): ScanMatch[] {
  const out: ScanMatch[] = [];
  const n = block.length;
  for (let pos = 0; ;) {
    const i = block.indexOf('--', pos);
    if (i < 0) break;
    const r = nameEnd(block, i + 2);
    if (r === i + 2) { pos = i + 1; continue; }
    const colon = wsEnd(block, r);
    if (block.charCodeAt(colon) !== 58) { pos = r; continue; }
    let v = wsEnd(block, colon + 1);
    // ([^;]+?) needs one character: when the space runs up to a ';' or the
    // end, the last space is that character.
    if (v >= n || block.charCodeAt(v) === 59) {
      if (v === colon + 1) { pos = r; continue; }
      v--;
    }
    let e = block.indexOf(';', v + 1);
    if (e < 0) e = n;
    const stop = e < n ? e + 1 : n;
    out.push({ index: i, text: block.slice(i, stop), groups: [block.slice(i + 2, r), block.slice(v, e)] });
    pos = stop;
  }
  return out;
}

/** /--(?:color|surface|accent|action|feedback)[\w-]*\s*:\s*var\(--/i.test(css) */
function hasTokenLayering(css: string): boolean {
  const start = /--(?:color|surface|accent|action|feedback)/gi;
  const varAt = /var\(--/iy;
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) return false;
    const r = nameEnd(css, m.index + m[0].length);
    const t = wsEnd(css, r);
    if (css.charCodeAt(t) === 58) {
      varAt.lastIndex = wsEnd(css, t + 1);
      if (varAt.test(css)) return true;
    }
    // Every later start inside the same name reaches the same r.
    pos = Math.max(r, m.index + 1);
  }
}

/** `text` with each [start, end) span replaced by fn(the spanned text). */
function replaceSpansWith(text: string, spans: number[], fn: (m: string) => string): string {
  if (spans.length === 0) return text;
  const parts: string[] = [];
  let last = 0;
  for (let k = 0; k < spans.length; k += 2) {
    parts.push(text.slice(last, spans[k]), fn(text.slice(spans[k], spans[k + 1])));
    last = spans[k + 1];
  }
  parts.push(text.slice(last));
  return parts.join('');
}

/** Spans of /\[[^\]]*\]/g. */
function bracketSpans(text: string): number[] {
  const spans: number[] = [];
  for (let pos = 0; ;) {
    const i = text.indexOf('[', pos);
    if (i < 0) break;
    const j = text.indexOf(']', i + 1);
    if (j < 0) break;
    spans.push(i, j + 1);
    pos = j + 1;
  }
  return spans;
}

/** text.match(/\[[^\]]*\]|\.[\w-]+/g) */
function attrAndClassParts(text: string): string[] | null {
  const out: string[] = [];
  const lastClose = text.lastIndexOf(']');
  for (let pos = 0; pos < text.length;) {
    const ch = text.charCodeAt(pos);
    if (ch === 91 && lastClose > pos) {
      const j = text.indexOf(']', pos + 1);
      out.push(text.slice(pos, j + 1));
      pos = j + 1;
      continue;
    }
    if (ch === 46) {
      const r = nameEnd(text, pos + 1);
      if (r > pos + 1) { out.push(text.slice(pos, r)); pos = r; continue; }
    }
    pos++;
  }
  return out.length ? out : null;
}

/** v45: /^\[[\w-]*(?:motion|anim)[\w-]*(?:[~|^$*]?=[^\]]*)?\]$/i.test(s) */
function isMotionToggleAttr(s: string): boolean {
  const n = s.length;
  if (n < 2 || s.charCodeAt(0) !== 91 || s.charCodeAt(n - 1) !== 93) return false;
  const r = nameEnd(s, 1);
  if (!/motion|anim/i.test(s.slice(1, r))) return false;
  if (r === n - 1) return true;
  let k = r;
  if ('~|^$*'.indexOf(s[k]) >= 0) k++;
  if (s.charCodeAt(k) !== 61) return false;
  return s.indexOf(']', k + 1) === n - 1;
}

/** Where `\s*!\s*important\s*$` (case-insensitive) begins in `value`, or -1. */
function importantSuffixStart(value: string): number {
  let e = value.length;
  while (e > 0 && isJsSpace(value.charCodeAt(e - 1))) e--;
  if (e < 9 || !/^important$/i.test(value.slice(e - 9, e))) return -1;
  let k = e - 9;
  while (k > 0 && isJsSpace(value.charCodeAt(k - 1))) k--;
  if (k === 0 || value.charCodeAt(k - 1) !== 33) return -1;
  k--;
  while (k > 0 && isJsSpace(value.charCodeAt(k - 1))) k--;
  return k;
}

/** A [0-9] code unit. */
function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

/** color-mix: /^([\s\S]*?)\s+(\d*\.?\d+)%$/.exec(p) */
function percentAfter(p: string): string[] | null {
  const n = p.length;
  if (n === 0 || p.charCodeAt(n - 1) !== 37) return null;
  let q = n - 1;
  while (q > 0 && (isDigit(p.charCodeAt(q - 1)) || p.charCodeAt(q - 1) === 46)) q--;
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(p.slice(q, n - 1))) return null;
  if (q === 0 || !isJsSpace(p.charCodeAt(q - 1))) return null;
  let w = q - 1;
  while (w > 0 && isJsSpace(p.charCodeAt(w - 1))) w--;
  return [p, p.slice(0, w), p.slice(q, n - 1)];
}

/**
 * Relative colour syntax:
 * /^from\s+([\s\S]+?)\s+(r\s+g\s+b|h\s+s\s+l|l\s+c\s+h|l\s+a\s+b)\s*(?:\/\s*([\s\S]+))?$/.exec(args)
 */
function relativeColorMatch(args: string): Array<string | undefined> | null {
  if (!args.startsWith('from') || !isJsSpace(args.charCodeAt(4))) return null;
  const channels = /(r\s+g\s+b|h\s+s\s+l|l\s+c\s+h|l\s+a\s+b)\s*(?:\/\s*([\s\S]+))?$/y;
  const tail = (k: number): RegExpExecArray | null => {
    channels.lastIndex = k;
    return channels.exec(args);
  };
  const start = wsEnd(args, 4);
  // The base is lazy: it ends at the first run of space after its first
  // character that the channel keywords and the rest of the value follow.
  for (let k = start + 1; k < args.length; k++) {
    if (!isJsSpace(args.charCodeAt(k))) continue;
    const w = wsEnd(args, k);
    const t = tail(w);
    if (t) return [args, args.slice(start, k), t[1], t[2]];
    k = w;
  }
  // With less of the leading space taken, the base can be one space whose
  // following space leads straight to the keywords.
  if (start - 4 >= 3) {
    const t = tail(start);
    if (t) return [args, args.slice(start - 2, start - 1), t[1], t[2]];
  }
  return null;
}

/** html.match(/<input\b[^>]*>/gi) || [] */
function inputTags(html: string): string[] {
  const start = /<input\b/gi;
  const out: string[] = [];
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(html);
    if (!m) break;
    const g = html.indexOf('>', m.index + m[0].length);
    if (g < 0) break;
    out.push(html.slice(m.index, g + 1));
    pos = g + 1;
  }
  return out;
}

/** /<title\b[^>]*>[^<]+<\/title>/i.test(html) */
function hasTitleText(html: string): boolean {
  const start = /<title\b/gi;
  const close = /<\/title>/iy;
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(html);
    if (!m) return false;
    const g = html.indexOf('>', m.index + m[0].length);
    if (g < 0) return false;
    const lt = html.indexOf('<', g + 1);
    if (lt < 0) return false;
    if (lt > g + 1) {
      close.lastIndex = lt;
      if (close.test(html)) return true;
    }
    // Every start before g reaches the same `>` and the same `<` after it.
    pos = g + 1;
  }
}

/**
 * /TAG[^>]*ATTR[^"']*WORD/i.test(html): `open` (global) matches the tag's
 * start, `attr` (global) an attribute name with its `=` and opening quote, and
 * `word` (global, holding no quote) what the value must contain before its
 * closing quote.
 */
function tagAttrValueHas(html: string, open: RegExp, attr: RegExp, word: RegExp): boolean {
  const attrs: number[] = [];
  const values: number[] = [];
  attr.lastIndex = 0;
  for (let a = attr.exec(html); a; a = attr.exec(html)) { attrs.push(a.index); values.push(a.index + a[0].length); }
  const gt = nextMatchFinder(html, />/g);
  const found = nextMatchFinder(html, word);
  const n = html.length;
  let ptr = 0;
  for (let pos = 0; ;) {
    open.lastIndex = pos;
    const m = open.exec(html);
    if (!m) return false;
    const after = m.index + m[0].length;
    const g = Math.min(gt(after), n);
    // Each attribute in the tag is read once: what follows it does not
    // depend on which start reached it.
    while (ptr < attrs.length && attrs[ptr] < after) ptr++;
    for (; ptr < attrs.length && attrs[ptr] < g; ptr++) {
      const v = values[ptr];
      let q = v;
      while (q < n && html.charCodeAt(q) !== 34 && html.charCodeAt(q) !== 39) q++;
      if (found(v) < q) return true;
    }
    if (g >= n) return false;
    pos = g + 1;
  }
}

/** The index of the first entry of an ascending list at or after `x` (the length when none). */
function lowerBound(list: number[], x: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < x) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** Matches of /:root(?:\s*,\s*:host)?\s*\{([^}]*)\}/g: groups [body]. */
function rootTokenBlocks(css: string): ScanMatch[] {
  const start = /:root/g;
  const out: ScanMatch[] = [];
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) break;
    const p = m.index + m[0].length;
    let b = -1;
    // The optional ", :host": whitespace, a comma, whitespace, ":host".
    const comma = wsEnd(css, p);
    if (css.charCodeAt(comma) === 44) {
      const h = wsEnd(css, comma + 1);
      if (css.startsWith(':host', h)) {
        const q = wsEnd(css, h + 5);
        if (css.charCodeAt(q) === 123) b = q;
      }
    }
    if (b < 0) {
      const q = wsEnd(css, p);
      if (css.charCodeAt(q) === 123) b = q;
    }
    if (b < 0) { pos = m.index + 1; continue; }
    const c = css.indexOf('}', b + 1);
    if (c < 0) break;
    out.push({ index: m.index, text: css.slice(m.index, c + 1), groups: [css.slice(b + 1, c)] });
    pos = c + 1;
  }
  return out;
}

/** v05: /@view-transition\s*\{[^}]*navigation\s*:\s*auto/i.test(body) */
function hasViewTransitionNavigation(body: string): boolean {
  const start = /@view-transition/gi;
  const found = nextMatchFinder(body, /navigation\s*:\s*auto/gi);
  const close = nextMatchFinder(body, /\}/g);
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(body);
    if (!m) return false;
    const b = wsEnd(body, m.index + m[0].length);
    if (body.charCodeAt(b) !== 123) { pos = m.index + 1; continue; }
    const c = close(b + 1);
    if (found(b + 1) < c) return true;
    if (c === Infinity) return false;
    // Every later start before c reads the same body, or less of it.
    pos = c + 1;
  }
}

/**
 * v34: /<script\s+type\s*=\s*["']application\/ld\+json["'][\s\S]*?"@type"\s*:\s*"[^"]*\b(?:ai|softwareapplication)\b[^"]*"[\s\S]*?(?:"applicationCategory"\s*:\s*"[^"]*ai[^"]*"|"[^"]*ai[^"]*")/i.test(html)
 * Only the first opener and the first matching @type matter: later ones see
 * less of the page. The applicationCategory form is one of the quoted
 * strings holding "ai" that the second form accepts.
 */
function hasAiJsonLd(html: string): boolean {
  const open = /<script\s+type\s*=\s*["']application\/ld\+json["']/i.exec(html);
  if (!open) return false;
  const type = /"@type"\s*:\s*"/gi;
  const word = nextMatchFinder(html, /\b(?:ai|softwareapplication)\b/gi);
  type.lastIndex = open.index + open[0].length;
  for (let t = type.exec(html); t; t = type.exec(html)) {
    const v = t.index + t[0].length;
    const q = html.indexOf('"', v);
    if (q < 0) return false;
    if (word(v) < q) {
      for (let p = html.indexOf('"', q + 1); p >= 0;) {
        const e = html.indexOf('"', p + 1);
        if (e < 0) return false;
        if (/ai/i.test(html.slice(p + 1, e))) return true;
        p = e;
      }
      return false;
    }
    type.lastIndex = q;
  }
  return false;
}

/** v10: /transition\s*:[^;]*transform[^;]*(ease-out|cubic-bezier\([^)]*0[, ])/i.test(css) */
function hasTransformEaseTransition(css: string): boolean {
  const start = /transition\s*:/gi;
  const transform = nextMatchFinder(css, /transform/gi);
  const ease = nextMatchFinder(css, /ease-out/gi);
  const paren = nextMatchFinder(css, /\)/g);
  const beziers = matchStarts(css, /cubic-bezier\(/gi);
  const zeros = matchStarts(css, /0[, ]/g);
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) return false;
    const p = m.index + m[0].length;
    let r = css.indexOf(';', p);
    if (r < 0) r = css.length;
    const t = transform(p);
    if (t < r) {
      const from = t + 9;
      if (ease(from) < r) return true;
      // A cubic-bezier( that starts before r and holds a 0 followed by a
      // comma or a space before its first ')'.
      for (let k = lowerBound(beziers, from); k < beziers.length && beziers[k] < r; k++) {
        const inner = beziers[k] + 13;
        const z = lowerBound(zeros, inner);
        if (z < zeros.length && zeros[z] + 1 < paren(inner)) return true;
      }
    }
    // Every later start before r reads the same declaration, or less of it.
    if (r >= css.length) return false;
    pos = r + 1;
  }
}

/** S3: css.match(/(?:background(?:-image)?\s*:[^;]*linear-gradient[^;]*(?:#?(?:615fff|8e51ff|4f39f6|7f22fe|a855f7|9333ea|7c3aed|6d28d9|5b21b6|4c1d95)))/gi) */
function purpleGradientDecls(css: string): string[] | null {
  const start = /background(?:-image)?\s*:/gi;
  const gradient = nextMatchFinder(css, /linear-gradient/gi);
  const hueRe = /615fff|8e51ff|4f39f6|7f22fe|a855f7|9333ea|7c3aed|6d28d9|5b21b6|4c1d95/gi;
  // Every place a hue starts, overlapping ones included (a855f7f22fe holds two).
  const hues: number[] = [];
  for (let h = hueRe.exec(css); h; h = hueRe.exec(css)) { hues.push(h.index); hueRe.lastIndex = h.index + 1; }
  const out: string[] = [];
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) break;
    const p = m.index + m[0].length;
    let r = css.indexOf(';', p);
    if (r < 0) r = css.length;
    const g = gradient(p);
    if (g < r) {
      // The last hue before r, if it starts after the gradient's name.
      const k = lowerBound(hues, r) - 1;
      if (k >= 0 && hues[k] >= g + 15) out.push(css.slice(m.index, hues[k] + 6));
    }
    // Every later start before r finds no hue after this one.
    if (r >= css.length) break;
    pos = r + 1;
  }
  return out.length ? out : null;
}

/** S4: stop.match(/rgba?\(([^)]+)\)/i) */
function rgbArgs(stop: string): string[] | null {
  const start = /rgba?\(/gi;
  for (let m = start.exec(stop); m; m = start.exec(stop)) {
    const p = m.index + m[0].length;
    const c = stop.indexOf(')', p);
    if (c < 0) return null;
    if (c > p) return [stop.slice(m.index, c + 1), stop.slice(p, c)];
  }
  return null;
}

/** A tag-name code unit for [a-z0-9-] under the i flag. */
function isTagNameChar(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45;
}

/** A \w code unit (no u flag). */
function isWordChar(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

/** The first entry of an ascending list at or after `x`, or -1. */
function firstAtOrAfter(list: number[], x: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < x) lo = mid + 1; else hi = mid;
  }
  return lo < list.length ? list[lo] : -1;
}

/**
 * v38: inner.replace(/<([a-z][a-z0-9-]*)\b[^>]*\baria-hidden\s*=\s*["']?true["']?[^>]*>[\s\S]*?<\/\1>/gi, '')
 * The closing tag must repeat the name, so the names of the closing tags are
 * kept in a trie and each opener's name is walked through it once.
 */
function withoutAriaHiddenElements(inner: string): string {
  const n = inner.length;
  type Node = { kids: Map<number, Node>; at: number[] };
  const root: Node = { kids: new Map(), at: [] };
  const closeRe = /<\/([a-z0-9-]+)>/gi;
  for (let c = closeRe.exec(inner); c; c = closeRe.exec(inner)) {
    let node = root;
    const name = c[1].toLowerCase();
    for (let k = 0; k < name.length; k++) {
      const code = name.charCodeAt(k);
      let next = node.kids.get(code);
      if (!next) { next = { kids: new Map(), at: [] }; node.kids.set(code, next); }
      node = next;
    }
    node.at.push(c.index);
  }
  const hidden = matchStarts(inner, /\baria-hidden\s*=\s*["']?true/gi);
  const gt = nextMatchFinder(inner, />/g);
  const start = /<[a-z]/gi;
  const spans: number[] = [];
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(inner);
    if (!m) break;
    const i = m.index;
    const g = gt(i + 1);
    if (g === Infinity) break;
    // Name lengths whose name is also a closing tag's name, longest last.
    const lens: number[] = [];
    const nodes: Node[] = [];
    let node: Node | undefined = root;
    for (let e = i + 1; e < n && isTagNameChar(inner.charCodeAt(e)); e++) {
      const code = inner.charCodeAt(e);
      node = node.kids.get(code >= 65 && code <= 90 ? code + 32 : code);
      if (!node) break;
      if (node.at.length) { lens.push(e + 1 - (i + 1)); nodes.push(node); }
    }
    let stop = -1;
    for (let k = lens.length - 1; k >= 0 && stop < 0; k--) {
      const ne = i + 1 + lens[k];
      const before = isWordChar(inner.charCodeAt(ne - 1));
      const after = ne < n && isWordChar(inner.charCodeAt(ne));
      if (before === after) continue;
      const a = firstAtOrAfter(hidden, ne);
      if (a < 0 || a >= g) continue;
      const c = firstAtOrAfter(nodes[k].at, g + 1);
      if (c < 0) continue;
      stop = c + 3 + lens[k];
    }
    if (stop >= 0) { spans.push(i, stop); pos = stop; } else pos = i + 1;
  }
  return replaceSpans(inner, spans, '');
}

/** text.replace(/<kbd\b[^>]*>(?:(?!<kbd\b)[\s\S])*?<\/kbd>/gi, ' ') */
function withoutKbdElements(text: string): string {
  const start = /<kbd\b/gi;
  const gt = nextMatchFinder(text, />/g);
  const opener = nextMatchFinder(text, /<kbd\b/gi);
  const closer = nextMatchFinder(text, /<\/kbd>/gi);
  const spans: number[] = [];
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(text);
    if (!m) break;
    const g = gt(m.index + m[0].length);
    if (g === Infinity) break;
    const c = closer(g + 1);
    if (c === Infinity) break;
    // A nested <kbd> opens first: no start before this `>` matches; the
    // nested one is tried in turn.
    if (opener(g + 1) < c) { pos = g + 1; continue; }
    spans.push(m.index, c + 6);
    pos = c + 6;
  }
  return replaceSpans(text, spans, ' ');
}

/** s.replace(/[\s]*[\u2303\u2318\u2325\u21E7\u21E7\u2387].*$/i, '') */
function withoutGlyphShortcut(s: string): string {
  let lt = -1;
  for (let k = s.length - 1; k >= 0; k--) {
    if (isLineTerminator(s.charCodeAt(k))) { lt = k; break; }
  }
  for (let k = lt + 1; k < s.length; k++) {
    const c = s.charCodeAt(k);
    if (c === 0x2303 || c === 0x2318 || c === 0x2325 || c === 0x21e7 || c === 0x2387) {
      let w = k;
      while (w > 0 && isJsSpace(s.charCodeAt(w - 1))) w--;
      return s.slice(0, w);
    }
  }
  return s;
}

/** s.replace(/[\s]*(?:Ctrl|Cmd|Shift|Alt|Option|Command)(?:\+[A-Za-z0-9+\-]*|[A-Z0-9]+)?$/, '') */
function withoutTextShortcut(s: string): string {
  const n = s.length;
  let plusRun = n;
  while (plusRun > 0) {
    const c = s.charCodeAt(plusRun - 1);
    if (!(isDigit(c) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 43 || c === 45)) break;
    plusRun--;
  }
  let upperRun = n;
  while (upperRun > 0) {
    const c = s.charCodeAt(upperRun - 1);
    if (!(isDigit(c) || (c >= 65 && c <= 90))) break;
    upperRun--;
  }
  const mod = /Ctrl|Cmd|Shift|Alt|Option|Command/g;
  for (let m = mod.exec(s); m; m = mod.exec(s)) {
    const t = m.index + m[0].length;
    if (t === n || (s.charCodeAt(t) === 43 && t + 1 >= plusRun) || t >= upperRun) {
      let w = m.index;
      while (w > 0 && isJsSpace(s.charCodeAt(w - 1))) w--;
      return s.slice(0, w);
    }
  }
  return s;
}

/** s.replace(/(?:\s*\+)+$/, '') */
function withoutTrailingPluses(s: string): string {
  if (s.charCodeAt(s.length - 1) !== 43) return s;
  let k = s.length;
  while (k > 0 && (s.charCodeAt(k - 1) === 43 || isJsSpace(s.charCodeAt(k - 1)))) k--;
  return s.slice(0, k);
}

/** S2: /(?:transparent|rgba\([^)]+\)|color-mix\([^)]*\)|var\([^)]*\)|#[0-9a-fA-F]{3,8})\s+1px(?:\s*,)/.test(text) */
function hasColorThenHairline(text: string): boolean {
  const close = nextMatchFinder(text, /\)/g);
  let tailAt = -1;
  let tailOk = false;
  const tail = (e: number): boolean => {
    if (e !== tailAt) {
      tailAt = e;
      const t = wsEnd(text, e);
      tailOk = t > e && text.startsWith('1px', t) && text.charCodeAt(wsEnd(text, t + 3)) === 44;
    }
    return tailOk;
  };
  const head = /transparent|rgba\(|color-mix\(|var\(|#/g;
  for (let m = head.exec(text); m; m = head.exec(text)) {
    const i = m.index;
    const after = i + m[0].length;
    // `transparent` can overlap itself: try the very next position too.
    head.lastIndex = i + 1;
    if (m[0] === 'transparent') {
      if (tail(after)) return true;
    } else if (m[0] === '#') {
      let h = after;
      while (h < text.length && /[0-9a-fA-F]/.test(text[h])) h++;
      if (h - after >= 3 && h - after <= 8 && tail(h)) return true;
    } else {
      const p = close(after);
      if (p === Infinity) continue;
      if (m[0] === 'rgba(' && p === after) continue;
      if (tail(p + 1)) return true;
    }
  }
  return false;
}

/** S2: /\s+1px\s*,\s*(?:transparent|rgba\([^)]+\)|color-mix\([^)]*\)|var\([^)]*\))/.test(text) */
function hasHairlineThenColor(text: string): boolean {
  const lastClose = text.lastIndexOf(')');
  for (let at = text.indexOf('1px'); at >= 0; at = text.indexOf('1px', at + 1)) {
    if (at === 0 || !isJsSpace(text.charCodeAt(at - 1))) continue;
    let t = wsEnd(text, at + 3);
    if (text.charCodeAt(t) !== 44) continue;
    t = wsEnd(text, t + 1);
    if (text.startsWith('transparent', t)) return true;
    if (text.startsWith('rgba(', t) && text.charCodeAt(t + 5) !== 41 && lastClose > t + 5) return true;
    if (text.startsWith('color-mix(', t) && lastClose >= t + 10) return true;
    if (text.startsWith('var(', t) && lastClose >= t + 4) return true;
  }
  return false;
}

/** S2: /\/\s*[^,/]*(?:^|\s)1px(?:$|[\s,])/.test(value) */
function hasSlashThenHairline(value: string): boolean {
  let lastSep = -1;
  for (let k = 0; k < value.length; k++) {
    const c = value.charCodeAt(k);
    if (c === 44 || c === 47) { lastSep = k; continue; }
    if (c !== 49 || k === 0 || !value.startsWith('1px', k) || !isJsSpace(value.charCodeAt(k - 1))) continue;
    const next = value.charCodeAt(k + 3);
    if ((k + 3 === value.length || isJsSpace(next) || next === 44) && lastSep >= 0 && value.charCodeAt(lastSep) === 47) return true;
  }
  return false;
}

/** css.match(/linear\(\s*[^)]{20,}\)/gi) || [] */
function longLinearEasings(css: string): string[] {
  const start = /linear\(/gi;
  const out: string[] = [];
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) break;
    const after = m.index + m[0].length;
    const c = css.indexOf(')', after);
    if (c < 0) break;
    if (c - after >= 20) out.push(css.slice(m.index, c + 1));
    // Every start before c reads the same ')' with less between.
    pos = c + 1;
  }
  return out;
}

/**
 * Group 1 of each match of
 * /<link[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']/gi:
 * the last quoted href in the tag after its first rel=stylesheet.
 */
function stylesheetLinkMatches(html: string): ScanMatch[] {
  const start = /<link/gi;
  const rel = nextMatchFinder(html, /rel=["']?stylesheet/gi);
  const hrefs = matchStarts(html, /href=["']/gi);
  const gt = nextMatchFinder(html, />/g);
  const n = html.length;
  const isQuote = (c: number): boolean => c === 34 || c === 39;
  let lastQuote = n - 1;
  while (lastQuote >= 0 && !isQuote(html.charCodeAt(lastQuote))) lastQuote--;
  const out: ScanMatch[] = [];
  let ptr = 0;
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(html);
    if (!m) break;
    const after = m.index + m[0].length;
    const g = Math.min(gt(after), n);
    while (ptr < hrefs.length && hrefs[ptr] < after) ptr++;
    let end = ptr;
    while (end < hrefs.length && hrefs[end] < g) end++;
    // The last href=" in the tag whose value is non-empty and closes.
    let h = -1;
    for (let k = end - 1; k >= ptr && h < 0; k--) {
      const v = hrefs[k] + 6;
      if (v < n && !isQuote(html.charCodeAt(v)) && lastQuote > v) h = hrefs[k];
    }
    const r = rel(after);
    if (h >= 0 && r < g && r + (isQuote(html.charCodeAt(r + 4)) ? 15 : 14) <= h) {
      let q = h + 7;
      while (!isQuote(html.charCodeAt(q))) q++;
      out.push({ index: m.index, text: html.slice(m.index, q + 1), groups: [html.slice(h + 6, q)] });
      pos = q + 1;
      continue;
    }
    // Every start before g sees less of the same tag.
    if (g >= n) break;
    pos = g + 1;
  }
  return out;
}

/**
 * For each `{` in `opens`, the index of the `}` that brings the depth back to
 * zero from it, or -1: what a depth-counting walk from that brace finds, for
 * every brace in one pass.
 */
function closingBraces(code: string, opens: Set<number>): Map<number, number> {
  const out = new Map<number, number>();
  const stack: number[] = [];
  for (let k = 0; k < code.length; k++) {
    const ch = code.charCodeAt(k);
    if (ch === 123) stack.push(k);
    else if (ch === 125 && stack.length) {
      const open = stack.pop() as number;
      if (opens.has(open)) out.set(open, k);
    }
  }
  return out;
}
// ── The call sites, one helper each, so the test runs exactly what they run ──

/** /<button[^>]*>([\s\S]*?)<\/button>/gi (v38, v39). */
function buttonElements(html: string): ScanMatch[] {
  return elementMatches(html, /<button/gi, /<\/button>/gi);
}

/** /<label[^>]*>([\s\S]*?)<\/label>/gi (v39). */
function labelElements(html: string): ScanMatch[] {
  return elementMatches(html, /<label/gi, /<\/label>/gi);
}

/** /<a[^>]*>([\s\S]*?)<\/a>/gi (v40). */
function anchorElements(html: string): ScanMatch[] {
  return elementMatches(html, /<a/gi, /<\/a>/gi);
}

/** /<style[^>]*>([\s\S]*?)<\/style>/gi (inline stylesheets). */
function styleElements(html: string): ScanMatch[] {
  return elementMatches(html, /<style/gi, /<\/style>/gi);
}

/** /<(?:a|div|span)[^>]*role=["']button["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/gi (v38). */
function roleButtonElements(html: string): ScanMatch[] {
  return roleElementMatches(html, /<(?:a|div|span)/gi, /role=["']button["']/gi, /<\/(?:a|div|span)>/gi);
}

/** /<[a-z]+[^>]*role=["']tab["'][^>]*>([\s\S]*?)<\/[a-z]+>/gi (v39). */
function roleTabElements(html: string): ScanMatch[] {
  return roleElementMatches(html, /<[a-z]/gi, /role=["']tab["']/gi, /<\/[a-z]+>/gi);
}

/** v41: /class=["'][^"']*(eyebrow|eyebro|meta-label)[^"']*["']/i.test(attrs) */
function hasEyebrowClass(attrs: string): boolean {
  return quotedAttrHas(attrs, /class=["']/gi, /eyebro|meta-label/gi);
}

/** v41: /style=["'][^"']*text-transform:\s*uppercase[^"']*["']/i.test(attrs) */
function hasUppercaseStyle(attrs: string): boolean {
  return quotedAttrHas(attrs, /style=["']/gi, /text-transform:\s*uppercase/gi);
}

/** v17: /(?:h1|h2|h3|h4|h5|h6|\.h\d|heading|title)[^{]*\{[^}]*line-height\s*:\s*([0-9.]+)/gi */
function headingLineHeights(css: string): ScanMatch[] {
  return ruleBodyScan(css, bracedStarts(css, /h1|h2|h3|h4|h5|h6|\.h\d|heading|title/gi), /line-height/gi, /line-height\s*:\s*([0-9.]+)/iy, false);
}

/** v17: /(?:body|p|article|\.body|\.prose|\.copy)[^{]*\{[^}]*line-height\s*:\s*([0-9.]+)/gi */
function bodyLineHeights(css: string): ScanMatch[] {
  return ruleBodyScan(css, bracedStarts(css, /body|p|article|\.body|\.prose|\.copy/gi), /line-height/gi, /line-height\s*:\s*([0-9.]+)/iy, false);
}

/**
 * v24: /(?:^|[,}\s])\s*(?:button|a\b|input|textarea|select|\[role\s*=\s*["']?button["']?\]|\.btn|\.button|\.chip|\.tab|\.nav-link)\s*[^{]*\{[^}]*(?:min-height|min-width)\s*:\s*(\d+(?:\.\d+)?)(px|rem)/gim
 */
function touchTargetSizes(css: string): ScanMatch[] {
  return ruleBodyScan(css, touchTargetStarts(css), /min-(?:height|width)/gi, /(?:min-height|min-width)\s*:\s*(\d+(?:\.\d+)?)(px|rem)/iy, false);
}

/** v27: /(?:input|textarea|select|\.input|\.field)[^{]*\{[^}]*font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)/gi */
function fieldFontSizes(sheet: string): ScanMatch[] {
  return ruleBodyScan(sheet, bracedStarts(sheet, /input|textarea|select|\.input|\.field/gi), /font-size/gi, /font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)/iy, false);
}

/** v27: /input\s*(?:,[^{]*)?\{[^}]*font-size\s*:\s*(?:1rem|16px|1\.0(?:\d+)?rem|[2-9]\dpx)/gi */
function fieldFontFloors(sheet: string): ScanMatch[] {
  return ruleBodyScan(sheet, inputFloorStarts(sheet), /font-size/gi, /font-size\s*:\s*(?:1rem|16px|1\.0(?:\d+)?rem|[2-9]\dpx)/iy, false);
}

/** v09: /:focus[^{]*\{[^}]*outline\s*:\s*(none|0)\s*[;}]/i.test(css) */
function focusStripsOutline(css: string): boolean {
  return ruleBodyScan(css, bracedStarts(css, /:focus/gi), /outline/gi, /outline\s*:\s*(none|0)\s*[;}]/iy, true).length > 0;
}

/** v09: /:focus[^{]*\{[^}]*(box-shadow|outline\s*:\s*[^n0])/i.test(css) */
function focusHasRing(css: string): boolean {
  return ruleBodyScan(css, bracedStarts(css, /:focus/gi), /box-shadow|outline/gi, /(box-shadow|outline\s*:\s*[^n0])/iy, true).length > 0;
}

/** v08: /@keyframes\s+[^{]*breath[^{]*\{[^}]*opacity\s*:/i.test(css) */
function hasBreathKeyframes(css: string): boolean {
  return ruleBodyScan(css, breathKeyframeStarts(css), /opacity/gi, /opacity\s*:/iy, true).length > 0;
}

/** v08: /@media[^{]*(?:hover\s*:\s*hover|pointer\s*:\s*fine)/i.test(css) */
function mediaQueryHasHoverGuard(css: string): boolean {
  return preludeHas(css, /@media/gi, /hover\s*:\s*hover|pointer\s*:\s*fine/gi);
}

/** v35: /@media[^{]*forced-colors\s*:\s*active/i.test(css) */
function mediaQueryHasForcedColors(css: string): boolean {
  return preludeHas(css, /@media/gi, /forced-colors\s*:\s*active/gi);
}

/** v35: /@media[^{]*-ms-high-contrast/i.test(css) */
function mediaQueryHasHighContrast(css: string): boolean {
  return preludeHas(css, /@media/gi, /-ms-high-contrast/gi);
}

/** O4: /@media[^{]*prefers-reduced-motion/i.test(css) */
function mediaQueryHasReducedMotion(css: string): boolean {
  return preludeHas(css, /@media/gi, /prefers-reduced-motion/gi);
}

/** v05: /@media[^{]*prefers-reduced-motion\s*:\s*(reduce|no-preference)\b[^{]*\{/gi */
function reducedMotionQueries(code: string): ScanMatch[] {
  return preludeMatches(code, /@media/gi, /prefers-reduced-motion/gi, /prefers-reduced-motion\s*:\s*(reduce|no-preference)\b/iy);
}

/** color-mix: /^(\d*\.?\d+)%\s+([\s\S]*)$/.exec(p), the number without the ambiguous \d*\.?\d+ */
function percentBefore(p: string): RegExpExecArray | null {
  return /^(\d+(?:\.\d+)?|\.\d+)%\s+([\s\S]*)$/.exec(p);
}

/** v45: /^(?:0*\.?0*|0*(?:\.0+)?%)$/.test(v), without the ambiguous 0*\.?0* */
function isZeroOpacity(v: string): boolean {
  return /^(?:0*(?:\.0*)?|0*(?:\.0+)?%)$/.test(v);
}

/** O1: the cubic-bezier() matches, each number written without the ambiguous \d*\.?\d+ */
function cubicBezierMatches(css: string): ScanMatch[] {
  const re = /cubic-bezier\(\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)/gi;
  const out: ScanMatch[] = [];
  for (let m = re.exec(css); m; m = re.exec(css)) out.push({ index: m.index, text: m[0], groups: m.slice(1) });
  return out;
}

/** v34: /<script\b[^>]*src\s*=\s*["'][^"']*\b(?:chatbot|ai-widget|dialogflow)\b/i.test(html) */
function hasAiWidgetScript(html: string): boolean {
  return tagAttrValueHas(html, /<script\b/gi, /src\s*=\s*["']/gi, /\b(?:chatbot|ai-widget|dialogflow)\b/gi);
}

/** v34: /<script\b[^>]*src\s*=\s*["'][^"']*\b(?:assistant|claude|gemini|rasa|intercom|drift|tawk|crisp|livechat|conversational)\b/i.test(html) */
function hasChatScript(html: string): boolean {
  return tagAttrValueHas(html, /<script\b/gi, /src\s*=\s*["']/gi, /\b(?:assistant|claude|gemini|rasa|intercom|drift|tawk|crisp|livechat|conversational)\b/gi);
}

/** v34: /<(?:iframe|div|section|aside)\b[^>]*(?:class|id)\s*=\s*["'][^"']*\b(?:chatbot|chat-bot|ai-assistant|ai_chat)\b/i.test(html) */
function hasAiChatContainer(html: string): boolean {
  return tagAttrValueHas(html, /<(?:iframe|div|section|aside)\b/gi, /(?:class|id)\s*=\s*["']/gi, /\b(?:chatbot|chat-bot|ai-assistant|ai_chat)\b/gi);
}

/** v34: /<(?:input|textarea|form)\b[^>]*(?:placeholder|aria-label)\s*=\s*["'][^"']*\b(?:ask\s+ai|message\s+ai|chat\s+with\s+ai|ai\s+assistant)\b/i.test(html) */
function hasAiInput(html: string): boolean {
  return tagAttrValueHas(html, /<(?:input|textarea|form)\b/gi, /(?:placeholder|aria-label)\s*=\s*["']/gi, /\b(?:ask\s+ai|message\s+ai|chat\s+with\s+ai|ai\s+assistant)\b/gi);
}

/** v34: /<(?:iframe|div|section|aside)\b[^>]*(?:class|id)\s*=\s*["'][^"']*\b(?:assistant-widget|intercom|drift|zendesk-chat|tawk(?:\.to)?|crisp\.chat|livechat|chat-widget|chat-container)\b/i.test(html) */
function hasChatWidgetContainer(html: string): boolean {
  return tagAttrValueHas(html, /<(?:iframe|div|section|aside)\b/gi, /(?:class|id)\s*=\s*["']/gi, /\b(?:assistant-widget|intercom|drift|zendesk-chat|tawk(?:\.to)?|crisp\.chat|livechat|chat-widget|chat-container)\b/gi);
}

/** v34: /<(?:iframe|div|section)\b[^>]*(?:class|id)\s*=\s*["'][^"']*\b(?:contact-widget|smart-search|virtual-agent|message-us|help-widget)\b/i.test(html) */
function hasAmbiguousWidget(html: string): boolean {
  return tagAttrValueHas(html, /<(?:iframe|div|section)\b/gi, /(?:class|id)\s*=\s*["']/gi, /\b(?:contact-widget|smart-search|virtual-agent|message-us|help-widget)\b/gi);
}

/** v34: /<meta\s+name\s*=\s*["']generator["'][^>]*content\s*=\s*["'][^"']*\b(?:ai|gpt|claude|gemini|llm|generated|artificial\s+intelligence)\b/i.test(html) */
function hasAiGeneratorMeta(html: string): boolean {
  return tagAttrValueHas(html, /<meta\s+name\s*=\s*["']generator["']/gi, /content\s*=\s*["']/gi, /\b(?:ai|gpt|claude|gemini|llm|generated|artificial\s+intelligence)\b/gi);
}

/** text.replace(/\[[^\]]*\]/g, fn) */
function replaceBrackets(text: string, fn: (m: string) => string): string {
  return replaceSpansWith(text, bracketSpans(text), fn);
}

/**
 * S8: html with <script>, <style> and <template> elements and comments each
 * replaced by a space (/<script\b[\s\S]*?<\/script\s*>/gi and the like).
 */
function withoutNonVisibleMarkup(html: string): string {
  const a = replaceSpans(html, lazyBlockSpans(html, /<script\b/gi, /<\/script\s*>/gi), ' ');
  const b = replaceSpans(a, lazyBlockSpans(a, /<style\b/gi, /<\/style\s*>/gi), ' ');
  const c = replaceSpans(b, lazyBlockSpans(b, /<template\b/gi, /<\/template\s*>/gi), ' ');
  return replaceSpans(c, lazyBlockSpans(c, /<!--/g, /-->/g), ' ');
}
/**
 * S2: does some linear-gradient() in the value carry two or more colour stops?
 * The lower-cased copy is made once; it was remade for every gradient read.
 */
function hasMultiStopGradient(value: string): boolean {
  const lower = value.toLowerCase();
  let from = 0;
  for (;;) {
    const at = lower.indexOf('linear-gradient(', from);
    if (at < 0) return false;
    let depth = 0;
    let end = -1;
    for (let i = at + 15; i < value.length; i++) {
      if (value[i] === '(') depth++;
      else if (value[i] === ')' && --depth === 0) { end = i; break; }
    }
    if (end < 0) return false;
    const args = splitCssTopLevel(value.slice(at + 16, end), ',');
    const stops = /^(?:to\s|[-+]?[\d.]+(?:deg|turn|rad|grad)\b)/i.test(args[0] ?? '') ? args.slice(1) : args;
    if (stops.length >= 2) return true;
    from = end;
  }
}

// ── Resilient CSS & HTML Fetching ──────────────────────────────────────────

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

function extractCssLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  for (const m of styleElements(html)) {
    links.push(m.groups[0] as string);
  }
  for (const m of stylesheetLinkMatches(html)) {
    try {
      links.push(new URL(m.groups[0] as string, baseUrl).href);
    } catch {
      // ignore malformed hrefs
    }
  }
  return links;
}

/**
 * Result of one fetch attempt.
 *
 * WHY THIS IS NOT A BARE STRING
 * The previous version returned '' for every failure mode AND for a
 * successfully-fetched empty body, so callers could not tell "the server said
 * 403" from "the page was genuinely blank". fetchPageResilient therefore
 * substituted a placeholder document and the engine scored THAT. Verified
 * 2026-09-18: nytimes.com and cssdesignawards.com return 403 to our fetches,
 * and both were scored 61.5/D as though they were real pages carrying no design
 * tokens — the same number an empty document produces, to the decimal. A grade
 * that cannot distinguish a blocked site from a bare one is not a grade.
 *
 * `ok: false` means the attempt yielded no document; `reason` says which
 * failure it was, so the caller can report it instead of guessing.
 */
/**
 * Byte caps on what the hosted engine reads from a site (engine 1.5.1).
 *
 * Measured 2026-10-15 through this route's own fetch on the leaderboard
 * cohort: the largest page HTML was 1.80 MB, the largest single stylesheet
 * 0.87 MB, the largest page's stylesheets together 3.29 MB, and the largest
 * /DESIGN.md answered with a 200 was 2.61 MB. Each cap is four or more times
 * the largest, rounded up to a power of two, so no page in the cohort comes
 * near one. A body longer than its cap is read up to the cap and the outcome
 * says so (htmlTruncated, stylesheetBytesTruncated), as stylesheetsTruncated
 * reports the stylesheet count cap. The stylesheets share one budget, read as
 * they arrive.
 */
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_STYLESHEET_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_STYLESHEET_BYTES = 16 * 1024 * 1024;
const MAX_DESIGN_MD_BYTES = 16 * 1024 * 1024;

/**
 * A response body as text, as Response.text() decodes it (UTF-8, a leading
 * byte order mark dropped, U+FFFD for a malformed sequence), read only up to
 * `maxBytes`, and up to what is left of `budget` when one is shared.
 */
async function readCapped(resp: Response, maxBytes: number, budget?: { left: number }): Promise<{ text: string; truncated: boolean }> {
  if (!resp.body) return { text: '', truncated: false };
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let read = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = Math.max(0, Math.min(maxBytes - read, budget ? budget.left : Infinity));
      const chunk = value.byteLength > room ? value.subarray(0, room) : value;
      if (chunk !== value) truncated = true;
      read += chunk.byteLength;
      if (budget) budget.left -= chunk.byteLength;
      parts.push(decoder.decode(chunk, { stream: true }));
      if (truncated) break;
    }
  } finally {
    if (truncated) await reader.cancel().catch(() => undefined);
  }
  parts.push(decoder.decode());
  return { text: parts.join(''), truncated };
}

type FetchOutcome =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; reason: 'http_error' | 'timeout' | 'network' | 'empty_body'; status?: number };

async function fetchCssSingleDetailed(url: string, maxBytes = MAX_STYLESHEET_BYTES, budget?: { left: number }): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await safeFetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    if (!resp.ok) return { ok: false, reason: 'http_error', status: resp.status };
    const { text, truncated } = await readCapped(resp, maxBytes, budget);
    if (!text || text.length <= 50) return { ok: false, reason: 'empty_body' };
    return { ok: true, text, truncated };
  } catch (e) {
    const aborted = e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message));
    return { ok: false, reason: aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * String-returning wrapper for the CSS call sites.
 *
 * CSS fetch sites legitimately collapse the two failures: "no stylesheet" and
 * "a stylesheet we could not read" both mean no token layer is available to
 * inspect, so '' is the honest value for both. Only the HTML fetch needs the
 * distinction, because only the HTML fetch decides whether a page exists.
 */
async function fetchCssSingle(url: string): Promise<string> {
  const r = await fetchCssSingleDetailed(url);
  return r.ok ? r.text : '';
}

/**
 * Fetched page, or an explicit statement that there is no page.
 *
 * The failure branch is the point. Previously every candidate failure produced
 * `{ html: '<html><body></body></html>', css: '' }` — a real document that the
 * checks then scored, yielding 61.5/D for a site that had blocked us. The
 * caller now learns the fetch failed and can say so instead of inventing a grade.
 */
/**
 * Upper bound on external stylesheets fetched per score.
 *
 * This is a PATHOLOGY GUARD, not a performance measure. An earlier version of
 * this fix capped at 12 on the assumption that fetching every sheet was slow —
 * measured wrong: github.com's 29 unique stylesheets fetch in 0.5s in parallel
 * (16 workers), because the cost was never the sheet count, it was fetching them
 * SEQUENTIALLY. The lower cap silently truncated github's CSS surface and cost
 * it 6.2 points (68.5 -> 62.3), which is a scoring regression dressed as an
 * optimisation. Do not lower this to save time; time is already bounded by the
 * per-request abort and the concurrency below.
 *
 * 60 is chosen to be above any real site observed (github's 29 is the largest in
 * the leaderboard cohort) while still bounding a pathological page that links
 * hundreds of sheets.
 */
const MAX_STYLESHEETS = 60;

/**
 * Wall-clock ceiling for the whole stylesheet phase, across every sheet.
 *
 * Distinct from the per-request 8s abort: this bounds the SUM, so a page linking
 * many slow sheets cannot extend a score without limit. 20s is generous against
 * the measured 0.5s for a 29-sheet page while still failing fast on a hung host.
 */
const STYLESHEET_DEADLINE_MS = 20_000;

type PageOutcome =
  | {
      ok: true;
      html: string;
      css: string;
      /** How many external stylesheets contributed — reported so a capped read is visible. */
      stylesheetsFetched: number;
      /** Unique external stylesheets the page referenced. */
      stylesheetsTotal: number;
      /** True when stylesheetsTotal exceeded the cap and the CSS surface is partial. */
      stylesheetsTruncated: boolean;
      /** True when the HTML was longer than MAX_HTML_BYTES and was read up to it. */
      htmlTruncated: boolean;
      /** True when a stylesheet, or the stylesheets together, were read only up to their byte cap. */
      stylesheetBytesTruncated: boolean;
    }
  | { ok: false; reason: 'http_error' | 'timeout' | 'network' | 'empty_body'; status?: number; attempted: string[] };

async function fetchPageResilient(targetUrl: string): Promise<PageOutcome> {
  const parsed = new URL(targetUrl);
  const candidateUrls = [
    targetUrl,
    parsed.hostname.startsWith('www.') ? '' : `https://www.${parsed.hostname}${parsed.pathname}`,
    `http://${parsed.hostname}${parsed.pathname}`,
  ].filter(Boolean);

  let html = '';
  let htmlTruncated = false;
  // Remember WHY each candidate failed. A 403 on every candidate means the site
  // is blocking us — a different fact from a timeout, and the caller needs to
  // tell them apart.
  let lastFail: (FetchOutcome & { ok: false }) | null = null;

  for (const candidate of candidateUrls) {
    const outcome = await fetchCssSingleDetailed(candidate, MAX_HTML_BYTES);
    if (outcome.ok) { html = outcome.text; htmlTruncated = outcome.truncated; break; }
    lastFail = outcome;
  }

  if (!html) {
    return {
      ok: false,
      reason: lastFail ? lastFail.reason : 'network',
      status: lastFail && 'status' in lastFail ? lastFail.status : undefined,
      attempted: candidateUrls,
    };
  }

  // -- Stylesheet collection: dedupe, cap, and fetch in parallel ------------
  //
  // Was: sequential fetch of every <link rel=stylesheet> in document order,
  // each with its own 8s abort. On a large site that is minutes of wall clock.
  // github.com exposes 40 stylesheet links (11 of them exact duplicates), so the
  // worst case was ~320s of sequential waiting for a single score. Observed live
  // 2026-09-18: /api/score for github.com ran past 85s and returned http=000,
  // which also stalled the weekly re-score at 26/30.
  //
  // Three changes, each addressing a distinct part of that:
  //   1. Dedupe by URL. 11 of github's 40 links are byte-identical repeats.
  //   2. Cap the count — as a pathology guard ONLY. See MAX_STYLESHEETS: an
  //      earlier, lower cap was justified by an unmeasured assumption that
  //      fetching every sheet was slow. It is not (29 sheets = 0.5s in
  //      parallel), and the cap cost github.com 6.2 points by hiding CSS.
  //   3. Fetch concurrently. THIS is the actual latency fix: sequential makes
  //      latency the SUM of every slow sheet, concurrent makes it the MAX.
  const allParts = extractCssLinks(html, targetUrl);
  const inlineParts = allParts.filter((p) => !p.startsWith('http'));
  const uniqueExternal = [...new Set(allParts.filter((p) => p.startsWith('http')))];
  const externalParts = uniqueExternal.slice(0, MAX_STYLESHEETS);

  const cssParts: string[] = [...inlineParts];
  // Global deadline on the whole stylesheet phase.
  //
  // Each individual fetch already aborts at 8s, but 60 sheets at 8s each is
  // still hours of worst case if a site is slow per-request — and unlike the
  // sheet COUNT, which turned out not to matter, a hung endpoint genuinely
  // does. The deadline bounds the phase regardless of how many sheets a page
  // links, so raising the cap above cannot re-introduce an unbounded wait.
  //
  // Sheets that miss the deadline are dropped, not failed: a partial CSS surface
  // still yields real token data, and the omission is reported in the outcome.
  const deadline = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error('stylesheet deadline')), STYLESHEET_DEADLINE_MS).unref?.()
      ?? setTimeout(() => rej(new Error('stylesheet deadline')), STYLESHEET_DEADLINE_MS),
  );
  // Engine 1.5.1: the sheets share one byte budget as well as the deadline.
  const budget = { left: MAX_TOTAL_STYLESHEET_BYTES };
  let stylesheetBytesTruncated = false;
  let fetched: string[] = [];
  try {
    fetched = await Promise.race([
      Promise.all(
        externalParts.map(async (part) => {
          const r = await fetchCssSingleDetailed(part, MAX_STYLESHEET_BYTES, budget);
          if (r.ok && r.truncated) stylesheetBytesTruncated = true;
          return r.ok ? r.text : '';
        }),
      ),
      deadline,
    ]);
  } catch {
    fetched = [];
  }
  for (const t of fetched) if (t) cssParts.push(t);

  return {
    ok: true,
    html,
    css: cssParts.join('\n'),
    stylesheetsFetched: fetched.filter(Boolean).length,
    stylesheetsTotal: uniqueExternal.length,
    stylesheetsTruncated: uniqueExternal.length > externalParts.length,
    htmlTruncated,
    stylesheetBytesTruncated,
  };
}

// ── Token extraction + normalization ────────────────────────────────────────

function extractRootTokens(css: string): Record<string, string> {
  // Only the BASE unscoped :root is read for contract-value comparison.
  // Media-query overrides (e.g. @media (prefers-contrast: more) { :root { ... } })
  // are accessibility enhancements, not contract drift — they must NOT clobber
  // the base tokens.  Strip @media blocks before extracting :root.
  const stripped = withoutMediaBlocks(css);
  const tokens: Record<string, string> = {};
  // `:root, :host { ... }` is the block Tailwind v4 writes its theme into;
  // until engine 1.3.0 only `:root {` was read, so those tokens were missed.
  for (const m of rootTokenBlocks(stripped)) {
    for (const p of customPropertyValues(m.groups[0] as string)) {
      tokens[`--${p.groups[0]}`] = (p.groups[1] as string).trim();
    }
  }
  return tokens;
}

const TOKEN_ALIASES: Record<string, string[]> = {
  '--paper': [
    '--bg', '--background', '--surface', '--bg-primary', '--background-color',
    '--canvas', '--page', '--page-bg', '--bg-base', '--surface-base',
    '--color-bg', '--color-background', '--color-surface', '--app-bg',
  ],
  '--ink': [
    '--text', '--fg', '--foreground', '--text-primary', '--color-text',
    '--color-foreground', '--text-main', '--text-base', '--body-text',
  ],
  '--signal': [
    '--accent', '--primary', '--brand', '--accent-color', '--color-accent',
    '--color-primary', '--color-brand', '--brand-color', '--link',
  ],
  '--muted': [
    '--text-muted', '--text-secondary', '--secondary', '--fg-muted',
    '--color-text-secondary', '--color-muted', '--text-subtle',
  ],
  '--muted-dim': [
    '--text-dim', '--text-disabled', '--fg-dim', '--text-faint',
  ],
  '--duration-quick': [
    '--duration-fast', '--transition-fast', '--motion-fast', '--dur-fast',
  ],
  '--duration-slow': [
    '--duration-slow-1', '--transition-slow', '--motion-slow', '--dur-slow',
  ],
};

// ── WCAG 2.1 contrast ratio ──────────────────────────────────────────────────
// Per WCAG 2.1 §1.4.3: contrast = (L1 + 0.05) / (L2 + 0.05), where L1/L2 are
// relative luminances of the lighter/darker colors. Relative luminance uses
// the sRGB→linear transfer function. AA: 4.5:1 body, 3:1 large/UI.
function srgbChannelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: [number, number, number]): number {
  return (
    0.2126 * srgbChannelToLinear(rgb[0]) +
    0.7152 * srgbChannelToLinear(rgb[1]) +
    0.0722 * srgbChannelToLinear(rgb[2])
  );
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * A token value as the opaque sRGB colour v06 and v22 measure.
 *
 * Read through the CSS Color 4 parser v44 uses (resolveThemeColor): var()
 * chains with fallbacks, hex of 3, 4, 6 or 8 digits, rgb() and hsl() in comma
 * or space syntax, oklch(), oklab(), color(srgb), color-mix(), light-dark()
 * (its light side: these two checks read one theme) and bare HSL channels.
 * Until engine 1.3.0 they read only 3- and 6-digit hex and comma rgb(), with
 * alpha ignored, so a stylesheet written in oklch() (Tailwind v4, shadcn)
 * SKIPped both checks and a page with illegible text scored 100.
 *
 * A translucent colour is composited over `under` as a browser paints it;
 * with nothing under it, it is not measured.
 */
function resolveTokenColor(value: string, tokens: Record<string, string>, under: [number, number, number] | null): [number, number, number] | null {
  if (!value.trim()) return null;
  const c = resolveThemeColor(value, [tokens], false);
  if (!c) return null;
  if (c[3] >= 1) return [c[0], c[1], c[2]];
  if (!under) return null;
  const painted = v44Composite(c, [under[0], under[1], under[2], 1]);
  return [painted[0], painted[1], painted[2]];
}

// ── APCA-W3 0.0.98G-4g — supplementary perceptual contrast ───────────────────
// Ported from Myndex/apca-w3 canonical source (W3-licensed for WCAG 3
// conformance tools). APCA is polarity-sensitive (unlike WCAG 2.1) and returns
// a signed Lc value: positive = dark text on light bg, negative = light text
// on dark bg. Use Math.abs(Lc) for threshold comparison. Attribution:
// Andrew Somers / Myndex Research.
// Thresholds (Bronze Simple Mode): Lc 75 body min, Lc 90 body preferred, Lc 60 non-body content.
function sRGBtoY_APCA(rgb: [number, number, number]): number {
  const r = Math.pow(rgb[0] / 255, 2.4);
  const g = Math.pow(rgb[1] / 255, 2.4);
  const b = Math.pow(rgb[2] / 255, 2.4);
  let ys = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  // Soft black clamp
  if (ys < 0.022) ys += Math.pow(0.022 - ys, 1.414);
  return ys;
}

function apcaContrast(txtRgb: [number, number, number], bgRgb: [number, number, number]): number {
  const txtYs = sRGBtoY_APCA(txtRgb);
  const bgYs = sRGBtoY_APCA(bgRgb);
  if (Math.abs(bgYs - txtYs) < 0.0005) return 0;
  let sapc: number;
  if (bgYs > txtYs) {
    // Normal polarity (dark text on light bg)
    sapc = (Math.pow(bgYs, 0.56) - Math.pow(txtYs, 0.57)) * 1.14;
  } else {
    // Reverse polarity (light text on dark bg)
    sapc = (Math.pow(bgYs, 0.65) - Math.pow(txtYs, 0.62)) * 1.14;
  }
  if (Math.abs(sapc) < 0.0005) return 0;
  sapc = sapc < 0 ? sapc + 0.027 : sapc - 0.027;
  return sapc * 100; // signed Lc
}

function resolveVar(value: string, tokens: Record<string, string>, depth = 0): string {
  if (depth > 5) return value.trim();
  const m = value.match(/^\s*var\(\s*(--[\w-]+)/);
  if (!m) return value.trim();
  const ref = tokens[m[1]];
  if (!ref) return value.trim();
  return resolveVar(ref, tokens, depth + 1);
}

function inferTokensFromCss(
  css: string,
  tokens: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = { ...tokens };
  for (const [canonical, aliases] of Object.entries(TOKEN_ALIASES)) {
    if (!result[canonical]) {
      for (const alias of aliases) {
        // Do not stop at an alias that merely EXISTS. resolveVar trims, so an
        // alias holding only whitespace (or a var() chain that resolves to one)
        // yields the empty string — truthy at the test, useless as a value.
        // Stopping there discarded the token even when a later alias in the
        // same list had a real one. Keep trying until the RESOLVED value is
        // non-empty.
        if (result[canonical]) break;
        if (result[alias]) {
          result[canonical] = resolveVar(result[alias], result);
        }
      }
    }
  }
  return result;
}

// ── Check Implementations ──────────────────────────────────────────────────

/** Structured findings a check attaches (v44, v45), capped at 20 with the rest counted. */
export type CheckEvidence = { findings: Array<Record<string, string | number | null>>; truncated: number };

export type CheckResult = { id: string; item: string; category: string; status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'MANUAL'; detail: string; weight?: number; remediation?: string; evidence?: CheckEvidence };

// ── Remediation guidance ────────────────────────────────────────────────────
// Per-check "how to fix this" guidance, shown in the score drawer for FAIL
// and WARN results (PASS/SKIP don't need remediation). Keyed by check id so
// every check implementation gets guidance for free — the check returns its
// status/detail, the table supplies the fix. Token references use the
// contract v0.3.0 names so the guidance is self-contained.
const REMEDIATION: Record<string, string> = {
  v01: 'Declare --paper (and the full :root token set) in your global stylesheet. The contract names --paper, --ink, --muted, --surface, --surface-raised, --line, --signal, --signal-light, --signal-dim as the required foundation.',
  v02: 'Test at 375px, 720px, 860px, and 1080px+ viewports. Common causes: fixed-width containers, negative margins, or images without max-width: 100%. Add overflow-x: hidden only as a last resort; find the overflowing element instead.',
  v03: 'Add :focus-visible { outline: 2px solid var(--signal-light); outline-offset: 2px; } to interactive elements. Never remove focus without replacing it. Test by tabbing through the page with a keyboard.',
  v04: 'Sound toggle should flip aria-pressed="true"/"false" on click and apply a [data-audio] attribute on <html> or <body> that the audio layer reads. Wire the state both ways: visual + accessibility tree.',
  v05: 'Add @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } } to disable entrance loops, parallax, and wordmark breath.',
  v06: 'Adjust your --ink, --muted, --muted-dim token values against --paper until contrast clears WCAG AA: 4.5:1 for body text, 3:1 for large text. Use oklch() or a contrast checker. --muted-dim is the usual offender.',
  v07: 'Add semantic HTML landmarks: exactly one <h1> per page, a descriptive <title>, <meta name="description"> with a one-sentence summary, and at least one <main>/<header>/<nav> landmark element. These are Lighthouse a11y basics and the foundation of document structure.',
  v08: 'Wire the Poise interaction rules from contract.interaction into your component layer: hover lifts (translateY -1px), press scales (0.96 cells / 0.985 cards), focus rings, and the data-cuelume-press haptic attribute on every tappable element.',
  v09: 'Publish a keyboard-path page or section documenting the tab order, focus visibility, and key bindings. Every interactive element must be reachable by Tab, operable by Enter/Space, and dismissible by Esc.',
  v10: 'Apply the Takt feel rules: press scale 0.96 on cells (buttons, chips, toggles), 0.985 on cards/rows, 0.995 on large surfaces. All scales must stay above the 0.95 floor; anything lower reads as a glitch.',
  v11: 'Replace transition: all with named properties: transition: color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out). transition: all causes layout-thrash and surprises.',
  v12: 'Restrict will-change to transform and opacity only, and only on elements actively animating. Remove will-change from static elements. Setting it on everything forces the browser to promote every layer, which costs memory and paint time.',
  v13: 'Set press scales to 0.96 (cells), 0.985 (cards/rows), 0.995 (large surfaces). All must be above 0.95. Use transform: scale() on :active, with transition: transform var(--duration-quick) var(--ease-out).',
  v14: 'Apply the Cadence typography rules: font-synthesis: none, text-underline-position: from-font, text-decoration-skip-ink: auto, -webkit-font-smoothing: antialiased, -moz-osx-font-smoothing: grayscale. Root font-size: 16px (never lower). All sizes in rem.',
  v15: 'Add to your :root or html rule: -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; This prevents subpixel rendering artifacts on dark backgrounds and gives type its intended weight.',
  v16: 'Set html { font-size: 16px } and express all text sizes in rem (not px, not em for the global scale). The 16px root is the Cadence floor: iOS Safari auto-zooms inputs below 16px, which breaks mobile UX.',
  v17: 'Set heading line-height to 1.08 and body line-height to 1.55. Tight headings read as deliberate; relaxed body copy reads as confident. Avoid 1.0 (cramped) and 2.0 (loose); both read as amateur typography.',
  v18: 'Add text-wrap: balance to headings and text-wrap: pretty to paragraphs. balance prevents orphaned headline words; pretty prevents orphaned words in body copy. Both are progressive enhancement: unsupported browsers ignore them.',
  v19: 'Add font-feature-settings: "tnum" or font-variant-numeric: tabular-nums to numeric displays: scores, counts, prices, timestamps. This keeps digits from shifting width as values change, which matters for any live-updating number.',
  v20: 'Add ::selection { background: var(--signal); color: var(--paper); } instead of leaving the browser default. The selection color is a small but loud brand surface; using your --signal token there carries the brand into every text selection.',
  v21: 'Audit Core Web Vitals with Lighthouse or PageSpeed Insights. LCP < 2.5s (optimize hero image + fonts), INP < 200ms (defer non-critical JS, use CSS for entrance animations), CLS < 0.1 (reserve space for images/ads, avoid late layout shifts).',
  v22: 'Primary button text must clear WCAG AA 4.5:1 against its fill. If --ink on --signal is too low, either darken --ink, lighten --signal, or switch the button to --paper-on--signal. Never ship a button where the label is hard to read.',
  v23: 'Declare the five duration tokens in :root: --duration (0.6s default), --duration-quick (150ms), --duration-fast (250ms), --duration-medium (350ms), --duration-slow (400ms). Use them everywhere instead of hardcoding ms values in component CSS.',
  x01: 'Add font-synthesis: none to your :root or body rule. This prevents the browser from synthesizing bold/italic faces when the real weights aren\'t loaded: a common cause of blurry headlines on Windows.',
  x02: 'Add text-underline-position: from-font to links and underlined text. This uses the font designer\'s built-in underline position rather than the browser default, which is usually too low and clips descenders.',
  x03: 'Add text-decoration-skip-ink: auto to links. This makes underlines skip the rounded parts of letters (g, j, p, q, y), a small typographic refinement that shows attention to craft.',
  v24: 'Ensure all interactive elements (buttons, links, inputs) have a min-height and min-width of at least 44px (WCAG 2.5.5 Target Size Enhanced, AAA, which matches the 44px convention in Apple HIG; WCAG 2.5.8 Minimum AA is 24px, and this check enforces the stricter 44px). For small icon buttons, add padding or min-height to reach the 44px floor. The static check detects CSS min-height ≥44px on button/a/input selectors; full verification needs a browser.',
  v25: 'Use exactly one <h1> per page as the main heading, and don\'t skip heading levels (no h1→h3 jumps). Screen readers and SEO both rely on a logical heading outline. Audit your heading order with a browser extension or Lighthouse.',
  v26: 'Limit font-family declarations to 3 or fewer (1 body family, 1 heading family, 1 mono for code). More than 3 families signals inconsistency and hurts performance. Consolidate by removing unused families or using weight variations of a single family.',
  v27: 'Set input font-size to at least 16px (1rem) to prevent iOS Safari auto-zoom on focus. Inputs below 16px trigger a layout-shift zoom on iPhone that breaks the mobile UX. Use font-size: 1rem or larger on all input, textarea, and select elements.',
  v28: 'Constrain body/article/paragraph max-width to 45-75ch (66ch ideal) for readable line length. Lines longer than 75ch are hard to track; shorter than 45ch feels choppy. Use max-width: 66ch on prose containers.',
  v29: 'Structure design tokens in layers: primitive (raw values like --color-blue-500: #3b82f6), semantic (aliases like --color-accent: var(--color-blue-500)), and component (references like --button-bg: var(--color-accent)). At minimum, alias some tokens via var() so a color change propagates through the system. Full 3-tier architecture is DSAF A1.1 maturity level.',
  v42: 'Name your color tokens by ROLE, not by hue. The contract names colors by what they mean: --ink (text), --paper (background), --surface (panels), --muted (secondary text), --signal (brand accent), --ok/--warn/--error (status). Hue names like --blue-500 or --slate-900 describe wavelength, not usage: when the brand palette shifts or dark mode lands, every hue-named reference must be hunted down and rewritten. Keep hue primitives in a separate tier and alias them to role tokens via var().',
  v43: 'Express UI states as semantic color roles: --ok/--success (verification pass), --warn/--warning (caution), --error/--danger (failure), --info (notice). The contract ships --ok, --warn, and --error for exactly this. Status colors named by state let components consume meaning (a score badge, a form error, and a toast all read the same token) and stay legible when the palette evolves.',
  v44: 'Give each status hue a text token for words and keep the hue itself for marks. A color that marks a state (a dot, a bar, a tint) needs 3:1, while the word for that state needs 4.5:1 (3:1 at 24px, or 18.66px bold) in every theme the site declares. Mix the hue toward your ink for text, for example --warn-ink: color-mix(in oklab, var(--warn) 70%, var(--ink)), measure it on the page and on each surface it sits on in every theme, and paint status words with it.',
  v45: 'Let every entrance that starts invisible run to its end when motion is paused. Under the pause rule, give one-shot entrances whose first keyframe is opacity 0 a negative delay longer than the animation, for example html[data-motion="paused"] :is(.fade-up, .reveal) { animation-delay: -3600s !important; }, or remove them with animation: none. Loops can stay held. Test by pausing motion and reloading: every page should still show its content.',
  v46: 'Size text from the type scale. Use a type token (font-size: var(--text-body)) or a size that sits on the scale your tokens declare; keep deliberate fluid type in clamp() with a viewport or container unit, and keep its lower bound at or above the smallest type token. A static size between two steps reads as a one-off and drifts the rhythm the scale exists to hold.',
  v34: 'If the page hosts an AI chatbot or agent, tell people they are talking to an AI no later than their first interaction, in a form assistive technology announces. EU AI Act Article 50(1), which applies from 2026-08-02, places this duty on the provider of the AI system (the organisation that develops it and places it on the market or puts it into service under its own name); it does not apply where the AI nature is obvious from the context, and Article 50(5) asks for the information to be clear and accessible. The check reads any one of: visible "AI assistant" or "Chatbot" text, aria-label="AI assistant" on the chat container, or a data-ai-disclosure attribute on the widget. A live chat answered by people needs no AI disclosure: if the check flagged one for review, confirm who answers. US laws differ in scope: California\'s bot-disclosure law (SB 1001, Bus. & Prof. Code §§17940-17943) covers bots that mislead people about being bots to drive a sale or influence a vote; Colorado SB 24-205 was repealed and re-enacted by SB 26-189 (signed 2026-05-14, obligations from 2027-01-01), which governs automated decision-making in consequential decisions. This is not legal advice.',
  v35: 'Add a forced-colors readiness block: @media (forced-colors: active) { ... } with forced-color-adjust: none on elements that must preserve brand identity (logos, charts, semantic-color indicators). Windows High Contrast Mode and Chrome forced-colors recolor the page: without this media query, critical UI becomes illegible. Also ensure borders/outlines use currentColor or system colors so they adapt. Test with Windows HCM (Settings > Accessibility > Contrast themes).',
  v36: 'Remove UTS #39 confusable characters from CSS identifiers and token names. Confusables are Unicode characters from different scripts (Cyrillic, Greek, fullwidth) that look identical to ASCII letters; Cyrillic а (U+0430), for example, looks like Latin a (U+0061). In token names they enable shadowing attacks (--соlor-bg with Cyrillic с vs --color-bg). Audit all custom property names, class names, and url() paths for non-ASCII characters using a Unicode confusable detector. Provenance: Unicode Technical Standard #39, Unicode 16.0.0. Designesy is the only design verification engine that checks this surface.',
  v37: 'Publish a DESIGN.md file at /DESIGN.md in your repo root and serve it publicly. The DESIGN.md format\'s linter (v0.4.0, Apache-2.0) validates the file: 11 lint rules covering broken token refs, missing primary colors, WCAG contrast, orphaned tokens, section order, and more. Designesy integrates Google\'s linter as the spec layer and runs its own 45-check contract verification as the layer above. Install the CLI: npm install -g @google/design.md. Lint locally: npx @google/design.md lint DESIGN.md. Export to W3C DTCG: npx @google/design.md export --format dtcg DESIGN.md. Note: DESIGN.md uses sRGB hex only; for OKLCH/Display P3 color spaces, use the W3C DTCG JSON format directly.',
  v38: 'Rewrite button labels to start with a verb or recognized command. NN/g: "Lead with verbs or verb phrases that clearly outline what will happen after the command is selected." Use "Save changes" not "Changes", "Delete file" not "File". Recognized commands: Save, Cancel, Delete, Edit, Share, Close, Back, Next, etc. This is a WARN (heuristic): review flagged buttons manually.',
  v39: 'Remove trailing periods from button text, labels, and tab text. Microsoft Fluent: "Don\'t end text for buttons, radio buttons, labels, or checkboxes with a period." Periods are for full sentences in tooltips, error messages, and dialog bodies only.',
  v40: 'Replace non-descriptive link text with destination-revealing text. WCAG 2.4.4 Link Purpose: link text should describe the destination. Use "Read the typography guide" not "Click here". Use "View the leaderboard" not "Learn more". NN/g: non-descriptive links force users to read surrounding context to understand the destination.',
  v41: 'Convert ALL CAPS UI text to sentence case. IBM Carbon: "All caps has been shown to be slower to read." Only eyebrow labels (per typography contract: 0.72 to 0.75rem, weight 600, uppercase, letter-spacing 0.18em) and acronyms should be uppercase. Use CSS text-transform: uppercase on eyebrow elements if needed, but keep the HTML text in sentence case for screen readers.',
  S1: 'Replace overused AI-signal fonts with a distinctive choice from your brand system. Inter, Roboto, Open Sans, Montserrat, Poppins, Lato, Space Grotesk, Instrument Serif, and Geist are the fonts AI defaults to when it has no design brief. A custom or less common font signals intentionality.',
  S2: 'Remove or reduce full-page gradient backgrounds. The 60%+ viewport gradient is the most recognizable AI slop pattern. Use a solid or subtle textured background instead. If a gradient serves a purpose (e.g., a data visualization), scope it to a small area.',
  S3: 'Remove purple/violet gradient overlays (#615fff, #8e51ff, #4f39f6, #7f22fe family). This is the "VibeCode Purple" tell: the most hardcoded gradient in AI-generated UIs. Replace with your brand signal color or a neutral surface.',
  S4: 'Remove gradient text (background-clip: text + color: transparent). Gradient text is decorative, harms readability, and kills scannability. Use solid text colors that pass WCAG contrast.',
  S5: 'Replace default Tailwind/Bootstrap hex values with brand-specific colors. Default indigo-500 (#6366f1), violet-500 (#8b5cf6), slate-900 (#0f172a), Bootstrap primary (#0d6efd) signal no design system. Extend your token set with brand-specific values.',
  S6: 'Vary your card layouts. Repeated identical cards in a rigid grid are the universal AI feature-card template. Mix sizes, use asymmetric layouts, vary content density, or use a different component for your features section.',
  S7: 'Replace emoji icons with SVG or icon-library icons. Emoji render differently across operating systems, do not inherit CSS color, do not adapt to dark mode, and do not scale cleanly. Use Lucide, Heroicons, or custom SVGs.',
  S8: 'Remove "AI-powered", "Generate", "Chat with AI", "Powered by AI" pill badges from your hero or marketing copy. The user already knows what your product does. These badges signal that the copy was AI-generated.',
  S9: 'Remove all Lorem ipsum placeholder text. It signals the page is unfinished or was generated without real content. Replace with actual copy.',
  S10: 'Use at least 2 font families: one for display/headings, one for body text (and optionally a mono for code). A single font family for everything signals no typographic hierarchy.',
  S11: 'Replace marketing buzzwords (streamline, empower, supercharge, world-class, enterprise-grade, unlock, leverage, seamless, cutting-edge, revolutionize) with specific, concrete copy. Instead of "Streamline your workflow", say what actually changes: "Deploy in 3 minutes instead of 3 hours."',
  S12: 'Replace placeholder/stock image URLs (via.placeholder.com, placehold.co,picsum.photos, unsplash.com/random) with real assets, optimized images, or well-composed CSS gradients.',
};

function checkPaperToken(tokens: Record<string, string>): CheckResult {
  const val = tokens['--paper'];
  if (val) return { id: 'v01', item: 'Token values match live site :root foundation', category: 'tokens', status: 'PASS', detail: `--paper resolved to ${val}` };
  return { id: 'v01', item: 'Token values match live site :root foundation', category: 'tokens', status: 'FAIL', detail: '--paper background token not declared in :root' };
}

function checkContrastSignal(tokens: Record<string, string>): CheckResult {
  // v22 — REAL WCAG 2.1 contrast between the primary button's fill and its
  // label. AA threshold: 4.5:1 for body text, 3:1 for large/UI — buttons are
  // large text, but we hold the 4.5:1 bar because button labels are often
  // small (12-14px).
  //
  // A contract that names its primary action pair (--action, the fill, and
  // --on-action, the label) is measured on exactly that pair: it is what the
  // button paints, so a better-contrast token elsewhere cannot stand in for a
  // label that fails. Without both tokens the check reads the convention most
  // contracts use: --paper or --ink text on --signal, the better ratio winning
  // (designers choose the higher-contrast pairing).
  const actionVal = tokens['--action'];
  const onActionVal = tokens['--on-action'];
  // The page under a translucent fill is --paper; a translucent label sits on the fill.
  const pageRgb = resolveTokenColor(tokens['--paper'] || '', tokens, null);
  if (actionVal && onActionVal) {
    const fillRgb = resolveTokenColor(actionVal, tokens, pageRgb);
    const labelRgb = fillRgb ? resolveTokenColor(onActionVal, tokens, fillRgb) : null;
    if (!fillRgb || !labelRgb) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'SKIP', detail: `--action ${actionVal} or --on-action ${onActionVal} unresolvable to RGB` };
    const pairRatio = contrastRatio(labelRgb, fillRgb);
    const pairStr = `${pairRatio.toFixed(2)}:1`;
    if (pairRatio >= 4.5) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'PASS', detail: `--on-action on --action = ${pairStr} (≥ 4.5:1 AA)` };
    if (pairRatio >= 3) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'WARN', detail: `--on-action on --action = ${pairStr} (passes 3:1 large-text, fails 4.5:1 body)` };
    return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'FAIL', detail: `--on-action on --action = ${pairStr} (below 3:1, illegible)` };
  }
  const signalVal = tokens['--signal'];
  if (!signalVal) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'WARN', detail: '--signal accent token not declared' };
  const signalRgb = resolveTokenColor(signalVal, tokens, pageRgb);
  if (!signalRgb) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'SKIP', detail: `--signal value ${signalVal} unresolvable to RGB` };

  const candidates: Array<{ name: string; rgb: [number, number, number] | null }> = [
    { name: '--paper', rgb: resolveTokenColor(tokens['--paper'] || '', tokens, signalRgb) },
    { name: '--ink', rgb: resolveTokenColor(tokens['--ink'] || '', tokens, signalRgb) },
  ];
  let bestRatio = 0;
  let bestName = '';
  for (const c of candidates) {
    if (!c.rgb) continue;
    const r = contrastRatio(c.rgb, signalRgb);
    if (r > bestRatio) { bestRatio = r; bestName = c.name; }
  }
  if (bestRatio === 0) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'SKIP', detail: 'no --paper/--ink token to test against --signal' };
  const ratioStr = `${bestRatio.toFixed(2)}:1`;
  if (bestRatio >= 4.5) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'PASS', detail: `${bestName} on --signal = ${ratioStr} (≥ 4.5:1 AA)` };
  if (bestRatio >= 3) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'WARN', detail: `${bestName} on --signal = ${ratioStr} (passes 3:1 large-text, fails 4.5:1 body)` };
  return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'FAIL', detail: `${bestName} on --signal = ${ratioStr} (below 3:1, illegible)` };
}

// v06 — REAL contrast check for ink/muted/muted-dim on paper.
// Computes both WCAG 2.1 ratio (the scoring standard) AND APCA Lc (the
// WCAG 3 candidate, polarity-aware). APCA is supplementary — it does not
// change pass/fail, but surfaces dark-mode contrast issues WCAG 2.1 misses.
//
// Where a stylesheet declares --muted-foreground, that is the muted text
// measured: in the shadcn convention --muted is a surface and
// --muted-foreground the text on it. Engine 1.3.0 reads oklch() (see
// resolveTokenColor), so without this every default shadcn theme would
// measure its --muted surface as text, at about 1.1:1, and FAIL.
function checkContrastReadable(tokens: Record<string, string>): CheckResult {
  const paperVal = tokens['--paper'];
  if (!paperVal) return { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper', category: 'accessibility', status: 'SKIP', detail: '--paper not declared: cannot test contrast' };
  const paperRgb = resolveTokenColor(paperVal, tokens, null);
  if (!paperRgb) return { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper', category: 'accessibility', status: 'SKIP', detail: `--paper value ${paperVal} unresolvable to RGB` };

  const textTokens = ['--ink', tokens['--muted-foreground'] ? '--muted-foreground' : '--muted', '--muted-dim'];
  const results: string[] = [];
  let worst = { name: '', ratio: Infinity, status: 'PASS' as 'PASS' | 'WARN' | 'FAIL' };
  for (const name of textTokens) {
    const val = tokens[name];
    if (!val) { results.push(`${name}: not declared`); continue; }
    const rgb = resolveTokenColor(val, tokens, paperRgb);
    if (!rgb) { results.push(`${name}: unresolvable`); continue; }
    const ratio = contrastRatio(rgb, paperRgb);
    const r = ratio.toFixed(2);
    // APCA supplementary signal (Lc 75 = body min, Lc 90 = body preferred, Lc 60 = non-body content min)
    const lc = apcaContrast(rgb, paperRgb);
    const lcStr = `Lc${Math.abs(lc).toFixed(0)}`;
    let st: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
    if (ratio < 3) st = 'FAIL';
    else if (ratio < 4.5) st = 'WARN';
    results.push(`${name}=${r}:1 ${lcStr}(${st})`);
    if (st === 'FAIL') { if (worst.status !== 'FAIL' || ratio < worst.ratio) worst = { name, ratio, status: 'FAIL' }; }
    else if (st === 'WARN' && worst.status !== 'FAIL') { if (worst.status !== 'WARN' || ratio < worst.ratio) worst = { name, ratio, status: 'WARN' }; }
  }
  const detail = results.join(', ');
  if (worst.status === 'FAIL') return { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper (WCAG 2.1 + APCA)', category: 'accessibility', status: 'FAIL', detail: `${detail}; ${worst.name} below 3:1` };
  if (worst.status === 'WARN') return { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper (WCAG 2.1 + APCA)', category: 'accessibility', status: 'WARN', detail: `${detail}; ${worst.name} below 4.5:1 AA` };
  return { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper (WCAG 2.1 + APCA)', category: 'accessibility', status: 'PASS', detail };
}

function checkTransitionAll(css: string): CheckResult {
  if (/transition\s*:\s*all/i.test(css)) return { id: 'v11', item: 'No transition:all in the live stylesheet', category: 'motion', status: 'FAIL', detail: 'found transition:all' };
  return { id: 'v11', item: 'No transition:all in the live stylesheet', category: 'motion', status: 'PASS', detail: 'no transition:all found' };
}

function checkWillChange(css: string): CheckResult {
  const matches = css.match(/will-change\s*:\s*([^;}]+)/gi) || [];
  for (const m of matches) {
    const val = m.replace(/will-change\s*:\s*/i, '').trim().toLowerCase();
    // Per-token subset test — accepts minified/reordered forms (e.g. "transform,opacity")
    // while still rejecting scroll-position, contents, or any non-transform/opacity value.
    const tokens = val.split(',').map(s => s.trim()).filter(Boolean);
    const ok = tokens.length > 0 && tokens.every(t => t === 'transform' || t === 'opacity');
    if (!ok) {
      return { id: 'v12', item: 'will-change restricted to transform and opacity only', category: 'motion', status: 'WARN', detail: `found will-change: ${val}` };
    }
  }
  return { id: 'v12', item: 'will-change restricted to transform and opacity only', category: 'motion', status: 'PASS', detail: 'will-change restricted cleanly' };
}

function checkFocusVisible(css: string): CheckResult {
  if (/:focus-visible/i.test(css)) return { id: 'v03', item: 'Primary interactive elements show focus-visible rings', category: 'interaction', status: 'PASS', detail: ':focus-visible declared' };
  return { id: 'v03', item: 'Primary interactive elements show focus-visible rings', category: 'interaction', status: 'FAIL', detail: 'missing :focus-visible rules' };
}

function checkTextWrap(css: string): CheckResult {
  const balance = /text-wrap\s*:\s*balance/i.test(css);
  const pretty = /text-wrap\s*:\s*pretty/i.test(css);
  if (balance && pretty) return { id: 'v18', item: 'text-wrap: balance + pretty both present in live CSS', category: 'cadence', status: 'PASS', detail: 'both text-wrap values present' };
  return { id: 'v18', item: 'text-wrap: balance + pretty both present in live CSS', category: 'cadence', status: 'WARN', detail: `balance=${balance} pretty=${pretty}` };
}

function checkCadenceRules(css: string): CheckResult {
  // v14 — umbrella Cadence contract-diff. Verifies the key Cadence rules from
  // contract.cadence are present in the live CSS. This is strictly weaker than
  // the individual checks (v15 font-smoothing, v16 rem-scale, v17 line-height,
  // v18 text-wrap, x01/x02/x03 resolved tensions, v19 tabular-nums) — it confirms
  // the Cadence section as a whole is represented, not individual rules.
  const rules = [
    { name: 'font-smoothing', re: /font-smoothing\s*:\s*(antialiased|grayscale)/i },
    { name: 'rem-based sizes', re: /font-size\s*:\s*[\d.]+rem/i },
    { name: 'line-height', re: /line-height\s*:\s*[\d.]+/i },
    { name: 'text-wrap', re: /text-wrap\s*:\s*(balance|pretty)/i },
    { name: 'tabular-nums', re: /tabular-nums/i },
  ];
  const missing = rules.filter(r => !r.re.test(css)).map(r => r.name);
  if (missing.length === 0) return { id: 'v14', item: 'Cadence typography rules match live CSS and contract.cadence', category: 'cadence', status: 'PASS', detail: 'all Cadence rules present' };
  return { id: 'v14', item: 'Cadence typography rules match live CSS and contract.cadence', category: 'cadence', status: 'WARN', detail: `missing: ${missing.join(', ')}` };
}

function checkTabularNums(css: string): CheckResult {
  // v19 — count of tabular-nums instances. Contract threshold is 8.
  const count = (css.match(/tabular-nums/gi) || []).length;
  if (count >= 8) return { id: 'v19', item: 'tabular-nums: 8 instances across the live CSS', category: 'cadence', status: 'PASS', detail: `${count} instances found` };
  return { id: 'v19', item: 'tabular-nums: 8 instances across the live CSS', category: 'cadence', status: 'WARN', detail: `only ${count} instances (threshold: 8)` };
}

/**
 * v05 helper: does a `prefers-reduced-motion: no-preference` block opt INTO
 * motion?
 *
 * Gating motion behind `no-preference` is a recommended way to honour reduced
 * motion: the motion exists only for users who have not asked for less, so a
 * `reduce` preference receives none of it. The block counts when it declares an
 * animation, a transition, smooth scrolling or a view transition.
 *
 * A block that only switches motion off (`animation: none`, durations of 10ms or
 * less) is the `reduce` kill switch filed under the wrong query. It stills motion
 * for users with no preference and leaves it running for users who asked for
 * less, which inverts the preference, so it does not count. The calibration
 * fixture broken-reduced-motion-inverted pins that case.
 */
function optsIntoMotion(body: string): boolean {
  if (hasViewTransitionNavigation(body)) return true;
  const declRe = /(?:^|[{;\s])(animation|animation-name|animation-duration|transition|transition-property|transition-duration|scroll-behavior|view-transition-name)\s*:\s*([^;{}]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(body)) !== null) {
    const prop = m[1].toLowerCase();
    const value = m[2].replace(/!important/i, '').trim().toLowerCase();
    if (prop === 'scroll-behavior') {
      if (value === 'smooth') return true;
      continue;
    }
    if (/^(?:none|initial|unset|revert|revert-layer|0|0s|0ms)$/.test(value)) continue;
    const times = [...value.matchAll(/(?:^|[\s,(])(\d+(?:\.\d+)?|\.\d+)(ms|s)\b/g)].map((t) => parseFloat(t[1]) * (t[2] === 's' ? 1000 : 1));
    if (times.length > 0 && times.every((t) => t <= 10)) continue;
    return true;
  }
  return false;
}

function checkReducedMotion(css: string): CheckResult {
  const ITEM = 'prefers-reduced-motion disables entrance and wordmark breath';
  const CATEGORY = 'motion';

  // Strip comments first. Without this, a commented-out media query — or any
  // prose mentioning prefers-reduced-motion — satisfied the old check. The
  // calibration corpus caught exactly that: the previous regex matched the
  // string anywhere, including inside /* */.
  const code = withoutCssComments(css, '');

  // Match the media query and read its VALUE. Two shapes honour reduced motion:
  //   * `reduce` with a non-empty body: motion is switched off for those users.
  //   * `no-preference` with a body that opts INTO motion (optsIntoMotion): the
  //     motion is opt-in, so a reduce preference never receives it.
  // Until engine 1.1.0 only the first shape passed, and a site that gated all
  // of its motion behind `no-preference` was WARNed for following a recommended
  // pattern. A bare substring match on the feature name stays wrong in both
  // directions: an empty block, or a `no-preference` block that only switches
  // motion off, honours nothing and still WARNs.
  const queries = reducedMotionQueries(code);
  let sawReduce = false;
  let sawMotionOptIn = false;
  let sawNoPreference = false;
  // Each block body ends at the brace that brings the depth back to zero,
  // found for every query in one pass (engine 1.5.1; a walk per query read
  // nested queries' bodies over and over).
  const closes = closingBraces(code, new Set(queries.map((q) => q.index + q.text.length - 1)));
  // A no-preference block inside one already read opts into motion only if
  // that one does, so it is not read again.
  let readUntil = -1;
  for (const match of queries) {
    const value = (match.groups[0] as string).toLowerCase();
    const open = match.index + match.text.length - 1;
    const close = closes.get(open) ?? -1;
    const body = close > open ? code.slice(open + 1, close).trim() : '';
    if (value === 'no-preference') {
      sawNoPreference = true;
      if (!sawMotionOptIn && close > readUntil) {
        if (optsIntoMotion(body)) sawMotionOptIn = true;
        readUntil = close;
      }
      continue;
    }
    // A `reduce` query that declares no rules reduces nothing.
    if (body.length > 0) sawReduce = true;
  }

  if (sawReduce) {
    return { id: 'v05', item: ITEM, category: CATEGORY, status: 'PASS', detail: 'prefers-reduced-motion: reduce block declares rules' };
  }
  if (sawMotionOptIn) {
    return { id: 'v05', item: ITEM, category: CATEGORY, status: 'PASS', detail: 'motion is opt-in: declared inside a prefers-reduced-motion: no-preference block, so a reduce preference receives none of it' };
  }
  if (sawNoPreference) {
    return {
      id: 'v05', item: ITEM, category: CATEGORY, status: 'WARN',
      detail: 'a prefers-reduced-motion: no-preference block exists but gates no motion: it is empty, or it only switches motion off, which stills motion for users with no preference and leaves it running for users who asked for less. Declare motion inside no-preference, or switch it off inside reduce.',
    };
  }
  return { id: 'v05', item: ITEM, category: CATEGORY, status: 'WARN', detail: 'missing prefers-reduced-motion: reduce media query' };
}

function checkSemanticHtmlFoundation(html: string): CheckResult {
  // v07 — REPLACED. The old check grepped for an internal control-plane word
  // in the target site's HTML — a designesy self-audit that was meaningless
  // for any external site (they all passed for the wrong reason). v07 is now a general
  // semantic-HTML check: verifies the page has a single <h1>, a <title>, a
  // <meta name="description">, and a <main>/<header>/<nav> landmark. These are
  // Lighthouse a11y basics (document-title weight 4.1, heading-order 0.8) and
  // apply to every site. The check name/id stays v07 for continuity.
  const visibleHtml = withoutScriptsAndStyles(html);
  const h1Count = (visibleHtml.match(/<h1\b/gi) || []).length;
  const hasTitle = hasTitleText(html);
  const hasMetaDesc = /<meta\s+name=["']description["']/i.test(html);
  const hasLandmark = /<(main|header|nav)\b/i.test(visibleHtml);
  const signals: string[] = [];
  const failures: string[] = [];
  if (h1Count === 1) signals.push('single h1'); else failures.push(h1Count === 0 ? 'no h1' : `${h1Count} h1s`);
  if (hasTitle) signals.push('title'); else failures.push('no title');
  if (hasMetaDesc) signals.push('meta description'); else failures.push('no meta description');
  if (hasLandmark) signals.push('landmark'); else failures.push('no main/header/nav');
  if (failures.length === 0) return { id: 'v07', item: 'Semantic HTML foundation: single h1, title, meta description, landmark', category: 'identity', status: 'PASS', detail: signals.join(', ') };
  if (failures.length <= 2) return { id: 'v07', item: 'Semantic HTML foundation: single h1, title, meta description, landmark', category: 'identity', status: 'WARN', detail: `ok: ${signals.join(', ')} · missing: ${failures.join(', ')}` };
  return { id: 'v07', item: 'Semantic HTML foundation: single h1, title, meta description, landmark', category: 'identity', status: 'FAIL', detail: `missing: ${failures.join(', ')}` };
}

// v13 — REAL press-scale check. Scans CSS for scale() values in :active or
// press-related contexts. Contract: 0.96 cells, 0.985 cards, 0.995 large surfaces,
// all above the 0.95 floor. We look for scale(0.9[5-9]|0.99[0-9]) and confirm
// at least one press-scale exists; below-floor values in :active contexts FAIL.
// Decorative below-floor scales (theme icons, hidden elements with opacity:0)
// are downgraded to WARN — they are not press-feedback glitches.
function checkPressScale(css: string): CheckResult {
  // Strip @keyframes blocks — scale(0) inside a ripple/particle keyframe is a
  // legitimate animation starting point, not a press scale.
  const stripped = withoutKeyframesBlocks(css);

  // Collect all press-scale candidates: scale() < 1 found in CSS rule blocks
  // (not keyframes). We split by '}' to get individual rule blocks so we can
  // inspect the selector context for each scale() value.
  const ruleBlocks = stripped.split('}');
  const pressScales: number[] = [];
  const decorativeBelowFloor: string[] = [];
  let activeBelowFloor = false;
  let activeBelowVal = '';

  for (const block of ruleBlocks) {
    const scaleMatch = block.match(/scale\(\s*([0-9.]+)\s*\)/i);
    if (!scaleMatch) continue;
    const num = parseFloat(scaleMatch[1]);
    if (isNaN(num) || num >= 1) continue;

    pressScales.push(num);

    if (num > 0 && num < 0.95) {
      // Check if this rule is a press/active context or a decorative context.
      // Press contexts: :active, .is-pressed, [data-press], .press
      const isPressContext = /:active|\.is-pressed|\[data-press|\.press\b/i.test(block);
      if (isPressContext) {
        activeBelowFloor = true;
        activeBelowVal = num.toString();
      } else {
        // Decorative — theme icon, hidden element, SVG transform, etc.
        // These are not press-feedback glitches.
        decorativeBelowFloor.push(num.toString());
      }
    }
  }

  // FAIL only if a below-floor scale is in an :active/press context.
  if (activeBelowFloor) {
    return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows (both above the 0.95 floor)', category: 'takt', status: 'FAIL', detail: `found scale(${activeBelowVal}) in :active context: below 0.95 floor, reads as a glitch` };
  }

  // Decorative below-floor scales: WARN (not a press glitch, but worth reviewing).
  if (decorativeBelowFloor.length > 0) {
    const realPressScales = pressScales.filter(s => s >= 0.95 && s < 1);
    if (realPressScales.length > 0) {
      const vals = realPressScales.map(s => s.toFixed(3)).join(', ');
      return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows (both above the 0.95 floor)', category: 'takt', status: 'PASS', detail: `${realPressScales.length} press-scale(s) found: ${vals}; ${decorativeBelowFloor.length} decorative scale(s) below floor (non-press, ignored)` };
    }
    return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows (both above the 0.95 floor)', category: 'takt', status: 'WARN', detail: `${decorativeBelowFloor.length} decorative scale(s) below 0.95 floor: ${decorativeBelowFloor.join(', ')} (outside :active context); no valid press scales found` };
  }

  const realPressScales = pressScales.filter(s => s > 0);
  if (realPressScales.length > 0) {
    const vals = realPressScales.map(s => s.toFixed(3)).join(', ');
    return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows (both above the 0.95 floor)', category: 'takt', status: 'PASS', detail: `${realPressScales.length} press-scale(s) found: ${vals}` };
  }
  // Only scale(0) found (animation initial states) — not a press scale signal.
  if (pressScales.length > 0) return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows (both above the 0.95 floor)', category: 'takt', status: 'WARN', detail: 'only scale(0) found (animation initial states): no press scale detected' };
  return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows (both above the 0.95 floor)', category: 'takt', status: 'WARN', detail: 'no press-scale (scale() < 1) found in CSS' };
}

// v17 — REAL line-height by role check. Scans for heading-tight (1.0-1.15)
// and body-relaxed (1.4-1.7) line-heights. Contract: headings 1.08, body 1.55.
function checkLineHeightByRole(css: string): CheckResult {
  const headingLhs = headingLineHeights(css).map((m) => parseFloat(m.groups[0] as string));
  const bodyLhs = bodyLineHeights(css).map((m) => parseFloat(m.groups[0] as string));
  const headingOk = headingLhs.some(lh => lh >= 1.0 && lh <= 1.15);
  const bodyOk = bodyLhs.some(lh => lh >= 1.4 && lh <= 1.7);
  if (headingOk && bodyOk) return { id: 'v17', item: 'Line-height by role: headings 1.08, body 1.55 confirmed', category: 'cadence', status: 'PASS', detail: `headings ${headingLhs.join(',') || 'n/a'}, body ${bodyLhs.join(',') || 'n/a'}` };
  if (headingLhs.length === 0 && bodyLhs.length === 0) return { id: 'v17', item: 'Line-height by role: headings 1.08, body 1.55 confirmed', category: 'cadence', status: 'WARN', detail: 'no role-scoped line-height declarations found' };
  const missing: string[] = [];
  if (!headingOk) missing.push('heading 1.0-1.15');
  if (!bodyOk) missing.push('body 1.4-1.7');
  return { id: 'v17', item: 'Line-height by role: headings 1.08, body 1.55 confirmed', category: 'cadence', status: 'WARN', detail: `missing: ${missing.join(', ')} (found headings ${headingLhs.join(',') || 'none'}, body ${bodyLhs.join(',') || 'none'})` };
}

// v20 — REAL ::selection check. Verifies ::selection is styled with a
// var(--signal) reference (or any non-default color). Browser default is
// #000/#fff text on #0000ff blue background — any custom rule beats that.
function checkSelectionStyled(css: string): CheckResult {
  const selMatch = selectionRules(css);
  if (!selMatch || selMatch.length === 0) return { id: 'v20', item: '::selection styled with var(--signal) instead of the browser default', category: 'cadence', status: 'WARN', detail: 'no ::selection rule found: browser default will show' };
  const usesSignal = selMatch.some(r => /var\(\s*--signal/i.test(r));
  const hasColor = selMatch.some(r => /(background|color)\s*:/i.test(r));
  if (usesSignal) return { id: 'v20', item: '::selection styled with var(--signal) instead of the browser default', category: 'cadence', status: 'PASS', detail: '::selection uses --signal token' };
  if (hasColor) return { id: 'v20', item: '::selection styled with var(--signal) instead of the browser default', category: 'cadence', status: 'PASS', detail: '::selection styled with custom color (token reference recommended)' };
  return { id: 'v20', item: '::selection styled with var(--signal) instead of the browser default', category: 'cadence', status: 'WARN', detail: '::selection rule exists but no color/background set' };
}

// v23 — REAL duration-token check. Verifies the contract's 5 duration tokens
// are present in :root (--duration, --duration-quick, --duration-fast,
// --duration-medium, --duration-slow). Accepts aliases (see TOKEN_ALIASES).
function checkDurationTokens(tokens: Record<string, string>): CheckResult {
  const required = ['--duration', '--duration-quick', '--duration-fast', '--duration-medium', '--duration-slow'];
  const present = required.filter(t => tokens[t]);
  const missing = required.filter(t => !tokens[t]);
  if (missing.length === 0) return { id: 'v23', item: 'Duration tokens --duration-quick through --duration-slow present in :root', category: 'motion', status: 'PASS', detail: `all 5 duration tokens present` };
  if (present.length >= 3) return { id: 'v23', item: 'Duration tokens --duration-quick through --duration-slow present in :root', category: 'motion', status: 'WARN', detail: `${present.length}/5 present, missing: ${missing.join(', ')}` };
  return { id: 'v23', item: 'Duration tokens --duration-quick through --duration-slow present in :root', category: 'motion', status: 'FAIL', detail: `only ${present.length}/5 duration tokens present, missing: ${missing.join(', ')}` };
}

// x01 — REAL font-synthesis check. Verifies font-synthesis: none is set
// (prevents browser from synthesizing bold/italic when real weights aren't
// loaded — a common cause of blurry headlines on Windows).
function checkFontSynthesis(css: string): CheckResult {
  if (/font-synthesis\s*:\s*none/i.test(css)) return { id: 'x01', item: 'font-synthesis: none set (Cadence resolved tension)', category: 'cadence', status: 'PASS', detail: 'font-synthesis: none declared' };
  if (/font-synthesis\s*:/i.test(css)) return { id: 'x01', item: 'font-synthesis: none set (Cadence resolved tension)', category: 'cadence', status: 'WARN', detail: 'font-synthesis declared but not set to none' };
  return { id: 'x01', item: 'font-synthesis: none set (Cadence resolved tension)', category: 'cadence', status: 'WARN', detail: 'no font-synthesis rule found: browser may synthesize missing weights' };
}

// x02 — REAL text-underline-position check. Verifies from-font (or
// under) is set so underlines use the font designer's position.
function checkUnderlinePosition(css: string): CheckResult {
  if (/text-underline-position\s*:\s*(from-font|under)/i.test(css)) return { id: 'x02', item: 'text-underline-position: from-font set (Cadence resolved tension)', category: 'cadence', status: 'PASS', detail: 'text-underline-position set to from-font/under' };
  if (/text-underline-position\s*:/i.test(css)) return { id: 'x02', item: 'text-underline-position: from-font set (Cadence resolved tension)', category: 'cadence', status: 'WARN', detail: 'text-underline-position declared but not from-font/under' };
  return { id: 'x02', item: 'text-underline-position: from-font set (Cadence resolved tension)', category: 'cadence', status: 'WARN', detail: 'no text-underline-position rule: browser default may clip descenders' };
}

// x03 — REAL text-decoration-skip-ink check. Verifies auto (or none) is set
// so underlines skip the rounded parts of letters (g, j, p, q, y).
function checkSkipInk(css: string): CheckResult {
  if (/text-decoration-skip-ink\s*:\s*(auto|none)/i.test(css)) return { id: 'x03', item: 'text-decoration-skip-ink: auto set', category: 'cadence', status: 'PASS', detail: 'text-decoration-skip-ink set to auto/none' };
  if (/text-decoration-skip-ink\s*:/i.test(css)) return { id: 'x03', item: 'text-decoration-skip-ink: auto set', category: 'cadence', status: 'WARN', detail: 'text-decoration-skip-ink declared but not auto/none' };
  return { id: 'x03', item: 'text-decoration-skip-ink: auto set', category: 'cadence', status: 'WARN', detail: 'no text-decoration-skip-ink rule: underlines may cross letterforms' };
}

// ── Tier 3 coverage checks (v24-v28) — high-impact gaps from the audit ──────

// v24 — Touch target sizes ≥44px (WCAG 2.5.5 Target Size Enhanced, AAA; 2.5.8 Minimum AA is 24px — this check enforces the stricter bar).
// Static half: scans CSS for min-height/min-width ≥44px on interactive selectors.
// Full verification needs a browser (getBoundingClientRect on rendered elements).
function checkTouchTargets(css: string): CheckResult {
  // Look for min-height/min-width ≥ 44px on button, a, input, [role=button] selectors.
  const targets: number[] = [];
  for (const m of touchTargetSizes(css)) {
    const val = parseFloat(m.groups[0] as string);
    const unit = (m.groups[1] as string).toLowerCase();
    const px = unit === 'rem' ? val * 16 : val;
    targets.push(px);
  }
  if (targets.length === 0) return { id: 'v24', item: 'Touch targets ≥44px on interactive elements (WCAG 2.5.5 Enhanced)', category: 'accessibility', status: 'WARN', detail: 'no explicit min-height/min-width on interactive selectors: full verification needs browser' };
  const below = targets.filter(t => t < 44);
  if (below.length > 0) return { id: 'v24', item: 'Touch targets ≥44px on interactive elements (WCAG 2.5.5 Enhanced)', category: 'accessibility', status: 'WARN', detail: `${targets.length} target(s) found, ${below.length} below 44px floor (${below.join(', ')}px)` };
  return { id: 'v24', item: 'Touch targets ≥44px on interactive elements (WCAG 2.5.5 Enhanced)', category: 'accessibility', status: 'PASS', detail: `${targets.length} interactive element(s) with min-height/width ≥44px` };
}

// v25 — Heading hierarchy: single h1, no skipped levels (h1→h3 jump = fail).
// Scans HTML for heading order. design-auditor + Lighthouse heading-order check.
function checkHeadingHierarchy(html: string): CheckResult {
  const visibleHtml = withoutScriptsAndStyles(html);
  const headings = [...visibleHtml.matchAll(/<h([1-6])\b/gi)];
  if (headings.length === 0) return { id: 'v25', item: 'Heading hierarchy: single h1, no skipped levels', category: 'accessibility', status: 'WARN', detail: 'no heading elements found: page may lack structure' };
  const levels = headings.map(h => parseInt(h[1]));
  const h1Count = levels.filter(l => l === 1).length;
  const h1Issue = h1Count === 0 ? 'no h1' : h1Count > 1 ? `${h1Count} h1s` : '';
  // Check for skipped levels: h1→h3, h2→h4, etc. (a jump of >1 is a skip).
  const skips: string[] = [];
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      skips.push(`h${levels[i - 1]}→h${levels[i]}`);
    }
  }
  const issues = [h1Issue, ...skips].filter(Boolean);
  if (issues.length === 0) return { id: 'v25', item: 'Heading hierarchy: single h1, no skipped levels', category: 'accessibility', status: 'PASS', detail: `single h1, ${headings.length} headings, no skipped levels` };
  if (issues.length === 1 && !h1Issue) return { id: 'v25', item: 'Heading hierarchy: single h1, no skipped levels', category: 'accessibility', status: 'WARN', detail: `skipped level: ${skips.join(', ')}` };
  if (h1Issue && skips.length === 0) return { id: 'v25', item: 'Heading hierarchy: single h1, no skipped levels', category: 'accessibility', status: 'WARN', detail: h1Issue };
  return { id: 'v25', item: 'Heading hierarchy: single h1, no skipped levels', category: 'accessibility', status: 'FAIL', detail: issues.join(', ') };
}

// v26 — Font family count ≤3 (design-auditor, Typography Master).
// Counts distinct font-family declarations. >3 = inconsistency signal.
//
// `tokens` is the :root custom-property table, used to resolve var() aliases to
// the family they actually reference — see the alias note in the loop.
/**
 * Resolve a family token to a real typeface name, following the alias chain.
 *
 * One level is not enough. The site's stack is two hops deep:
 *   --sans       -> var(--font-sans), -apple-system, ...
 *   --font-sans  -> 'Schibsted Grotesk', 'Schibsted Grotesk Fallback', ...  (next/font)
 * so resolving once yields the literal string "var(--font-sans)", which then
 * counts as its OWN family alongside the raw `geist` name that next/font also
 * emits — double-counting one typeface and failing the check.
 *
 * Follows up to `maxHops` links and normalizes the result. Returns null when the
 * chain does not terminate in a name (a cycle, or an unknown token), so the
 * caller can skip rather than attribute a family it cannot identify.
 *
 * THE FIRST LOOKUP BUG. Callers pass the var() capture group, which EXCLUDES the
 * leading `--` (`/var\(\s*--([\w-]+)/` captures `mono`), while the token map is
 * keyed WITH it. So `tokens[name]` missed, the loop never ran, and every aliased
 * declaration resolved to null and was skipped — the original over-count inverted
 * into UNDER-counting, which PASSES input the check never read. Measured before
 * the fix: five faces reached through declared aliases reported "0
 * family/families" and PASS; the same five declared directly reported "5
 * families" and WARN. Normalizing here rather than at each call site is
 * deliberate — four copies of this function exist across the engines.
 */
function resolveFamilyToken(
  tokens: Record<string, string>,
  name: string,
  maxHops = 4,
): string | null {
  // Accept `mono` and `--mono` alike — see the note above.
  const key = name.startsWith('--') ? name : `--${name}`;
  let current = tokens[key];
  for (let hop = 0; hop < maxHops && current; hop++) {
    const first = current.split(',')[0].trim().replace(/["']/g, '').toLowerCase();
    const ref = first.match(/^var\(\s*--([\w-]+)/);
    if (!ref) return first;
    current = tokens[`--${ref[1]}`];
  }
  return null;
}

function checkFontFamilyCount(css: string, tokens: Record<string, string>): CheckResult {
  const families = new Set<string>();
  const re = /font-family\s*:\s*([^;}]+)/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    // Normalize: strip quotes, take first family in a stack, lowercase.
    let stack = m[1].split(',')[0].trim().replace(/["']/g, '').toLowerCase();
    // Skip generic keywords that shouldn't count as "a family choice."
    const generic = ['inherit', 'initial', 'unset', 'revert', 'serif', 'sans-serif', 'monospace', 'system-ui', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica', 'arial'];
    if (generic.includes(stack)) continue;
    // A var() alias is a REFERENCE to a family token, not another family. The
    // site declares three stacks (--sans/--display/--mono); every component that
    // writes `font-family: var(--mono)` is choosing the SAME family, but counted
    // as a distinct name it inflated this check from 3 to 9 on the site and
    // failed a page that genuinely uses three faces. Resolve the alias through
    // the custom-property table so the count reflects faces, not spellings.
    if (stack.startsWith('var(')) {
      const ref = stack.match(/var\(\s*--([\w-]+)/);
      const resolved = ref ? resolveFamilyToken(tokens, ref[1]) : null;
      if (resolved) {
        stack = resolved;
        if (generic.includes(stack)) continue;
      } else {
        continue; // unresolvable alias — cannot attribute it to a family
      }
    }
    // next/font generates a synthetic metric-matched fallback face per family
    // ("Geist Fallback", "Fraunces Fallback") and applies it via font-family in
    // the adjusted @font-face. Those are not additional typeface choices — they
    // are the same family's fallback metrics — so they must not count as
    // palette drift.
    //
    // Engine 1.3.1: the WORD fallback anywhere in the name, not only as its
    // last word. A hand-tuned face can carry a suffix after it: designesy.org's
    // "Fraunces Fallback Tuned" is Times New Roman under size-adjust, drawn only
    // before Fraunces loads, and `\sfallback$` counted it as a fourth family
    // (v26 WARN, "4 families: fraunces fallback tuned, fraunces, ...").
    if (/\bfallback\b/.test(stack)) continue;
    families.add(stack);
  }
  const count = families.size;
  const list = [...families].slice(0, 6).join(', ');
  if (count <= 3) return { id: 'v26', item: 'Font family count ≤3 (body + heading + mono)', category: 'cadence', status: 'PASS', detail: `${count} family/families: ${list}` };
  if (count <= 5) return { id: 'v26', item: 'Font family count ≤3 (body + heading + mono)', category: 'cadence', status: 'WARN', detail: `${count} families (recommended ≤3): ${list}` };
  return { id: 'v26', item: 'Font family count ≤3 (body + heading + mono)', category: 'cadence', status: 'FAIL', detail: `${count} families, palette drift (recommended ≤3): ${list}` };
}

/**
 * v27 helper (engine 1.3.1): does this rule's selector style a form field
 * itself? True when the subject (the last compound) of any selector in the
 * list is an input, textarea or select element, or carries the exact class
 * .input or .field, and is not a pseudo-element (::placeholder does not set
 * the size iOS Safari reads). ".field-card-meta", ".input-hint", "::selection",
 * ".field label" and "user-select" are not fields.
 */
function isFieldSelector(selector: string): boolean {
  const clean = withoutCssComments(selector, ' ');
  return splitCssTopLevel(clean, ',').some((part) => {
    const compounds = part.trim().split(/\s*[>+~]\s*|\s+/);
    const subject = compounds[compounds.length - 1] || '';
    if (subject.indexOf('::') >= 0) return false;
    return /(?:^|[^\w.#:-])(?:input|textarea|select)(?![\w-])/i.test(subject)
      || /\.(?:input|field)(?![\w-])/i.test(subject);
  });
}

/**
 * v27 helper (engine 1.4.1): the rule whose body holds the declaration at an
 * offset, its selector read backwards from that body's opening brace to the
 * previous closing brace, opening brace or semicolon. The finder returns
 * [start, open], the selector being css.slice(start, open), or null when the
 * offset is not inside a rule body (a stray declaration, or a brace closed in
 * between).
 *
 * Engine 1.5.1: the finder lists the sheet's braces and semicolons once and
 * answers each offset by binary search. Before, each declaration ran three
 * lastIndexOf scans, each reading back to the last character of its kind, so
 * a sheet with no semicolons was read back to its start once per declaration
 * and cost the square of its length. Each answer is the one those scans gave.
 */
function ruleSelectorFinder(css: string): (offset: number) => [number, number] | null {
  const opens: number[] = [];
  const closes: number[] = [];
  const marks: number[] = [];
  for (let i = 0; i < css.length; i++) {
    const c = css.charCodeAt(i);
    if (c === 123) { opens.push(i); marks.push(i); } else if (c === 125) { closes.push(i); marks.push(i); } else if (c === 59) marks.push(i);
  }
  // The last entry at or before x in an ascending list, or -1.
  const atOrBefore = (list: number[], x: number): number => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 ? list[lo - 1] : -1;
  };
  return (offset: number) => {
    const at = Math.max(0, offset);
    const open = atOrBefore(opens, at);
    if (open < 0 || atOrBefore(closes, at) > open) return null;
    return [atOrBefore(marks, open - 1) + 1, open];
  };
}

/**
 * v27 helper (engine 1.4.1): for an offset, does the font-size declaration
 * there sit in a rule whose own selector names a field keyword (input, textarea, select,
 * .input, .field), the same words the literal scan looks for? v27's literal
 * regexes find a keyword and then the next rule body, and their `[^{]*` runs
 * across a closing brace. So the word "select" in `.chip { user-select: none }`
 * carried into `.chip-label { font-size: 12px }` and FAILed a page whose
 * fields were all 16px. The regexes still find the candidates; this reads the
 * selector of the rule each matched declaration actually sits in, and drops a
 * candidate whose own selector carries no keyword. Class names stay matched
 * as before (`.search-input`, `.form-select`): many sites style their fields
 * through such classes, and measured on the leaderboard cohort the stricter
 * isFieldSelector test dropped real fields (a 14px textarea, a 16px search
 * input's floor).
 */
function fieldRuleFinder(css: string): (offset: number) => boolean {
  const ruleAt = ruleSelectorFinder(css);
  let seen = -1;
  let verdict = false;
  return (offset: number) => {
    const rule = ruleAt(offset);
    if (rule === null) return false;
    // The declarations of one rule share its verdict (engine 1.5.1: each one
    // read the selector again).
    if (rule[1] !== seen) {
      seen = rule[1];
      verdict = /input|textarea|select|\.field/i.test(withoutCssComments(css.slice(rule[0], rule[1]), ' '));
    }
    return verdict;
  };
}

/**
 * v27 helper (engine 1.3.1): in each rule whose selector styles a field
 * (isFieldSelector), every `font-size: var(...)` declaration is rewritten to
 * its value from the :root token table, through substituteCssVars (var()
 * chains, and a var()'s own fallback where no token declares the name). A
 * value that does not resolve is left exactly as written, and so is every rule
 * that does not style a field: v27's literal scan matches its keywords
 * anywhere before a brace, so resolving var() in every rule would have read
 * designesy.org's `.field-card-meta { font-size: var(--text-label) }` (12.8px,
 * a card caption) as an input below 16px. Only values that start with var(
 * are touched; calc(), clamp() and min()/max() stay as written, as before.
 *
 * The scan is anchored on each `font-size: var(` and finds its rule's selector
 * through ruleSelectorFinder, so its cost is linear in the sheet. A
 * whole-sheet rule regex (`([^{}]*)\{([^{}]*)\}`) is quadratic on a long
 * @media prelude: measured at +4.5 s on five 43 KB preludes.
 */
function resolveFontSizeVars(css: string, tokens: Record<string, string>): string {
  if (css.indexOf('var(') < 0) return css;
  const parts: string[] = [];
  const ruleAt = ruleSelectorFinder(css);
  let seen = -1;
  let styled = false;
  let last = 0;
  for (const m of fontSizeVarMatches(css)) {
    const decl = m.text;
    const lead = m.groups[0] as string;
    const value = m.groups[1] as string;
    const offset = m.index;
    parts.push(css.slice(last, offset));
    last = offset + decl.length;
    // Not inside a rule body (a stray declaration, or a brace closed between).
    const rule = ruleAt(offset);
    if (rule === null) { parts.push(decl); continue; }
    if (rule[1] !== seen) { seen = rule[1]; styled = isFieldSelector(css.slice(rule[0], rule[1])); }
    if (!styled) { parts.push(decl); continue; }
    const sub = substituteCssVars(value, [tokens]);
    parts.push(sub === null ? decl : lead + sub.trim());
  }
  parts.push(css.slice(last));
  return parts.join('');
}

/**
 * v27 helper: does the delivered markup carry a field iOS Safari zooms into on
 * focus? That is a <textarea>, a <select>, or an <input> of any type except the
 * ones that take no typed text: hidden, checkbox, radio, submit, button, reset,
 * image, file, range and color. An <input> with no type is a text field.
 */
function hasZoomableField(html: string): boolean {
  const visible = withoutScriptsAndStyles(html);
  if (/<(?:textarea|select)\b/i.test(visible)) return true;
  const inputs = inputTags(visible);
  return inputs.some((tag) => {
    const type = /\stype\s*=\s*["']?([a-z-]+)/i.exec(tag);
    return !type || !/^(?:hidden|checkbox|radio|submit|button|reset|image|file|range|color)$/i.test(type[1]);
  });
}

// v27 — Input font-size 16px floor (iOS Safari auto-zoom prevention).
// Scans CSS for input/textarea/select font-size below 16px (1rem).
//
// Since engine 1.1.0 the page's own markup decides applicability. When the CSS
// shows neither a sub-16px input rule nor a 16px floor, a page with no field iOS
// can zoom into (hasZoomableField) has nothing to check and reads SKIP, as v38
// does for a page with no buttons. It used to read WARN. The CSS verdicts are
// unchanged: a sub-16px input rule still FAILs and a declared floor still PASSes,
// because both describe the stylesheet that fields rendered later by script
// would also inherit.
//
// Since engine 1.3.1 a font-size written as var() is read through the :root
// token table first (resolveFontSizeVars), so `input { font-size:
// var(--text-body) }` with `--text-body: 1rem` is the 16px floor it renders as.
// Both regexes below read literals only; before 1.3.1 that rule read WARN ("no
// explicit input font-size ≥16px detected") on designesy.org. A var() the table
// cannot resolve is left as written, so it reads as it did before.
function checkInputFontFloor(css: string, html: string, tokens: Record<string, string> = {}): CheckResult {
  const sheet = resolveFontSizeVars(css, tokens);
  const inFieldRule = fieldRuleFinder(sheet);
  // Find input/textarea/select rules with font-size < 16px or < 1rem.
  const below: string[] = [];
  for (const m of fieldFontSizes(sheet)) {
    // Engine 1.4.1: only a declaration whose own rule styles a field counts.
    if (!inFieldRule(m.index + m.text.lastIndexOf('font-size'))) continue;
    const val = parseFloat(m.groups[0] as string);
    const unit = (m.groups[1] as string).toLowerCase();
    const px = unit === 'rem' ? val * 16 : val;
    if (px < 16) below.push(`${val}${unit} (${px}px)`);
  }
  if (below.length === 0) {
    // Also check: is there a global input font-size ≥16px? (e.g. `input { font-size: 1rem }`)
    // The strict form `input\s*\{` matches standalone rules; the grouped form
    // `input,...,{` matches selectors merged by CSS minifiers (e.g. `input,textarea,select{font-size:1rem}`).
    // Engine 1.4.1: the floor rule must itself style a field, as above.
    let hasGlobalFloor = false;
    for (const f of fieldFontFloors(sheet)) {
      if (hasGlobalFloor) break;
      hasGlobalFloor = inFieldRule(f.index + f.text.lastIndexOf('font-size'));
    }
    if (hasGlobalFloor) return { id: 'v27', item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)', category: 'accessibility', status: 'PASS', detail: 'input font-size floor detected' };
    if (!hasZoomableField(html)) return { id: 'v27', item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)', category: 'accessibility', status: 'SKIP', detail: 'no text input, textarea or select found in HTML: nothing for the 16px floor to protect' };
    return { id: 'v27', item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)', category: 'accessibility', status: 'WARN', detail: 'no explicit input font-size ≥16px detected: iOS Safari may auto-zoom on focus' };
  }
  return { id: 'v27', item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)', category: 'accessibility', status: 'FAIL', detail: `${below.length} input(s) below 16px floor: ${below.join(', ')}` };
}

function checkReadingWidth(css: string): CheckResult {
  const ITEM = 'Reading width 45-75ch on prose containers';
  const CATEGORY = 'cadence';

  // Selectors that indicate a prose container. Matched against the selector
  // text of a rule, not the element tree — so `p`, `.prose`, `.lede`,
  // `.definition > p`, `.methodology-prose > p` all qualify, while `.grid`,
  // `.token-table`, `.row`, `.doctrine-cols` do not.
  const PROSE_SELECTOR = /(^|[\s,>+~])(p|article|blockquote|li|dd|dt|figcaption)\b|prose|lede|measure|reading|note\b|copy\b|body-text|text-block/i;
  // Containers that must never be treated as prose even if a class name
  // contains a prose-ish word (e.g. `.prose-grid`).
  const STRUCTURAL_SELECTOR = /grid|table|row|col\b|flex|swatch|chip|badge|tab\b|nav\b|toolbar|chart|canvas|pre\b|code\b|kbd/i;

  // Walk every rule block, capturing selector + declarations together.
  const proseInRange: number[] = [];
  const proseOutOfRange: number[] = [];
  const nonProse: number[] = [];

  for (const m of cssRuleBlocks(css)) {
    const selector = withoutCssComments(m.groups[0] as string, '').trim();
    const body = m.groups[1] as string;
    // Skip at-rule preludes (`@media (...)`, `@supports (...)`) — the block
    // body is walked on the next iteration when the inner rule is seen. A
    // media query wrapping prose rules should not itself be classified.
    if (selector.startsWith('@')) continue;

    const widthMatch = /max-width\s*:\s*(\d+(?:\.\d+)?)ch/i.exec(body);
    if (!widthMatch) continue;
    const value = parseFloat(widthMatch[1]);

    const isProse = PROSE_SELECTOR.test(selector) && !STRUCTURAL_SELECTOR.test(selector);
    if (!isProse) { nonProse.push(value); continue; }
    if (value >= 45 && value <= 75) proseInRange.push(value);
    else proseOutOfRange.push(value);
  }

  if (proseInRange.length > 0) {
    const detail = proseOutOfRange.length > 0
      ? `${proseInRange.length} prose measure(s) in 45-75ch: ${proseInRange.join(', ')}ch (also ${proseOutOfRange.length} prose rule(s) outside the band: ${proseOutOfRange.join(', ')}ch)`
      : `${proseInRange.length} prose measure(s) in 45-75ch: ${proseInRange.join(', ')}ch`;
    return { id: 'v28', item: ITEM, category: CATEGORY, status: 'PASS', detail };
  }

  if (nonProse.length > 0 && proseOutOfRange.length === 0) {
    return {
      id: 'v28', item: ITEM, category: CATEGORY, status: 'WARN',
      detail: `${nonProse.length} ch-based max-width rule(s) found (${nonProse.join(', ')}ch) but none target a prose container: line length on paragraphs is unconstrained. Add the measure to your prose selectors (p, article, .prose), not to a grid or table.`,
    };
  }

  if (proseOutOfRange.length > 0) {
    return {
      id: 'v28', item: ITEM, category: CATEGORY, status: 'WARN',
      detail: `${proseOutOfRange.length} prose rule(s) found, all outside 45-75ch: ${proseOutOfRange.join(', ')}ch`,
    };
  }

  return {
    id: 'v28', item: ITEM, category: CATEGORY, status: 'WARN',
    detail: 'no max-width in ch units found: line length may exceed 75ch on wide screens',
  };
}

// ── Tier 5: token-layer completeness (v29) — DSAF A1.1 wedge ────────────────
// Detects primitive → semantic → component token architecture from :root.
// Per AnySearch research: 3-layer is rare on live sites (DTCG spec v1 stable
// Oct 2025), so 2-layer is the passing bar, 3-layer is a bonus maturity signal.
// FAIL = zero var() references (everything hardcoded). PASS = ≥2 layers. BONUS
// = 3 layers (reported in detail, no separate status).
function checkTokenLayerDepth(tokens: Record<string, string>): CheckResult {
  const RAW_RE = /^(#([0-9a-f]{3,8})$|rgba?\(|hsla?\(|oklch|lab|color|[-\d.]+(px|rem|em|ms|s|%|vh|vw|deg))/i;
  const REF_RE = /^var\(\s*--([\w-]+)\s*(?:,\s*(.+))?\)\s*$/i;

  let primitiveCount = 0;
  let semanticCount = 0; // var() pointing to a raw value
  let componentCount = 0; // var() pointing to another var()
  let noRefCount = 0;

  for (const [name, value] of Object.entries(tokens)) {
    const refMatch = value.match(REF_RE);
    if (!refMatch) {
      // Not a var() reference — is it a raw value?
      if (RAW_RE.test(value.trim())) primitiveCount++;
      else noRefCount++;
      continue;
    }
    // It's a var() reference — check what it points to.
    const refName = `--${refMatch[1]}`;
    const refValue = tokens[refName];
    if (!refValue) {
      // Points to an undefined token — count as semantic (can't verify depth).
      semanticCount++;
      continue;
    }
    const nestedRef = refValue.match(REF_RE);
    if (nestedRef) {
      // var() pointing to another var() → component layer (2+ hops)
      componentCount++;
    } else {
      // var() pointing to a raw value → semantic layer (1 hop)
      semanticCount++;
    }
  }

  const hasVarRefs = semanticCount + componentCount > 0;
  if (!hasVarRefs && primitiveCount === 0) {
    return { id: 'v29', item: 'Token architecture: primitive → semantic → component layers', category: 'tokens', status: 'SKIP', detail: 'no design tokens detected in :root' };
  }
  if (!hasVarRefs) {
    return { id: 'v29', item: 'Token architecture: primitive → semantic → component layers', category: 'tokens', status: 'WARN', detail: `${primitiveCount} primitive token(s), zero var() references: no aliasing layer` };
  }
  const layers = (primitiveCount > 0 ? 1 : 0) + (semanticCount > 0 ? 1 : 0) + (componentCount > 0 ? 1 : 0);
  const detail = `${layers} layer(s): ${primitiveCount} primitive, ${semanticCount} semantic, ${componentCount} component`;
  if (layers >= 3) {
    return { id: 'v29', item: 'Token architecture: primitive → semantic → component layers', category: 'tokens', status: 'PASS', detail: `${detail}: full 3-tier architecture (DSAF A1.1 maturity)` };
  }
  if (layers >= 2) {
    return { id: 'v29', item: 'Token architecture: primitive → semantic → component layers', category: 'tokens', status: 'PASS', detail: `${detail}: 2-tier aliasing detected` };
  }
  return { id: 'v29', item: 'Token architecture: primitive → semantic → component layers', category: 'tokens', status: 'WARN', detail: `${detail}: only 1 layer, no aliasing` };
}

// ── Semantic category checks (v42, v43) ─────────────────────────────────────
// The semantic category (weight 12) scores whether a site's color system
// speaks in ROLES (meaning) rather than hues (wavelength). The contract's own
// palette is fully role-named (--ink, --paper, --surface, --signal, --ok,
// --warn, --error), and role-based naming is the documented best practice
// (zeroheight naming guide 2026, Material 3 "named for how or where they're
// used", NYS DS "do not use primitive tokens directly"). Both checks are
// WARN-only (style-craft, not user harm) per the engine's calibration
// precedent for style checks, and both self-SKIP when a site has no color
// tokens to assess — no scope-tier registration needed.

// Role words name USAGE; hue words name WAVELENGTH; numeric scale suffixes
// (-100…-999) mark primitive palettes. Tokens matching neither list are
// neutral (brand coinages like --shimmer-1) and are excluded from the share.
const SEMANTIC_ROLE_WORDS = [
  'ink', 'paper', 'surface', 'muted', 'border', 'line', 'content', 'text',
  'foreground', 'background', 'accent', 'signal', 'brand', 'primary',
  'secondary', 'tertiary', 'danger', 'error', 'success', 'warning', 'warn',
  'info', 'ok', 'fail', 'link', 'focus', 'disabled', 'placeholder',
  'selection', 'canvas', 'overlay', 'scrim', 'highlight', 'active', 'hover',
  'pressed', 'elevated', 'lifted', 'raised', 'dim', 'faint', 'strong',
];
const SEMANTIC_HUE_WORDS = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink',
  'rose', 'slate', 'gray', 'grey', 'zinc', 'neutral', 'stone', 'brown',
  'black', 'white', 'mint', 'magenta', 'crimson', 'navy', 'olive', 'maroon',
  'gold', 'silver', 'bronze', 'coral', 'salmon', 'peach', 'plum', 'lavender',
  'turquoise', 'azure', 'jade', 'burgundy', 'charcoal', 'ivory', 'sepia',
  'rust', 'sand', 'cream',
];

function isColorValue(value: string): boolean {
  return /^(#|rgb|hsl|oklch|oklab|lab|lch|color\()/i.test(value.trim());
}

function classifyColorToken(name: string): 'role' | 'hue' | 'neutral' {
  const segments = name.toLowerCase().split(/[-_]/).filter(Boolean);
  if (segments.some((s) => SEMANTIC_ROLE_WORDS.includes(s))) return 'role';
  const last = segments[segments.length - 1] ?? '';
  if (segments.some((s) => SEMANTIC_HUE_WORDS.includes(s)) || /^\d{2,3}$/.test(last)) return 'hue';
  return 'neutral';
}

/**
 * The color tokens v42 and v43 read, and the palette layer among them
 * (engine 1.3.0).
 *
 * A token is a color token when its value is written as a color, or when,
 * with var() aliases followed through the token set, it is one. Until 1.3.0 only a literal counted, so a
 * role token that aliases a primitive (--error: var(--red-700), the structure
 * v42's own remediation recommends) was dropped before classification and the
 * verdict inverted: a site that did what the check asks scored worse.
 *
 * The palette layer is every hue-named color token that a role-named token
 * reaches through its aliases. That is the two-tier structure the token
 * standards describe: DTCG 2025.10 §3.8 defines an alias as a token whose
 * value references another (its example is $color-text-primary aliasing
 * $color-palette-black); Spectrum's primitive tokens "are typically used
 * indirectly through semantic tokens as an alias"; Primer's base tokens are
 * "generally used as a reference for functional tokens"; Material's reference
 * tokens hold the concrete values that system tokens give roles to. A palette
 * used that way is not a hue vocabulary, so it leaves v42's denominator. A
 * hue-named token that no role token reaches is consumed directly, or not at
 * all, and still counts against the role share.
 */
function colorTokenTiers(tokens: Record<string, string>): { color: string[]; palette: Set<string> } {
  const refs = (value: string): string[] => [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
  // A value written as a color counts as one, as before 1.3.0, even when its
  // var() cannot be followed (hsl(var(--x)) whose --x refers back to itself);
  // anything else counts when its aliases resolve to a color.
  const color = Object.keys(tokens).filter((name) => {
    if (isColorValue(tokens[name])) return true;
    const resolved = substituteCssVars(tokens[name], [tokens]);
    return resolved !== null && isColorValue(resolved);
  });
  const reached = new Set<string>();
  const queue = color.filter((name) => classifyColorToken(name) === 'role').flatMap((name) => refs(tokens[name]));
  while (queue.length > 0) {
    const name = queue.pop() as string;
    if (reached.has(name) || !Object.prototype.hasOwnProperty.call(tokens, name)) continue;
    reached.add(name);
    queue.push(...refs(tokens[name]));
  }
  return { color, palette: new Set(color.filter((name) => reached.has(name) && classifyColorToken(name) === 'hue')) };
}

function checkSemanticColorVocabulary(tokens: Record<string, string>): CheckResult {
  const item = 'Semantic color vocabulary: tokens named by role rather than hue';
  const { color, palette } = colorTokenTiers(tokens);
  if (color.length < 4) {
    return { id: 'v42', item, category: 'semantic', status: 'SKIP', detail: `too few color tokens to assess (${color.length})` };
  }
  let role = 0;
  let hue = 0;
  for (const name of color) {
    if (palette.has(name)) continue;
    const c = classifyColorToken(name);
    if (c === 'role') role++;
    else if (c === 'hue') hue++;
  }
  const named = role + hue;
  if (named === 0) {
    return { id: 'v42', item, category: 'semantic', status: 'SKIP', detail: `${color.length} color tokens, all neutrally named: vocabulary unclassifiable` };
  }
  const share = Math.round((role / named) * 100);
  const layer = palette.size > 0 ? `; ${palette.size} hue-named primitive(s) that role tokens alias are the palette layer, not counted` : '';
  if (role >= 3 && share >= 60) {
    return { id: 'v42', item, category: 'semantic', status: 'PASS', detail: `${role} role-named vs ${hue} hue-named color tokens (${share}% role share): colors are named by role${layer}` };
  }
  return { id: 'v42', item, category: 'semantic', status: 'WARN', detail: `${role} role-named vs ${hue} hue-named color tokens (${share}% role share): color vocabulary leans on hue names${layer}` };
}

// v43 reads the same color tokens as v42, aliases followed, so --error:
// var(--red-700) is an error family. The palette layer needs no exclusion
// here: v43 counts families, and a hue-named primitive is never one.
function checkSemanticStatusRoles(tokens: Record<string, string>): CheckResult {
  const item = 'Semantic status colors: ok/warn/error/info state roles present';
  const { color } = colorTokenTiers(tokens);
  if (color.length === 0) {
    return { id: 'v43', item, category: 'semantic', status: 'SKIP', detail: 'no color tokens in :root' };
  }
  const families: Record<string, boolean> = { ok: false, warn: false, error: false, info: false };
  for (const name of color) {
    const segments = name.toLowerCase().split(/[-_]/);
    if (segments.some((s) => ['ok', 'success', 'pass', 'positive'].includes(s))) families.ok = true;
    if (segments.some((s) => ['warn', 'warning', 'caution'].includes(s))) families.warn = true;
    // 'destructive' is shadcn/ui's error role (--destructive); engine 1.3.1.
    if (segments.some((s) => ['error', 'danger', 'fail', 'critical', 'negative', 'destructive'].includes(s))) families.error = true;
    if (segments.some((s) => ['info', 'notice', 'informational'].includes(s))) families.info = true;
  }
  const found = Object.entries(families).filter(([, v]) => v).map(([k]) => k);
  const missing = Object.entries(families).filter(([, v]) => !v).map(([k]) => k);
  if (found.length >= 3) {
    return { id: 'v43', item, category: 'semantic', status: 'PASS', detail: `${found.length}/4 status families present (${found.join(', ')}): states expressed as semantic roles` };
  }
  return { id: 'v43', item, category: 'semantic', status: 'WARN', detail: `${found.length}/4 status families present${found.length ? ` (${found.join(', ')})` : ''}; missing: ${missing.join(', ')}` };
}

// ── v44, v45: a CSS rule model, theme-aware colour resolution ───────────────
// Both checks need more structure than one regex over the whole sheet can give:
// which rule a declaration sits in, which at-rules wrap it, and what each
// custom property resolves to in each theme. parseCssRules walks the sheet once
// with a character loop (no regex over the whole sheet, so no backtracking on
// long brace-free runs) and returns every style rule with its declarations,
// the at-rule preludes around it and its source order, plus every @keyframes
// block. Native nesting resolves `&` to `:is(parent)`.

type CssRuleBlock = { selector: string; decls: string; at: string[]; order: number };
type CssKeyframesBlock = { name: string; frames: Array<{ selector: string; decls: string }> };
type CssDecl = { prop: string; value: string; important: boolean };
type Rgba = [number, number, number, number];

function stripCssComments(css: string): string {
  const out: string[] = [];
  const n = css.length;
  let last = 0;
  let i = 0;
  while (i < n) {
    const c = css.charCodeAt(i);
    if (c === 47 && css.charCodeAt(i + 1) === 42) {
      out.push(css.slice(last, i), ' ');
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      last = i;
      continue;
    }
    if (c === 34 || c === 39) {
      i++;
      while (i < n) {
        const d = css.charCodeAt(i);
        if (d === 92) { i += 2; continue; }
        i++;
        if (d === c || d === 10) break;
      }
      continue;
    }
    i++;
  }
  out.push(css.slice(last));
  return out.join('');
}

/** Split at top-level separators, outside parentheses, brackets and quotes. */
function splitCssTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let from = 0;
  const push = (to: number) => {
    const piece = s.slice(from, to).trim();
    if (piece) out.push(piece);
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    else if (depth === 0 && (sep === ' ' ? ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === '\f' : ch === sep)) {
      push(i);
      from = i + 1;
    }
  }
  push(s.length);
  return out;
}

/** A selector on one line, cut to 120 characters, for a finding. */
function shortSelector(selector: string): string {
  const one = selector.replace(/\s+/g, ' ').trim();
  return one.length > 120 ? `${one.slice(0, 117)}...` : one;
}

// v44 and v45 read the same sheet; the second parse of the same string is
// served from here.
let lastCssParse: { css: string; result: { rules: CssRuleBlock[]; keyframes: CssKeyframesBlock[] } } | null = null;

function parseCssRules(css: string): { rules: CssRuleBlock[]; keyframes: CssKeyframesBlock[] } {
  if (lastCssParse && lastCssParse.css === css) return lastCssParse.result;
  const result = parseCssRulesUncached(css);
  lastCssParse = { css, result };
  return result;
}

// Engine 1.5.1: limits that only a malformed or hostile sheet reaches. The
// leaderboard cohort, measured 2026-10-15, nests at most 6 levels deep and
// leaves at most one block open at the end of a page's CSS. A brace that
// would open a level deeper than CSS_MAX_NESTING is read as text of the block
// it sits in. At the end of the sheet at most CSS_MAX_OPEN_AT_END blocks left
// open are closed and read, innermost first: each one reads to the end of the
// sheet, so every further one was another full copy of the rest of it, and a
// short sheet that left many blocks open cost seconds.
const CSS_MAX_NESTING = 16;
const CSS_MAX_OPEN_AT_END = 4;

function parseCssRulesUncached(css: string): { rules: CssRuleBlock[]; keyframes: CssKeyframesBlock[] } {
  const src = stripCssComments(css);
  const n = src.length;
  const rules: CssRuleBlock[] = [];
  const keyframes: CssKeyframesBlock[] = [];
  type Frame = {
    kind: 'rule' | 'group' | 'keyframes' | 'frame' | 'other';
    prelude: string;
    selector: string;
    at: string[];
    parts: string[];
    segStart: number;
    kf: CssKeyframesBlock | null;
  };
  const stack: Frame[] = [];
  let order = 0;
  let start = 0;
  let paren = 0;
  let overflow = 0;
  const close = (f: Frame, end: number) => {
    f.parts.push(src.slice(f.segStart, end));
    const decls = f.parts.join(' ').trim();
    if (f.kind === 'frame' && f.kf) f.kf.frames.push({ selector: f.prelude.toLowerCase(), decls });
    else if ((f.kind === 'rule' || (f.kind === 'group' && f.selector)) && decls) {
      rules.push({ selector: f.selector, decls, at: f.at, order: order++ });
    }
  };
  let i = 0;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c === 34 || c === 39) {
      i++;
      while (i < n) {
        const d = src.charCodeAt(i);
        if (d === 92) { i += 2; continue; }
        i++;
        if (d === c || d === 10) break;
      }
      continue;
    }
    // An unquoted url(...) may hold braces and semicolons: skip it whole. A
    // quoted one is read as a string, because its text can hold `)`
    // (`url("data:...filter='url(%23n)'...")`).
    if ((c === 117 || c === 85) && src.slice(i, i + 4).toLowerCase() === 'url(') {
      let j = i + 4;
      while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) j++;
      if (src[j] !== '"' && src[j] !== "'") {
        const end = src.indexOf(')', j);
        i = end < 0 ? n : end + 1;
        continue;
      }
    }
    if (c === 40) { paren++; i++; continue; }
    if (c === 41) { if (paren > 0) paren--; i++; continue; }
    if (c === 59) { if (paren === 0) start = i + 1; i++; continue; }
    if (c === 123) {
      paren = 0;
      if (stack.length >= CSS_MAX_NESTING) { overflow++; start = i + 1; i++; continue; }
      const prelude = src.slice(start, i).trim();
      const parent = stack.length ? stack[stack.length - 1] : null;
      if (parent) parent.parts.push(src.slice(parent.segStart, start));
      const at = parent ? parent.at : [];
      const ctx = parent && (parent.kind === 'rule' || parent.kind === 'group') ? parent.selector : '';
      let f: Frame;
      if (prelude.startsWith('@')) {
        const name = (/^@([\w-]+)/.exec(prelude)?.[1] ?? '').toLowerCase();
        if (/keyframes$/.test(name)) {
          const kf: CssKeyframesBlock = { name: prelude.slice(name.length + 1).trim().replace(/^["']|["']$/g, ''), frames: [] };
          keyframes.push(kf);
          f = { kind: 'keyframes', prelude, selector: '', at, parts: [], segStart: i + 1, kf };
        } else if (/^(media|supports|layer|container|document|-moz-document|scope|starting-style)$/.test(name)) {
          f = { kind: 'group', prelude, selector: ctx, at: [...at, prelude.toLowerCase()], parts: [], segStart: i + 1, kf: null };
        } else {
          f = { kind: 'other', prelude, selector: '', at, parts: [], segStart: i + 1, kf: null };
        }
      } else if (parent && parent.kind === 'keyframes') {
        f = { kind: 'frame', prelude, selector: '', at, parts: [], segStart: i + 1, kf: parent.kf };
      } else if (parent && (parent.kind === 'other' || parent.kind === 'frame')) {
        f = { kind: 'other', prelude, selector: '', at, parts: [], segStart: i + 1, kf: null };
      } else {
        const selector = ctx
          ? splitCssTopLevel(prelude, ',').map((p) => (p.includes('&') ? p.replace(/&/g, `:is(${ctx})`) : `:is(${ctx}) ${p}`)).join(', ')
          : prelude;
        f = { kind: 'rule', prelude, selector, at, parts: [], segStart: i + 1, kf: null };
      }
      stack.push(f);
      start = i + 1;
      i++;
      continue;
    }
    if (c === 125) {
      paren = 0;
      if (overflow > 0) { overflow--; start = i + 1; i++; continue; }
      const f = stack.pop();
      if (f) {
        close(f, i);
        const parent = stack.length ? stack[stack.length - 1] : null;
        if (parent) parent.segStart = i + 1;
      }
      start = i + 1;
      i++;
      continue;
    }
    i++;
  }
  for (let closed = 0; stack.length; closed++) {
    const f = stack.pop();
    if (f && closed < CSS_MAX_OPEN_AT_END) close(f, n);
  }
  return { rules, keyframes };
}

function parseCssDecls(decls: string): CssDecl[] {
  const out: CssDecl[] = [];
  for (const raw of splitCssTopLevel(decls, ';')) {
    const colon = raw.indexOf(':');
    if (colon <= 0) continue;
    const name = raw.slice(0, colon).trim();
    if (!/^-{0,2}[a-zA-Z_][\w-]*$/.test(name)) continue;
    let value = raw.slice(colon + 1).trim();
    const cut = importantSuffixStart(value);
    const important = cut >= 0;
    if (important) value = value.slice(0, cut).trim();
    out.push({ prop: name.startsWith('--') ? name : name.toLowerCase(), value, important });
  }
  return out;
}

/** Each var(--x[, fallback]) replaced by its value in the first scope that declares it. */
function substituteCssVars(value: string, scope: Array<Record<string, string>>, depth = 0): string | null {
  if (depth > 16) return null;
  let out = '';
  let i = 0;
  for (;;) {
    const k = value.indexOf('var(', i);
    if (k < 0) return out + value.slice(i);
    out += value.slice(i, k);
    let d = 0;
    let j = k + 3;
    for (; j < value.length; j++) {
      if (value[j] === '(') d++;
      else if (value[j] === ')' && --d === 0) break;
    }
    if (j >= value.length) return null;
    const inner = value.slice(k + 4, j);
    const parts = splitCssTopLevel(inner, ',');
    const name = (parts[0] ?? '').trim();
    const comma = inner.indexOf(',');
    const fallback = comma < 0 ? null : inner.slice(comma + 1).trim();
    let rep: string | null = null;
    for (const s of scope) {
      if (Object.prototype.hasOwnProperty.call(s, name)) { rep = s[name]; break; }
    }
    if (rep === null) rep = fallback;
    if (rep === null) return null;
    const sub = substituteCssVars(rep, scope, depth + 1);
    if (sub === null) return null;
    out += sub;
    i = j + 1;
  }
}

const CSS_NAMED_COLORS: Record<string, Rgba> = {
  transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1],
  red: [255, 0, 0, 1], green: [0, 128, 0, 1], blue: [0, 0, 255, 1], yellow: [255, 255, 0, 1],
  orange: [255, 165, 0, 1], gray: [128, 128, 128, 1], grey: [128, 128, 128, 1],
  silver: [192, 192, 192, 1], maroon: [128, 0, 0, 1], purple: [128, 0, 128, 1],
  navy: [0, 0, 128, 1], teal: [0, 128, 128, 1], olive: [128, 128, 0, 1], lime: [0, 255, 0, 1],
};

function srgbToOklab(rgb: [number, number, number]): [number, number, number] {
  const lin = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]);
  const m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]);
  const s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Oklab to 0-255 sRGB, clipped per channel to the sRGB gamut. */
function oklabToSrgb(lab: [number, number, number]): [number, number, number] {
  const [L, a, b] = lab;
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((c) => {
    const x = Math.min(1, Math.max(0, c));
    const g = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, g)) * 255;
  }) as [number, number, number];
}

function cssNumber(token: string, percentScale: number): number | null {
  const t = token.trim().toLowerCase();
  if (t === 'none') return 0;
  const m = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%|deg|turn|rad|grad)?$/.exec(t);
  if (!m) return null;
  const x = parseFloat(m[1]);
  if (m[2] === '%') return (x / 100) * percentScale;
  if (m[2] === 'turn') return x * 360;
  if (m[2] === 'rad') return (x * 180) / Math.PI;
  if (m[2] === 'grad') return x * 0.9;
  return x;
}

function cssAlpha(token: string | undefined): number | null {
  if (token === undefined) return 1;
  const a = cssNumber(token, 1);
  return a === null ? null : Math.min(1, Math.max(0, a));
}

/** Function arguments as [c1, c2, c3, alpha?], comma or space syntax. */
function cssColorArgs(args: string): string[] | null {
  const slash = splitCssTopLevel(args, '/');
  const head = slash[0] ?? '';
  const channels = head.includes(',') ? splitCssTopLevel(head, ',') : splitCssTopLevel(head, ' ');
  if (slash.length === 2) channels.push(slash[1]);
  if (slash.length > 2 || channels.length < 3 || channels.length > 4) return null;
  return channels;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 360;
  const f = (n: number) => {
    const k = (n + hh * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * A CSS colour value, vars already substituted, to [r, g, b, alpha] in 0-255
 * sRGB. Hex, the common named colours, rgb(), hsl(), oklch(), oklab(),
 * color(srgb), light-dark(), color-mix() in srgb, oklab or oklch (premultiplied,
 * rounded to 8 bits as a browser paints it), and the identity form of relative
 * colour syntax (`rgb(from X r g b / a)`). Anything else returns null: an
 * unmeasurable colour is left out, never guessed.
 */
function parseCssColor(input: string, dark: boolean, depth = 0): Rgba | null {
  if (depth > 8) return null;
  const v = input.trim().toLowerCase();
  if (!v) return null;
  if (v[0] === '#') {
    const hex = v.slice(1);
    if (!/^[0-9a-f]+$/.test(hex) || ![3, 4, 6, 8].includes(hex.length)) return null;
    const full = hex.length <= 4 ? hex.split('').map((c) => c + c).join('') : hex;
    const ch = [0, 2, 4, 6].map((k) => (k < full.length ? parseInt(full.slice(k, k + 2), 16) : 255));
    return [ch[0], ch[1], ch[2], ch[3] / 255];
  }
  // Own keys only: 'constructor' or 'toString' as a value read Object.prototype
  // and threw, which failed the whole score (engine 1.3.0 reads token values here).
  if (Object.prototype.hasOwnProperty.call(CSS_NAMED_COLORS, v)) return [...CSS_NAMED_COLORS[v]] as Rgba;
  const fn = /^([a-z-]+)\(([\s\S]*)\)$/.exec(v);
  if (!fn) return null;
  const name = fn[1];
  const args = fn[2].trim();
  if (name === 'light-dark') {
    const pair = splitCssTopLevel(args, ',');
    return pair.length === 2 ? parseCssColor(pair[dark ? 1 : 0], dark, depth + 1) : null;
  }
  if (name === 'color-mix') {
    const parts = splitCssTopLevel(args, ',');
    if (parts.length !== 3) return null;
    const space = /^in\s+([a-z-]+)/.exec(parts[0])?.[1] ?? '';
    if (!['srgb', 'oklab', 'oklch'].includes(space)) return null;
    const side = (p: string) => {
      const after = percentAfter(p);
      const before = percentBefore(p);
      if (after) return { color: after[1], pct: parseFloat(after[2]) / 100 };
      if (before) return { color: before[2], pct: parseFloat(before[1]) / 100 };
      return { color: p, pct: null as number | null };
    };
    const a = side(parts[1]);
    const b = side(parts[2]);
    const ca = parseCssColor(a.color, dark, depth + 1);
    const cb = parseCssColor(b.color, dark, depth + 1);
    if (!ca || !cb) return null;
    let p1 = a.pct;
    let p2 = b.pct;
    if (p1 === null && p2 === null) { p1 = 0.5; p2 = 0.5; }
    else if (p1 === null) p1 = 1 - (p2 as number);
    else if (p2 === null) p2 = 1 - p1;
    const sum = (p1 as number) + (p2 as number);
    if (sum <= 0) return null;
    const w1 = (p1 as number) / sum;
    const w2 = (p2 as number) / sum;
    const alpha = ca[3] * w1 + cb[3] * w2;
    if (alpha <= 0) return [0, 0, 0, 0];
    let rgb: [number, number, number];
    if (space === 'srgb') {
      rgb = [0, 1, 2].map((k) => (ca[k] * ca[3] * w1 + cb[k] * cb[3] * w2) / alpha) as [number, number, number];
    } else {
      const la = srgbToOklab([ca[0], ca[1], ca[2]]);
      const lb = srgbToOklab([cb[0], cb[1], cb[2]]);
      let lab: [number, number, number];
      if (space === 'oklab') {
        lab = [0, 1, 2].map((k) => (la[k] * ca[3] * w1 + lb[k] * cb[3] * w2) / alpha) as [number, number, number];
      } else {
        const lch = (x: [number, number, number]) => [x[0], Math.hypot(x[1], x[2]), (Math.atan2(x[2], x[1]) * 180) / Math.PI];
        const A = lch(la);
        const B = lch(lb);
        let h1 = A[2];
        let h2 = B[2];
        if (A[1] < 1e-4) h1 = h2;
        if (B[1] < 1e-4) h2 = h1;
        if (h2 - h1 > 180) h1 += 360;
        else if (h1 - h2 > 180) h2 += 360;
        const L = (A[0] * ca[3] * w1 + B[0] * cb[3] * w2) / alpha;
        const C = (A[1] * ca[3] * w1 + B[1] * cb[3] * w2) / alpha;
        const H = ((h1 * w1 + h2 * w2) * Math.PI) / 180;
        lab = [L, C * Math.cos(H), C * Math.sin(H)];
      }
      rgb = oklabToSrgb(lab);
    }
    const mult = Math.min(1, sum);
    return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), Math.round(alpha * mult * 255) / 255];
  }
  const rel = relativeColorMatch(args);
  if (rel) {
    const base = parseCssColor(rel[1] as string, dark, depth + 1);
    if (!base) return null;
    const a = rel[3] === undefined ? base[3] : cssAlpha(rel[3]);
    return a === null ? null : [base[0], base[1], base[2], a];
  }
  if (name === 'color') {
    const m = /^srgb\s+([\s\S]+)$/.exec(args);
    const ch = m ? cssColorArgs(m[1]) : null;
    if (!ch) return null;
    const c = ch.slice(0, 3).map((t) => cssNumber(t, 1));
    const a = cssAlpha(ch[3]);
    if (c.some((x) => x === null) || a === null) return null;
    return [(c[0] as number) * 255, (c[1] as number) * 255, (c[2] as number) * 255, a];
  }
  const ch = cssColorArgs(args);
  if (!ch) return null;
  const alpha = cssAlpha(ch[3]);
  if (alpha === null) return null;
  if (name === 'rgb' || name === 'rgba') {
    const c = ch.slice(0, 3).map((t) => cssNumber(t, 255));
    if (c.some((x) => x === null)) return null;
    return [...(c as number[]).map((x) => Math.min(255, Math.max(0, x))), alpha] as Rgba;
  }
  if (name === 'hsl' || name === 'hsla') {
    const h = cssNumber(ch[0], 1);
    const s = cssNumber(ch[1].endsWith('%') ? ch[1] : `${ch[1]}%`, 1);
    const l = cssNumber(ch[2].endsWith('%') ? ch[2] : `${ch[2]}%`, 1);
    if (h === null || s === null || l === null) return null;
    return [...hslToRgb(h, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l))), alpha] as Rgba;
  }
  if (name === 'oklch' || name === 'oklab') {
    const L = cssNumber(ch[0], 1);
    const x = cssNumber(ch[1], 0.4);
    const y = cssNumber(ch[2], name === 'oklch' ? 1 : 0.4);
    if (L === null || x === null || y === null) return null;
    const lab: [number, number, number] = name === 'oklch'
      ? [L, x * Math.cos((y * Math.PI) / 180), x * Math.sin((y * Math.PI) / 180)]
      : [L, x, y];
    return [...oklabToSrgb(lab), alpha] as Rgba;
  }
  return null;
}

/** A token value resolved to a colour in a theme scope; bare HSL channels read as hsl(). */
function resolveThemeColor(value: string, scope: Array<Record<string, string>>, dark: boolean): Rgba | null {
  const sub = substituteCssVars(value, scope);
  if (sub === null) return null;
  const direct = parseCssColor(sub, dark);
  if (direct) return direct;
  if (/^\s*-?[\d.]+(?:deg)?\s+[\d.]+%\s+[\d.]+%\s*$/.test(sub)) return parseCssColor(`hsl(${sub})`, dark);
  return null;
}

function toHexColor(rgb: Rgba | [number, number, number]): string {
  return `#${[0, 1, 2].map((k) => Math.round(rgb[k]).toString(16).padStart(2, '0')).join('')}`;
}

/** Name segments of a custom property: camelCase and separators split, lowercased. */
function tokenNameSegments(name: string): string[] {
  return name.replace(/^--/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().split(/[-_]+/).filter(Boolean);
}

// ── v44 Status colors used as text meet contrast in every declared theme ────
// A colour picked to mark a state (a dot, a bar, a tint: 3:1 is enough for a
// mark) gets reused to write the word for that state, and text needs 4.5:1.
// Found on designesy.org itself: light --warn #b07d04 as text measured 3.51:1
// on #fbfbfc; mixed toward the ink, color-mix(in oklab, var(--warn) 70%,
// var(--ink)) paints #7f5e21 and measures 5.76:1.
//
// A status hue is a custom property named in the status vocabulary (v43's
// families plus grade-a to grade-f), or one the stylesheet also paints as a
// non-text mark (background, border, outline, fill, stroke) whose value has a
// hue (Oklch chroma 0.06 or more, so white, black and greys are not hues). An
// on-fill colour (--danger-foreground, --on-error, --x-contrast, --x-inverse)
// is not a status hue: it is text for a filled surface the stylesheet does not
// pair with it, and measuring it on the page would be wrong in both directions.
// A text use is color or -webkit-text-fill-color reading a status hue
// directly, through one alias, or at reduced alpha.
//
// Only a status-named colour can FAIL, and only where it resolves to a hue
// (Oklch chroma 0.06 or more). A neutral value under a status name (white or
// grey text for a counter or a hint on a danger button) WARNs at most: it is a
// general text-contrast miss, not a status colour. A hue that qualifies only
// because the sheet also paints it as a mark WARNs at most: across the
// leaderboard cohort those were palette colours (utility classes,
// illustrations, links) whose real surface is often an ancestor's fill the
// static model cannot see. Disabled and
// inactive states (:disabled, [disabled], [aria-disabled=true], .disabled) are
// exempt, as WCAG 1.4.3 exempts inactive user interface components.
//
// Each text use is measured in every theme it applies to: the :root block and
// every [data-theme]/.dark/.light block and prefers-color-scheme block, each
// over the root. A theme named by fewer keys than a compound theme that
// contains it ([data-color-mode=dark] inside [data-color-mode=dark]
// [data-dark-theme=dark]) also reads that compound's tokens before the root's.
//
// The surface is attested, never assumed. Walking the selector from its
// subject outward, the first rule that paints a background for that element
// is its surface: the rule itself, another rule for the same selector, then
// each ancestor compound (its full prefix, the prefix without its interactive
// state, the compound alone, the compound without its state). A translucent
// fill composites over the next surface out. With no fill in the selector, the
// surface is the theme's page background (html/body, else
// --paper/--bg/--background/--surface, else white or black by scheme), unless
// an ancestor compound carries an interactive state (:hover, :active, :focus,
// :checked, [aria-expanded], [aria-selected], [aria-pressed], [aria-current],
// [open]): such a state usually changes a fill this reading cannot find, so
// the pairing is unattested and WARNs at most. v44 never FAILs a pairing it
// cannot attest.
//
// Text needs 4.5:1, large text (24px, or 18.66px at weight 700) 3:1. A
// non-text use is a graphical object under WCAG 1.4.11 and needs 3:1: its
// subject is an svg element, or a class whose role word (the last word, or a
// leading icon- or octicon- prefix) is icon, octicon, glyph, spinner or
// indicator, or a progress or meter bar; or the colour it reads is named for
// one of those (--button-danger-iconColor); or the element paints its own
// background with currentColor, so the colour is a fill measured against the
// surface behind it.

// Oklch chroma at or above which a colour has a hue; below it, white, black,
// greys and near-greys are neutral.
const V44_HUE_CHROMA = 0.06;
const V44_STATUS_WORDS = ['ok', 'success', 'pass', 'positive', 'warn', 'warning', 'caution', 'error', 'danger', 'fail', 'negative', 'destructive', 'info'];
const V44_ON_FILL_WORDS = ['on', 'foreground', 'contrast', 'inverse', 'inverted'];
const V44_THEME_CLASS = /\.((?:theme-)?(?:dark|light)(?:-theme|-mode)?)(?![\w-])/gi;

/** Theme keys a selector names: [data-theme=dark], [data-color-mode=light], .dark, .light. */
function themeSelectorKeys(selector: string): string[] {
  const keys: string[] = [];
  for (const m of selector.matchAll(/\[\s*([\w-]+)\s*=\s*["']?([\w-]+)["']?\s*\]/g)) {
    if (/(?:^|-)(?:theme|color-scheme|color-mode|mode|scheme|appearance)$/i.test(m[1])) keys.push(`[${m[1].toLowerCase()}=${m[2].toLowerCase()}]`);
  }
  for (const m of selector.matchAll(V44_THEME_CLASS)) keys.push(`.${m[1].toLowerCase()}`);
  return keys;
}

/** A selector part with its theme attributes and classes removed. */
function withoutThemeKeys(part: string): string {
  return replaceBrackets(part, (a) => (themeSelectorKeys(a).length ? '' : a))
    .replace(V44_THEME_CLASS, '')
    .trim();
}

/**
 * The token block a selector part declares: 'root' for :root, html, :host or
 * body; for one of those (or a bare theme selector) carrying theme attributes
 * or classes, the theme they name together, sorted
 * (`[data-color-mode=dark][data-dark-theme=dark]`); null for anything else.
 */
function tokenBlockTheme(part: string): string | null {
  const bare = part.replace(/:not\([^()]*\)/gi, '');
  const keys = [...new Set(themeSelectorKeys(bare))].sort();
  const rest = withoutThemeKeys(bare).replace(/\s+/g, '');
  if (!/^(?::root|html|:host|body)?$/i.test(rest)) return null;
  if (keys.length === 0) return rest ? 'root' : null;
  return keys.join('');
}

/** A selector with its theme keys removed (and the html/:root/body that carried them), for matching a rule to its themed override. */
function keylessSelector(selector: string): string {
  return splitCssTopLevel(selector, ',')
    .map((p) => {
      const rest = withoutThemeKeys(p);
      return (themeSelectorKeys(p).length ? rest.replace(/^(?:html|:root|body)(?=\s|$)/i, '') : rest).replace(/\s+/g, ' ').trim();
    })
    .join(',');
}

function v44Scheme(at: string[]): { media: boolean; scheme: string | undefined } {
  const media = at.filter((a) => a.startsWith('@media'));
  return { media: media.length > 0, scheme: media.map((a) => /prefers-color-scheme\s*:\s*(dark|light)/.exec(a)?.[1]).find(Boolean) };
}

function v44Composite(fg: Rgba, bg: Rgba): Rgba {
  const a = Math.round(fg[3] * 255) / 255;
  return [Math.round(fg[0] * a + bg[0] * (1 - a)), Math.round(fg[1] * a + bg[1] * (1 - a)), Math.round(fg[2] * a + bg[2] * (1 - a)), 1];
}

/** The colour a background value paints: 'none' when it paints nothing, null when it cannot be read. */
function v44BackgroundColor(value: string, scope: Array<Record<string, string>>, dark: boolean): Rgba | 'none' | null {
  if (/^(?:none|transparent|initial|inherit|unset|revert|revert-layer)$/i.test(value.trim())) return 'none';
  const layers = splitCssTopLevel(value, ',');
  for (const tok of splitCssTopLevel(layers[layers.length - 1] ?? '', ' ')) {
    if (/^(?:url|[a-z-]*gradient|image|image-set|element)\(/i.test(tok)) continue;
    const c = resolveThemeColor(tok, scope, dark);
    if (c) return c[3] === 0 ? 'none' : c;
  }
  return null;
}

// Interactive states that usually change a fill.
const V44_STATE = /^(?::(?:hover|active|focus|focus-visible|focus-within|checked|target)|\[(?:aria-(?:expanded|selected|pressed|current|checked)|open)(?:[~|^$*]?=[^\]]*)?\])$/i;
const V44_NON_TEXT_TYPES = /^(?:svg|path|circle|rect|ellipse|line|polyline|polygon|use|g)$/i;
const V44_NON_TEXT_WORDS = ['icon', 'octicon', 'glyph', 'spinner', 'indicator'];

/** A selector part with its theme keys removed, and the html/:root/body that carried them. */
function keylessPart(part: string): string {
  const rest = withoutThemeKeys(part);
  return (themeSelectorKeys(part).length ? rest.replace(/^(?:html|:root|body)(?=\s|$)/i, '') : rest).trim();
}

/** A lookup key for a run of compounds: simple selectors, combinators kept. */
function compoundsKey(comps: Array<{ comb: string; compound: string }>, stateless: boolean): string {
  return comps
    .map((c, i) => `${i === 0 ? '' : c.comb === ' ' ? ' ' : c.comb}${simpleSelectors(c.compound).filter((x) => !stateless || !V44_STATE.test(x)).join('')}`)
    .join('');
}

/**
 * Whether a selector's subject is a graphical object rather than text: every
 * alternative's subject is an svg element, or has a class whose role word (the
 * last word, after any CSS-module hash) is icon, octicon, glyph, spinner or
 * indicator, or that names an icon by prefix (icon-check, octicon-x), or is a
 * bar of a progress or meter component.
 */
function nonTextSubject(part: string): boolean {
  return expandIsWhere(part).every((alt) => {
    const comps = selectorCompounds(alt);
    const subject = simpleSelectors(comps[comps.length - 1]?.compound ?? '');
    if (subject.some((x) => V44_NON_TEXT_TYPES.test(x))) return true;
    return subject.some((x) => {
      if (!x.startsWith('.')) return false;
      const segs = x.slice(1).split(/[-_]+/).filter(Boolean);
      while (segs.length > 1 && /\d/.test(segs[segs.length - 1])) segs.pop();
      const words = segs.flatMap((w) => w.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(' '));
      const last = words[words.length - 1] ?? '';
      return V44_NON_TEXT_WORDS.includes(last) || ((words[0] === 'icon' || words[0] === 'octicon') && words.length > 1)
        || (last === 'bar' && words.some((w) => w === 'progress' || w === 'meter'));
    });
  });
}

function checkStatusTextContrast(css: string): CheckResult {
  const ID = 'v44';
  const ITEM = 'Status colors used as text meet contrast in every declared theme';
  const CATEGORY = 'accessibility';
  const parsed = parseCssRules(css).rules.map((rule) => ({
    rule,
    decls: parseCssDecls(rule.decls),
    tokenBlock: splitCssTopLevel(rule.selector, ',').map(tokenBlockTheme),
  }));

  // 1. Themes: the root block, and every theme block over it. Media blocks
  //    other than prefers-color-scheme are overrides (contrast, print,
  //    width), not themes, and are left out.
  // A theme is the root, a prefers-color-scheme block (media), or a set of
  // theme attributes and classes (keys); a rule reaches it by the same.
  type Theme = { label: string; dark: boolean; tokens: Record<string, string>; keys: string[]; media: string | null };
  type Where = { keys: string[][]; media: string | null };
  const themes = new Map<string, Theme>();
  const ensure = (key: string, keys: string[], media: string | null): Theme => {
    let t = themes.get(key);
    if (!t) {
      const name = key === 'root' ? '' : key;
      // Dark by name: a *-theme attribute's value decides ([data-light-theme=dark]
      // puts the dark theme in the light slot); else any key that says dark
      // and none that says light. A color-scheme declaration overrides both.
      const themeValues = keys.map((k) => /^\[[\w-]*theme=([\w-]+)\]$/.exec(k)?.[1]).filter((v): v is string => Boolean(v));
      const said = themeValues.length ? themeValues.join(' ') : name;
      t = { label: key === 'root' ? ':root' : key, dark: /dark/.test(said) && !/light/.test(said), tokens: {}, keys, media };
      themes.set(key, t);
    }
    return t;
  };
  const root = ensure('root', [], null);
  const whereOf = (rule: CssRuleBlock): Where => {
    const { scheme } = v44Scheme(rule.at);
    return { keys: splitCssTopLevel(rule.selector, ',').map((p) => themeSelectorKeys(p)), media: scheme ? `@media (prefers-color-scheme: ${scheme})` : null };
  };
  const reaches = (t: Theme, w: Where) => (w.media ? t.media === w.media : t.media === null || w.keys.some((k) => k.length === 0))
    && w.keys.some((k) => k.length === 0 || (t.keys.length > 0 && k.every((x) => t.keys.includes(x))));
  const themed = (w: Where) => w.media !== null || w.keys.every((k) => k.length > 0);
  for (const { rule, decls, tokenBlock } of parsed) {
    const { media, scheme } = v44Scheme(rule.at);
    if (media && !scheme) continue;
    for (const t of tokenBlock) {
      if (!t) continue;
      const mediaKey = `@media (prefers-color-scheme: ${scheme})`;
      const theme = t === 'root'
        ? (scheme ? ensure(mediaKey, [], mediaKey) : root)
        : ensure(t, attrAndClassParts(t) ?? [], null);
      if (t === 'root' && scheme) theme.dark = scheme === 'dark';
      for (const d of decls) {
        if (d.prop.startsWith('--')) theme.tokens[d.prop] = d.value;
        else if (d.prop === 'color-scheme') {
          const v = d.value.trim().toLowerCase();
          if (/^(?:only\s+)?dark$/.test(v)) theme.dark = true;
          else if (/^(?:only\s+)?light$/.test(v)) theme.dark = false;
        }
      }
    }
  }
  // A theme's tokens; then those of every compound theme that contains it,
  // because a page that matches [data-color-mode=dark] also carries the theme
  // attribute those compounds add (primer.style declares --fgColor-danger only
  // under [data-color-mode=dark][data-dark-theme=dark]): nearest first, and
  // among those the one whose added keys repeat the theme's own value
  // ([data-dark-theme=dark] for [data-color-mode=dark]), then source order;
  // then those of every theme it includes (a [data-color-mode=dark] block
  // also applies under [data-color-mode=dark][data-dark-theme=dark_dimmed]),
  // most specific first; then the root's.
  const scopeCache = new Map<string, Array<Record<string, string>>>();
  const scopeOf = (key: string): Array<Record<string, string>> => {
    const hit = scopeCache.get(key);
    if (hit) return hit;
    const t = themes.get(key) as Theme;
    const others = key === 'root' || t.media ? [] : [...themes.entries()].filter(([k, o]) => k !== key && k !== 'root' && !o.media);
    const valueOf = (k: string) => /=([\w-]+)\]$/.exec(k)?.[1] ?? k.replace(/^\./, '');
    const own = new Set(t.keys.map(valueOf));
    const repeats = (o: Theme) => o.keys.filter((x) => !t.keys.includes(x)).every((x) => own.has(valueOf(x)));
    const narrower = others
      .filter(([, o]) => o.keys.length > t.keys.length && t.keys.every((x) => o.keys.includes(x)))
      .sort((a, b) => a[1].keys.length - b[1].keys.length || Number(repeats(b[1])) - Number(repeats(a[1])))
      .map(([, o]) => o.tokens);
    const wider = others
      .filter(([, o]) => o.keys.length < t.keys.length && o.keys.every((x) => t.keys.includes(x)))
      .sort((a, b) => b[1].keys.length - a[1].keys.length)
      .map(([, o]) => o.tokens);
    const scope = key === 'root' ? [root.tokens] : [t.tokens, ...narrower, ...wider, root.tokens];
    scopeCache.set(key, scope);
    return scope;
  };

  // 2. Status hues, and the aliases that read one.
  const paintRefs = new Set<string>();
  for (const { decls } of parsed) {
    for (const d of decls) {
      if (/^(?:background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke)$/.test(d.prop)) {
        for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) paintRefs.add(m[1]);
      }
    }
  }
  // 'name': a status colour by its name. 'paint': a hue the sheet also paints
  // as a mark. null: not a status hue.
  const hueCache = new Map<string, 'name' | 'paint' | null>();
  const hueKind = (name: string): 'name' | 'paint' | null => {
    const hit = hueCache.get(name);
    if (hit !== undefined) return hit;
    const segs = tokenNameSegments(name);
    let kind: 'name' | 'paint' | null = null;
    if (!segs.some((s) => V44_ON_FILL_WORDS.includes(s))) {
      if (segs.some((s) => V44_STATUS_WORDS.includes(s)) || /(?:^|-)grade-[a-f](?:-|$)/.test(segs.join('-'))) kind = 'name';
      else if (paintRefs.has(name)) {
        for (const [key, t] of themes) {
          const c = resolveThemeColor(`var(${name})`, scopeOf(key), t.dark);
          if (!c || c[3] <= 0) continue;
          const lab = srgbToOklab([c[0], c[1], c[2]]);
          if (Math.hypot(lab[1], lab[2]) >= V44_HUE_CHROMA) kind = 'paint';
          break;
        }
      }
    }
    hueCache.set(name, kind);
    return kind;
  };
  const isHue = (name: string): boolean => hueKind(name) !== null;
  const huesIn = (value: string) => [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]).filter(isHue);
  const aliasOf = new Map<string, string>();
  type AliasDecl = { value: string; keyless: string; where: Where; subjects: string[][] };
  const componentAlias = new Map<string, AliasDecl[]>();
  // Selectors whose text color a themed rule replaces: keyless selector -> where.
  const themedColor = new Map<string, Where[]>();
  for (const { rule, decls, tokenBlock } of parsed) {
    const where = whereOf(rule);
    if (themed(where) && decls.some((d) => d.prop === 'color' || d.prop === '-webkit-text-fill-color')) {
      const k = keylessSelector(rule.selector);
      themedColor.set(k, [...(themedColor.get(k) ?? []), where]);
    }
    for (const d of decls) {
      if (!d.prop.startsWith('--') || isHue(d.prop)) continue;
      const hues = huesIn(d.value);
      if (hues.length && !aliasOf.has(d.prop)) aliasOf.set(d.prop, hues[0]);
      // A component-scoped alias keeps every value it takes, hue or not, so a
      // themed rule that re-points it (to an ink mix, say) is measured too.
      if (!tokenBlock.some(Boolean) && /var\(\s*--/.test(d.value)) {
        const keyless = keylessSelector(rule.selector);
        const subjects = splitCssTopLevel(keyless, ',').map((p) => {
          const comps = selectorCompounds(p);
          return simpleSelectors(comps[comps.length - 1]?.compound ?? '');
        }).filter((x) => x.length > 0);
        componentAlias.set(d.prop, [...(componentAlias.get(d.prop) ?? []), { value: d.value, keyless, where, subjects }]);
      }
    }
  }

  // 3. The page background of each theme: body, then html, then :root, from
  //    the theme's own rules first and the root's rules after; then the
  //    surface tokens; then white, or black for a dark scheme. A theme other
  //    than the root whose background is only that assumption is not
  //    measured: nothing in it says what surface its text sits on.
  const pageBg = new Map<string, Rgba>();
  const assumedBg = new Set<string>();
  const bgRules: Array<{ parts: Array<{ keys: string[]; subject: string }>; media: string | null; bg: CssDecl }> = [];
  for (let r = parsed.length - 1; r >= 0; r--) {
    const { rule, decls } = parsed[r];
    if (!/(?:^|[\s,>(])(?:html|body|:root)\b|\[|\.(?:theme-)?(?:dark|light)/i.test(rule.selector)) continue;
    const bg = [...decls].reverse().find((d) => d.prop === 'background-color' || d.prop === 'background');
    if (!bg) continue;
    const { media, scheme } = v44Scheme(rule.at);
    if (media && !scheme) continue;
    const parts = splitCssTopLevel(rule.selector, ',').map((p) => {
      const keys = themeSelectorKeys(p);
      const comps = withoutThemeKeys(p).split(/\s+/).filter(Boolean);
      return { keys, subject: (comps[comps.length - 1] ?? (keys.length ? 'html' : '')).toLowerCase() };
    }).filter((p) => p.subject === 'body' || p.subject === 'html' || p.subject === ':root');
    if (parts.length) bgRules.push({ parts, media: scheme ? `@media (prefers-color-scheme: ${scheme})` : null, bg });
  }
  for (const [key, t] of themes) {
    const scope = scopeOf(key);
    const plain: Rgba = t.dark ? [0, 0, 0, 1] : [255, 255, 255, 1];
    let found: Rgba | null = null;
    for (const pass of key === 'root' ? ['root'] : ['own', 'root']) {
      for (const subject of ['body', 'html', ':root']) {
        for (const cand of bgRules) {
          if (found) break;
          const hit = cand.parts.some((p) => p.subject === subject && (pass === 'own'
            ? (t.media ? cand.media === t.media && p.keys.length === 0 : cand.media === null && p.keys.length > 0 && p.keys.every((x) => t.keys.includes(x)))
            : cand.media === null && p.keys.length === 0));
          if (!hit) continue;
          const c = v44BackgroundColor(cand.bg.value, scope, t.dark);
          if (c && c !== 'none') found = c[3] >= 1 ? c : v44Composite(c, plain);
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) {
      for (const name of ['--paper', '--bg', '--background', '--surface']) {
        if (!scope.some((x) => Object.prototype.hasOwnProperty.call(x, name))) continue;
        const c = resolveThemeColor(`var(${name})`, scope, t.dark);
        if (c && c[3] > 0) { found = c[3] >= 1 ? c : v44Composite(c, plain); break; }
      }
    }
    // A theme whose scheme differs from the root's but whose page background
    // is the root's did not theme its surface: measuring its text there would
    // pair a dark palette with a light page, or the reverse.
    const rootBg = pageBg.get('root');
    if (key !== 'root' && (!found || (t.dark !== root.dark && rootBg && toHexColor(found) === toHexColor(rootBg)))) assumedBg.add(key);
    pageBg.set(key, found ?? plain);
  }

  // Every background a rule paints, by selector (theme keys removed), for
  // attesting a text use's surface. Latest rule first.
  const bgIndex = new Map<string, Array<{ where: Where; value: string }>>();
  for (let r = parsed.length - 1; r >= 0; r--) {
    const { rule, decls } = parsed[r];
    const bg = [...decls].reverse().find((d) => d.prop === 'background-color' || d.prop === 'background');
    if (!bg) continue;
    if (rule.at.some((a) => /^@media\b.*\b(?:print|forced-colors)\b/.test(a))) continue;
    const where = whereOf(rule);
    for (const part of splitCssTopLevel(rule.selector, ',')) {
      // Indexed as written: a :hover rule's fill is the hovered element's,
      // never the resting one's. The lookup side drops a state, not this side.
      const k = compoundsKey(selectorCompounds(keylessPart(part)), false);
      const list = bgIndex.get(k) ?? [];
      list.push({ where, value: bg.value });
      bgIndex.set(k, list);
    }
  }

  // 4. Every text use, in every theme it applies to.
  type Finding = { selector: string; token: string; theme: string; value: string; background: string; ratio: number | null; need: number; status: 'PASS' | 'WARN' | 'FAIL'; note: string };
  const findings: Finding[] = [];
  const seen = new Set<string>();
  let uses = 0;
  let unresolved = 0;
  for (const { rule, decls } of parsed) {
    const texts = decls.filter((d) => d.prop === 'color' || d.prop === '-webkit-text-fill-color');
    if (!texts.length) continue;
    if (rule.at.some((a) => /^@media\b.*\b(?:print|forced-colors)\b/.test(a))) continue;
    const text = texts[texts.length - 1];
    const refs = [...text.value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
    const direct = refs.find(isHue);
    const alias = refs.find((r) => aliasOf.has(r));
    if (!direct && !alias) continue;
    // Inactive controls carry no contrast requirement (WCAG 1.4.3). A rule is
    // exempt when every selector in it names a disabled state; :not(:disabled)
    // names the opposite and does not count.
    const disabled = splitCssTopLevel(rule.selector, ',').every((p) =>
      /:disabled\b|\[disabled\]|\[aria-disabled(?:=["']?true["']?)?\]|\.disabled(?![\w-])/i.test(p.replace(/:not\((?:[^()]|\([^()]*\))*\)/gi, '')));
    if (disabled) continue;
    uses++;
    const token = direct ?? `${alias} -> ${aliasOf.get(alias as string)}`;
    const byName = hueKind(direct ?? (aliasOf.get(alias as string) as string)) === 'name';
    const where = whereOf(rule);
    const replacedBy = themed(where) ? [] : themedColor.get(keylessSelector(rule.selector)) ?? [];
    const applies = [...themes.keys()].filter((k) => {
      const t = themes.get(k) as Theme;
      return !assumedBg.has(k) && reaches(t, where) && !replacedBy.some((w) => reaches(t, w));
    });
    // Large text: the rule's own font-size (a clamp() reads its minimum) or
    // the size in a font shorthand, with its weight.
    let px: number | null = null;
    let weight = 400;
    for (const d of decls) {
      if (d.prop === 'font-size' || d.prop === 'font') {
        const v = d.value.toLowerCase();
        const kw = /(?:^|\s)(xxx-large|xx-large|x-large)(?:\s|$)/.exec(v);
        const m = /^clamp\(\s*([\d.]+)(px|rem|em)/.exec(v)
          ?? (d.prop === 'font-size' ? /^([\d.]+)(px|rem|em)$/.exec(v) : /(?:^|\s)([\d.]+)(px|rem|em)(?:\s*\/|\s|$)/.exec(v));
        if (kw) px = kw[1] === 'xxx-large' ? 48 : kw[1] === 'xx-large' ? 32 : 24;
        else if (m) px = parseFloat(m[1]) * (m[2] === 'px' ? 1 : 16);
        const w = d.prop === 'font' ? /(?:^|\s)(bold|bolder|[1-9]00)(?:\s|$)/.exec(v) : null;
        if (w) weight = /bold/.test(w[1]) ? 700 : parseInt(w[1], 10);
      }
      if (d.prop === 'font-weight') {
        const w = d.value.trim().toLowerCase();
        if (/^bold(?:er)?$/.test(w)) weight = 700;
        else if (/^\d+$/.test(w)) weight = parseInt(w, 10);
      }
    }
    // A colour named for a graphic (an icon colour) is not text.
    const graphicToken = [direct, alias, alias ? aliasOf.get(alias) : undefined].some((nm) => nm && tokenNameSegments(nm).some((w) => V44_NON_TEXT_WORDS.includes(w)));
    const need = graphicToken || (px !== null && (px >= 24 || (px >= 18.66 && weight >= 700))) ? 3 : 4.5;
    const ownBg = [...decls].reverse().find((d) => d.prop === 'background-color' || d.prop === 'background');
    const ownTokens: Record<string, string> = {};
    for (const d of decls) if (d.prop.startsWith('--')) ownTokens[d.prop] = d.value;
    // An alias set on a component reaches only text inside that component, so
    // a value is a variant here only when this rule's selector names the
    // component (`.card .label` for an alias set on `.card`). A themed rule
    // for the same component replaces the unthemed one.
    const compounds = splitCssTopLevel(rule.selector, ',').flatMap((p) => selectorCompounds(p).map((c) => simpleSelectors(c.compound)));
    const variantsIn = (key: string): Array<Record<string, string>> => {
      if (direct || !alias || Object.prototype.hasOwnProperty.call(ownTokens, alias)) return [{}];
      const t = themes.get(key) as Theme;
      const decl = (componentAlias.get(alias) ?? []).filter((a) => reaches(t, a.where)
        && a.subjects.some((subject) => compounds.some((c) => compoundCovers(subject, c))));
      const forTheme = new Set(decl.filter((a) => themed(a.where)).map((a) => a.keyless));
      const values = decl.filter((a) => themed(a.where) || !forTheme.has(a.keyless)).map((a) => a.value);
      return [{}, ...[...new Set(values)].map((value) => ({ [alias]: value }))];
    };
    const sel = shortSelector(rule.selector);
    const parts = splitCssTopLevel(rule.selector, ',');
    for (const key of applies) {
      const t = themes.get(key) as Theme;
      for (const variant of variantsIn(key)) {
        const scope = [ownTokens, variant, ...scopeOf(key)];
        const fg = resolveThemeColor(text.value, scope, t.dark);
        if (!fg) { unresolved++; continue; }
        if (fg[3] <= 0) continue;
        // One fill: its color in this theme; 'stale' when, in a theme whose
        // scheme differs from the root's, it resolves exactly as in the root
        // (the surface did not follow the theme, so it is not measured).
        const fill = (value: string): Rgba | 'none' | 'unreadable' | 'stale' => {
          const c = v44BackgroundColor(value, scope, t.dark);
          if (c === null) return 'unreadable';
          if (c !== 'none' && key !== 'root' && t.dark !== root.dark) {
            const inRoot = v44BackgroundColor(value, [ownTokens, variant, root.tokens], root.dark);
            if (inRoot && inRoot !== 'none' && toHexColor(inRoot) === toHexColor(c) && inRoot[3] === c[3]) return 'stale';
          }
          return c;
        };
        const indexed = (k: string): string | null => {
          for (const e of bgIndex.get(k) ?? []) if (reaches(t, e.where)) return e.value;
          return null;
        };
        type Surface = { bg: Rgba | null; attested: boolean; stale: boolean; need: number };
        const surfaces: Surface[] = parts.map((part) => {
          const comps = selectorCompounds(keylessPart(part));
          const n = comps.length - 1;
          let partNeed = nonTextSubject(keylessPart(part)) ? 3 : need;
          const layers: Rgba[] = [];
          for (let k = n; k >= 0; k--) {
            let value: string | null = null;
            if (k === n && ownBg) value = ownBg.value;
            const prefix = comps.slice(0, k + 1);
            const lone = [{ comb: '', compound: comps[k].compound }];
            for (const cand of [compoundsKey(prefix, false), compoundsKey(prefix, true), compoundsKey(lone, false), compoundsKey(lone, true)]) {
              if (value !== null) break;
              value = indexed(cand);
            }
            if (value === null) continue;
            // An element that paints its own background with currentColor
            // (a progress bar, a dot) uses the colour as a fill: a graphic,
            // measured against the surface behind it.
            if (k === n && /^\s*currentcolor\s*$/i.test(value)) { partNeed = 3; continue; }
            const c = fill(value);
            if (c === 'stale') return { bg: null, attested: false, stale: true, need: partNeed };
            if (c === 'unreadable') return { bg: null, attested: true, stale: false, need: partNeed };
            if (c === 'none') continue;
            layers.push(c);
            if (c[3] >= 1) break;
          }
          const opaque = layers.length > 0 && layers[layers.length - 1][3] >= 1;
          const stateAbove = comps.slice(0, n).some((c) => simpleSelectors(c.compound).some((x) => V44_STATE.test(x)));
          let base: Rgba = opaque ? (layers.pop() as Rgba) : (pageBg.get(key) as Rgba);
          for (let i = layers.length - 1; i >= 0; i--) base = v44Composite(layers[i], base);
          return { bg: base, attested: opaque || !stateAbove, stale: false, need: partNeed };
        });
        const solid: Rgba = [Math.round(fg[0]), Math.round(fg[1]), Math.round(fg[2]), 1];
        const fgLab = srgbToOklab([solid[0], solid[1], solid[2]]);
        const neutral = Math.hypot(fgLab[1], fgLab[2]) < V44_HUE_CHROMA;
        const value = toHexColor(solid) + (fg[3] < 1 ? ` at ${Math.round(fg[3] * 100)}%` : '');
        type Measured = { background: string; ratio: number | null; need: number; status: Finding['status']; note: string };
        const measured: Measured[] = [];
        for (const sf of surfaces) {
          if (sf.stale) continue;
          if (!sf.bg) {
            measured.push({ background: 'unresolved', ratio: null, need: sf.need, status: 'WARN', note: 'its background cannot be resolved' });
            continue;
          }
          const bg = sf.bg;
          const full = contrastRatio([solid[0], solid[1], solid[2]], [bg[0], bg[1], bg[2]]);
          const shown = fg[3] < 1 ? v44Composite(fg, bg) : solid;
          const painted = contrastRatio([shown[0], shown[1], shown[2]], [bg[0], bg[1], bg[2]]);
          let status: Finding['status'] = full < sf.need ? 'FAIL' : painted < sf.need ? 'WARN' : 'PASS';
          let note = status === 'WARN' ? `clears ${sf.need}:1 only at full alpha (${full.toFixed(2)}:1)` : '';
          if (status === 'FAIL' && !sf.attested) {
            status = 'WARN';
            note = 'is only a warning: the surface is unresolved, because an ancestor in an interactive state (hover, active, focus, expanded, open) usually changes a fill this check cannot find';
          } else if (status === 'FAIL' && !byName) {
            status = 'WARN';
            note = 'is only a warning: the color is not named as a status, it counts because the stylesheet also paints it as a mark, and its real surface may be a fill this check cannot see';
          } else if (status === 'FAIL' && neutral) {
            status = 'WARN';
            note = 'neutral text on a status fill: a general text-contrast miss, not a status color';
          }
          // Shown to two places; a miss that would round up to the bar is
          // rounded down instead, so 4.497 reads 4.49, never 4.50 against 4.5.
          const rounded = Math.round(painted * 100) / 100;
          const shownRatio = painted < sf.need && rounded >= sf.need ? Math.floor(painted * 100) / 100 : rounded;
          measured.push({ background: toHexColor(bg), ratio: shownRatio, need: sf.need, status, note });
        }
        if (!measured.length) { unresolved++; continue; }
        const order = { FAIL: 0, WARN: 1, PASS: 2 };
        measured.sort((a, b) => order[a.status] - order[b.status] || (a.ratio === null ? 0 : a.ratio / a.need) - (b.ratio === null ? 0 : b.ratio / b.need));
        const worst = measured[0];
        const dedupe = `${sel}|${token}|${value}|${worst.background}|${worst.need}|${worst.status}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        findings.push({ selector: sel, token, theme: t.label, value, ...worst });
      }
    }
  }

  if (findings.length === 0) {
    return {
      id: ID, item: ITEM, category: CATEGORY, status: 'SKIP',
      detail: uses === 0
        ? 'not applicable: no status color is used as text'
        : `not applicable: ${uses} status-color text use(s), none resolvable to a measurable color`,
    };
  }
  const rank = { FAIL: 0, WARN: 1, PASS: 2 };
  const margin = (f: Finding) => (f.ratio === null ? 0 : f.ratio / f.need);
  findings.sort((a, b) => rank[a.status] - rank[b.status] || margin(a) - margin(b));
  const fails = findings.filter((f) => f.status === 'FAIL');
  const warns = findings.filter((f) => f.status === 'WARN');
  const status = fails.length ? 'FAIL' : warns.length ? 'WARN' : 'PASS';
  const say = (f: Finding) => (f.ratio === null
    ? `${f.selector} uses ${f.token} ${f.value} in ${f.theme}, and ${f.note}`
    : `${f.selector} uses ${f.token} ${f.value} on ${f.background} in ${f.theme} at ${f.ratio.toFixed(2)}:1 (needs ${f.need}:1)${f.note ? `; ${/^(?:is|clears) /.test(f.note) ? 'this ' : ''}${f.note}` : ''}`);
  const lead = status === 'FAIL' ? fails : warns;
  const detail = status === 'PASS'
    ? `${findings.length} status-color text use(s) clear contrast in ${themes.size} theme(s); the closest: ${say(findings[0])}`
    : `${lead.length} status-color text use(s) ${status === 'FAIL' ? 'under contrast' : 'to review'}: ${lead.slice(0, 2).map(say).join(' | ')}${lead.length > 2 ? ` | ${lead.length - 2} more` : ''}`;
  return {
    id: ID, item: ITEM, category: CATEGORY, status, detail,
    evidence: {
      findings: findings.slice(0, 20).map((f) => ({ selector: f.selector, token: f.token, theme: f.theme, value: f.value, background: f.background, ratio: f.ratio, need: f.need, status: f.status, note: f.note || null })),
      truncated: Math.max(0, findings.length - 20),
    },
  };
}

// ── v45 Pausing motion keeps content visible ────────────────────────────────
// A site-level pause (animation-play-state: paused on every element, under an
// attribute or class on the document, or inside prefers-reduced-motion:
// reduce) holds each animation on its current frame. An entrance whose first
// keyframe is opacity 0 is then held invisible, and when the pause is restored
// before first paint, whole pages render empty for exactly the visitors who
// asked for less motion. Found on designesy.org itself: under
// html[data-motion="paused"] * { animation-play-state: paused !important } the
// .fade-up entrance (@keyframes fadeUp, from opacity 0) froze invisible; the
// fix gives each entrance animation-delay: -3600s under the pause, so it holds
// on its last frame.
//
// An entrance is a one-shot use (no `infinite`) of keyframes whose from/0%
// frame sets opacity 0 or visibility hidden, held at that frame (no positive
// delay with a fill that leaves the frame unapplied), that the pause reaches
// (it is !important, outranks the rule, or the rule leaves the play state
// alone). Its override is a rule under the same pause, for the same selector
// or a compound it contains, that wins the cascade and sets animation: none,
// animation-name: none, animation-play-state: running, or a negative
// animation-delay at least as long as the animation. Static: pauses applied
// from JavaScript (WAAPI pause(), classes added at runtime) are not modelled.

type V45Scope = { prefix: string; media: boolean; selector: string; important: boolean; spec: number[]; order: number; decls: CssDecl[] };

/** The compounds of one complex selector and the combinator before each. */
function selectorCompounds(part: string): Array<{ comb: string; compound: string }> {
  const out: Array<{ comb: string; compound: string }> = [];
  let depth = 0;
  let cur = '';
  let comb = '';
  for (let i = 0; i < part.length; i++) {
    const ch = part[i];
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    if (depth === 0 && (ch === ' ' || ch === '\n' || ch === '\t' || ch === '>' || ch === '+' || ch === '~')) {
      if (cur) { out.push({ comb, compound: cur }); cur = ''; comb = ' '; }
      if (ch !== ' ' && ch !== '\n' && ch !== '\t') comb = ch;
      continue;
    }
    cur += ch;
  }
  if (cur) out.push({ comb, compound: cur });
  return out;
}

/** The simple selectors of one compound, attribute quotes and spacing normalised. */
function simpleSelectors(compound: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < compound.length; i++) {
    const ch = compound[i];
    if (depth === 0 && (ch === '.' || ch === '#' || ch === '[' || (ch === ':' && compound[i - 1] !== ':')) && cur) {
      out.push(cur);
      cur = '';
    }
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((s) => (s.startsWith('[') ? s.replace(/["'\s]/g, '').toLowerCase() : s)).filter((s) => s !== '*');
}

/** Specificity [ids, classes, types] of one complex selector. */
function selectorSpecificity(part: string): number[] {
  const spec = [0, 0, 0];
  for (const { compound } of selectorCompounds(part)) {
    for (const s of simpleSelectors(compound)) {
      const fn = /^:(is|not|has|matches|where|nth-child|nth-last-child)\(([\s\S]*)\)$/i.exec(s);
      if (fn) {
        const name = fn[1].toLowerCase();
        if (name === 'where') continue;
        if (name.startsWith('nth')) { spec[1]++; continue; }
        let best = [0, 0, 0];
        for (const arg of splitCssTopLevel(fn[2], ',')) {
          const sp = selectorSpecificity(arg);
          if (sp[0] > best[0] || (sp[0] === best[0] && (sp[1] > best[1] || (sp[1] === best[1] && sp[2] > best[2])))) best = sp;
        }
        for (let k = 0; k < 3; k++) spec[k] += best[k];
        continue;
      }
      if (s.startsWith('#')) spec[0]++;
      else if (s.startsWith('::') || /^:(?:before|after|first-line|first-letter)$/i.test(s)) spec[2]++;
      else if (s.startsWith('.') || s.startsWith('[') || s.startsWith(':')) spec[1]++;
      else spec[2]++;
    }
  }
  return spec;
}

function compareSpecificity(a: number[], b: number[]): number {
  for (let k = 0; k < 3; k++) if (a[k] !== b[k]) return a[k] - b[k];
  return 0;
}

/** One time value in ms, null when it is not a literal time. */
function cssTimeMs(token: string): number | null {
  const m = /^(-?(?:\d+(?:\.\d*)?|\.\d+))(ms|s)$/i.exec(token.trim());
  return m ? parseFloat(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1) : null;
}

/** :is() and :where() in a selector, expanded into their alternatives (bounded). */
function expandIsWhere(part: string, budget = 64): string[] {
  const m = /:(?:is|where|matches|-webkit-any)\(/i.exec(part);
  if (!m) return [part];
  const open = m.index + m[0].length - 1;
  let depth = 0;
  let close = -1;
  for (let i = open; i < part.length; i++) {
    if (part[i] === '(') depth++;
    else if (part[i] === ')' && --depth === 0) { close = i; break; }
  }
  if (close < 0) return [part];
  const out: string[] = [];
  for (const alt of splitCssTopLevel(part.slice(open + 1, close), ',')) {
    for (const x of expandIsWhere(part.slice(0, m.index) + alt + part.slice(close + 1), budget)) {
      if (out.length >= budget) return out;
      out.push(x);
    }
  }
  return out;
}

/** Whether every simple selector of `inner` holds for an element matching `outer` ([x] holds wherever [x=...] does). */
function compoundCovers(inner: string[], outer: string[]): boolean {
  return inner.every((s) => outer.includes(s)
    || (/^\[[\w-]+\]$/.test(s) && outer.some((o) => o.startsWith(`${s.slice(0, -1)}=`) || o.startsWith(`${s.slice(0, -1)}~=`) || o.startsWith(`${s.slice(0, -1)}|=`))));
}

/**
 * Whether selector `r` matches every element selector `e` matches: r's
 * compounds, read from the subject outward, each hold for e's compound at the
 * same position, joined by the same combinator (a descendant combinator in r
 * also holds where e has a child combinator).
 */
function selectorCovers(r: string, e: string): boolean {
  const rc = selectorCompounds(r);
  const ec = selectorCompounds(e);
  if (!rc.length || rc.length > ec.length) return false;
  for (let k = 1; k <= rc.length; k++) {
    const a = rc[rc.length - k];
    const b = ec[ec.length - k];
    if (!compoundCovers(simpleSelectors(a.compound), simpleSelectors(b.compound))) return false;
    if (k < rc.length && a.comb !== b.comb && !(a.comb === ' ' && b.comb === '>')) return false;
  }
  return true;
}

const V45_USER_ACTION = /^:(?:hover|focus|focus-within|focus-visible|active|target|checked)$/i;
// A document-level motion toggle: an attribute that names motion or animation
// ([data-motion=paused], [data-reduced-motion]), or a class that is one
// (.reduce-motion, .no-motion, .motion-paused, .animations-off). Component
// classes that only end in "paused" (a marquee's .logobar--paused) are not.
const V45_TOGGLE_CLASS = /^\.(?:is-|has-|prefers-)?(?:reduced?-motion|no-motion|motion-(?:off|paused|reduced?|none)|paused-motion|(?:no-)?animations?(?:-(?:off|paused|disabled|none))?|(?:pause|stop)-animations?|still)$/i;

/**
 * Whether a compound before `*` reaches the whole document: html, :root or
 * body with any qualifier, or a bare motion toggle (an attribute that names
 * motion or animation, or a class that is a motion toggle), never a
 * user-action state.
 */
function isDocumentScope(compound: string): boolean {
  const simple = simpleSelectors(compound);
  if (!simple.length) return false;
  if (simple.some((s) => V45_USER_ACTION.test(s))) return false;
  const type = simple.find((s) => /^[a-z]/i.test(s) || /^:root$/i.test(s));
  if (type) return /^(?:html|body|:root)$/i.test(type);
  return simple.every((s) => s.startsWith('.') || s.startsWith('['))
    && simple.some((s) => isMotionToggleAttr(s) || V45_TOGGLE_CLASS.test(s));
}

// v46 — Type sizes come from the scale (engine 1.4.0).
//
// v16 asks that sizes be written in rem; it cannot tell a rem that sits on the
// type scale from one that sits between steps, so a page can pass v16 while its
// sizes drift off the scale its own tokens declare. v46 reads the scale from the
// page itself: the :root type-size tokens (a name such as --text-*, --font-size-*,
// --fs-* or --type-*, whose value resolves to a static rem or px length; colour
// tokens named --text-muted never resolve to a length, so they never count). The
// steps are every token value plus the token ratio (the median of consecutive
// token ratios) extended four steps below and ten above the token nearest 16px.
// The floor is the smallest type token.
//
// Fluid type is a deliberate design move, so a clamp(), min() or max() that
// moves with a viewport or container unit is accepted as written; only its lower
// bound is held to the floor. Relative sizes (em, %, inherit, keywords) follow
// their parent, not the global scale, and are not judged. A static rem or px
// size is judged: off the scale when it sits more than 2.5% from every step,
// below the floor when it is smaller than the smallest type token.
//
// WARN only: an off-scale size is a hygiene finding, not a broken page.
const V46_ITEM = 'Type sizes come from the scale';
const V46_TOLERANCE = 0.025;
const V46_FLUID = /(?:^|[^a-z-])(?:[sld]?v[wh]|v[ib]|vmin|vmax|cq[iwhb]|cqmin|cqmax)\b/i;

function v46StaticPx(value: string): number | null {
  const m = value.trim().match(/^(\d+(?:\.\d+)?|\.\d+)(rem|px)$/i);
  if (!m) return null;
  return parseFloat(m[1]) * (m[2].toLowerCase() === 'rem' ? 16 : 1);
}

function v46TypeScale(tokens: Record<string, string>): { steps: number[]; floor: number; ratio: number; count: number } | null {
  const values: number[] = [];
  for (const [name, raw] of Object.entries(tokens)) {
    if (!/^--(?:text|font-size|fs|type)-[\w-]+$/i.test(name)) continue;
    const px = v46StaticPx(resolveVar(raw, tokens));
    if (px !== null && px > 0) values.push(px);
  }
  const unique = [...new Set(values.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  if (unique.length < 3) return null;
  const ratios: number[] = [];
  for (let i = 1; i < unique.length; i++) {
    const r = unique[i] / unique[i - 1];
    if (r >= 1.05 && r <= 1.7) ratios.push(r);
  }
  ratios.sort((a, b) => a - b);
  const ratio = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1.25;
  const base = unique.reduce((best, v) => (Math.abs(v - 16) < Math.abs(best - 16) ? v : best), unique[0]);
  const steps = new Set<number>(unique);
  for (let n = -4; n <= 10; n++) steps.add(Math.round(base * Math.pow(ratio, n) * 1000) / 1000);
  return { steps: [...steps].sort((a, b) => a - b), floor: unique[0], ratio, count: unique.length };
}

/** Lower bound in px of a fluid size: clamp()'s first argument, or the largest static argument of max(). */
function v46FluidFloor(value: string): number | null {
  const fn = value.trim().match(/^(clamp|max)\((.*)\)$/i);
  if (!fn) return null;
  const args = splitCssTopLevel(fn[2], ',').map((a) => v46StaticPx(a));
  if (fn[1].toLowerCase() === 'clamp') return args.length === 3 ? args[0] : null;
  const statics = args.filter((a): a is number => a !== null);
  return statics.length ? Math.max(...statics) : null;
}

// Engine 1.5.2: the `font` shorthand sets a size too, and until 1.5.2 v46 read
// only `font-size`, so `font: 500 0.66rem/1 var(--mono)` sat outside the check.
// The size is the first token that is a length, a size keyword or a size
// function, ahead of the line-height slash and the family; a weight (500) has
// no unit and a family name is no length, so neither is taken. A system font
// keyword (caption, menu…) or a CSS-wide keyword sets no measurable size.
const V46_FONT_SYSTEM = /^(?:caption|icon|menu|message-box|small-caption|status-bar|inherit|initial|unset|revert|revert-layer)$/i;
const V46_SIZE_WORDS = new Set(['small', 'large', 'x-small', 'x-large', 'xx-small', 'xx-large', 'xxx-small', 'xxx-large', 'medium', 'smaller', 'larger']);

/** `s` with A to Z lower-cased and every other code unit kept: the case folding of the /i flag without the u flag. */
function foldAsciiCase(s: string): string {
  return s.replace(/[A-Z]+/g, (run) => run.toLowerCase());
}

/**
 * Whether a shorthand token is a size, as
 * /^(?:\d*\.?\d+(?:[a-z]+|%)|(?:xx?-|xxx-)?(?:small|large)|medium|smaller|larger|(?:clamp|min|max|calc)\(.*\))$/i
 * answers: a number and then a unit or %, a size keyword, or a size function
 * whose parenthesis closes at the end of the token with no line break inside.
 * Read in one pass: the number in that pattern can split a run of digits
 * between \d* and \d+ in as many ways as the run is long.
 */
function isV46SizeToken(s: string): boolean {
  const n = s.length;
  let k = 0;
  let dot = false;
  for (; k < n; k++) {
    const c = s.charCodeAt(k);
    if (c === 46) {
      if (dot) return false;                                       // a second dot ends every reading
      dot = true;
    } else if (!isDigit(c)) break;
  }
  if (k > 0) {
    if (k === n || s.charCodeAt(k - 1) === 46) return false;       // the number ends in a digit, and a unit follows it
    if (k === n - 1 && s.charCodeAt(k) === 37) return true;        // %
    for (let i = k; i < n; i++) {
      const c = s.charCodeAt(i) | 32;
      if (c < 97 || c > 122) return false;
    }
    return true;
  }
  if (n <= 9 && V46_SIZE_WORDS.has(foldAsciiCase(s))) return true;
  const open = s.indexOf('(');
  if (open < 3 || open > 5 || n < open + 2 || s.charCodeAt(n - 1) !== 41) return false;
  const fn = foldAsciiCase(s.slice(0, open));
  if (fn !== 'clamp' && fn !== 'min' && fn !== 'max' && fn !== 'calc') return false;
  for (let i = open + 1; i < n - 1; i++) if (isLineTerminator(s.charCodeAt(i))) return false;
  return true;
}

/** The size written inside a `font` shorthand value, or null when it carries none. */
function v46ShorthandSize(value: string, tokens: Record<string, string>): string | null {
  const whole = resolveVar(value, tokens);                         // a whole-shorthand token alias
  if (V46_FONT_SYSTEM.test(whole)) return null;
  for (const part of splitCssTopLevel(whole.replace(/\//g, ' / ').replace(/\s+/g, ' '), ' ')) {
    if (part === '/') return null;                                 // a slash before any size: not a shorthand v46 can read
    if (isV46SizeToken(resolveVar(part, tokens))) return part;
  }
  return null;
}

/**
 * The declarations v46 reads: matches of
 * /(font-size|(?<![\w-])font)\s*:\s*([^;}]+)/gi, groups [property, value].
 * A font-size match is read past its value, as the global pattern reads it.
 * After a `font` match the scan goes on from the end of the word, so a
 * shorthand never swallows a font-size written after it. A `font` match is
 * dropped when it sits inside the value of the shorthand before it (it is
 * that value's own text), or when its value holds a `{`: an @supports
 * condition such as `(font: -apple-system-body) and …{` declares nothing.
 *
 * Engine 1.5.2. Each start is tried once, and the starts that share a value's
 * end share one search for it, so the scan reads the sheet in linear time.
 */
function v46SizeDecls(css: string): ScanMatch[] {
  const start = /font/gi;
  const sizeWord = /-size/iy;
  const valueEnd = nextMatchFinder(css, /[;}]/g);
  const brace = nextMatchFinder(css, /\{/g);
  const out: ScanMatch[] = [];
  let shorthandEnd = -1;
  for (let pos = 0; ;) {
    start.lastIndex = pos;
    const m = start.exec(css);
    if (!m) break;
    const at = m.index;
    pos = at + 1;
    sizeWord.lastIndex = at + 4;
    const size = sizeWord.test(css);
    if (!size && (at < shorthandEnd || (at > 0 && isNameChar(css.charCodeAt(at - 1))))) continue;
    const word = size ? 9 : 4;
    const colon = wsEnd(css, at + word);
    if (css.charCodeAt(colon) !== 58) continue;
    const ws = wsEnd(css, colon + 1);
    let from = ws;
    let end = ws;
    if (ws < css.length && css.charCodeAt(ws) !== 59 && css.charCodeAt(ws) !== 125) {
      const r = valueEnd(ws);
      end = r === Infinity ? css.length : r;
    } else if (ws > colon + 1) {
      from = ws - 1;                                               // only white space before the end: the value is its last character
    } else continue;
    if (size) {
      pos = end;
    } else {
      pos = at + 4;
      if (brace(from) < end) continue;
      shorthandEnd = end;
    }
    out.push({ index: at, text: css.slice(at, end), groups: [css.slice(at, at + word), css.slice(from, end)] });
  }
  return out;
}

/**
 * The selector of the rule a v46 finding sits in, by offset: the text from
 * the `{`, `}` or `;` before the last `{` at or before the offset up to that
 * brace, without comments, white space collapsed, cut to 80 characters (''
 * when no `{` comes before the offset).
 *
 * Engine 1.5.2: the sheet's braces and semicolons are listed once, each offset
 * is answered by binary search, and the findings of one rule share one
 * reading of its selector. Before, each finding ran four lastIndexOf scans,
 * and on a sheet with few braces or semicolons each one read back toward the
 * start of the sheet, so the check's cost grew with the square of its length.
 */
function v46SelectorFinder(css: string): (at: number) => string {
  const opens: number[] = [];
  const marks: number[] = [];
  for (let i = 0; i < css.length; i++) {
    const c = css.charCodeAt(i);
    if (c === 123) { opens.push(i); marks.push(i); } else if (c === 125 || c === 59) marks.push(i);
  }
  const read = new Map<number, string>();
  return (at: number) => {
    const k = lowerBound(opens, at + 1) - 1;                       // the last `{` at or before the offset
    if (k < 0) return '';
    const open = opens[k];
    let selector = read.get(open);
    if (selector === undefined) {
      const j = lowerBound(marks, open) - 1;                       // the `{`, `}` or `;` before it
      selector = withoutCssComments(css.slice(j < 0 ? 0 : marks[j] + 1, open), ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
      read.set(open, selector);
    }
    return selector;
  };
}

function checkTypeScale(css: string, tokens: Record<string, string>): CheckResult {
  const scale = v46TypeScale(tokens);
  if (!scale) {
    return { id: 'v46', item: V46_ITEM, category: 'cadence', status: 'SKIP', detail: 'fewer than 3 type-size tokens in :root: no scale to measure against' };
  }
  const { steps, floor, ratio } = scale;
  const nearest = (px: number) => steps.reduce((best, s) => (Math.abs(s - px) < Math.abs(best - px) ? s : best), steps[0]);
  const onScale = (px: number) => steps.some((s) => Math.abs(px - s) / s <= V46_TOLERANCE);
  const below = (px: number) => px < floor * (1 - V46_TOLERANCE);
  type Finding = { selector: string; value: string; px: number; issue: string; nearest: number };
  const findings: Finding[] = [];
  const seen = new Set<string>();                                  // one finding per rule: a bundle repeats rules across @media copies
  const add = (f: Finding) => {
    const key = `${f.selector}|${f.value}|${f.issue}`;
    if (!seen.has(key)) { seen.add(key); findings.push(f); }
  };
  let judged = 0;
  let fluid = 0;
  const selectorAt = v46SelectorFinder(css);
  for (const m of v46SizeDecls(css)) {                             // engine 1.5.2: font-size and the font shorthand
    const declared = withoutCssComments(m.groups[1] as string, '').replace(/!important/i, '').trim();
    const written = (m.groups[0] as string).length === 4 ? v46ShorthandSize(declared, tokens) : declared;
    if (written === null) continue;
    const value = resolveVar(written, tokens);
    if (/^var\(/i.test(value)) continue;                            // an alias the token table cannot resolve
    if (/^(?:clamp|min|max)\(/i.test(value) && V46_FLUID.test(value)) {
      fluid++;
      const low = v46FluidFloor(value);
      if (low !== null && below(low)) {
        add({ selector: selectorAt(m.index), value: written, px: Math.round(low * 100) / 100, issue: 'fluid minimum below the floor', nearest: floor });
      }
      continue;
    }
    const px = v46StaticPx(value);
    if (px === null) continue;                                      // em, %, keywords, calc(): relative or not static
    judged++;
    if (below(px)) {
      add({ selector: selectorAt(m.index), value: written, px: Math.round(px * 100) / 100, issue: 'below the floor', nearest: floor });
    } else if (!onScale(px)) {
      add({ selector: selectorAt(m.index), value: written, px: Math.round(px * 100) / 100, issue: 'off the scale', nearest: nearest(px) });
    }
  }
  const scaleText = `${steps.length}-step scale (ratio ${ratio.toFixed(3)}, ${scale.count} type tokens, floor ${floor}px)`;
  if (judged + fluid === 0) {
    return { id: 'v46', item: V46_ITEM, category: 'cadence', status: 'SKIP', detail: `no static or fluid font sizes outside the tokens to measure against the ${scaleText}` };
  }
  const offScale = findings.filter((f) => f.issue === 'off the scale').length;
  const underFloor = findings.length - offScale;
  if (findings.length === 0) {
    return { id: 'v46', item: V46_ITEM, category: 'cadence', status: 'PASS', detail: `${judged} static and ${fluid} fluid sizes sit on the ${scaleText}` };
  }
  return {
    id: 'v46', item: V46_ITEM, category: 'cadence', status: 'WARN',
    detail: `${offScale} static size(s) off the ${scaleText} and ${underFloor} below its floor, of ${judged} static and ${fluid} fluid sizes measured`,
    evidence: {
      findings: findings.slice(0, 20).map((f) => ({ selector: f.selector, value: f.value, px: f.px, issue: f.issue, nearest: f.nearest })),
      truncated: Math.max(0, findings.length - 20),
    },
  };
}

function checkPausedEntrances(css: string): CheckResult {
  const ID = 'v45';
  const ITEM = 'Pausing motion keeps content visible';
  const CATEGORY = 'motion';
  const { rules, keyframes } = parseCssRules(css);
  const parsed = rules.map((rule) => ({ rule, decls: parseCssDecls(rule.decls) }));
  const isReduce = (at: string[]) => at.some((a) => a.startsWith('@media') && /prefers-reduced-motion(?!\s*:\s*no-preference)/.test(a));
  const isNoPreference = (at: string[]) => at.some((a) => a.startsWith('@media') && /prefers-reduced-motion\s*:\s*no-preference/.test(a));
  const rootTokens: Record<string, string> = {};
  for (const { rule, decls } of parsed) {
    if (rule.at.some((a) => a.startsWith('@media'))) continue;
    if (!splitCssTopLevel(rule.selector, ',').some((p) => /^\s*(?::root|html)\s*$/i.test(p))) continue;
    for (const d of decls) if (d.prop.startsWith('--')) rootTokens[d.prop] = d.value;
  }

  // 1. Pause scopes.
  const scopes: V45Scope[] = [];
  for (const { rule, decls } of parsed) {
    const pause = [...decls].reverse().find((d) => d.prop === 'animation-play-state');
    if (!pause || !/^paused(?:\s*,\s*paused)*$/i.test(pause.value)) continue;
    const media = isReduce(rule.at);
    for (const part of splitCssTopLevel(rule.selector, ',')) {
      const comps = selectorCompounds(part);
      const subject = comps[comps.length - 1];
      if (!subject || !/^\*(?:::?(?:before|after))?$/i.test(subject.compound)) continue;
      let prefix = '';
      if (comps.length === 2 && comps[1].comb === ' ' && isDocumentScope(comps[0].compound)) prefix = simpleSelectors(comps[0].compound).join('');
      else if (comps.length !== 1) continue;
      if (scopes.some((s) => s.prefix === prefix && s.media === media)) continue;
      scopes.push({ prefix, media, selector: part, important: pause.important, spec: selectorSpecificity(part), order: rule.order, decls });
    }
  }
  if (!scopes.length) {
    return { id: ID, item: ITEM, category: CATEGORY, status: 'SKIP', detail: 'not applicable: no rule pauses every element (animation-play-state: paused on *)' };
  }

  // 2. Keyframes that start invisible (the last block of a name wins).
  const hiddenNames = new Set<string>();
  const byName = new Map<string, CssKeyframesBlock>();
  for (const k of keyframes) byName.set(k.name, k);
  for (const [name, k] of byName) {
    // The first frame, and the last: an animation that also ends invisible
    // (a flash or a glow that fades out) hides nothing a pause would reveal.
    const frameHides = (edge: RegExp) => {
      let opacity: string | null = null;
      let visibility: string | null = null;
      for (const f of k.frames) {
        if (!f.selector.split(',').some((x) => edge.test(x.trim()))) continue;
        for (const d of parseCssDecls(f.decls)) {
          if (d.prop === 'opacity') opacity = d.value.trim();
          if (d.prop === 'visibility') visibility = d.value.trim().toLowerCase();
        }
      }
      return (opacity !== null && /\d/.test(opacity) && isZeroOpacity(opacity)) || visibility === 'hidden';
    };
    if (frameHides(/^(?:from|0*(?:\.0+)?%)$/) && !frameHides(/^(?:to|100(?:\.0+)?%)$/)) hiddenNames.add(name);
  }

  // 3. One-shot entrances using them, held on their first frame.
  type Entrance = { name: string; part: string; spec: number[]; order: number; important: boolean; shorthand: boolean; durationMs: number | null; gated: boolean };
  const entrances: Entrance[] = [];
  if (hiddenNames.size) {
    for (const { rule, decls } of parsed) {
      if (isReduce(rule.at)) continue;
      const anim = [...decls].reverse().find((d) => d.prop === 'animation' || d.prop === 'animation-name');
      if (!anim) continue;
      const list = (prop: string) => {
        const d = [...decls].reverse().find((x) => x.prop === prop);
        return d ? splitCssTopLevel(substituteCssVars(d.value, [rootTokens]) ?? d.value, ',') : null;
      };
      const segments = splitCssTopLevel(anim.value, ',');
      segments.forEach((segment, idx) => {
        const resolved = substituteCssVars(segment, [rootTokens]) ?? segment;
        const tokens = splitCssTopLevel(resolved, ' ');
        const name = anim.prop === 'animation-name' ? segment.trim() : splitCssTopLevel(segment, ' ').find((t) => hiddenNames.has(t));
        if (!name || !hiddenNames.has(name)) return;
        let infinite = anim.prop === 'animation' && tokens.some((t) => t.toLowerCase() === 'infinite');
        const times = anim.prop === 'animation' ? tokens.map(cssTimeMs).filter((x): x is number => x !== null) : [];
        const unknownTime = anim.prop === 'animation' && tokens.some((t) => /^var\(/i.test(t));
        let durationMs: number | null = anim.prop === 'animation' ? (times.length ? times[0] : unknownTime ? null : 0) : null;
        let delayMs: number | null = anim.prop === 'animation' ? (times.length > 1 ? times[1] : unknownTime ? null : 0) : 0;
        let fill = anim.prop === 'animation' ? (tokens.find((t) => /^(?:none|forwards|backwards|both)$/i.test(t)) ?? 'none').toLowerCase() : 'none';
        const pick = (l: string[] | null) => (l && l.length ? l[idx % l.length] : null);
        const count = pick(list('animation-iteration-count'));
        if (count !== null) infinite = /infinite/i.test(count);
        const dur = pick(list('animation-duration'));
        if (dur !== null) durationMs = cssTimeMs(dur);
        const del = pick(list('animation-delay'));
        if (del !== null) delayMs = cssTimeMs(del);
        const fm = pick(list('animation-fill-mode'));
        if (fm !== null) fill = fm.toLowerCase();
        if (infinite || durationMs === 0) return;
        if (delayMs !== null && delayMs > 0 && (fill === 'none' || fill === 'forwards')) return;
        for (const part of splitCssTopLevel(rule.selector, ',')) {
          entrances.push({ name, part, spec: selectorSpecificity(part), order: rule.order, important: anim.important, shorthand: anim.prop === 'animation', durationMs, gated: isNoPreference(rule.at) });
        }
      });
    }
  }

  // 4. Overrides: rules that end or remove an animation, with what they reach.
  const neutralises = (decls: CssDecl[], durationMs: number | null): 'yes' | 'maybe' | 'no' => {
    let best: 'yes' | 'maybe' | 'no' = 'no';
    for (const d of decls) {
      const v = d.value.trim().toLowerCase();
      if ((d.prop === 'animation' || d.prop === 'animation-name') && /^none(?:\s*,\s*none)*$/.test(v)) return 'yes';
      if (d.prop === 'animation-play-state' && /^running(?:\s*,\s*running)*$/.test(v)) return 'yes';
      if (d.prop === 'animation-delay') {
        const ms = splitCssTopLevel(substituteCssVars(v, [rootTokens]) ?? v, ',').map(cssTimeMs);
        if (ms.length && ms.every((x) => x !== null && x < 0)) {
          const shortest = Math.min(...ms.map((x) => -(x as number)));
          if (durationMs !== null ? shortest >= durationMs : shortest >= 60000) return 'yes';
          if (durationMs === null) best = 'maybe';
        }
      }
    }
    return best;
  };
  const overrides = parsed
    .map(({ rule, decls }) => ({ rule, decls }))
    .filter(({ decls }) => decls.some((d) => /^animation(?:-name|-play-state|-delay)?$/.test(d.prop)));

  type Verdict = { entrance: Entrance; scope: V45Scope; status: 'PASS' | 'WARN' | 'FAIL'; override: string | null };
  const verdicts: Verdict[] = [];
  const seen = new Set<string>();
  for (const scope of scopes) {
    for (const e of entrances) {
      if (scope.media && e.gated) continue;
      const reaches = scope.important || !e.shorthand || compareSpecificity(scope.spec, e.spec) > 0
        || (compareSpecificity(scope.spec, e.spec) === 0 && scope.order > e.order);
      if (!reaches) continue;
      const key = `${scope.prefix}|${scope.media}|${e.name}|${e.part}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const eComps = selectorCompounds(e.part);
      const eSubject = simpleSelectors(eComps[eComps.length - 1]?.compound ?? '');
      let status: Verdict['status'] = 'FAIL';
      let override: string | null = null;
      const own = neutralises(scope.decls, e.durationMs);
      if (own === 'yes') { status = 'PASS'; override = scope.selector; }
      for (const o of overrides) {
        if (status === 'PASS') break;
        for (const oPart of splitCssTopLevel(o.rule.selector, ',')) {
          if (status === 'PASS') break;
          const oComps = selectorCompounds(oPart);
          let rel: string | null = null;
          let otherScope = false;
          if (scope.media) {
            if (isReduce(o.rule.at)) rel = oPart;
            else if (oComps.length > 1 && isDocumentScope(oComps[0].compound)) otherScope = true;
          } else if (scope.prefix) {
            const first = simpleSelectors(oComps[0]?.compound ?? '').join('');
            if (oComps.length > 1 && oComps[1].comb === ' ' && first === scope.prefix && !isReduce(o.rule.at)) {
              rel = oPart.slice(oPart.indexOf(oComps[0].compound) + oComps[0].compound.length).trim();
            } else if (isReduce(o.rule.at) || (oComps.length > 1 && isDocumentScope(oComps[0].compound))) otherScope = true;
          } else {
            rel = oPart;
          }
          if (rel === null && !otherScope) continue;
          const effect = neutralises(o.decls, e.durationMs);
          if (effect === 'no') continue;
          // Under another scope: the selector after its document prefix, or
          // all of it inside a reduced-motion block.
          const target = rel ?? (isReduce(o.rule.at) && !(oComps.length > 1 && isDocumentScope(oComps[0].compound))
            ? oPart
            : oPart.slice(oPart.indexOf(oComps[0].compound) + oComps[0].compound.length).trim());
          let match: 'exact' | 'partial' | null = null;
          for (const alt of expandIsWhere(target)) {
            const aComps = selectorCompounds(alt);
            const aSubject = simpleSelectors(aComps[aComps.length - 1]?.compound ?? '');
            if (selectorCovers(alt, e.part)) { match = 'exact'; break; }
            const named = (x: string) => x.startsWith('.') || x.startsWith('#') || x.startsWith('[');
            if (aSubject.some((x) => named(x) && compoundCovers([x], eSubject))) match = 'partial';
          }
          if (!match) continue;
          const oSpec = selectorSpecificity(oPart);
          const wins = o.decls.some((d) => d.important && /^animation(?:-name|-play-state|-delay)?$/.test(d.prop)) || (!e.important && (compareSpecificity(oSpec, e.spec) > 0
            || (compareSpecificity(oSpec, e.spec) === 0 && o.rule.order > e.order)));
          if (match === 'exact' && effect === 'yes' && wins && rel !== null) { status = 'PASS'; override = oPart; }
          else if (status === 'FAIL') { status = 'WARN'; override = oPart; }
        }
      }
      verdicts.push({ entrance: e, scope, status, override });
    }
  }

  const scopeNames = scopes.map((s) => (s.media ? `@media (prefers-reduced-motion: reduce) ${shortSelector(s.selector)}` : shortSelector(s.selector)));
  if (!verdicts.length) {
    return {
      id: ID, item: ITEM, category: CATEGORY, status: 'PASS',
      detail: `pause scope ${scopeNames.join(', ')}: no one-shot entrance it holds starts at opacity 0`,
      evidence: { findings: [], truncated: 0 },
    };
  }
  const rank = { FAIL: 0, WARN: 1, PASS: 2 };
  verdicts.sort((a, b) => rank[a.status] - rank[b.status]);
  const fails = verdicts.filter((v) => v.status === 'FAIL');
  const warns = verdicts.filter((v) => v.status === 'WARN');
  const status = fails.length ? 'FAIL' : warns.length ? 'WARN' : 'PASS';
  const pauseRule = (v: Verdict) => (v.scope.media ? `@media (prefers-reduced-motion: reduce) ${shortSelector(v.scope.selector)}` : shortSelector(v.scope.selector));
  const say = (v: Verdict) => `@keyframes ${v.entrance.name} on ${shortSelector(v.entrance.part)} under ${pauseRule(v)}${v.override ? ` (override: ${shortSelector(v.override)})` : ''}`;
  const lead = status === 'FAIL' ? fails : warns;
  const detail = status === 'PASS'
    ? `${verdicts.length} entrance(s) that start at opacity 0 end or are removed under the pause (${scopeNames.join(', ')})`
    : status === 'FAIL'
      ? `${fails.length} entrance(s) start at opacity 0 and stay held invisible under the pause: ${fails.slice(0, 2).map(say).join(' | ')}${fails.length > 2 ? ` | ${fails.length - 2} more` : ''}`
      : `${warns.length} entrance(s) with an override whose selector or scope does not clearly match: ${lead.slice(0, 2).map(say).join(' | ')}${warns.length > 2 ? ` | ${warns.length - 2} more` : ''}`;
  return {
    id: ID, item: ITEM, category: CATEGORY, status, detail,
    evidence: {
      findings: verdicts.slice(0, 20).map((v) => ({ keyframes: v.entrance.name, selector: shortSelector(v.entrance.part), pauseRule: pauseRule(v), override: v.override === null ? null : shortSelector(v.override), status: v.status })),
      truncated: Math.max(0, verdicts.length - 20),
    },
  };
}

function checkFontSmoothing(css: string): CheckResult {
  const hasAntialiased = /-webkit-font-smoothing\s*:\s*antialiased/i.test(css);
  const hasMoz = /-moz-osx-font-smoothing\s*:\s*grayscale/i.test(css);
  if (hasAntialiased && hasMoz) return { id: 'v15', item: 'Font smoothing: antialiased + grayscale on :root confirmed', category: 'cadence', status: 'PASS', detail: 'both font-smoothing properties present' };
  return { id: 'v15', item: 'Font smoothing: antialiased + grayscale on :root confirmed', category: 'cadence', status: 'WARN', detail: 'missing complete font-smoothing declaration' };
}

function checkRemScale(css: string): CheckResult {
  // v16 — text sizes in rem. The intent is font-size discipline (the Cadence
  // contract), not layout px (borders, widths, shadows are legitimately px).
  // Count font-size declarations only, so SVG micro-labels and non-font px
  // don't drown the signal.
  const remMatches = (css.match(/font-size\s*:\s*[\d.]+rem/gi) || []).length;
  const pxMatches = (css.match(/font-size\s*:\s*[\d.]+px/gi) || []).length;
  if (remMatches > pxMatches) return { id: 'v16', item: 'Rem-based scale: all text sizes in rem, root at 16px confirmed', category: 'cadence', status: 'PASS', detail: `${remMatches} rem vs ${pxMatches} px` };
  return { id: 'v16', item: 'Rem-based scale: all text sizes in rem, root at 16px confirmed', category: 'cadence', status: 'WARN', detail: `${pxMatches} px vs ${remMatches} rem` };
}

// v08 — Poise interaction rules (static half of contract.interaction).
// Verifies the CSS-detectable subset of contract.interaction rules:
//   - Hover translation guarded by fine-pointer + hover-capable media query
//   - Press settle uses scale ~0.97 with ease-out
//   - Wordmark breath is opacity-only (no blur/glow on mark selectors)
// The interaction-feel half (subjective "response louder than action") needs a
// live browser and remains out of reach for static fetch. When the static rules
// are present we PASS with a note; absent rules earn a WARN (useful signal for
// sites that haven't adopted interaction-quality discipline).
function checkPoiseInteractionRules(css: string): CheckResult {
  const rules = [
    {
      name: 'fine-pointer hover guard',
      test: (s: string) => mediaQueryHasHoverGuard(s),
    },
    {
      name: 'press settle scale ~0.97',
      test: (s: string) => /scale\s*\(\s*0?\.9[5-9]\s*\)/i.test(s),
    },
    {
      name: 'opacity-only mark breath',
      test: (s: string) => hasBreathKeyframes(s),
    },
  ];
  const found = rules.filter(r => r.test(css)).map(r => r.name);
  const missing = rules.filter(r => !r.test(css)).map(r => r.name);
  if (found.length >= 2) {
    return {
      id: 'v08',
      item: 'Poise interaction rules match live /labs/poise and contract.interaction',
      category: 'poise',
      status: 'PASS',
      detail: `static half verified: ${found.join(', ')} (interaction-feel half requires browser)`,
    };
  }
  return {
    id: 'v08',
    item: 'Poise interaction rules match live /labs/poise and contract.interaction',
    category: 'poise',
    status: 'WARN',
    detail: `missing: ${missing.join(', ')}`,
  };
}

// v09 — Poise keyboard path (static half).
// contract.interaction.verification includes /review/poise/keyboard. The static
// half verifies that keyboard-navigation affordances exist in CSS+HTML:
//   - :focus-visible carries a visible style (not outline:none alone)
//   - :focus carries visible styling or is aliased to :focus-visible
// The browser half (tab-order traversal, visible focus ring on real elements)
// needs a live DOM. Static presence earns PASS; stripped focus earns WARN.
function checkPoiseKeyboardPath(css: string, html: string): CheckResult {
  const hasFocusVisible = /:focus-visible/i.test(css);
  const hasFocus = /:focus[^-]/i.test(css);
  // Detect focus styles that strip outline without a replacement ring/box-shadow
  const stripsOutline = focusStripsOutline(css);
  const hasFocusRing = focusHasRing(css);
  const hasTabindex = /tabindex\s*=/i.test(html);
  const hasAria = /aria-(label|labelledby|describedby|expanded|selected|pressed)/i.test(html);

  const signals = [hasFocusVisible, hasFocus, hasFocusRing, hasTabindex, hasAria].filter(Boolean).length;
  if (stripsOutline && !hasFocusRing) {
    return {
      id: 'v09',
      item: 'Poise keyboard-path verification remains published and current',
      category: 'poise',
      status: 'WARN',
      detail: 'focus styles strip outline without replacement ring',
    };
  }
  if (signals >= 3) {
    return {
      id: 'v09',
      item: 'Poise keyboard-path verification remains published and current',
      category: 'poise',
      status: 'PASS',
      detail: `static half verified: ${signals} keyboard-affordance signals (tab-order traversal requires browser)`,
    };
  }
  return {
    id: 'v09',
    item: 'Poise keyboard-path verification remains published and current',
    category: 'poise',
    status: 'WARN',
    detail: `only ${signals} keyboard-affordance signals found`,
  };
}

// v10 — Takt interface-feel rules (static half of contract.takt).
// Verifies CSS-detectable Takt rules not already covered by v11/v12/v13:
//   - Stagger enter animations: animation-delay in 60-120ms band
//   - Soften exits: transition on transform/translateY with ease-out
//   - Concentric radius: multiple border-radius values declared (weak proxy)
// The press-scale half is already covered by v13; transition:all by v11;
// will-change by v12. Browser-feel half (actual press behavior, hit-area
// measurement) remains out of reach for static fetch.
function checkTaktFeelRules(css: string): CheckResult {
  const rules = [
    {
      name: 'stagger enter animation-delay',
      test: (s: string) => /animation-delay\s*:\s*(?:0?\.(?:0?[6-9]|1[0-2])\d*s|\d{2,3}ms)/i.test(s),
    },
    {
      name: 'soften exit transform ease-out',
      test: (s: string) => hasTransformEaseTransition(s),
    },
    {
      name: 'concentric border-radius set',
      test: (s: string) => /border-radius\s*:\s*\d+/i.test(s),
    },
  ];
  const found = rules.filter(r => r.test(css)).map(r => r.name);
  const missing = rules.filter(r => !r.test(css)).map(r => r.name);
  if (found.length >= 2) {
    return {
      id: 'v10',
      item: 'Takt interface-feel rules match live CSS and contract.takt',
      category: 'takt',
      status: 'PASS',
      detail: `static half verified: ${found.join(', ')} (press-behavior + hit-area require browser)`,
    };
  }
  return {
    id: 'v10',
    item: 'Takt interface-feel rules match live CSS and contract.takt',
    category: 'takt',
    status: 'WARN',
    detail: `missing: ${missing.join(', ')}`,
  };
}

// v34 — AI-Disclosure Readiness (EU AI Act Article 50, which applies from
// 2026-08-02). Static, from the fetched HTML: it looks for an AI chat surface
// and for a disclosure signal (visible text, aria-label, data-ai-disclosure,
// generator meta, C2PA, JSON-LD).
//
// Article 50(1) puts the duty on the PROVIDER of an AI system that talks with
// people: they must be told it is an AI, unless that is obvious from the
// context, at the latest at the first interaction (50(5)). A site that embeds
// a vendor's assistant may not be that provider, so the check says "may
// require", never "requires", and it is not a legal finding.
//
// Only a positively identified AI chat surface with no disclosure FAILs: a
// container or input that names itself a chatbot or an AI assistant, or a
// script from a chatbot, AI-widget or Dialogflow path. Anything weaker WARNs
// "possible AI surface: review": live-chat vendors (Intercom, Drift, Zendesk,
// LiveChat, Tawk, Crisp), which are often answered by people; a generic chat
// container or an "assistant" script; page text about AI, which is not a chat
// surface. Until engine 1.3.0 those FAILed, and so did Google Publisher Tag,
// an ad tag, because its gpt.js matched the word "gpt".
function checkAiDisclosure(html: string): CheckResult {
  const ITEM = 'AI-Disclosure Readiness (EU AI Act Art 50, effective 2026-08-02)';
  const CATEGORY = 'identity';

  // Strip scripts/styles for visible-text checks but keep them for script-src
  // and JSON-LD detection. We use both raw html and a visible-only variant.
  const visibleHtml = withoutScriptsAndStyles(html);
  // Text-only: strip all tags so attribute values like class="chatbot" don't
  // false-positive as disclosure TEXT. Disclosure text must be human-readable
  // content between tags, not class/id/aria attribute values.
  const textOnly = withoutTags(visibleHtml, ' ', true);

  // ── AI chat surfaces, positively identified ─────────────────────────────

  // ── Possible AI surfaces: a review item, never a FAIL ───────────────────
  const aiTextRe = /\b(?:chat\s*with\s*(?:ai|our\s*bot|ai\s*assistant)|ask\s+ai|ai\s+assistant|talk\s+to\s+(?:our\s+)?bot|powered\s+by\s+ai|ai-generated|ai\s+chatbot|virtual\s+assistant)\b/i;

  const surfaceSignals: string[] = [];
  if (hasAiChatContainer(html)) surfaceSignals.push('chatbot container');
  if (hasAiWidgetScript(html)) surfaceSignals.push('AI widget script');
  if (hasAiInput(html)) surfaceSignals.push('AI input');

  const possibleSignals: string[] = [];
  if (hasChatWidgetContainer(html)) possibleSignals.push('chat widget container');
  if (hasChatScript(html)) possibleSignals.push('chat or assistant script');
  if (aiTextRe.test(textOnly)) possibleSignals.push('AI prompt text');
  if (hasAmbiguousWidget(html)) possibleSignals.push('ambiguous widget');

  // ── Disclosure detection ────────────────────────────────────────────────
  const disclosureTextRe = /\b(?:ai\s+assistant|ai\s+chatbot|ai-powered|powered\s+by\s+ai|automated\s+assistant|virtual\s+assistant|chatbot)\b/i;
  const ariaDisclosureRe = /aria-(?:label|description)\s*=\s*["'][^"']*\b(?:ai|assistant|bot|automated|chatbot)\b/i;
  const c2paRe = /(?:<link\s+rel\s*=\s*["']c2pa-manifest["']|<meta\s+name\s*=\s*["']c2pa["'])/i;
  const dataAiRe = /data-ai-disclosure\s*=/i;

  const disclosureSignals: string[] = [];
  if (disclosureTextRe.test(textOnly)) disclosureSignals.push('visible AI text');
  if (ariaDisclosureRe.test(html)) disclosureSignals.push('aria-label');
  if (hasAiGeneratorMeta(html)) disclosureSignals.push('generator meta');
  if (c2paRe.test(html)) disclosureSignals.push('C2PA manifest');
  if (hasAiJsonLd(html)) disclosureSignals.push('JSON-LD');
  if (dataAiRe.test(html)) disclosureSignals.push('data-ai-disclosure');

  // ── Condition evaluation ────────────────────────────────────────────────
  if (surfaceSignals.length === 0 && possibleSignals.length === 0) {
    return { id: 'v34', item: ITEM, category: CATEGORY, status: 'PASS', detail: 'no AI-interactive surface detected: disclosure not required' };
  }

  if (disclosureSignals.length > 0) {
    const found = surfaceSignals.length > 0 ? `AI surface detected (${surfaceSignals.join(', ')})` : `possible AI surface (${possibleSignals.join(', ')})`;
    return { id: 'v34', item: ITEM, category: CATEGORY, status: 'PASS', detail: `${found}; disclosure present (${disclosureSignals.join(', ')})` };
  }

  if (surfaceSignals.length > 0) {
    return { id: 'v34', item: ITEM, category: CATEGORY, status: 'FAIL', detail: `AI chat surface detected (${surfaceSignals.join(', ')}) and no AI disclosure found: EU AI Act Art. 50(1) may require telling people at their first interaction that they are talking to an AI (a duty on the AI system's provider, applying from 2026-08-02)` };
  }

  return { id: 'v34', item: ITEM, category: CATEGORY, status: 'WARN', detail: `possible AI surface (${possibleSignals.join(', ')}): review. If it is an AI system and no disclosure is shown, EU AI Act Art. 50(1) may require one (a duty on the AI system's provider); a chat answered by people needs none` };
}

// v35 — Forced-colors readiness (Windows High Contrast Mode / Chrome forced-colors).
// Verifies the site has a @media (forced-colors: active) block, ideally with
// forced-color-adjust: none on brand-critical elements. Without this, Windows
// HCM users see a recolored page where logos, charts, and semantic-color
// indicators become illegible. 2026 consensus: design-system score tools
// should check forced-colors resilience (Cycle 9 + Cycle 13 research #1).
function checkForcedColors(css: string): CheckResult {
  const ITEM = 'Forced-colors readiness: @media (forced-colors: active) block present';
  const CATEGORY = 'accessibility';

  // Primary signal: @media (forced-colors: active) block exists
  const hasForcedColorsMedia = mediaQueryHasForcedColors(css);
  // Secondary signal: forced-color-adjust property used anywhere
  const hasForcedColorAdjust = /forced-color-adjust\s*:/i.test(css);
  // Tertiary signal: -ms-high-contrast (legacy Edge/IE) — still relevant
  const hasHighContrast = mediaQueryHasHighContrast(css);

  if (hasForcedColorsMedia && hasForcedColorAdjust) {
    return { id: 'v35', item: ITEM, category: CATEGORY, status: 'PASS', detail: 'forced-colors media query + forced-color-adjust both present' };
  }
  if (hasForcedColorsMedia) {
    return { id: 'v35', item: ITEM, category: CATEGORY, status: 'PASS', detail: 'forced-colors media query present (add forced-color-adjust: none on brand-critical elements for full resilience)' };
  }
  if (hasHighContrast && hasForcedColorAdjust) {
    return { id: 'v35', item: ITEM, category: CATEGORY, status: 'PASS', detail: 'legacy -ms-high-contrast + forced-color-adjust present (modernize to forced-colors: active)' };
  }
  if (hasHighContrast) {
    return { id: 'v35', item: ITEM, category: CATEGORY, status: 'WARN', detail: 'legacy -ms-high-contrast media query present: modernize to @media (forced-colors: active) and add forced-color-adjust: none on brand-critical elements' };
  }
  if (hasForcedColorAdjust) {
    return { id: 'v35', item: ITEM, category: CATEGORY, status: 'WARN', detail: 'forced-color-adjust used but no @media (forced-colors: active) block (add the media query guard)' };
  }
  return { id: 'v35', item: ITEM, category: CATEGORY, status: 'WARN', detail: 'no forced-colors media query or forced-color-adjust detected: Windows HCM users may see illegible UI' };
}

// v36 — Unicode Security: UTS #39 Confusable Detection in design tokens + CSS identifiers.
//
// This is the Unicode-binding moat — the only design verification engine that
// binds UTS #39 confusable detection into a contract check. No competitor
// (Google @google/design.md, Nutlope/hallmark, fabricioctelles/slop-eval,
// jakubkrehel/skills, Atlassian ADS) checks for confusable characters in
// design-system surfaces.
//
// UTS #39 defines "confusables" as pairs of Unicode characters that look
// identical or near-identical but have different code points — e.g., Latin
// 'a' (U+0061) vs Cyrillic 'а' (U+0430), Latin 'o' (U+006F) vs Cyrillic 'о'
// (U+043E). In a design system, confusables in token names, class names, or
// URL references enable:
//   - Token shadowing: --color-bg (Latin) vs --соlor-bg (Cyrillic 'с') looks
//     identical but resolves to a different value — a supply-chain attack
//     vector for injected CSS.
//   - Class spoofing: .btn-primary vs .btn-рrimary (Cyrillic 'р') bypasses
//     styling rules and can hide malicious UI.
//   - URL confusion: url(/assets/logo.png) vs url(/аssets/logo.png) loads
//     from a different path.
//
// Provenance: Unicode® Technical Standard #39, Unicode Security Mechanisms,
// Version 16.0.0. Copyright © 1991-2024 Unicode, Inc. Published under the
// Unicode License v3 — permits republishing with attribution.
// Reference: https://www.unicode.org/reports/tr39/
//
// The full UTS #39 confusable data file is ~500KB. We embed a curated subset
// covering the highest-risk Latin ↔ Cyrillic ↔ Greek confusables — the pairs
// most likely to appear in CSS identifiers (ASCII-range lookalikes). This is
// a static-check approximation; the full ICU confusables.txt integration is
// a follow-up. The check is deterministic: same CSS input → same result.

// ── UTS #39 confusable map (curated subset, Unicode 16.0.0) ──────────────────
// Each entry maps a confusable code point (Cyrillic/Greek/etc.) to its ASCII
// visual equivalent. We scan CSS identifiers for any character matching these
// code points and flag the position.
const CONFUSABLE_MAP: Record<string, string> = {
  // Latin → Cyrillic confusables (the highest-risk set for CSS identifiers)
  '\u0430': 'a',  // Cyrillic а → Latin a
  '\u0435': 'e',  // Cyrillic е → Latin e
  '\u043E': 'o',  // Cyrillic о → Latin o
  '\u0440': 'p',  // Cyrillic р → Latin p
  '\u0441': 'c',  // Cyrillic с → Latin c
  '\u0445': 'x',  // Cyrillic х → Latin x
  '\u0443': 'y',  // Cyrillic у → Latin y
  '\u0410': 'A',  // Cyrillic А → Latin A
  '\u0412': 'B',  // Cyrillic В → Latin B
  '\u0415': 'E',  // Cyrillic Е → Latin E
  '\u041A': 'K',  // Cyrillic К → Latin K
  '\u041C': 'M',  // Cyrillic М → Latin M
  '\u041D': 'H',  // Cyrillic Н → Latin H
  '\u041E': 'O',  // Cyrillic О → Latin O
  '\u0420': 'P',  // Cyrillic Р → Latin P
  '\u0421': 'C',  // Cyrillic С → Latin C
  '\u0422': 'T',  // Cyrillic Т → Latin T
  '\u0425': 'X',  // Cyrillic Х → Latin X
  '\u0446': 'u',  // Cyrillic ц → Latin u (approximate)
  '\u0448': 'w',  // Cyrillic ш → Latin w (approximate)
  '\u0456': 'i',  // Cyrillic і → Latin i
  '\u0458': 'j',  // Cyrillic ј → Latin j
  '\u0455': 's',  // Cyrillic ѕ → Latin s
  // Greek confusables
  '\u03BF': 'o',  // Greek ο → Latin o
  '\u0391': 'A',  // Greek Α → Latin A
  '\u0392': 'B',  // Greek Β → Latin B
  '\u0395': 'E',  // Greek Ε → Latin E
  '\u0396': 'Z',  // Greek Ζ → Latin Z
  '\u0397': 'H',  // Greek Η → Latin H
  '\u0399': 'I',  // Greek Ι → Latin I
  '\u039A': 'K',  // Greek Κ → Latin K
  '\u039C': 'M',  // Greek Μ → Latin M
  '\u039D': 'N',  // Greek Ν → Latin N
  '\u039F': 'O',  // Greek Ο → Latin O
  '\u03A1': 'P',  // Greek Ρ → Latin P
  '\u03A4': 'T',  // Greek Τ → Latin T
  '\u03A5': 'Y',  // Greek Υ → Latin Y
  '\u03A7': 'X',  // Greek Χ → Latin X
  '\u03C1': 'p',  // Greek ρ → Latin p
  '\u03C5': 'u',  // Greek υ → Latin u
  '\u03C7': 'x',  // Greek χ → Latin x
  // Fullwidth → ASCII (CJK range)
  '\uFF41': 'a',  // Fullwidth ａ → Latin a
  '\uFF42': 'b',  // Fullwidth ｂ → Latin b
  '\uFF43': 'c',  // Fullwidth ｃ → Latin c
  '\uFF44': 'd',  // Fullwidth ｄ → Latin d
  '\uFF45': 'e',  // Fullwidth ｅ → Latin e
  '\uFF46': 'f',  // Fullwidth ｆ → Latin f
  '\uFF47': 'g',  // Fullwidth ｇ → Latin g
  '\uFF48': 'h',  // Fullwidth ｈ → Latin h
  '\uFF49': 'i',  // Fullwidth ｉ → Latin i
  '\uFF4A': 'j',  // Fullwidth ｊ → Latin j
  '\uFF4B': 'k',  // Fullwidth ｋ → Latin k
  '\uFF4C': 'l',  // Fullwidth ｌ → Latin l
  '\uFF4D': 'm',  // Fullwidth ｍ → Latin m
  '\uFF4E': 'n',  // Fullwidth ｎ → Latin n
  '\uFF4F': 'o',  // Fullwidth ｏ → Latin o
  '\uFF50': 'p',  // Fullwidth ｐ → Latin p
  '\uFF51': 'q',  // Fullwidth ｑ → Latin q
  '\uFF52': 'r',  // Fullwidth ｒ → Latin r
  '\uFF53': 's',  // Fullwidth ｓ → Latin s
  '\uFF54': 't',  // Fullwidth ｔ → Latin t
  '\uFF55': 'u',  // Fullwidth ｕ → Latin u
  '\uFF56': 'v',  // Fullwidth ｖ → Latin v
  '\uFF57': 'w',  // Fullwidth ｗ → Latin w
  '\uFF58': 'x',  // Fullwidth ｘ → Latin x
  '\uFF59': 'y',  // Fullwidth ｙ → Latin y
  '\uFF5A': 'z',  // Fullwidth ｚ → Latin z
};

// Scan a string for confusable characters. Returns array of { char, pos,
// ascii } for each confusable found.
function findConfusables(text: string): Array<{ char: string; pos: number; ascii: string }> {
  const found: Array<{ char: string; pos: number; ascii: string }> = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const ascii = CONFUSABLE_MAP[ch];
    if (ascii) {
      found.push({ char: ch, pos: i, ascii });
    }
  }
  return found;
}

function checkSecurityConfusables(css: string, tokens: Record<string, string>): CheckResult {
  const ITEM = 'Unicode Security: no UTS #39 confusable characters in token names or CSS identifiers';
  const CATEGORY = 'security';

  // Scan 1: token names (the highest-value attack surface — token shadowing)
  // Token names are the keys of the :root custom properties. If a token name
  // contains a confusable, it can shadow a legitimate token.
  const tokenNameConfusables: string[] = [];
  for (const name of Object.keys(tokens)) {
    const found = findConfusables(name);
    if (found.length > 0) {
      const detail = found.map(f => `U+${f.char.codePointAt(0)?.toString(16).padStart(4, '0')}→${f.ascii}`).join(', ');
      tokenNameConfusables.push(`--${name.replace(/^--/, '')}: ${detail}`);
    }
  }

  // Scan 2: CSS class names and identifiers in selectors.
  // Extract class names (.className) and id selectors (#id) from CSS. Scan
  // each for confusables. This catches class spoofing attacks.
  const classRe = /\.([a-zA-Z_\u00A0-\uFFFF][\w\u00A0-\uFFFF-]*)/g;
  const idRe = /#([a-zA-Z_\u00A0-\uFFFF][\w\u00A0-\uFFFF-]*)/g;
  const identifierConfusables: string[] = [];
  const scannedClasses = new Set<string>();
  let m;
  while ((m = classRe.exec(css)) !== null) {
    const className = m[1];
    if (scannedClasses.has(className)) continue;
    scannedClasses.add(className);
    const found = findConfusables(className);
    if (found.length > 0) {
      const detail = found.map(f => `U+${f.char.codePointAt(0)?.toString(16).padStart(4, '0')}→${f.ascii}`).join(', ');
      identifierConfusables.push(`.${className}: ${detail}`);
    }
  }
  const scannedIds = new Set<string>();
  while ((m = idRe.exec(css)) !== null) {
    const idName = m[1];
    if (scannedIds.has(idName)) continue;
    scannedIds.add(idName);
    // Skip hex colors (#fff, #000 — these are not id selectors)
    if (/^[0-9a-fA-F]{3,8}$/.test(idName)) continue;
    const found = findConfusables(idName);
    if (found.length > 0) {
      const detail = found.map(f => `U+${f.char.codePointAt(0)?.toString(16).padStart(4, '0')}→${f.ascii}`).join(', ');
      identifierConfusables.push(`#${idName}: ${detail}`);
    }
  }

  // Scan 3: url() references — confusables in file paths can redirect to
  // different assets (logo spoofing, CSS injection via @import)
  const urlConfusables: string[] = [];
  const scannedUrls = new Set<string>();
  for (const u of cssUrlMatches(css)) {
    const urlPath = u.groups[0] as string;
    if (scannedUrls.has(urlPath)) continue;
    scannedUrls.add(urlPath);
    // Skip data: URIs (no security risk from confusables in base64)
    if (urlPath.startsWith('data:')) continue;
    const found = findConfusables(urlPath);
    if (found.length > 0) {
      const detail = found.map(f => `U+${f.char.codePointAt(0)?.toString(16).padStart(4, '0')}→${f.ascii}`).join(', ');
      urlConfusables.push(`${urlPath}: ${detail}`);
    }
  }

  const totalConfusables = tokenNameConfusables.length + identifierConfusables.length + urlConfusables.length;

  if (totalConfusables === 0) {
    return {
      id: 'v36',
      item: ITEM,
      category: CATEGORY,
      status: 'PASS',
      detail: `scanned ${Object.keys(tokens).length} token names, ${scannedClasses.size} classes, ${scannedIds.size} ids, ${scannedUrls.size} url refs: no UTS #39 confusables detected (Unicode 16.0.0)`,
    };
  }

  const allFindings = [
    ...tokenNameConfusables.map(d => `TOKEN: ${d}`),
    ...identifierConfusables.map(d => `IDENT: ${d}`),
    ...urlConfusables.map(d => `URL: ${d}`),
  ];

  // Token-name confusables are FAIL (direct security risk — token shadowing
  // can override design-system values). Identifier confusables are WARN
  // (class spoofing risk but less direct). URL confusables are WARN.
  if (tokenNameConfusables.length > 0) {
    return {
      id: 'v36',
      item: ITEM,
      category: CATEGORY,
      status: 'FAIL',
      detail: `${totalConfusables} confusable(s) found: ${allFindings.slice(0, 5).join('; ')}${allFindings.length > 5 ? ` (+${allFindings.length - 5} more)` : ''}. Token-name confusables enable shadowing attacks: a --соlor-bg token (Cyrillic с) looks identical to --color-bg but resolves to a different value.`,
    };
  }

  return {
    id: 'v36',
    item: ITEM,
    category: CATEGORY,
    status: 'WARN',
    detail: `${totalConfusables} confusable(s) in identifiers/urls: ${allFindings.slice(0, 5).join('; ')}${allFindings.length > 5 ? ` (+${allFindings.length - 5} more)` : ''}. No token names affected, but class/id/url confusables can spoof UI elements or redirect asset loads.`,
  };
}

// ── Copywriting checks (v38–v41) — contract v0.4.0 ─────────────────────────
//
// These checks parse the HTML DOM for UI text patterns that violate the
// copywriting principles from NN/g, Polaris, IBM Carbon, Microsoft Fluent,
// Apple HIG, and Atlassian. The gap signal came from detail.design which
// organizes patterns by discipline including Copywriting — designesy's
// contract had no copywriting section until v0.4.0.
//
// Each check operates on the fetched HTML (not CSS) since copywriting is
// about the text content, not the styling. We extract <button>, <a>, <label>,
// and heading text content and apply heuristics.

// v38 — Button text is a verb phrase or recognized command, not a bare noun.
//
// Heuristic: extract all <button> and [role="button"] element text. For each:
//   - Allow if it's in the recognized-commands allowlist (Save, Cancel, Delete,
//     Edit, Share, Close, Back, Next, Previous, etc.)
//   - Allow if the first word is a verb (heuristic: ends in -e, -ate, -ize,
//     -ify, -en, -ing, or is in a verb allowlist)
//   - FAIL if the text is a single noun with no verb ("Settings", "Profile",
//     "Account" used as button labels without a verb context)
//
// Provenance: NN/g "Lead with verbs or verb phrases", Apple HIG "use a verb",
// Microsoft Fluent "use words that represent actions".
const RECOGNIZED_BUTTON_COMMANDS = new Set([
  'save', 'cancel', 'delete', 'edit', 'share', 'close', 'back', 'next',
  'previous', 'undo', 'redo', 'install', 'retry', 'done', 'ok', 'okay',
  'yes', 'no', 'confirm', 'submit', 'apply', 'send', 'create', 'add',
  'remove', 'clear', 'reset', 'search', 'filter', 'sort', 'export',
  'import', 'download', 'upload', 'copy', 'cut', 'paste', 'print',
  'play', 'pause', 'stop', 'start', 'open', 'view', 'show', 'hide',
  'enable', 'disable', 'accept', 'reject', 'decline', 'continue',
  'login', 'logout', 'register', 'subscribe', 'unsubscribe', 'follow',
  'unfollow', 'like', 'bookmark', 'pin', 'star', 'report', 'block',
  'mute', 'unmute', 'archive', 'restore', 'refresh', 'reload', 'update',
  'find', 'replace', 'navigate', 'run', 'score', 'review', 'verify',
  'detect', 'assess', 'enforce', 'dismiss', 'analyze', 'inspect', 'check',
  'evaluate', 'validate', 'test', 'monitor', 'track', 'measure', 'scan',
  // Engine 1.3.1. get, set and try: the comment in checkButtonTextVerb said
  // "Get X", "Set X" and "Try X" were allowed, but none of the three was in
  // this set, so "Get started" and "Try it free" read WARN on any site.
  'get', 'set', 'try',
  // Imperative CTA verbs that the suffix heuristic in isVerbLike misses (it
  // already accepts explore, collapse, toggle, choose and compare by their -e
  // ending). Each is read as a verb at the start of a button label, and none
  // names a thing a button would be labelled with on its own:
  //   flip    "Flip card", "Flip to the flame": a command, no noun label use
  //   learn   "Learn more": verb only
  //   sign    "Sign in", "Sign up", "Sign out": the noun reading does not
  //           lead a button label
  //   join    "Join the waitlist": verb only
  //   expand  "Expand all", "Expand section": verb only
  //   select  "Select all", "Select plan": an imperative in button use
  //   read    "Read more", "Read the guide": an imperative in button use
  // Left out on purpose: switch and watch, which are common nouns ("Switch",
  // a toggle's name; "Watch", a product) as well as verbs.
  'flip', 'learn', 'sign', 'join', 'expand', 'select', 'read',
]);

function isVerbLike(word: string): boolean {
  const w = word.toLowerCase().trim();
  if (RECOGNIZED_BUTTON_COMMANDS.has(w)) return true;
  // Common verb endings (heuristic — not a full POS tagger)
  if (/^(re)?[a-z]+(e|ate|ize|ify|en|ing|ed)$/.test(w) && w.length > 2) return true;
  // Gerunds (-ing) are verb-like
  if (/^[a-z]+ing$/.test(w) && w.length > 4) return true;
  return false;
}

/**
 * Is this element opening tag a SELECTION control rather than a command button?
 *
 * v38's rule — button text leads with the verb it performs — is derived from
 * NN/g's command guidance and is correct for actions. It does not apply to the
 * options of a single-select group, whose labels name the choice, not an
 * action. Without this distinction the check penalises correct copywriting and
 * would flag every site using the <button aria-pressed> radio pattern.
 *
 * Detection is from explicit state/semantics, never from prose:
 *   - aria-pressed / aria-checked   → toggle or radio semantics
 *   - role="radio"|"option"|"menuitemradio"|"tab"  → an option in a set
 *   - name="<field>" with a value   → a form control
 */
function isSelectionControl(openTag: string): boolean {
  if (/aria-pressed\s*=/i.test(openTag)) return true;
  if (/aria-checked\s*=/i.test(openTag)) return true;
  if (/role\s*=\s*["']?(?:radio|option|menuitemradio|tab)["']?/i.test(openTag)) return true;
  if (/\sname\s*=\s*["'][^"']+["']/i.test(openTag) && /\svalue\s*=/i.test(openTag)) return true;
  return false;
}

function checkButtonTextVerb(html: string): CheckResult {
  const ITEM = 'Button text is a verb phrase or recognized command (not a bare noun)';
  const CATEGORY = 'copywriting';

  // Extract <button> and [role="button"] text content

  // Remove aria-hidden subtrees before extracting text.
  //
  // Content marked aria-hidden is by definition not part of the accessible name,
  // and stripping tags with an empty replacement FUSES whatever flanked it. On
  // /maturity an ordinal badge (<span aria-hidden>1</span>) sat directly before
  // the option label, so tag-stripping produced the single token
  // "1No — backgrounds are raw hex/rgb values" — a string nobody wrote, which
  // then failed a check about label phrasing.
  //
  // Same class as the tag→space defect fixed in the markdown converter earlier
  // in this lane: a transform silently invents text, and the invented text is
  // then judged.
  const stripAriaHidden = (inner: string): string => {
    let out = inner;
    for (let i = 0; i < 4; i++) {
      // Repeat to handle an aria-hidden wrapper containing another.
      const next = withoutAriaHiddenElements(out);
      if (next === out) break;
      out = next;
    }
    return out;
  };

  // Strip leading icon characters (Unicode symbols, emoji, geometric shapes,
  // arrows, dingbats) that precede the actual verb in button labels like
  // "✕ Close" or "◐ Play". Range: misc symbols (2600-26FF), dingbats (2700-27BF),
  // geometric shapes (2A00-2BFF), arrows (2190-21FF), misc technical (2300-23FF),
  // CJK symbols, private use, and common icon chars like ✕ ◐ ✦ → etc.
  // Strip leading icon characters (Unicode symbols, emoji, geometric shapes,
  // arrows, dingbats) that precede the actual verb in button labels like
  // "✕ Close" or "◐ Play". Range: misc symbols (2600-26FF), dingbats (2700-27BF),
  // geometric shapes (2A00-2BFF), arrows (2190-21FF), misc technical (2300-23FF),
  // CJK symbols, private use, and common icon chars like ✕ ◐ ✦ → etc.
  // U+00D7 (×, multiplication sign) is also used as a close glyph (e.g. "×").
  const ICON_PREFIX_RE = /^[\u00D7\u2100-\u27BF\u2190-\u21FF\u2300-\u23FF\u2600-\u27BF\u2A00-\u2BFF\u2190-\u21FF\u00A0\s]+/;

  // Carry the opening tag alongside the label so the violation loop can tell a
  // command button from a selection control (see isSelectionControl).
  const buttonTexts: { text: string; tag: string }[] = [];
  // Strip keyboard shortcut hints that are fused to or appended after the
  // button label — e.g. "Find⌘K", "Search ⌘+K", "Save Ctrl+S". These are
  // visual hints, not part of the verb. Ranges: ⌘ (U+2318), ⌃ (U+2303),
  // ⌥ (U+2325), ⇧ (U+21E7), and common "Ctrl+", "Cmd+", "Shift+" prefixes.
  // The `+` is optional and the key may be fused directly to the modifier
  // ("CtrlK"), because the badge is now platform-aware and renders "Ctrl" with
  // no glyph to strip. Requiring a literal '+' meant "FindCtrlK" survived and
  // v38 read the shortcut as part of the verb.
  //
  // The key must be ADJACENT to the modifier (plus form, or fused alphanumerics
  // with no space between). A space separates a real word: "Alt text" is a
  // label, not a shortcut, and must not be eaten.
  // Engine 1.3.1: a "+key" hint written in lower case ("Save ctrl+s",
  // "Find ctrl+k") is a hint too. The modifier is case-insensitive here but
  // must stand as its own word (the start of the label or after a space), so
  // "Halt+1" is untouched, and only the plus form is read: a modifier followed
  // by a space and a letter ("Shift A") is a label, as it was in 1.3.0.
  const PLUS_SHORTCUT_RE =
    /(?:^|\s)(?:ctrl|cmd|shift|alt|option|command)(?:\s*\+\s*[a-z0-9]+)+$/i;
  const stripShortcut = (s: string): string =>
    withoutTextShortcut(withoutGlyphShortcut(s)).replace(PLUS_SHORTCUT_RE, '').trim();
  // Engine 1.3.1: keycaps are read from the markup, not guessed from text.
  // A <kbd> element is keyboard input (HTML Living Standard, the kbd element),
  // a hint beside the label rather than the label, so its text is dropped
  // before the verb check, innermost first so nested keycaps
  // (<kbd><kbd>Ctrl</kbd>+<kbd>K</kbd></kbd>) go too. designesy.org's flip
  // button, <kbd>ctrl</kbd> <span aria-hidden="true">+</span> <kbd>i</kbd>
  // after a hidden lead, read as "Flip to the flame: ctrl  i" in 1.3.0. A "+"
  // left between dropped keycaps is dropped with them. A button whose only
  // text is keycaps is then empty and is judged as an icon-only button: by its
  // aria-label when it has one, and not at all when it does not.
  const labelText = (inner: string): string => {
    const visible = stripAriaHidden(inner);
    let out = visible;
    for (let i = 0; i < 4; i++) {
      const next = withoutKbdElements(out);
      if (next === out) break;
      out = next;
    }
    const text = withoutTags(out, '', false).trim();
    return out === visible ? text : withoutTrailingPluses(text).trim();
  };
  for (const m of buttonElements(html)) {
    let text = labelText(m.groups[0] as string);
    // Strip leading icon characters so "✕Close" → "Close"
    text = text.replace(ICON_PREFIX_RE, '').trim();
    // Strip trailing keyboard shortcut hints so "Find⌘K" → "Find"
    text = stripShortcut(text);
    // Icon-only button with an accessible name: use the aria-label verb.
    if (!text) {
      const aria = /aria-label=["']([^"']+)["']/i.exec(m.text);
      if (aria) text = aria[1].trim();
    }
    // A one- or two-character visible label is an initial/symbol, not a label a
    // reader can act on ("T" for Token Discipline). When the control carries an
    // aria-label, that IS its accessible name and is what should be judged.
    // Without this, v38 reported six single-letter "buttons" as non-verb labels
    // on /maturity — an accurate observation of the wrong string.
    if (text && text.length <= 2) {
      const aria = /aria-label=["']([^"']+)["']/i.exec(m.text);
      if (aria) text = aria[1].trim();
    }
    if (text) buttonTexts.push({ text, tag: m.text });
  }
  for (const m of roleButtonElements(html)) {
    let text = labelText(m.groups[0] as string);
    text = text.replace(ICON_PREFIX_RE, '').trim();
    text = stripShortcut(text);
    if (!text) {
      const aria = /aria-label=["']([^"']+)["']/i.exec(m.text);
      if (aria) text = aria[1].trim();
    }
    // A one- or two-character visible label is an initial/symbol, not a label a
    // reader can act on ("T" for Token Discipline). When the control carries an
    // aria-label, that IS its accessible name and is what should be judged.
    // Without this, v38 reported six single-letter "buttons" as non-verb labels
    // on /maturity — an accurate observation of the wrong string.
    if (text && text.length <= 2) {
      const aria = /aria-label=["']([^"']+)["']/i.exec(m.text);
      if (aria) text = aria[1].trim();
    }
    if (text) buttonTexts.push({ text, tag: m.text });
  }

  if (buttonTexts.length === 0) {
    return { id: 'v38', item: ITEM, category: CATEGORY, status: 'SKIP', detail: 'no button elements found in HTML' };
  }

  const violations: string[] = [];
  for (const { text, tag } of buttonTexts) {
    // Skip text that's clearly not a button label — if it's longer than ~40 chars
    // it's likely a regex false positive from nested content (e.g. a div
    // containing a whole section being matched as role="button")
    if (text.length > 40) continue;
    // A selection control is not a command.
    //
    // v38 asks whether button TEXT leads with the action it performs. That is
    // right for commands ("Save changes", "Delete file") and wrong for the
    // options of a single-select group, where the label names the CHOICE rather
    // than an action: "Structured token system", "Yes, a single --bg variable".
    // NN/g's verb rule is about commands.
    //
    // Found on /maturity: 9 of 29 "buttons" were 1-4 scale options in the
    // maturity questionnaire, each correctly answering a prompt. The check was
    // penalising correct copywriting — and would do the same to any site whose
    // radio group is built from <button aria-pressed> rather than
    // <input type="radio">, which is a common accessible pattern.
    //
    // Detected from explicit selection-state attributes rather than by guessing
    // at prose; the ordinal branch covers scale options that carry no ARIA
    // state, and the yes/no branch covers closed-form answers.
    if (isSelectionControl(tag)) continue;
    if (/^(yes|no|none|not sure|unsure)\b/i.test(text)) continue;
    if (/^\d+\s+\S/.test(text)) continue;
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) continue;
    const firstWord = words[0].toLowerCase();

    // Allow recognized single-word commands
    if (RECOGNIZED_BUTTON_COMMANDS.has(firstWord)) continue;
    // Allow if first word is verb-like
    if (isVerbLike(firstWord)) continue;
    // "Get X", "Set X", "Try X" are allowed above: get, set and try are in
    // RECOGNIZED_BUTTON_COMMANDS (since engine 1.3.1; this comment claimed it
    // before they were).
    // If we get here, the first word is likely a noun → potential violation
    violations.push(`"${text}"`);
  }

  if (violations.length === 0) {
    return { id: 'v38', item: ITEM, category: CATEGORY, status: 'PASS', detail: `${buttonTexts.length} button(s) checked: all start with a verb or recognized command` };
  }
  return {
    id: 'v38',
    item: ITEM,
    category: CATEGORY,
    status: 'WARN',
    detail: `${violations.length}/${buttonTexts.length} button(s) may not start with a verb: ${violations.slice(0, 3).join(', ')}${violations.length > 3 ? ` (+${violations.length - 3} more)` : ''}. NN/g: "Lead with verbs or verb phrases that clearly outline what will happen."`,
  };
}

// v39 — No trailing period on button text, labels, or tab text.
//
// Heuristic: extract <button>, <label>, and tab text ([role="tab"]) and check
// for trailing periods. Microsoft Fluent: "Don't end text for buttons, radio
// buttons, labels, or checkboxes with a period."
function checkNoTrailingPeriod(html: string): CheckResult {
  const ITEM = 'No trailing period on button text, labels, or tab text';
  const CATEGORY = 'copywriting';

  const texts: { type: string; text: string }[] = [];
  for (const m of buttonElements(html)) {
    const text = withoutTags(m.groups[0] as string, '', false).trim();
    if (text) texts.push({ type: 'button', text });
  }
  for (const m of labelElements(html)) {
    const text = withoutTags(m.groups[0] as string, '', false).trim();
    if (text) texts.push({ type: 'label', text });
  }
  for (const m of roleTabElements(html)) {
    const text = withoutTags(m.groups[0] as string, '', false).trim();
    if (text) texts.push({ type: 'tab', text });
  }

  if (texts.length === 0) {
    return { id: 'v39', item: ITEM, category: CATEGORY, status: 'SKIP', detail: 'no button/label/tab elements found in HTML' };
  }

  const violations = texts.filter(t =>
    t.text.length <= 40 &&  // skip false positives from nested content
    /\.$/.test(t.text) && !/\.\.\.$/.test(t.text)
  );

  if (violations.length === 0) {
    return { id: 'v39', item: ITEM, category: CATEGORY, status: 'PASS', detail: `${texts.length} element(s) checked: no trailing periods on buttons, labels, or tabs` };
  }
  return {
    id: 'v39',
    item: ITEM,
    category: CATEGORY,
    status: 'WARN',
    detail: `${violations.length}/${texts.length} element(s) have trailing periods: ${violations.slice(0, 3).map(v => `"${v.text}"`).join(', ')}${violations.length > 3 ? ` (+${violations.length - 3} more)` : ''}. Microsoft Fluent: "Don't end text for buttons, radio buttons, labels, or checkboxes with a period."`,
  };
}

// v40 — Link text is descriptive, not bare "click here / learn more / read more / here".
//
// Heuristic: extract all <a> text content and check against a blocklist of
// non-descriptive link text. WCAG 2.4.4 Link Purpose (In Context) + NN/g
// microcontent guidance.
const NON_DESCRIPTIVE_LINK_TEXT = /^(click here|here|learn more|read more|more|link|this|that|continue|see more|view details)$/i;

function checkLinkTextDescriptive(html: string): CheckResult {
  const ITEM = 'Link text is descriptive (not bare "click here", "learn more", "here")';
  const CATEGORY = 'copywriting';

  const linkTexts: string[] = [];
  for (const m of anchorElements(html)) {
    const text = withoutTags(m.groups[0] as string, '', false).trim();
    if (text) linkTexts.push(text);
  }

  if (linkTexts.length === 0) {
    return { id: 'v40', item: ITEM, category: CATEGORY, status: 'SKIP', detail: 'no anchor elements found in HTML' };
  }

  const violations = linkTexts.filter(t => NON_DESCRIPTIVE_LINK_TEXT.test(t));

  if (violations.length === 0) {
    return { id: 'v40', item: ITEM, category: CATEGORY, status: 'PASS', detail: `${linkTexts.length} link(s) checked: all have descriptive text` };
  }
  return {
    id: 'v40',
    item: ITEM,
    category: CATEGORY,
    status: 'WARN',
    detail: `${violations.length}/${linkTexts.length} link(s) have non-descriptive text: ${violations.slice(0, 3).map(v => `"${v}"`).join(', ')}${violations.length > 3 ? ` (+${violations.length - 3} more)` : ''}. WCAG 2.4.4: link text should describe the destination. Use "Read the typography guide" not "Click here".`,
  };
}

// v41 — No ALL CAPS UI text except eyebrow labels.
//
// Heuristic: extract <button>, <a>, <label>, <td>, <th>, and <p> text.
// Flag strings >3 chars in ALL CAPS. Exclude elements with class containing
// "eyebrow" or "label" (per typography contract, eyebrows are intentionally
// uppercase: 0.72–0.75rem, weight 600, uppercase, letter-spacing 0.18em).
// IBM Carbon: "All caps has been shown to be slower to read."
function checkNoAllCaps(html: string): CheckResult {
  const ITEM = 'No ALL CAPS UI text except eyebrow labels';
  const CATEGORY = 'copywriting';

  // Match elements with their class attributes so we can exclude eyebrow labels
  const violations: string[] = [];
  for (const m of capsElementMatches(html)) {
    const attrs = m.groups[1] || '';
    const text = withoutTags(m.groups[2] as string, '', false).trim();
    if (!text || text.length < 4) continue;

    // Skip eyebrow labels (class contains "eyebrow" or "label" — per typography
    // contract, eyebrows are intentionally uppercase)
    if (hasEyebrowClass(attrs)) continue;
    // Skip elements with text-transform: uppercase in inline style
    if (hasUppercaseStyle(attrs)) continue;

    // Check if text is ALL CAPS (only letters, all uppercase, >3 chars)
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
      violations.push(`"${text}"`);
    }
  }

  if (violations.length === 0) {
    return { id: 'v41', item: ITEM, category: CATEGORY, status: 'PASS', detail: 'No ALL CAPS UI text found outside eyebrow labels' };
  }
  return {
    id: 'v41',
    item: ITEM,
    category: CATEGORY,
    status: 'WARN',
    detail: `${violations.length} element(s) have ALL CAPS text: ${violations.slice(0, 3).join(', ')}${violations.length > 3 ? ` (+${violations.length - 3} more)` : ''}. IBM Carbon: "All caps has been shown to be slower to read." Use sentence case for UI text. Eyebrow labels are exempt per typography contract.`,
  };
}

// v37 — DESIGN.md Spec-Layer Validation (Google @google/design.md integration).
//
// This is the two-layer integration: Google's `@google/design.md` CLI validates
// the DESIGN.md file is well-formed (spec layer); designesy validates the
// design system the file describes passes the contract (contract layer).
// designesy does NOT compete with Google's linter — it integrates with it.
//
// What this check does:
// 1. Fetches /DESIGN.md from the target site's origin (no public convention
//    exists, so "not served" is the expected state → SKIP, not FAIL).
// 2. If found, runs Google's official `lint()` on the raw markdown.
// 3. Reports the findings: errors → FAIL, warnings → WARN, infos → PASS.
//
// The 11 lint rules (v0.4.0):
//   broken-ref (error) — token references that don't resolve
//   missing-primary (warning) — no primary color defined
//   contrast-ratio (warning) — component color pairs below WCAG AA
//   orphaned-tokens (warning) — tokens defined but never referenced
//   token-summary (info) — summary of defined tokens
//   missing-sections (info) — optional sections absent
//   missing-typography (warning) — colors but no typography
//   section-order (warning) — sections out of canonical order
//   unknown-key (warning) — YAML key that looks like a typo
//   token-like-ignored (warning) — unknown key with token-like values
//   omitted-rules (info) — validates the omitted config
//
// Provenance: @google/design.md v0.4.0, Apache-2.0.
// https://github.com/google-labs-code/design.md
// Import path: @google/design.md/linter (subpath export, library API).
// Atlassian ADS research: MCP beats DESIGN.md on token cost — designesy's
// MCP path is the higher-value delivery, DESIGN.md is the portable fallback.
// This check bridges both: if the site publishes DESIGN.md, designesy lints
// it with Google's engine AND scores the design system with its own.
async function checkDesignMdSpec(targetUrl: string): Promise<CheckResult> {
  const ITEM = 'DESIGN.md spec-layer validation (DESIGN.md format lint)';
  const CATEGORY = 'spec';

  // Attempt to fetch /DESIGN.md from the target origin. No public convention
  // exists — most sites don't serve it. "Not served" is SKIP, not FAIL.
  const parsed = new URL(targetUrl);
  const designMdUrl = `${parsed.protocol}//${parsed.host}/DESIGN.md`;

  let designMdContent: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await safeFetch(designMdUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      return {
        id: 'v37',
        item: ITEM,
        category: CATEGORY,
        status: 'SKIP',
        detail: `/DESIGN.md not publicly served (HTTP ${resp.status}). No public convention exists yet, so this is expected. Designesy scores the shipped CSS directly.`,
      };
    }
    designMdContent = (await readCapped(resp, MAX_DESIGN_MD_BYTES)).text;
    // Basic validation: must contain YAML frontmatter (---) and be > 50 chars
    if (designMdContent.length < 50 || !designMdContent.includes('---')) {
      return {
        id: 'v37',
        item: ITEM,
        category: CATEGORY,
        status: 'WARN',
        detail: `/DESIGN.md served but does not appear to be a valid DESIGN.md (no YAML frontmatter). Content: ${designMdContent.substring(0, 100)}...`,
      };
    }
  } catch {
    return {
      id: 'v37',
      item: ITEM,
      category: CATEGORY,
      status: 'SKIP',
      detail: `could not fetch /DESIGN.md: designesy scores the shipped CSS directly (spec layer optional)`,
    };
  }

  // Run Google's official linter on the DESIGN.md content.
  // Dynamic import isolates the dependency — if the package fails to load in
  // serverless, only v37 reports the error, not the entire API route.
  let lintDesignMd: (markdown: string) => { findings: Array<{ severity: string; path?: string; message?: string }>; summary: { errors: number; warnings: number; infos: number } };
  try {
    const mod = await import('@google/design.md/linter');
    lintDesignMd = mod.lint;
  } catch (e) {
    // MANUAL (weight 0), matching engine.ts: the linter did not run here, which
    // says nothing about the site, so it must not cost the site points.
    const msg = sanitizeErrorText(e instanceof Error ? e.message : 'unknown error');
    return {
      id: 'v37',
      item: ITEM,
      category: CATEGORY,
      status: 'MANUAL',
      detail: `/DESIGN.md fetched but linter unavailable: ${msg}. The @google/design.md package may not be installed in this runtime; run the full audit to resolve.`,
    };
  }

  try {
    const report = lintDesignMd(designMdContent);
    const errors = report.summary?.errors || 0;
    const warnings = report.summary?.warnings || 0;
    const infos = report.summary?.infos || 0;
    const totalFindings = (report.findings || []).length;

    // Extract the most significant findings for the detail string
    const errorFindings = (report.findings || []).filter(f => f.severity === 'error');
    const warnFindings = (report.findings || []).filter(f => f.severity === 'warning');

    if (errors > 0) {
      const topErrors = errorFindings.slice(0, 3).map(f => `${f.path || 'root'}: ${f.message?.substring(0, 80)}`).join('; ');
      return {
        id: 'v37',
        item: ITEM,
        category: CATEGORY,
        status: 'FAIL',
        detail: `/DESIGN.md linted: ${errors} error(s), ${warnings} warning(s), ${infos} info(s). Errors: ${topErrors}${errorFindings.length > 3 ? ` (+${errorFindings.length - 3} more)` : ''}. Google validates the file; designesy validates the design system.`,
      };
    }

    if (warnings > 0) {
      const topWarns = warnFindings.slice(0, 3).map(f => `${f.path || 'root'}: ${f.message?.substring(0, 80)}`).join('; ');
      return {
        id: 'v37',
        item: ITEM,
        category: CATEGORY,
        status: 'WARN',
        detail: `/DESIGN.md linted: ${warnings} warning(s), ${infos} info(s). Warnings: ${topWarns}${warnFindings.length > 3 ? ` (+${warnFindings.length - 3} more)` : ''}. File is well-formed; designesy scores the design system separately.`,
      };
    }

    return {
      id: 'v37',
      item: ITEM,
      category: CATEGORY,
      status: 'PASS',
      detail: `/DESIGN.md linted clean: ${infos} info(s), 0 errors, 0 warnings. Google validates the file; designesy validates the design system. ${totalFindings} finding(s).`,
    };
  } catch (e) {
    const msg = sanitizeErrorText(e instanceof Error ? e.message : 'unknown error');
    return {
      id: 'v37',
      item: ITEM,
      category: CATEGORY,
      status: 'WARN',
      detail: `/DESIGN.md fetched but lint failed: ${msg}. The file may use a format version the linter doesn't support yet.`,
    };
  }
}

// ── Error text in a result, shared by both engine copies ───────────────────
// A caught error's message carries the file system of the machine that ran
// the engine: Node's "Cannot find package '@google/design.md' imported from
// <path>" gives the full path of the npm cache the CLI ran from, under the
// Users folder of the account that ran it, and a result is read by people
// other than that account. Every check detail passes through
// sanitizeErrorText before it is returned. It replaces absolute paths (a
// drive letter, a UNC share, a POSIX home, temp or system root), file:// URLs
// and npm cache segments, and keeps the clause that says what failed
// ("Cannot find package '@google/design.md'"). A path segment may hold spaces
// (an account name often does); the last one may not, so the sentence after
// a path survives, and trailing punctuation is kept.
function sanitizeErrorText(text: string): string {
  // The punctuation a replaced path ended with, read back from its end
  // (engine 1.5.1: /[.,;:!?)]+$/ was retried from every mark in a run).
  const tail = (m: string): string => {
    let k = m.length;
    while (k > 0 && '.,;:!?)'.indexOf(m[k - 1]) >= 0) k--;
    return m.slice(k);
  };
  const keep = (label: string) => (m: string): string => `${label}${tail(m)}`;
  const pathless = text
    .replace(/\bfile:\/\/[^\s'"<>`|]*/gi, keep('a local file'))
    .replace(/\\\\[^\\\s'"<>`|]+\\(?:[^\\\r\n'"<>`|*?]+\\)*[^\\\s'"<>`|*?]*/g, keep('a local path'))
    .replace(/(?<![\w\\/])[A-Za-z]:([\\/])(?:[^\\/\r\n'"<>`|*?]+\1)*[^\\/\s'"<>`|*?]*/g, keep('a local path'))
    .replace(
      /(^|[\s'"`(=,:[])\/(?:home|Users|root|tmp|var|private|opt|usr|srv|mnt|Volumes|Library|app|vercel|workspace|workspaces|github|runner|nix|snap)(?:\/[^/\r\n'"<>`|]+(?=\/))*\/[^/\s'"<>`|]+/g,
      (m: string, lead: string) => `${lead}${keep('a local path')(m.slice(lead.length))}`,
    );
  // npm cache segments: a run of characters other than space, quotes, angle
  // brackets, backtick and pipe that holds npm-cache, /_npx/ or /.npm/ is
  // replaced whole. Each run is read once (engine 1.5.1: the run pattern was
  // retried from every character in it).
  const marker = /npm-cache|[\\/]_npx[\\/]|[\\/]\.npm[\\/]/gi;
  const stop = /[\s'"<>`|]/;
  const parts: string[] = [];
  let last = 0;
  let markerAt = -1;
  for (let a = 0; a < pathless.length;) {
    if (stop.test(pathless[a])) { a++; continue; }
    let b = a + 1;
    while (b < pathless.length && !stop.test(pathless[b])) b++;
    if (markerAt < a) {
      marker.lastIndex = a;
      const found = marker.exec(pathless);
      markerAt = found ? found.index : Infinity;
    }
    if (markerAt < b) {
      parts.push(pathless.slice(last, a), keep('the npm cache')(pathless.slice(a, b)));
      last = b;
    }
    a = b;
  }
  parts.push(pathless.slice(last));
  return parts.join('');
}

/** The checks with every detail passed through sanitizeErrorText. */
function sanitizeCheckDetails(checks: CheckResult[]): CheckResult[] {
  return checks.map((c) => (typeof c.detail === 'string' ? { ...c, detail: sanitizeErrorText(c.detail) } : c));
}

// ── Score arithmetic, shared by both engine copies ─────────────────────────
// Everything between the check verdicts and the grade: category weights, the
// weighted score, the slop deduction, the originality lift, the per-category
// sub-scores, the accessibility floor and the hard-fail ceilings. It is one
// function so the source-drift gate compares it as one unit. Until engine
// 1.2.0 the arithmetic sat inline in each orchestrator, outside the gate, and
// the copies disagreed on the floor: the site capped at 70 when the
// accessibility category was under 60%, the npm engine on any accessibility
// FAIL. The site's rule is the one documented on /methodology.
//
// Exported for /api/score/rescore, which scores a run again after the browser
// audit settles its three live-page checks: the same arithmetic, on the
// engine's own verdicts, so no other copy of the math exists (the score form
// used to carry one, without the slop deduction or the originality lift).
export function scoreArithmetic(checks: CheckResult[], slopTotal: number, originalityPoints: number): {
  score: number;
  categoryWeights: Record<string, number>;
  categoryCounts: Record<string, number>;
  categoryScores: Record<string, { score: number | null; weight: number; pass: number; fail: number; warn: number; skip: number; manual: number }>;
  a11yFloorApplied: boolean;
  hardFailCeilingApplied: boolean;
  hardFailCeilingReason: string | null;
} {
  // ── Tier 2: per-category weighted scoring ──────────────────────────────────
  // Weights follow the contract's section emphasis (the contract IS the scoring
  // basis), with an accessibility floor so contract sections covering real-user
  // harm cannot be drowned out by cadence's 8 checks. SKIPs fall out of BOTH
  // numerator and denominator (Lighthouse precedent: manual/N/A audits excluded).
  //
  // Weight table (relative weights, sums to 117 — the scoring formula
  // normalizes via Σ(points)/Σ(total). Derived from AnySearch research against
  // Lighthouse axe user-impact, design-auditor category %, and DSAF 50/50):
  //   cadence 18, accessibility 15, semantic 12, motion 10, tokens 9,
  //   takt 8, poise 7, identity 6, interaction 6, performance 6, responsive 3
  // v0.4.0 additions: copywriting 8, security 5, spec 4
  const CATEGORY_WEIGHTS: Record<string, number> = {
    cadence: 18, accessibility: 15, semantic: 12, motion: 10, tokens: 9,
    takt: 8, poise: 7, identity: 6, interaction: 6, performance: 6, responsive: 3,
    security: 5, spec: 4, copywriting: 8,
  };

  // Per-check weight = category weight / number of checks in that category
  // (so each category contributes its full weight, split evenly among its checks).
  const categoryCounts: Record<string, number> = {};
  for (const c of checks) {
    if (c.status === 'SKIP' || c.status === 'MANUAL') continue;
    categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
  }

  let weightedPoints = 0;
  let weightedTotal = 0;
  for (const c of checks) {
    if (c.status === 'SKIP' || c.status === 'MANUAL') continue;
    const catWeight = CATEGORY_WEIGHTS[c.category] || 5;
    const checkWeight = catWeight / (categoryCounts[c.category] || 1);
    weightedTotal += checkWeight;
    if (c.status === 'PASS') weightedPoints += checkWeight;
    else if (c.status === 'WARN') weightedPoints += checkWeight * 0.5;
    // FAIL = 0 points
  }

  let score = weightedTotal === 0 ? 0 : Math.round((weightedPoints / weightedTotal) * 1000) / 10;

  // ── Anti-slop deduction ─────────────────────────────────────────────────────
  // Apply detected slop patterns as a direct subtraction from the weighted score.
  // The deduction is flat (not percentage-scaled) so it cannot be gamed by making
  // the site more minimal. Capped at 20 total.
  if (slopTotal > 0) {
    score = Math.max(0, score - slopTotal);
  }

  // ── Originality lift ─────────────────────────────────────────────────────────
  // Reward positive craft signals. Applied after the slop deduction so a generic
  // site with no distinctive signals stays at its (already-slop-deducted) score,
  // while a distinctive site is lifted above the compliant-but-generic baseline.
  // Capped at +8. Score clamped to ≤100 since this is a bonus on a 100-scale base.
  if (originalityPoints > 0) {
    score = Math.min(100, score + originalityPoints);
  }

  // One decimal, the precision scores are shown at: subtracting a fractional
  // slop total leaves float noise (72.6 - 20 + 4 is 56.599999999999994).
  score = Math.round(score * 10) / 10;

  // ── Per-category sub-scores (the constellation) ─────────────────────────
  // Each category gets its own 0-100 score using the same weighting rule as
  // the composite (PASS 1.0 / WARN 0.5 / FAIL 0, SKIP excluded). Categories
  // with zero scored checks report null so the client can render them as
  // "unscored" rather than fabricating a 0 or 100. This is the same math the
  // composite uses — one source of truth, no client-side re-derivation.
  const catAgg: Record<string, { wp: number; wt: number; pass: number; fail: number; warn: number; skip: number; manual: number }> = {};
  for (const c of checks) {
    const agg = catAgg[c.category] || (catAgg[c.category] = { wp: 0, wt: 0, pass: 0, fail: 0, warn: 0, skip: 0, manual: 0 });
    if (c.status === 'SKIP') { agg.skip += 1; continue; }
    if (c.status === 'MANUAL') { agg.manual += 1; continue; }
    const checkWeight = (CATEGORY_WEIGHTS[c.category] || 5) / (categoryCounts[c.category] || 1);
    agg.wt += checkWeight;
    if (c.status === 'PASS') { agg.wp += checkWeight; agg.pass += 1; }
    else if (c.status === 'WARN') { agg.wp += checkWeight * 0.5; agg.warn += 1; }
    else agg.fail += 1; // FAIL
  }
  const categoryScores: Record<string, { score: number | null; weight: number; pass: number; fail: number; warn: number; skip: number; manual: number }> = {};
  for (const [cat, agg] of Object.entries(catAgg)) {
    categoryScores[cat] = {
      score: agg.wt === 0 ? null : Math.round((agg.wp / agg.wt) * 1000) / 10,
      weight: CATEGORY_WEIGHTS[cat] || 5,
      pass: agg.pass,
      fail: agg.fail,
      warn: agg.warn,
      skip: agg.skip,
      manual: agg.manual,
    };
  }

  // ── Tier 2: accessibility floor (DSAF enterprise-grade precedent) ──────────
  // DSAF enforces A8 Accessibility ≥75% — a system can score 90% combined and
  // still fail enterprise-grade if a11y is 73%. We apply a softer version: if
  // the accessibility category scores below 60%, cap the overall grade at C.
  // This prevents "perfect tokens, zero a11y = A" dishonesty.
  const a11yChecks = checks.filter((c) => c.category === 'accessibility' && c.status !== 'SKIP' && c.status !== 'MANUAL');
  const a11yPass = a11yChecks.filter((c) => c.status === 'PASS').length;
  const a11yWarn = a11yChecks.filter((c) => c.status === 'WARN').length;
  const a11yScored = a11yChecks.length;
  const a11yPct = a11yScored === 0 ? 100 : ((a11yPass + a11yWarn * 0.5) / a11yScored) * 100;
  let a11yFloorApplied = false;
  if (a11yScored > 0 && a11yPct < 60) {
    // Cap at C (70). If the weighted score is already below 70, leave it.
    if (score > 70) {
      score = 70;
      a11yFloorApplied = true;
    }
  }

  // ── Hard-fail ceilings (PixelJury precedent) ────────────────────────────────
  // Certain check FAILures are so severe they cap the score regardless of other
  // strengths. These are design-integrity failures — a site that FAILs on
  // contrast or horizontal overflow cannot be A-grade no matter how good its
  // tokens are. Caps are applied AFTER the a11y floor (floor wins over ceilings).
  //
  // No A while any check FAILs (engine 1.3.0, see CHANGELOG). A
  // FAIL is the engine's own finding that the page breaks a rule, so any FAIL
  // caps the score at 89.9, a B at most. Until 1.3.0 a page could score 100, an
  // A, beside FAIL verdicts, including the engine's own WCAG contrast FAIL
  // (v44). The specific ceilings below are lower and win where they apply.
  // Every cap here runs after the originality lift, so the lift can carry a
  // score up to a cap but never past one.
  const hardFailChecks = checks.filter((c) => c.status === 'FAIL');
  let hardFailCeilingApplied = false;
  let hardFailCeilingReason: string | null = null;
  const ANY_FAIL_CAP = 89.9;
  if (hardFailChecks.length > 0 && score > ANY_FAIL_CAP) {
    const ids = hardFailChecks.map((c) => c.id);
    const named = ids.length === 1 ? `${ids[0]} fails` : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]} fail`;
    score = ANY_FAIL_CAP;
    hardFailCeilingApplied = true;
    hardFailCeilingReason = `A FAIL caps the grade at B: ${named}, and the score cannot exceed 89.9 while any check fails.`;
  }
  for (const c of hardFailChecks) {
    let cap: number | null = null;
    let reason: string | null = null;

    // v06 Contrast readable — fundamental legibility failure
    if (c.id === 'v06') { cap = 65; reason = 'Contrast below WCAG minimum: text is unreadable for many users.'; }
    // v44 Status text contrast — the words that report a state fail WCAG
    // 1.4.3 (or 1.4.11 for a graphic) on a surface the stylesheet attests.
    // Same cap as v06 (engine 1.3.0): both are
    // measured WCAG contrast failures on text.
    if (c.id === 'v44') { cap = 65; reason = 'Status text below WCAG contrast (4.5:1, or 3:1 for large text and graphics): the words that report errors, warnings and success are hard to read.'; }
    // v22 Contrast signal — CTA text unreadable on brand color
    if (c.id === 'v22') { cap = 70; reason = 'Primary CTA contrast below WCAG AA: the most important interaction on the page is hard to read.'; }
    // v02 Horizontal overflow — broken layout on mobile
    if (c.id === 'v02') { cap = 70; reason = 'Horizontal overflow detected: content is cut off or scrolls sideways on smaller viewports.'; }
    // v24 Touch targets — interactive elements too small to use
    if (c.id === 'v24') { cap = 75; reason = 'Interactive elements below the 44px minimum touch target (WCAG 2.5.5 Enhanced): inaccessible on touch devices.'; }
    // v25 Heading hierarchy — broken document outline
    if (c.id === 'v25') { cap = 75; reason = 'Multiple h1 elements or skipped heading levels: document outline is broken.'; }
    // v16 Rem scale — root font-size under 16px (iOS zoom break)
    if (c.id === 'v16') { cap = 70; reason = 'Root font-size below 16px: triggers iOS Safari auto-zoom, breaks mobile UX.'; }

    if (cap !== null && score > cap) {
      score = cap;
      hardFailCeilingApplied = true;
      hardFailCeilingReason = reason;
    }
  }

  return {
    score,
    categoryWeights: CATEGORY_WEIGHTS,
    categoryCounts,
    categoryScores,
    a11yFloorApplied,
    hardFailCeilingApplied,
    hardFailCeilingReason,
  };
}

export function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

async function scoreUrlUncached(targetUrl: string, scope?: ScoreScope) {
  const page = await fetchPageResilient(targetUrl);

  // UNREACHABLE — return a result carrying NO numeric score.
  //
  // Why this is not just a low score: a site that blocks our fetch (403/redirect
  // loop/timeout) is not a badly-designed site, it is an unread site. Scoring the
  // placeholder document gave every such site an identical 61.5/D, which is a
  // statement about our own fetch and not about their design. Callers must now
  // handle the absence explicitly rather than render a fabricated grade.
  //
  // `score: null` is deliberate and load-bearing: it makes every consumer fail
  // type-check until it decides what to show. `grade: null` likewise. The counts
  // are zeroed rather than omitted so the response shape stays stable for
  // existing parsers.
  if (!page.ok) {
    const why =
      page.reason === 'http_error'
        ? `the server returned HTTP ${page.status ?? 'error'} for every candidate URL`
        : page.reason === 'timeout'
          ? 'the request timed out'
          : page.reason === 'empty_body'
            ? 'the response body was empty or too small to be a page'
            : 'the request failed at the network level';
    return {
      unreachable: true as const,
      unreachableReason: page.reason,
      unreachableDetail: `Could not read ${targetUrl}: ${why}. No score is reported, because a site that cannot be fetched cannot be graded.`,
      attemptedUrls: page.attempted,
      score: null,
      grade: null,
      pass: 0, fail: 0, warn: 0, skip: 0, manual: 0, total: 0, scored: 0,
      scope: (scope || autoDetectScope(targetUrl)) as ScoreScope,
      a11yFloorApplied: false,
      hardFailCeilingApplied: false,
      hardFailCeilingReason: null,
      categoryScores: {},
      checks: [] as CheckResult[],
      tokensExtracted: 0,
      slop: { total: 0, findings: [], convergences: null },
      originality: { points: 0, signals: [], summary: '', slopGateApplied: false },
      retrievedAt: new Date().toISOString(),
    };
  }

  const { html, css } = page;
  const rawTokens = extractRootTokens(css);
  const tokens = inferTokensFromCss(css, rawTokens);

  // Resolve scope: explicit parameter wins, otherwise auto-detect from URL.
  const effectiveScope: ScoreScope = scope || autoDetectScope(targetUrl);

  let checks: CheckResult[] = [
    checkPaperToken(tokens),
    { id: 'v02', item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+', category: 'responsive', status: 'MANUAL', detail: 'requires browser viewport trace: run the full audit to resolve' },
    checkFocusVisible(css),
    { id: 'v04', item: 'Sound toggle flips aria-pressed and applies the audio preference', category: 'poise', status: 'MANUAL', detail: 'requires live DOM interaction: run the full audit to resolve' },
    checkReducedMotion(css),
    checkContrastReadable(tokens),
    checkSemanticHtmlFoundation(html),
    checkPoiseInteractionRules(css),
    checkPoiseKeyboardPath(css, html),
    checkTaktFeelRules(css),
    checkTransitionAll(css),
    checkWillChange(css),
    checkPressScale(css),
    checkCadenceRules(css),
    checkFontSmoothing(css),
    checkRemScale(css),
    checkLineHeightByRole(css),
    checkTextWrap(css),
    checkTabularNums(css),
    checkSelectionStyled(css),
    { id: 'v21', item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1', category: 'performance', status: 'MANUAL', detail: 'requires CDP trace: run the full audit to resolve' },
    checkContrastSignal(tokens),
    checkDurationTokens(tokens),
    checkFontSynthesis(css),
    checkUnderlinePosition(css),
    checkSkipInk(css),
    checkTouchTargets(css),
    checkHeadingHierarchy(html),
    checkFontFamilyCount(css, tokens),
    checkInputFontFloor(css, html, rawTokens),
    checkReadingWidth(css),
    checkTokenLayerDepth(tokens),
    checkSemanticColorVocabulary(tokens),
    checkSemanticStatusRoles(tokens),
    checkAiDisclosure(html),
    checkForcedColors(css),
    checkSecurityConfusables(css, tokens),
    checkButtonTextVerb(html),
    checkNoTrailingPeriod(html),
    checkLinkTextDescriptive(html),
    checkNoAllCaps(html),
    checkStatusTextContrast(css),
    checkPausedEntrances(css),
    checkTypeScale(css, rawTokens),
  ];

  // v37 is async (fetches /DESIGN.md from the target origin and runs Google's
  // linter) — added after the synchronous checks array is built.
  checks.push(await checkDesignMdSpec(targetUrl));

  // ── Scope filter ────────────────────────────────────────────────────────────
  // Apply the scope filter AFTER all checks execute but BEFORE scoring math.
  // This converts absence-WARNs/FAILs to SKIPs for tier 2 (optional features)
  // and tier 3 (contract-specific tokens) when scope=universal. Tier 1 checks
  // (universal accessibility/semantics) are never filtered — their absence is
  // a real WCAG 2.2 violation regardless of scope.
  checks = sanitizeCheckDetails(applyScopeFilter(checks, effectiveScope));

  const pass = checks.filter((c) => c.status === 'PASS').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;
  const skip = checks.filter((c) => c.status === 'SKIP').length;
  const manual = checks.filter((c) => c.status === 'MANUAL').length;
  const total = checks.length;

  // ── Anti-slop deduction layer ───────────────────────────────────────────────
  // Second pass: detect generic/AI-generated design patterns that the compliance
  // checks above cannot catch. Deductions are subtracted from the weighted score
  // (not the checks), capped per check and in total. This makes "taste" part of
  // the score — a site can pass every contract rule and still be generic.
  //
  // Sources: Impeccable (59 rules), solodesign (50 rules), Web AI Slop (20 tells),
  // sikora.software (10), 925studios (6). Wave 1 = 12 highest-signal rules.
  //
  // Slop checks do NOT produce PASS/FAIL/WARN/SKIP check items — they produce
  // deductions that reduce the weighted score directly.

  interface SlopFinding {
    id: string;
    label: string;
    severity: number;   // points deducted per instance
    instances: number;
    evidence: string[];
  }

  const slopFindings: SlopFinding[] = [];

  // ── Documentation exclusion for the copy/asset rules (S9, S11, S12) ───────
  //
  // S9 (lorem ipsum), S11 (marketing buzzwords) and S12 (placeholder image
  // URLs) each search the page for their own trigger patterns. A page that
  // DOCUMENTS those anti-patterns — listing "lorem ipsum", "streamline",
  // "placehold.co" as examples of what the rule detects — therefore trips all
  // three, and at maximum severity: /methodology lost the full 20-point slop
  // deduction for correctly publishing the rules, scoring 88/B while passing
  // all 39 of its scored checks at the time.
  //
  // This is the sharpest instance yet of the defect class running through this
  // whole session: the check reports a verdict about its own vocabulary rather
  // than the artifact. A page cannot both name an anti-pattern and be accused
  // of committing it.
  //
  // The test is structural, not keyword-based — adding more excluded words
  // would just move the false positives. A page is treated as documenting the
  // rules when it carries the rule-registry structure the engine's own
  // methodology surface uses: rule IDs (S1..S12) appearing alongside their
  // labels as table content. Detected by counting distinct rule IDs present in
  // the HTML; a page that merely USES lorem ipsum does not enumerate the rules.
  const docRuleIds = new Set(
    (html.match(/\bS(?:1[0-2]|[1-9])\b(?=[\s\S]{0,120}?(?:lorem ipsum|Marketing buzzword|Placeholder imag|Overused font|gradient background|pill badge|Single font))/gi) || [])
      .map((s) => s.toUpperCase()),
  );
  const isDocumentingSlopRules = docRuleIds.size >= 4;

  // S1. Overused font families — the most reflexive AI tell
  {
    const overusedFonts = new Set([
      'inter', 'roboto', 'open sans', 'montserrat', 'poppins', 'lato',
      'space grotesk', 'instrument serif', 'geist',
    ]);
    const fontMatches = css.match(/font-family\s*:([^;}{]+)/gi) || [];
    const usedFonts = new Set<string>();
    for (const match of fontMatches) {
      const families = match.replace(/^font-family\s*:/i, '').split(',');
      for (const fam of families) {
        const clean = fam.trim().replace(/["']/g, '').toLowerCase();
        if (overusedFonts.has(clean)) usedFonts.add(clean);
      }
    }
    if (usedFonts.size > 0) {
      slopFindings.push({
        id: 'S1',
        label: 'Overused font family',
        severity: 5,
        instances: usedFonts.size,
        evidence: [...usedFonts],
      });
    }
  }

  // S2. Full-page gradient background: a multi-stop linear gradient that
  // covers the viewport. Not: a gradient on a component (the glass score hero,
  // a window sheen, a cell fill), a hairline, or a grid.
  //
  // Viewport evidence is required: the gradient is painted on html, body or
  // :root, the rule is position: fixed and pinned to all four edges (or sized
  // to the viewport), or it is sized in viewport units.
  // Until engine 1.2.0 `inset: 0` counted as full-bleed, but inset: 0 fills
  // the nearest positioned ancestor, which is a component; designesy.org lost
  // 5 points to a 1px window sheen, a cell fill and a heatmap bar that all
  // matched on it. A viewport-sized rule with border-radius: inherit is still
  // a component. A gradient sized to 1px (height, width, border width, or a
  // background-size with a 1px dimension, as in `top / 100% 1px`) is a hairline.
  {
    // A repeating hairline pattern is a GRID, not a decorative gradient wash.
    //
    // An earlier pattern required the colour to precede the stop, which only
    // matches `linear-gradient(transparent 1px, ...)`; designesy.org writes the
    // reverse, `linear-gradient(color-mix(...) 1px, transparent 1px)`, and its
    // graph-paper grid was reported at the maximum severity. Match a 1px stop
    // in EITHER order, which is what "hairline" means however it is written.
    const isGridPattern = (text: string) => hasColorThenHairline(text) || hasHairlineThenColor(text);
    const pageGrad: string[] = [];
    for (const rule of parseCssRules(css).rules) {
      if (!/linear-gradient\s*\(/i.test(rule.decls)) continue;
      const decls = parseCssDecls(rule.decls);
      if (!decls.some((d) => (d.prop === 'background' || d.prop === 'background-image') && hasMultiStopGradient(d.value))) continue;
      const text = `${rule.selector}{${rule.decls}}`;
      if (isGridPattern(text)) continue;
      const last = (prop: string) => [...decls].reverse().find((d) => d.prop === prop)?.value.trim().toLowerCase() ?? '';
      const pageSelector = splitCssTopLevel(rule.selector, ',').some((p) => {
        const comps = selectorCompounds(p);
        const subject = comps[comps.length - 1]?.compound ?? '';
        return /^(?:html|body|:root)(?![\w-])/i.test(subject) && !/::?(?:before|after|marker|backdrop)/i.test(subject);
      });
      // A fixed element covers the viewport only when it is pinned to all four
      // edges or sized to it; a fixed drawer or toast is not a page background.
      const zero = (v: string) => /^0(?:px|rem|em|%)?$/.test(v);
      const inset = last('inset');
      const pinned = (inset !== '' && inset.split(/\s+/).every(zero))
        || ['top', 'right', 'bottom', 'left'].every((side) => zero(last(side)));
      const viewportSized = decls.some((d) => /^(?:width|height|min-width|min-height|inline-size|block-size|min-inline-size|min-block-size)$/.test(d.prop)
        && /(?:^|[\s(,])100(?:d|s|l)?v(?:w|h|i|b)\b/i.test(d.value));
      const component = last('border-radius') === 'inherit';
      const hairline = decls.some((d) => (/^(?:height|width|block-size|inline-size)$/.test(d.prop) && d.value.trim() === '1px')
        || (/^border(?:-top|-bottom)?-width$/.test(d.prop) && d.value.trim() === '1px')
        || (d.prop === 'background-size' && /(?:^|[\s,])1px(?:$|[\s,])/.test(d.value))
        || (d.prop === 'background' && hasSlashThenHairline(d.value)));
      const fixedCover = last('position') === 'fixed' && (pinned || viewportSized);
      if ((pageSelector || fixedCover || (viewportSized && !component)) && !hairline) pageGrad.push(text.replace(/\s+/g, ' ').slice(0, 160));
    }
    const instances = pageGrad.length;
    if (instances > 0) {
      slopFindings.push({
        id: 'S2',
        label: 'Full-page gradient background',
        severity: 5,
        instances,
        evidence: pageGrad.slice(0, 3),
      });
    }
  }

  // S3. Purple/violet gradient on text or background — the "VibeCode Purple" tell
  {
    const matches = purpleGradientDecls(css);
    if (matches) {
      slopFindings.push({
        id: 'S3',
        label: 'Purple/violet AI gradient',
        severity: 4,
        instances: matches.length,
        evidence: matches.slice(0, 3),
      });
    }
  }

  // S4. Gradient text — multi-color gradient text (background-clip: text + color: transparent)
  // Only fires on gradients spanning 2+ genuinely DISTINCT hues (a slop rainbow).
  // A single-hue brand shimmer (e.g. signal-blue sweep across a wordmark or grade letter)
  // uses var(--ink)/var(--signal) tokens plus tints of ONE hue — intentional, not slop.
  {
    // Anchored to a rule boundary. Was `[^{]*` — unbounded, so the regex engine
    // retried from EVERY character position across the whole stylesheet. On
    // github.com (3.2 MB of CSS) that single pattern took 56 SECONDS; the same
    // pattern anchored to `(?:^|})` takes 4 ms and matches the same rule.
    // Measured 2026-09-19, Node 24. This was the real cause of the 55s cold
    // score, not the network (0.9s) and not the sequential CSS fetch.
    const gradientClips = gradientClipRules(css);
    // Extract a comparable hue signature from a color stop; var()/token stops are ignored
    // (they resolve to brand tokens, not literal slop colors).
    const hueKey = (stop: string): string | null => {
      // Ignore CSS variable / token references — these are brand tokens, not slop literals
      if (/var\(/.test(stop)) return null;
      const hex = stop.match(/#([0-9a-f]{6})/i);
      if (hex) {
        const n = parseInt(hex[1], 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        // Near-neutral (white/grey/black sheen) — treat as same neutral bucket
        if (mx - mn < 28) return 'neutral';
        // Bucket hue into 8 families (45° each) — only count genuinely different families
        let h = 0;
        const d = mx - mn;
        if (mx === r) h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = Math.round(((h * 60) + 360) % 360);
        return 'h' + Math.floor(h / 45);
      }
      const rgb = rgbArgs(stop);
      if (rgb) {
        const p = rgb[1].split(',').map(x => parseFloat(x));
        if (p.length >= 3) {
          const [r, g, b] = p;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx - mn < 28) return 'neutral';
          let h = 0;
          const d = mx - mn;
          if (mx === r) h = ((g - b) / d) % 6;
          else if (mx === g) h = (b - r) / d + 2;
          else h = (r - g) / d + 4;
          h = Math.round(((h * 60) + 360) % 360);
          return 'h' + Math.floor(h / 45);
        }
      }
      return null; // oklch/hsl/var or unparseable — don't count as evidence of slop
    };
    const multiColorGradient = gradientClips.filter(block => {
      const gradientMatch = linearGradientArgs(block);
      const gradText = (gradientMatch && (gradientMatch.groups[0] || gradientMatch.groups[1])) || '';
      const stops = gradText.split(',').map(s => s.trim());
      const hueKeys = new Set(stops.map(hueKey).filter((k): k is string => k !== null && k !== 'neutral'));
      // Need 2+ distinct hue FAMILIES — a single-hue shimmer buckets to one family
      return hueKeys.size >= 2;
    });
    if (multiColorGradient.length > 0) {
      slopFindings.push({
        id: 'S4',
        label: 'Gradient text (background-clip:text)',
        severity: 4,
        instances: multiColorGradient.length,
        evidence: multiColorGradient.slice(0, 2).map(m => m.substring(0, 80)),
      });
    }
  }

  // S5. Tailwind default palette hexes — indigo/violet/slate defaults
  {
    const tailwindDefaults = [
      '#0f172a', '#1e293b', '#334155', // slate-900/800/700
      '#615fff', '#8e51ff', '#4f39f6', '#7f22fe', // indigo/violet defaults
      '#6366f1', '#8b5cf6', '#a78bfa', // indigo-500/violet-500/violet-400
      '#0d6efd', '#007bff', // Bootstrap primaries
    ];
    const hexPattern = new RegExp(tailwindDefaults.map(h => h.replace('#', '#?')).join('|'), 'gi');
    const allColors = css.match(/#[0-9a-f]{6}/gi) || [];
    const matches = allColors.filter(c => tailwindDefaults.some(t => c.toLowerCase() === t.toLowerCase()));
    if (matches.length >= 3) {
      slopFindings.push({
        id: 'S5',
        label: 'Default Tailwind/Bootstrap palette',
        severity: 5,
        instances: matches.length,
        evidence: [...new Set(matches)].slice(0, 5),
      });
    }
  }

  // S6. Repeated identical cards — structural twins in card containers
  {
    // Detect card-like repeated structures: same class applied to multiple siblings
    const cardPattern = /\.(card|panel|tile|feature|item|box|cell|block)\b/gi;
    const cardClasses = css.match(cardPattern) || [];
    // Look for grid with repeated card children (same class repeated)
    const gridMatches = gridRepeatRules(css);
    // If we have card classes AND repeating grid layouts, likely card grid
    if (cardClasses.length >= 3 && gridMatches.length > 0) {
      slopFindings.push({
        id: 'S6',
        label: 'Repeated identical card grid',
        severity: 5,
        instances: 1,
        evidence: [`${cardClasses.length} card-like classes with repeating grid layouts`],
      });
    }
  }

  // S7. Emoji as UI icons — emoji in button/CTA positions
  //
  // The character class here was `[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}...]`,
  // which sweeps in the whole Miscellaneous Symbols and Dingbats block. That
  // block is overwhelmingly TEXT-DEFAULT glyphs: ✓ (U+2713), ✕ (U+2715) and
  // ❚ (U+275A) are typographic marks a designer reaches for deliberately, not
  // emoji. This site's own adoption badges and controls use exactly those three,
  // so the check fired on its own considered craft and took the severity-4
  // deduction for it.
  //
  // The right predicate is the Unicode property, not a hand-drawn range:
  //   \p{Emoji_Presentation} — code points that render as emoji BY DEFAULT
  //   \p{Emoji} + U+FE0F     — text-default code points PROMOTED to emoji
  // The second alternative keeps ✨ (U+2728) and ☀️ firing while leaving a bare
  // ✓ silent. It also GAINS ⭐ (U+2B50) and ✳ (U+2733), which the old range
  // missed despite both being genuine Emoji_Presentation characters — the old
  // class was wrong in both directions, not merely too broad.
  {
    const emojiInButtons = emojiCtaMatches(html);
    if (emojiInButtons && emojiInButtons.length >= 2) {
      slopFindings.push({
        id: 'S7',
        label: 'Emoji as UI icons',
        severity: 4,
        instances: emojiInButtons.length,
        evidence: [`${emojiInButtons.length} emoji in button/CTA elements`],
      });
    }
  }

  // S8. AI-pill badges: "AI-powered", "Generate", "Chat with AI" and the like
  // as the short text of a pill, badge, chip, tag or call to action.
  //
  // Until engine 1.2.0 this matched the whole HTML with no word boundary and
  // no element scope, so it read prose and the framework's <script> payload:
  // on designesy.org it counted three sentences arguing against AI sameness,
  // twice each, because "Generate" matched "generates" and "AI-generated".
  // Now <script>, <style>, <template> and comments are stripped, the phrases
  // match whole words only, and only a pill counts: an element whose class or
  // role names a badge, pill, chip, tag or CTA, a button, a link, or a span
  // with a border-radius of its own, holding 40 characters of text or fewer.
  // Skipped on a page that documents the rules (see isDocumentingSlopRules):
  // the anti-slop rule table on /methodology lists these phrases.
  {
    const visible = withoutNonVisibleMarkup(html);
    const pillPhrase = /\b(?:AI-powered|Generate|Chat with AI|Powered by AI|Built with AI|AI-driven)\b/i;
    const openRe = /<(span|a|button|div|small|strong|b|em|mark|label|p|li)\b([^<>]*)>/gi;
    const tagRe: Record<string, RegExp> = {};
    const pills: string[] = [];
    let open: RegExpExecArray | null;
    while ((open = openRe.exec(visible)) !== null) {
      const tag = open[1].toLowerCase();
      const attrs = open[2];
      const named = [...attrs.matchAll(/\b(?:class|role)\s*=\s*["']([^"']*)["']/gi)].map((a) => a[1]).join(' ');
      const pillish = /(?:^|[\s_-])(?:badge|pill|chip|tag|cta)(?:$|[\s_-])/i.test(named);
      const rounded = tag === 'span' && /\bstyle\s*=\s*["'][^"']*border-radius\s*:/i.test(attrs);
      if (!pillish && !rounded && tag !== 'button' && tag !== 'a') continue;
      // The element's content, to its matching close tag, within 2,000 characters.
      const start = open.index + open[0].length;
      const windowText = visible.slice(start, start + 2000);
      const re = tagRe[tag] ?? (tagRe[tag] = new RegExp(`<(/?)${tag}\\b[^<>]*>`, 'gi'));
      re.lastIndex = 0;
      let depth = 1;
      let end = -1;
      let t: RegExpExecArray | null;
      while ((t = re.exec(windowText)) !== null) {
        depth += t[1] ? -1 : 1;
        if (depth === 0) { end = t.index; break; }
      }
      if (end < 0) continue;
      const text = withoutTags(windowText.slice(0, end), ' ', false).replace(/\s+/g, ' ').trim();
      if (text && text.length <= 40 && pillPhrase.test(text)) pills.push(text);
    }
    if (pills.length > 0 && !isDocumentingSlopRules) {
      slopFindings.push({
        id: 'S8',
        label: 'AI-pill badge text',
        severity: 3,
        instances: pills.length,
        evidence: [...new Set(pills)].slice(0, 3),
      });
    }
  }

  // S9. Lorem ipsum placeholder text
  {
    const loremPattern = /lorem ipsum|dolor sit amet|consectetur adipiscing|sed do eiusmod|tempor incididunt/gi;
    const matches = html.match(loremPattern) || [];
    // Skipped on a page that documents the rules — see isDocumentingSlopRules.
    if (matches.length > 0 && !isDocumentingSlopRules) {
      slopFindings.push({
        id: 'S9',
        label: 'Lorem ipsum placeholder text',
        severity: 5,
        instances: matches.length,
        evidence: ['Lorem ipsum detected in page content'],
      });
    }
  }

  // S10. Single font family for entire page (heading + body + mono same family)
  {
    const fontFamilyMatches = css.match(/font-family\s*:([^;}{]+)/gi) || [];
    const uniqueFamilies = new Set<string>();
    for (const match of fontFamilyMatches) {
      const first = match.replace(/^font-family\s*:/i, '').split(',')[0].trim().replace(/["']/g, '').toLowerCase();
      if (first && !['serif', 'sans-serif', 'monospace', 'system-ui'].includes(first)) {
        uniqueFamilies.add(first);
      }
    }
    if (uniqueFamilies.size === 1) {
      slopFindings.push({
        id: 'S10',
        label: 'Single font family for everything',
        severity: 4,
        instances: 1,
        evidence: [`Only "${[...uniqueFamilies][0]}" used across entire page`],
      });
    }
  }

  // S11. Marketing buzzword copy
  {
    const buzzwords = ['streamline', 'empower', 'supercharge', 'world-class', 'enterprise-grade',
      'next-generation', 'unlock', 'leverage', 'seamless', 'cutting-edge', 'revolutionize',
      'game-chang', 'disrupt', 'synerg'];
    const bodyText = withoutTags(html, ' ', true).toLowerCase();
    const found: string[] = [];
    for (const word of buzzwords) {
      if (bodyText.includes(word)) found.push(word);
    }
    if (found.length >= 2 && !isDocumentingSlopRules) {
      slopFindings.push({
        id: 'S11',
        label: 'Marketing buzzword copy',
        severity: 3,
        instances: found.length,
        evidence: found.slice(0, 5),
      });
    }
  }

  // S12. Placeholder/stock image URLs
  {
    const placeholderPatterns = /via\.placeholder|placehold\.co|placeholder\.com|dummyimage|picsum\.photos|loremflickr|unsplash\.com\/(?:random|featured)/gi;
    const matches = html.match(placeholderPatterns) || [];
    if (matches.length > 0 && !isDocumentingSlopRules) {
      slopFindings.push({
        id: 'S12',
        label: 'Placeholder/stock image URLs',
        severity: 4,
        instances: matches.length,
        evidence: [...new Set(matches)].slice(0, 3),
      });
    }
  }

  // ── Compute slop deductions ───────────────────────────────────────────────
  // Per-check cap: 5 points. Total slop cap: 20 points.
  const SLOP_PER_CHECK_CAP = 5;
  const SLOP_TOTAL_CAP = 20;

  const slopDeductions = slopFindings.map((f) => ({
    ...f,
    deduction: Math.min(f.severity * Math.min(f.instances, 3), SLOP_PER_CHECK_CAP),
  }));

  let slopTotal = slopDeductions.reduce((sum, d) => sum + d.deduction, 0);
  slopTotal = Math.min(slopTotal, SLOP_TOTAL_CAP);

  const slopConvergences = slopDeductions.length >= 2
    ? `${slopDeductions.length} anti-slop pattern${slopDeductions.length !== 1 ? 's' : ''} detected`
    : slopDeductions.length === 1
      ? '1 anti-slop pattern detected'
      : null;

  // ── Originality / anti-slop POSITIVE lift ───────────────────────────────────
  // The compliance checks reward meeting the contract; the slop layer penalizes
  // generic patterns. Neither answers "is this DISTINCTIVE?" — the taste question
  // behind the fairness audit ("uglier than IBM/Figma/DeepMind but
  // scoring 100"). This layer adds up to +8 points for positive craft signals
  // detectable from CSS/HTML text alone. Symmetric to slop deductions but in the
  // opposite direction: compliant-but-generic sites earn NO lift (stay at their
  // weighted score), while bespoke craft is rewarded. The two layers are
  // independent and cannot double-count: slop subtracts for generic patterns,
  // originality adds only for signals slop does not already penalize the absence
  // of. A site can be compliant AND generic (no lift) OR compliant AND sloppy
  // (deducted) — never rewarded for both. Cap +8 so originality nudges rather
  // than dominates the weighted compliance base.
  interface OriginalitySignal { id: string; label: string; points: number; evidence: string; }
  const originalitySignals: OriginalitySignal[] = [];

  // O1. Bespoke easing — distinct custom cubic-bezier/linear() curves beyond the
    // keyword equivalents AND the template presets. Generic sites reuse keyword
    // easings or Material/Tailwind defaults; craft authors curves. Overshoot
    // (y<0 or y>1) is deliberate physics — a strong bespoke-motion tell.
    // Template presets — keyword equivalents + Material + Tailwind v4 + Bootstrap back-ease.
    const EASING_PRESETS = new Set([
      '0.25,0.1,0.25,1',   // ease
      '0.42,0,1,1',        // ease-in
      '0,0,0.58,1',        // ease-out
      '0.42,0,0.58,1',     // ease-in-out
      '0.4,0,0.2,1',       // Material standard / Tailwind v4 default
      '0.4,0,0.6,1',       // Material decel-accel
      '0,0,0.2,1',         // Material decel
      '0.4,0,1,1',         // Material accel
      '0.68,-0.55,0.265,1.55', // Bootstrap easeInOutBack
    ]);
    const distinct = new Set<string>();
    let hasOvershoot = false;
    for (const b of cubicBezierMatches(css)) {
      const [x1, y1s, x2, y2s] = b.groups as string[];
      const key = withoutTrailingDecimalZeros(`${x1},${y1s},${x2},${y2s}`).replace(/\s+/g, '');
      if (EASING_PRESETS.has(key)) continue;
      distinct.add(key);
      const y1 = parseFloat(y1s), y2 = parseFloat(y2s);
      if (y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1) hasOvershoot = true;
    }
    // linear() spring easings (State of CSS pick — needs ≥3 stops to be a spring)
    const linearSprings = longLinearEasings(css);
    if (linearSprings.length > 0) { hasOvershoot = true; }
    const easingCount = distinct.size;
    // Require ≥3 distinct non-preset curves for the full signal. Template CSS
    // (tailwindcss.com, shadcn) carries a handful of framework curves — 2 could
    // be a single copy-pasted bespoke accent, so the bar for "bespoke motion
    // system" is three authored curves. Overshoot/spring bumps the tier.
    if (easingCount >= 3) {
      originalitySignals.push({ id: 'O1', label: 'Bespoke motion easing', points: 3 + (hasOvershoot ? 2 : 0), evidence: `${easingCount} custom easing curves${hasOvershoot ? ' incl. spring/overshoot physics' : ''}` });
    } else if (easingCount >= 1) {
      originalitySignals.push({ id: 'O1', label: 'Custom easing curve', points: 1, evidence: `${easingCount} custom easing curve${easingCount !== 1 ? 's' : ''}` });
    }

    // O2. Modern layout — clamp() fluid type/spacing + container queries/subgrid.
    // These are deliberate, considered layout choices absent from template output.
    const hasClamp = /clamp\s*\(/.test(css);
    const hasContainer = /container-type\s*:|@container\b/.test(css);
    const hasSubgrid = /subgrid/.test(css);
    const modernCount = (hasClamp ? 1 : 0) + (hasContainer ? 1 : 0) + (hasSubgrid ? 1 : 0);
    if (modernCount >= 2) {
      originalitySignals.push({ id: 'O2', label: 'Modern layout primitives', points: 2, evidence: ['clamp()', hasContainer ? 'container queries' : '', hasSubgrid ? 'subgrid' : ''].filter(Boolean).join(' + ') });
    } else if (modernCount === 1) {
      originalitySignals.push({ id: 'O2', label: 'Fluid/container layout', points: 1, evidence: hasClamp ? 'clamp()' : hasContainer ? 'container queries' : 'subgrid' });
    }

    // O3. Typographic craft — font-feature-settings/letter-spacing tuning/ligature
    // control beyond defaults. Signals art-directed type, not font-family: inherit.
    const typoFeats = css.match(/font-feature-settings\s*:|font-variant-numeric\s*:|hanging-punctuation\s*:|text-underline-offset\s*:|font-optical-sizing\s*:/gi) || [];
    if (typoFeats.length >= 2) {
      originalitySignals.push({ id: 'O3', label: 'Typographic detail', points: 2, evidence: `${typoFeats.length} advanced type properties` });
    } else if (typoFeats.length === 1) {
      originalitySignals.push({ id: 'O3', label: 'Typographic detail', points: 1, evidence: typoFeats[0].split(':')[0] });
    }

    // O4. Intentional reduced-motion / reduced-data handling — TIERED handling
    // (soften, not just kill-switch) is a maturity tell. Reward a media query
    // that references a specific animation/transition (targeted) over a blanket
    // `* { animation: none }`.
    const reducedMotion = mediaQueryHasReducedMotion(css);
    const blanketKill = hasBlanketMotionKill(css);
    if (reducedMotion && !blanketKill) {
      originalitySignals.push({ id: 'O4', label: 'Tiered reduced-motion', points: 1, evidence: 'targeted (not blanket) motion reduction' });
    }

    // O5. Custom scroll/animation choreography — scroll-driven animations, view
    // transitions, or named keyframes beyond a single fade. Indicates considered
    // motion design rather than a single `transition: opacity`.
    const scrollDriven = /animation-timeline\s*:|scroll-timeline\s*:|view-timeline\s*:|animation-range\s*:/i.test(css);
    const viewTransition = /::view-transition|view-transition-name\s*:/i.test(css);
    const keyframes = css.match(/@keyframes\s+[\w-]+/gi) || [];
    const distinctKeyframes = new Set(keyframes.map((k) => k.replace(/@keyframes\s+/i, '')));
    if (scrollDriven || viewTransition) {
      originalitySignals.push({ id: 'O5', label: 'Advanced motion choreography', points: 2, evidence: scrollDriven ? 'scroll-driven animation' : 'view transitions' });
    } else if (distinctKeyframes.size >= 3) {
      originalitySignals.push({ id: 'O5', label: 'Multi-keyframe motion system', points: 1, evidence: `${distinctKeyframes.size} named keyframe animations` });
    }

    // O6. Bespoke iconography / SVG art-direction — inline SVG with viewBox (hand-
    // placed iconography/diagrams) rather than emoji or an icon-font/CDN sprite.
    const inlineSvg = svgViewBoxTags(html);
    const svgSymbols = symbolTags(html);
    if (inlineSvg.length >= 3 || svgSymbols.length >= 2) {
      originalitySignals.push({ id: 'O6', label: 'Bespoke iconography', points: 1, evidence: `${inlineSvg.length} inline SVGs${svgSymbols.length ? ` + ${svgSymbols.length} symbols` : ''}` });
    }

    // O7. Semantic design-token system — named custom properties with role-based
    // taxonomy (--surface/--ink/--signal, not --color-blue-500). A rich semantic
    // layer is the strongest marker of a real design system. Guards against two
    // template tells: (a) Tailwind v4 primitive hue tokens (--color-red-500) earn
    // zero — only semantic roles count; (b) the shadcn fingerprint (--background/
    // --foreground/--card/--popover/--ring with bare-HSL values) is a template,
    // zeroed out.
    // Shadcn/Radix fingerprint: co-occurrence of the shadcn token set. Modern
    // shadcn uses hex/oklch (not bare-HSL) and references Tailwind primitives
    // (var(--color-*-500)). Two fingerprint forms: (a) ≥6 of the classic shadcn
    // names co-occur, or (b) ≥4 co-occur AND the css references Tailwind
    // primitive hue tokens — either is near-certain template-generated.
    const SHADCN_FINGERPRINT = ['--background', '--foreground', '--card', '--popover', '--primary-foreground', '--ring', '--secondary', '--muted', '--accent', '--destructive', '--border', '--input'];
    const shadcnHits = SHADCN_FINGERPRINT.filter((t) => css.includes(t + ':')).length;
    const referencesTwPrimitives = /var\(--color-[a-z]+-\d{2,3}\)/i.test(css);
    const isShadcnTemplate = shadcnHits >= 6 || (shadcnHits >= 4 && referencesTwPrimitives);

    const customProps = customPropertyDecls(css);
    const semanticTokens = customProps.filter((p) => /--(surface|ink|paper|signal|line|muted|elevation|radius|duration|ease|accent|foreground|space|gap|shadow|canvas|action|feedback|success|warning|danger|error|info|subtle|on-[a-z]+)/i.test(p));
    // Exclude primitive hue tokens (--color-blue-500, --red-500) — those are a
    // framework palette, not a semantic system.
    const primitiveHue = /--(?:color|colour)-[a-z]+-\d{2,3}\s*:/i;
    const semanticCount = isShadcnTemplate ? 0 : semanticTokens.filter((p) => !primitiveHue.test(p)).length;

    // Layering: a semantic token whose value references a primitive (var(--x-500))
    // indicates a primitive→semantic→component architecture.
    const hasLayering = hasTokenLayering(css);
    // Theming: same token redefined under a theme selector or light-dark().
    const hasTheming = /light-dark\(|prefers-color-scheme\s*:\s*dark|data-theme/i.test(css);

    let tokenPoints = 0;
    const tokenEvidence: string[] = [];
    if (semanticCount >= 8) { tokenPoints += 4; tokenEvidence.push(`${semanticCount} semantic tokens`); }
    else if (semanticCount >= 4) { tokenPoints += 2; tokenEvidence.push(`${semanticCount} semantic tokens`); }
    if (hasLayering) { tokenPoints += 2; tokenEvidence.push('primitive→semantic layering'); }
    if (hasTheming && semanticCount >= 4) { tokenPoints += 2; tokenEvidence.push('theme-aware tokens'); }
    if (tokenPoints > 0) {
      originalitySignals.push({ id: 'O7', label: 'Semantic design tokens', points: Math.min(tokenPoints, 6), evidence: tokenEvidence.join(' · ') });
    }

  const ORIGINALITY_CAP = 8;
  const rawOriginality = originalitySignals.reduce((s, o) => s + o.points, 0);
  // Slop gate (research Rule 3): a heavily-sloppy site that also shows originality
  // signals is usually a heavily-customized TEMPLATE — the "originality" is
  // framework-driven, not authorial. Cap the lift at 50% when slop is heavy.
  const slopGateApplied = slopTotal >= 12;
  const originalityPoints = Math.min(
    slopGateApplied ? Math.round(rawOriginality * 0.5) : rawOriginality,
    ORIGINALITY_CAP
  );
  const originalitySummary = originalitySignals.length > 0
    ? `${originalitySignals.length} craft signal${originalitySignals.length !== 1 ? 's' : ''} (+${originalityPoints}pts${rawOriginality > ORIGINALITY_CAP ? `, capped from +${rawOriginality}` : ''}${slopGateApplied ? ', slop-gated ×0.5' : ''})`
    : null;

  // The arithmetic is shared with the other engine copy; see scoreArithmetic.
  const {
    score,
    categoryWeights: CATEGORY_WEIGHTS,
    categoryCounts,
    categoryScores,
    a11yFloorApplied,
    hardFailCeilingApplied,
    hardFailCeilingReason,
  } = scoreArithmetic(checks, slopTotal, originalityPoints);

  const grade = computeGrade(score);

  // Attach remediation guidance and per-check weight to each check. Every
  // check id has an entry; the table is the single source of truth for "how
  // to fix this" so guidance stays consistent across PASS/FAIL/WARN/SKIP.
  // Weight = CATEGORY_WEIGHTS[category] / scoredChecksInCategory (0 for SKIP/MANUAL).
  const checksWithRemediation = checks.map((c) => {
    const catWeight = CATEGORY_WEIGHTS[c.category] || 5;
    const isScored = c.status !== 'SKIP' && c.status !== 'MANUAL';
    const weight = isScored ? catWeight / (categoryCounts[c.category] || 1) : 0;
    return {
      ...c,
      weight: Math.round(weight * 1000) / 1000,
      remediation: REMEDIATION[c.id],
    };
  });

  return {
    score, grade, pass, fail, warn, skip, manual, total,
    scored: total - skip - manual, scope: effectiveScope, a11yFloorApplied,
    hardFailCeilingApplied, hardFailCeilingReason, categoryScores,
    checks: checksWithRemediation,
    tokensExtracted: Object.keys(rawTokens).length,
    slop: { total: slopTotal, findings: slopDeductions, convergences: slopConvergences },
    originality: { points: originalityPoints, signals: originalitySignals, summary: originalitySummary, slopGateApplied },
    // Stamped HERE, inside the uncached function, so it travels with the result
    // through unstable_cache. Reading the clock at the response boundary would
    // stamp a cached result with a fresh time and report a stale measurement as
    // new — the receipt would then contradict the data it is supposed to attest
    // to. `retrievedAt` therefore means "when this run happened", not "when
    // this response was served"; on a cache hit the two legitimately differ.
    retrievedAt: new Date().toISOString(),
  };
}

// Cached wrapper — the public `scoreUrl` used by both the POST handler and the
// OG image route. unstable_cache serializes the result and serves it from the
// Vercel Data Cache on subsequent calls with the same targetUrl+scope. Per the
// Next docs, the cache key is derived from the argument list, so targetUrl and
// scope together form the key. revalidateTag('score') purges all entries.
//
// The build's commit is part of the key. With the static key alone, a deploy
// that changed the engine kept serving scores computed by the PREVIOUS build
// until the TTL lapsed -- on 2026-10-06 the site's own leaderboard row stayed at
// a stale 95.7 after the engine fix had shipped. Keyed by commit, a new deploy
// starts from a clean cache. Outside Vercel there is no commit, and the key is
// stable for local runs.
//
// The miss gate (lib/score-miss-gate.ts): a caller that set one is asked here,
// on a miss only, before a fresh score starts. The live badge does.
export const scoreUrl = unstable_cache(
  async (targetUrl: string, scope?: ScoreScope) => {
    const gate = currentScoreMissGate();
    if (gate) await gate();
    return scoreUrlUncached(targetUrl, scope);
  },
  ['designesy-score', process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'],
  { revalidate: SCORE_TTL_SECONDS, tags: ['score'] }
);

// ── Format emission ─────────────────────────────────────────────────────────
// The canonical schema is at /specs/review-findings.json. Three emission formats:
//   format=designesy (default) — the native designesy shape (current response)
//   format=review  — jakubkrehel-compatible markdown table (Scope, Findings, Verdict)
//   format=google  — Google @google/design.md-compatible shape ({findings, summary, designSystem})
// The canonical JSON is the source of truth; the other two are lossy projections.

type ScoreResult = Awaited<ReturnType<typeof scoreUrlUncached>>;

/** Normalize designesy status to canonical severity. */
function statusToSeverity(status: string): string {
  switch (status) {
    case 'PASS': return 'pass';
    case 'FAIL': return 'error';
    case 'WARN': return 'warning';
    case 'SKIP': return 'skip';
    case 'MANUAL': return 'manual';
    default: return status.toLowerCase();
  }
}

/** Derive the overall verdict from check results. */
function deriveVerdict(result: ScoreResult): string {
  if (result.fail > 0) return 'fail';
  if (result.warn > 0) return 'needs-changes';
  if (result.pass === 0 && (result.skip + result.manual) === result.total) return 'not-scored';
  return 'pass';
}

/** Emission format: designesy (default, native shape — unchanged). */
function emitDesignesy(result: ScoreResult, requestedUrl: string, retrievedAt: Date) {
  // `retrievedAt` is internal plumbing — it is destructured out so the raw
  // string does not leak into the response body alongside the structured
  // `receipt.retrieved_at` that supersedes it.
  const { retrievedAt: _internal, ...payload } = result;
  return {
    ok: true,
    contractVersion: CONTRACT_VERSION,
    ...payload,
    receipt: buildReceipt(
      {
        requestedUrl,
        contractVersion: CONTRACT_VERSION,
        scope: result.scope,
        checks: result.checks,
      },
      retrievedAt,
    ),
  };
}

/** Emission format: canonical review-findings.json schema (the superset). */
function emitCanonical(url: string, result: ScoreResult, retrievedAt: Date) {
  return {
    schemaVersion: '1.0',
    generatedAt: retrievedAt.toISOString(),
    tool: {
      name: 'designesy',
      version: CONTRACT_VERSION,
    },
    subject: {
      type: 'url' as const,
      requested: url,
      scope: result.scope,
    },
    categories: Object.entries(result.categoryScores).map(([id, cs]) => ({
      id,
      score: cs.score,
      weight: cs.weight,
      counts: { pass: cs.pass, fail: cs.fail, warn: cs.warn, skip: cs.skip, manual: cs.manual },
    })),
    findings: result.checks.map((c) => ({
      id: c.id,
      item: c.item,
      category: c.category,
      status: c.status,
      severity: statusToSeverity(c.status),
      severityRaw: c.status,
      message: c.detail,
      detail: c.detail,
      remediation: c.remediation,
    })),
    summary: {
      score: result.score,
      grade: result.grade,
      countsByStatus: { pass: result.pass, fail: result.fail, warn: result.warn, skip: result.skip, manual: result.manual },
      countsBySeverity: {
        error: result.fail,
        warning: result.warn,
        pass: result.pass,
        skip: result.skip,
        manual: result.manual,
        info: 0,
      },
      scored: result.scored,
      total: result.total,
      a11yFloorApplied: result.a11yFloorApplied,
      categoryScores: Object.fromEntries(
        Object.entries(result.categoryScores).map(([id, cs]) => [id, cs.score])
      ),
    },
    verdict: deriveVerdict(result),
    receipt: buildReceipt(
      {
        requestedUrl: url,
        contractVersion: CONTRACT_VERSION,
        scope: result.scope,
        checks: result.checks,
      },
      retrievedAt,
    ),
  };
}

/** Emission format: Google @google/design.md-compatible shape. */
function emitGoogle(result: ScoreResult) {
  return {
    findings: result.checks.map((c) => ({
      // PASS and SKIP and MANUAL all map to 'info': this format's vocabulary has
      // no separate value for them, and the earlier `PASS ? 'info' : 'info'`
      // only obscured that.
      severity: c.status === 'FAIL' ? 'error' : c.status === 'WARN' ? 'warning' : 'info',
      path: c.category,
      message: c.detail,
    })),
    summary: {
      errors: result.fail,
      warnings: result.warn,
      infos: result.pass,
      // Additive, so a consumer of the previous shape is unaffected. The CLI
      // already emitted these two, which made `--format google` from the CLI
      // carry fields the API's same-named format did not.
      score: result.score,
      grade: result.grade,
    },
    designSystem: null,
  };
}

/** Emission format: jakubkrehel better-interface-compatible markdown report. */
function emitReview(url: string, result: ScoreResult): string {
  const lines: string[] = [];
  // Scope and Coverage
  lines.push('## Scope and Coverage\n');
  lines.push('| Domain | Evidence inspected | Result |');
  lines.push('|---|---|---|');
  const domains = new Map<string, { pass: number; fail: number; warn: number; skip: number; manual: number }>();
  for (const c of result.checks) {
    const d = domains.get(c.category) || { pass: 0, fail: 0, warn: 0, skip: 0, manual: 0 };
    if (c.status === 'PASS') d.pass++;
    else if (c.status === 'FAIL') d.fail++;
    else if (c.status === 'WARN') d.warn++;
    else if (c.status === 'MANUAL') d.manual++;
    else d.skip++;
    domains.set(c.category, d);
  }
  for (const [domain, d] of domains) {
    const findings = d.fail + d.warn;
    const result_str = findings === 0 ? 'Clear' : `${findings} finding(s): ${d.fail} FAIL, ${d.warn} WARN`;
    lines.push(`| ${domain} | CSS, HTML | ${result_str} |`);
  }
  lines.push('');

  // Findings table
  lines.push('## Findings\n');
  lines.push('| # | Severity | Domain | Location | Before | After | Why |');
  lines.push('|---|---|---|---|---|---|---|');
  let num = 0;
  for (const c of result.checks) {
    if (c.status === 'PASS' || c.status === 'SKIP' || c.status === 'MANUAL') continue;
    num++;
    const severity = c.status === 'FAIL' ? 'HIGH' : 'MEDIUM';
    // A cell escapes its backslashes before its pipes: a detail carries text
    // read from the scored page, where a backslash before a pipe would
    // otherwise escape the escape and leave a live cell separator.
    const before = c.detail.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').substring(0, 80);
    const after = (c.remediation || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').substring(0, 80);
    const why = `${c.item} (${c.category})`.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
    lines.push(`| ${num} | ${severity} | ${c.category} | ${url} | ${before} | ${after} | ${why} |`);
  }
  if (num === 0) {
    lines.push('| | | | | No actionable findings | | |');
  }
  lines.push('');

  // Verdict
  lines.push('## Verdict\n');
  const verdict = deriveVerdict(result);
  if (verdict === 'fail') lines.push('**Block**: at least one HIGH finding (FAIL) remains.');
  else if (verdict === 'needs-changes') lines.push('**Needs changes**: only MEDIUM findings (WARN) remain.');
  else if (verdict === 'not-scored') lines.push('**Not scored**: every check SKIPped or needs manual review — no verdict was reached.');
  else lines.push('**Approve**: no actionable findings remain.');
  lines.push('');
  lines.push(`**Score: ${result.score}% (Grade ${result.grade})** (${result.pass} PASS / ${result.fail} FAIL / ${result.warn} WARN / ${result.manual} MANUAL / ${result.skip} N/A / ${result.total} total)`);

  return lines.join('\n');
}

// ── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const caller = await clientKey(request.headers);
  if (rateLimited(caller)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Maximum 100 scores per hour.' },
      { status: 429 }
    );
  }

  // F7 usage counters (lib/usage.ts): which surface called, never what it scored.
  after(() => recordUsage(`score:${scoreClientOf(request.headers.get('user-agent'))}`, request));

  let body: { url?: unknown; format?: unknown; scope?: unknown; contract?: unknown };
  // Read as text, then parsed: the same result as request.json(), plus the
  // body's size, which own-contract mode caps (413 body_too_large).
  let bodyBytes = 0;
  try {
    const text = await request.text();
    bodyBytes = Buffer.byteLength(text, 'utf8');
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawUrl = typeof body.url === 'string' ? body.url : '';
  const url = normalizeInputUrl(rawUrl);
  const format = typeof body.format === 'string' ? body.format.toLowerCase() : 'designesy';

  // Scope: 'contract' (strict, all checks penalize absence) or 'universal'
  // (fair to external sites — optional features SKIP on absence). If not
  // provided, auto-detect: designesy.org → contract, everything else → universal.
  const scopeRaw = typeof body.scope === 'string' ? body.scope.toLowerCase() : '';
  const scope: ScoreScope = scopeRaw === 'contract' || scopeRaw === 'universal'
    ? scopeRaw as ScoreScope
    : autoDetectScope(url);

  if (!url || !isValidUrl(url)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid URL. Enter a valid domain like designesy.org or nike.com.' },
      { status: 400 }
    );
  }

  // Validate format
  if (!['designesy', 'review', 'google', 'canonical'].includes(format)) {
    return NextResponse.json(
      { ok: false, error: `Unknown format "${format}". Supported: designesy (default), review, google, canonical.` },
      { status: 400 }
    );
  }

  // Own-contract mode: a `contract` field scores the page against the caller's
  // own DESIGN.md or DTCG file (app/lib/own-contract/api.ts). It never goes
  // through the cached scoreUrl and stores nothing; requests without the field
  // take the path below, unchanged. The route hands over only what it holds:
  // its page fetch, the baseline layer's checks (called exactly as
  // scoreUrlUncached calls them), v36's confusable helper and the URL guard.
  if (body.contract !== undefined) {
    if (format !== 'designesy') {
      return NextResponse.json(
        { ok: false, error: 'Scoring against your own contract answers in format designesy only.', code: 'format_unsupported' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    try {
      const r = await handleOwnContract(
        { body: body as Record<string, unknown>, bodyBytes, url, caller },
        {
          fetchPage: fetchPageResilient,
          legacyChecks: ({ html, css }) => {
            const rawTokens = extractRootTokens(css);
            const tokens = inferTokensFromCss(css, rawTokens);
            return sanitizeCheckDetails([
              { id: 'v02', item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+', category: 'responsive', status: 'MANUAL', detail: 'requires browser viewport trace: run the full audit to resolve' },
              checkFocusVisible(css),
              checkReducedMotion(css),
              checkSemanticHtmlFoundation(html),
              checkPoiseKeyboardPath(css, html),
              checkTransitionAll(css),
              checkWillChange(css),
              { id: 'v21', item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1', category: 'performance', status: 'MANUAL', detail: 'requires CDP trace: run the full audit to resolve' },
              checkHeadingHierarchy(html),
              checkInputFontFloor(css, html, rawTokens),
              checkAiDisclosure(html),
              checkForcedColors(css),
              checkSecurityConfusables(css, tokens),
              checkButtonTextVerb(html),
              checkNoTrailingPeriod(html),
              checkLinkTextDescriptive(html),
              checkStatusTextContrast(css),
              checkPausedEntrances(css),
            ]);
          },
          safeFetch,
          findConfusables,
        },
      );
      // F7: one count per scored run under the mode's own key (never the URL or the contract).
      if (r.status === 200) after(() => recordUsage(scoreContractKey(scoreClientOf(request.headers.get('user-agent'))), request));
      return NextResponse.json(r.body, { status: r.status, headers: r.headers });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      return NextResponse.json(
        { ok: false, error: `Could not reach ${url}: ${sanitizeErrorText(msg)}` },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }

  try {
    const result = await scoreUrl(url, scope);

    // The run's own timestamp, carried on the result through the cache. On a
    // cache hit this is correctly older than now — the measurement really did
    // happen earlier, and the receipt must say so.
    const retrievedAt = new Date(result.retrievedAt);

    if (format === 'review') {
      const markdown = emitReview(url, result);
      return new Response(markdown, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (format === 'google') {
      return NextResponse.json(emitGoogle(result), {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (format === 'canonical') {
      return NextResponse.json(emitCanonical(url, result, retrievedAt), {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // default: designesy (native shape, unchanged)
    return NextResponse.json(
      emitDesignesy(result, url, retrievedAt),
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: `Could not reach ${url}: ${sanitizeErrorText(msg)}` },
      { status: 502 }
    );
  }
}