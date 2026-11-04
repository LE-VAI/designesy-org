// app/lib/page-fetch.ts
//
// How the drift, guardrails, monitor and compare routes read a page: its
// HTML, its inline <style> blocks and its linked stylesheets, all through
// url-guard's safeFetch. The four routes held identical copies of this code;
// they import it from here since engine 1.5.4 (see CHANGELOG), so a fix to how
// a page is read lands in all four at once.
//
// What it reads, as the score route reads it (engine 1.5.4):
//   - a stylesheet href resolves against the URL that answered: the candidate
//     that was read, after its redirects, never the URL that was asked for;
//   - a <link> is a stylesheet with rel=stylesheet before or after its href;
//   - a body sent gzip, deflate or br is decoded by safeFetch, and one that
//     does not decode is not read;
//   - what is held is bounded as it arrives, with the score route's caps:
//     8 MiB of HTML, 4 MiB of one stylesheet, and 16 MiB for a page's
//     stylesheets together, decoded or not. A body past a cap is read up to
//     it, so a few kilobytes on the wire cannot expand past what is read,
//     however many sheets a page links;
//   - the sheets take at most 20 s in all, as the score route's do
//     (STYLESHEET_DEADLINE_MS), so a page linking many sheets whose server
//     stays quiet cannot hold a route past its limit; a sheet not read by
//     then is left out.
// The scanners below are the score route's (app/api/score/route.ts), copied
// unchanged: each reads a run of text once, and
// packages/score/test/linear-scan.test.mjs holds the score engine's copies to
// the patterns they stand for. scripts/check-fetch-layer.mjs holds this
// module's stylesheetLinkMatches to the same pattern and runs all four routes.

import { safeFetch, type ReadBudget } from './url-guard';

/** Headers the page and sheet requests send. */
// Accept-Encoding names the three codings url-guard decodes (engine 1.5.4):
// with none, a server may send any coding (RFC 9110 section 12.5.3).
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

// ── Scanning (the score route's helpers) ────────────────────────────────────

/** A regex match as the helpers report it: start, matched text, groups. */
export type ScanMatch = { index: number; text: string; groups: Array<string | undefined> };

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

/** /<style[^>]*>([\s\S]*?)<\/style>/gi (inline stylesheets). */
function styleElements(html: string): ScanMatch[] {
  return elementMatches(html, /<style/gi, /<\/style>/gi);
}

/**
 * Group 1, or else group 2, of each match of
 * /<link(?:[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']|[^>]*href=["']([^"']+)["'][^>]*rel=["']?stylesheet)/gi.
 * The first alternative is the pattern before engine 1.5.4: the last quoted
 * href in the tag after its first rel=stylesheet. The second (engine 1.5.4)
 * reads a tag that writes href first: the last quoted href in the tag that is
 * followed by rel=stylesheet before the next `>`.
 */
export function stylesheetLinkMatches(html: string): ScanMatch[] {
  const start = /<link/gi;
  const rel = nextMatchFinder(html, /rel=["']?stylesheet/gi);
  const rels = matchStarts(html, /rel=["']?stylesheet/gi);
  const hrefs = matchStarts(html, /href=["']/gi);
  const gt = nextMatchFinder(html, />/g);
  const gtAfterValue = nextMatchFinder(html, />/g);
  const quote = nextMatchFinder(html, /["']/g);
  const n = html.length;
  const isQuote = (c: number): boolean => c === 34 || c === 39;
  let lastQuote = n - 1;
  while (lastQuote >= 0 && !isQuote(html.charCodeAt(lastQuote))) lastQuote--;
  // The second alternative, worked out once per href, since it does not
  // depend on where the tag starts: the value is non-empty and closes at q,
  // and a rel=stylesheet starts after q and before the first `>` after q.
  // The greedy [^>]* ends the match with the last such rel.
  const hrefFirst = hrefs.map((at) => {
    const v = at + 6;
    if (!(v < n && !isQuote(html.charCodeAt(v)) && lastQuote > v)) return null;
    const q = quote(v + 1);
    const k = lowerBound(rels, Math.min(gtAfterValue(q + 1), n)) - 1;
    if (k < 0 || rels[k] <= q) return null;
    return { q, end: rels[k] + (isQuote(html.charCodeAt(rels[k] + 4)) ? 15 : 14) };
  });
  // lastViable[i]: the largest k <= i whose href reads by the second alternative, or -1.
  const lastViable: number[] = [];
  for (let i = 0, lv = -1; i < hrefs.length; i++) {
    if (hrefFirst[i]) lv = i;
    lastViable.push(lv);
  }
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
    // No rel before an href: the last href in the tag that rel=stylesheet follows.
    const k = end > ptr ? lastViable[end - 1] : -1;
    if (k >= ptr) {
      const hit = hrefFirst[k] as { q: number; end: number };
      out.push({ index: m.index, text: html.slice(m.index, hit.end), groups: [html.slice(hrefs[k] + 6, hit.q)] });
      pos = hit.end;
      continue;
    }
    // Every start before g sees less of the same tag, by either alternative.
    if (g >= n) break;
    pos = g + 1;
  }
  return out;
}


// ── Fetching ────────────────────────────────────────────────────────────────

/** The score route's byte caps (app/api/score/route.ts, engine 1.5.1), applied here since engine 1.5.4. */
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_STYLESHEET_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_STYLESHEET_BYTES = 16 * 1024 * 1024;

/** How long one read may take: the page at one candidate URL, or one sheet. */
const READ_DEADLINE_MS = 8000;

/**
 * How long a page's stylesheets may take, in all, from the first one asked
 * for: the score route's STYLESHEET_DEADLINE_MS. The sheets are read one
 * after another, each with READ_DEADLINE_MS, so with no bound on the whole a
 * page linking many sheets whose server stays quiet held a route for 8 s a
 * sheet, past the 60 s each of the four routes may run once it links 8 such
 * sheets. One timer, started as the first sheet is asked for, ends the
 * phase: once it has fired no more sheets are asked for, and it ends the
 * sheet being read. A sheet not read by then is left out, as one that
 * cannot be read is.
 */
const STYLESHEET_DEADLINE_MS = 20_000;

/**
 * Inline <style> bodies, then the absolute URL of each linked stylesheet,
 * in document order. `baseUrl` is the URL the page was read from.
 */
export function extractCssLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  for (const m of styleElements(html)) links.push(m.groups[0] as string);
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
 * A body as text, up to `maxBytes` (decoded as Response.text() decodes), and
 * the URL that answered (resp.url, after redirects; a Response built by hand
 * has url ''), or '' and the URL asked for when the read failed. `budget`,
 * when given, is shared with the other reads of the same page. The read
 * ends after READ_DEADLINE_MS, or when `phase` is aborted, if that comes
 * first.
 */
async function fetchText(url: string, maxBytes: number, budget?: ReadBudget, phase?: AbortSignal): Promise<{ text: string; url: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), READ_DEADLINE_MS);
  const endPhase = () => controller.abort();
  phase?.addEventListener('abort', endPhase, { once: true });
  try {
    // safeFetch holds at most maxBytes + 1 bytes of the body, and charges
    // the shared budget as they arrive.
    const resp = await safeFetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      maxBodyBytes: maxBytes,
      budget,
    });
    if (!resp.ok) return { text: '', url };
    const bytes = new Uint8Array(await resp.arrayBuffer());
    return { text: new TextDecoder().decode(bytes.subarray(0, maxBytes)), url: resp.url || url };
  } catch {
    return { text: '', url };
  } finally {
    clearTimeout(timeout);
    phase?.removeEventListener('abort', endPhase);
  }
}

/**
 * The page at `targetUrl` (or at its www. host when the bare host gives no
 * page) and its CSS: the inline <style> bodies, then each linked sheet, read
 * one after another, joined with newlines. A sheet that cannot be read is
 * left out. With no page, both are ''. Each sheet is read up to
 * MAX_STYLESHEET_BYTES, and the sheets share MAX_TOTAL_STYLESHEET_BYTES;
 * once that is spent, no more are asked for. Nor are they once
 * STYLESHEET_DEADLINE_MS has passed since the first was asked for.
 */
export async function fetchPageResilient(targetUrl: string): Promise<{ html: string; css: string }> {
  let html = '';
  let pageUrl = targetUrl;
  try {
    const parsed = new URL(targetUrl);
    const candidates = [
      targetUrl,
      !parsed.hostname.startsWith('www.') ? `https://www.${parsed.hostname}${parsed.pathname}` : '',
    ].filter(Boolean);
    for (const c of candidates) {
      const r = await fetchText(c, MAX_HTML_BYTES);
      html = r.text;
      pageUrl = r.url;
      if (html && html.length > 50) break;
    }
  } catch {
    // fall through
  }
  if (!html) return { html: '', css: '' };
  const parts = extractCssLinks(html, pageUrl);
  const cssParts: string[] = [];
  const budget: ReadBudget = { left: MAX_TOTAL_STYLESHEET_BYTES };
  // The phase's timer starts as the first sheet is asked for, and its signal
  // alone says whether the phase is over. A timer can fire a millisecond
  // before Date.now() reaches the end it was set for, so a loop that compared
  // the time with that end could ask for one more sheet once the timer that
  // ended the last one had fired.
  const phase = new AbortController();
  let phaseTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    for (const part of parts) {
      if (part.startsWith('http')) {
        // A spent budget holds no byte of any later sheet.
        if (budget.left <= 0) continue;
        if (phase.signal.aborted) continue;
        if (!phaseTimer) phaseTimer = setTimeout(() => phase.abort(), STYLESHEET_DEADLINE_MS);
        const ext = (await fetchText(part, MAX_STYLESHEET_BYTES, budget, phase.signal)).text;
        if (ext) cssParts.push(ext);
      } else {
        cssParts.push(part);
      }
    }
  } finally {
    clearTimeout(phaseTimer);
  }
  return { html, css: cssParts.join('\n') };
}
