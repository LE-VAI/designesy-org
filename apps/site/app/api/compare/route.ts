// /api/compare — Designesy Token Diff Engine
//
// Fetches two URLs, extracts their :root token systems, and produces
// a structured diff: tokens added, removed, renamed (heuristic),
// value-changed, scale-stop-changed, contrast-drift, structure-delta,
// and score-delta (runs /score on both).
//
// Contract: /contracts/compare.json (designesy.compare v0.1.0)

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

// ── URL utilities (inlined — do not import from a route file) ─────────────────

function normalizeInputUrl(raw: string): string {
  let clean = raw.trim();
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  try {
    const u = new URL(clean);
    return u.href;
  } catch {
    return clean;
  }
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('172.16.') ||
      host === '0.0.0.0' ||
      !host.includes('.')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMIT = 30;
const RATE_WINDOW = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = hits.get(ip) || [];
  const recent = arr.filter((t) => now - t < RATE_WINDOW);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// ── Fetching (mirrors drift/monitor routes) ──────────────────────────────────

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

function extractCssLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html)) !== null) {
    links.push(m[1]);
  }
  const linkRe = /<link[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']/gi;
  while ((m = linkRe.exec(html)) !== null) {
    try {
      links.push(new URL(m[1], baseUrl).href);
    } catch {
      // ignore malformed
    }
  }
  return links;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!resp.ok) return '';
    return await resp.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPageResilient(targetUrl: string): Promise<{ html: string; css: string }> {
  let html = '';
  try {
    const parsed = new URL(targetUrl);
    const candidates = [
      targetUrl,
      !parsed.hostname.startsWith('www.') ? `https://www.${parsed.hostname}${parsed.pathname}` : '',
    ].filter(Boolean);
    for (const c of candidates) {
      html = await fetchText(c);
      if (html && html.length > 50) break;
    }
  } catch {
    // fall through
  }
  if (!html) return { html: '', css: '' };
  const parts = extractCssLinks(html, targetUrl);
  const cssParts: string[] = [];
  for (const part of parts) {
    if (part.startsWith('http')) {
      const ext = await fetchText(part);
      if (ext) cssParts.push(ext);
    } else {
      cssParts.push(part);
    }
  }
  return { html, css: cssParts.join('\n') };
}

// ── Token extraction ─────────────────────────────────────────────────────────

function extractRootTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const rootRe = /:root\s*\{([^}]*)\}/g;
  let m;
  while ((m = rootRe.exec(css)) !== null) {
    const block = m[1];
    const propRe = /(--[\w-]+)\s*:\s*([^;]+?)(?:;|$)/g;
    let p;
    while ((p = propRe.exec(block)) !== null) {
      tokens[p[1]] = p[2].trim();
    }
  }
  return tokens;
}

function extractValuesByProperty(css: string, props: string[]): string[] {
  const values: string[] = [];
  for (const prop of props) {
    const re = new RegExp(`${prop}\\s*:\\s*([^;]+?)(?:;|$)`, 'gi');
    let m;
    while ((m = re.exec(css)) !== null) {
      values.push(m[1].trim());
    }
  }
  return values;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((v) => v.toLowerCase().replace(/\s+/g, ' ').trim()))];
}

// ── Color parsing for contrast drift ─────────────────────────────────────────

function parseColorToRgb(value: string): [number, number, number] | null {
  const hexMatch = value.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return [r, g, b];
    }
  }
  const rgbMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }
  return null;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = relativeLuminance(...rgb1);
  const l2 = relativeLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── Levenshtein distance for rename detection ────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckResult = {
  id: string;
  item: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
};

type TokenDiffEntry = {
  token: string;
  valueA?: string;
  valueB?: string;
};

type RenameCandidate = {
  from: string;
  to: string;
  distance: number;
  valueA: string;
  valueB: string;
};

type ContrastDriftEntry = {
  token: string;
  valueA: string;
  valueB: string;
  contrastA: number;
  contrastB: number;
  drift: number;
};

type CompareResponse = {
  ok: boolean;
  urlA?: string;
  urlB?: string;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  tokensA?: number;
  tokensB?: number;
  added?: TokenDiffEntry[];
  removed?: TokenDiffEntry[];
  renamed?: RenameCandidate[];
  valueChanged?: TokenDiffEntry[];
  scaleDiff?: {
    spacing: { a: number; b: number; delta: number };
    radius: { a: number; b: number; delta: number };
    colors: { a: number; b: number; delta: number };
  };
  structureDelta?: {
    countA: number;
    countB: number;
    countDelta: number;
    categoriesA: Record<string, number>;
    categoriesB: Record<string, number>;
  };
  contrastDrift?: ContrastDriftEntry[];
  scoreDelta?: {
    scoreA: number;
    scoreB: number;
    delta: number;
    gradeA: string;
    gradeB: string;
  } | null;
  checks?: CheckResult[];
  error?: string;
};

// ── Diff computation ─────────────────────────────────────────────────────────

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function categorizeToken(name: string): string {
  if (/color|ink|muted|paper|surface|signal|line|shadow|bg|fg|border/i.test(name)) return 'color';
  if (/space|padding|margin|gap|grid/i.test(name)) return 'spacing';
  if (/radius|corner|round/i.test(name)) return 'radius';
  if (/font|type|text|size|weight|line/i.test(name)) return 'typography';
  if (/duration|transition|ease|motion|anim/i.test(name)) return 'motion';
  if (/z-index|zindex|stack/i.test(name)) return 'stacking';
  if (/shadow|elevation/i.test(name)) return 'elevation';
  return 'other';
}

function isColorValue(value: string): boolean {
  return /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(/i.test(value);
}

async function scoreCompareUncached(urlA: string, urlB: string): Promise<CompareResponse> {
  // Fetch both URLs in parallel
  const [resultA, resultB] = await Promise.all([
    fetchPageResilient(urlA),
    fetchPageResilient(urlB),
  ]);

  // Check c01: both URLs fetched
  if (!resultA.html && !resultA.css && !resultB.html && !resultB.css) {
    return { ok: false, error: 'Could not fetch either URL. Check that both URLs are correct and publicly accessible.' };
  }
  if (!resultA.html && !resultA.css) {
    return { ok: false, urlA, urlB, error: `Could not fetch URL A (${urlA}). Check that the URL is correct and publicly accessible.` };
  }
  if (!resultB.html && !resultB.css) {
    return { ok: false, urlA, urlB, error: `Could not fetch URL B (${urlB}). Check that the URL is correct and publicly accessible.` };
  }

  // Extract CSS + tokens from both
  const cssA = resultA.css + (resultA.html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)?.join('\n') || '');
  const cssB = resultB.css + (resultB.html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)?.join('\n') || '');
  const tokensA = extractRootTokens(cssA);
  const tokensB = extractRootTokens(cssB);

  const countA = Object.keys(tokensA).length;
  const countB = Object.keys(tokensB).length;

  const checks: CheckResult[] = [];

  // c01: Both URLs fetched
  checks.push({
    id: 'c01',
    item: 'Both URLs fetched',
    status: 'PASS',
    detail: `Both URLs fetched successfully with CSS content (A: ${cssA.length} chars, B: ${cssB.length} chars)`,
  });

  // c02: Token extraction
  if (countA === 0 && countB === 0) {
    checks.push({ id: 'c02', item: 'Token extraction', status: 'FAIL', detail: 'No :root custom properties found in either URL — nothing to compare' });
  } else if (countA === 0 || countB === 0) {
    checks.push({ id: 'c02', item: 'Token extraction', status: 'FAIL', detail: `No :root tokens in ${countA === 0 ? 'A' : 'B'} (A: ${countA}, B: ${countB}) — one site has no token system` });
  } else if (Math.abs(countA - countB) > Math.max(countA, countB) * 0.5) {
    checks.push({ id: 'c02', item: 'Token extraction', status: 'WARN', detail: `Significant token count disparity (A: ${countA}, B: ${countB}) — may indicate an incomplete token system` });
  } else {
    checks.push({ id: 'c02', item: 'Token extraction', status: 'PASS', detail: `Tokens extracted from both URLs (A: ${countA}, B: ${countB})` });
  }

  // Compute set diff
  const keysA = new Set(Object.keys(tokensA));
  const keysB = new Set(Object.keys(tokensB));

  // c03: Token-set diff
  const added: TokenDiffEntry[] = []; // In A but not B
  const removed: TokenDiffEntry[] = []; // In B but not A
  const valueChanged: TokenDiffEntry[] = []; // Same name, different value

  for (const key of keysA) {
    if (!keysB.has(key)) {
      added.push({ token: key, valueA: tokensA[key] });
    } else if (tokensA[key] !== tokensB[key]) {
      valueChanged.push({ token: key, valueA: tokensA[key], valueB: tokensB[key] });
    }
  }
  for (const key of keysB) {
    if (!keysA.has(key)) {
      removed.push({ token: key, valueB: tokensB[key] });
    }
  }

  if (countA === 0 && countB === 0) {
    checks.push({ id: 'c03', item: 'Token-set diff computed', status: 'FAIL', detail: 'Cannot compute diff — token maps are empty' });
  } else {
    checks.push({
      id: 'c03',
      item: 'Token-set diff computed',
      status: 'PASS',
      detail: `Diff computed: ${added.length} added, ${removed.length} removed, ${valueChanged.length} value-changed`,
    });
  }

  // c04: Rename detection (heuristic)
  const renamed: RenameCandidate[] = [];
  if (countA > 0 && countB > 0) {
    const addedNames = added.map((a) => a.token);
    const removedNames = removed.map((r) => r.token);
    const usedAdded = new Set<string>();
    const usedRemoved = new Set<string>();
    for (const addName of addedNames) {
      if (usedAdded.has(addName)) continue;
      for (const remName of removedNames) {
        if (usedRemoved.has(remName)) continue;
        const dist = levenshtein(addName.replace(/^--/, ''), remName.replace(/^--/, ''));
        if (dist > 0 && dist <= 2) {
          renamed.push({
            from: remName,
            to: addName,
            distance: dist,
            valueA: tokensA[addName] || '',
            valueB: tokensB[remName] || '',
          });
          usedAdded.add(addName);
          usedRemoved.add(remName);
          break;
        }
      }
    }
    checks.push({
      id: 'c04',
      item: 'Rename detection',
      status: 'PASS',
      detail: renamed.length > 0
        ? `${renamed.length} rename candidate${renamed.length === 1 ? '' : 's'} detected (Levenshtein ≤ 2)`
        : 'No rename candidates detected (no similar names with different values)',
    });
  } else {
    checks.push({ id: 'c04', item: 'Rename detection', status: 'FAIL', detail: 'Cannot detect renames — token parsing incomplete' });
  }

  // c05: Scale diff
  const spacingA = uniqueValues(extractValuesByProperty(cssA, ['padding', 'margin']));
  const spacingB = uniqueValues(extractValuesByProperty(cssB, ['padding', 'margin']));
  const radiusA = uniqueValues(extractValuesByProperty(cssA, ['border-radius']));
  const radiusB = uniqueValues(extractValuesByProperty(cssB, ['border-radius']));
  const colorTokensA = Object.values(tokensA).filter(isColorValue);
  const colorTokensB = Object.values(tokensB).filter(isColorValue);

  const scaleDiff = {
    spacing: { a: spacingA.length, b: spacingB.length, delta: spacingA.length - spacingB.length },
    radius: { a: radiusA.length, b: radiusB.length, delta: radiusA.length - radiusB.length },
    colors: { a: colorTokensA.length, b: colorTokensB.length, delta: colorTokensA.length - colorTokensB.length },
  };

  if (countA === 0 && countB === 0) {
    checks.push({ id: 'c05', item: 'Scale diff', status: 'FAIL', detail: 'Insufficient value data for scale diff' });
  } else {
    checks.push({
      id: 'c05',
      item: 'Scale diff',
      status: 'PASS',
      detail: `Scale diff: spacing ${scaleDiff.spacing.a}→${scaleDiff.spacing.b} (${scaleDiff.spacing.delta > 0 ? '+' : ''}${scaleDiff.spacing.delta}), radius ${scaleDiff.radius.a}→${scaleDiff.radius.b}, colors ${scaleDiff.colors.a}→${scaleDiff.colors.b}`,
    });
  }

  // c06: Structure delta
  const categoriesA: Record<string, number> = {};
  const categoriesB: Record<string, number> = {};
  for (const key of Object.keys(tokensA)) {
    const cat = categorizeToken(key);
    categoriesA[cat] = (categoriesA[cat] || 0) + 1;
  }
  for (const key of Object.keys(tokensB)) {
    const cat = categorizeToken(key);
    categoriesB[cat] = (categoriesB[cat] || 0) + 1;
  }

  const structureDelta = {
    countA,
    countB,
    countDelta: countA - countB,
    categoriesA,
    categoriesB,
  };

  if (countA === 0 && countB === 0) {
    checks.push({ id: 'c06', item: 'Structure delta', status: 'FAIL', detail: 'Token parsing incomplete' });
  } else {
    checks.push({
      id: 'c06',
      item: 'Structure delta',
      status: 'PASS',
      detail: `Structure: ${countA}→${countB} tokens (${countA - countB > 0 ? '+' : ''}${countA - countB} delta), categories: ${Object.keys(categoriesA).length}→${Object.keys(categoriesB).length}`,
    });
  }

  // c07: Contrast drift
  const contrastDrift: ContrastDriftEntry[] = [];
  const sharedColorTokens = valueChanged.filter((v) => isColorValue(v.valueA || '') && isColorValue(v.valueB || ''));
  // Reference background: white (#ffffff) for light-mode sites, #010102 for dark
  const refBg: [number, number, number] = [1, 1, 2]; // designesy dark paper

  for (const entry of sharedColorTokens) {
    const rgbA = parseColorToRgb(entry.valueA || '');
    const rgbB = parseColorToRgb(entry.valueB || '');
    if (rgbA && rgbB) {
      const cA = contrastRatio(rgbA, refBg);
      const cB = contrastRatio(rgbB, refBg);
      contrastDrift.push({
        token: entry.token,
        valueA: entry.valueA || '',
        valueB: entry.valueB || '',
        contrastA: Math.round(cA * 100) / 100,
        contrastB: Math.round(cB * 100) / 100,
        drift: Math.round((cB - cA) * 100) / 100,
      });
    }
  }

  if (sharedColorTokens.length === 0) {
    checks.push({ id: 'c07', item: 'Contrast drift', status: 'WARN', detail: 'No shared color tokens with different values — contrast drift not computable' });
  } else {
    checks.push({
      id: 'c07',
      item: 'Contrast drift',
      status: 'PASS',
      detail: `Contrast drift computed for ${contrastDrift.length} shared color token${contrastDrift.length === 1 ? '' : 's'}`,
    });
  }

  // c08: Score delta — run /score on both URLs
  let scoreDelta: CompareResponse['scoreDelta'] = null;
  try {
    const [scoreAResp, scoreBResp] = await Promise.all([
      fetch(new URL('/api/score', 'https://www.designesy.org'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlA }),
      }),
      fetch(new URL('/api/score', 'https://www.designesy.org'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlB }),
      }),
    ]);
    const scoreA = await scoreAResp.json();
    const scoreB = await scoreBResp.json();
    if (scoreA.ok && scoreB.ok) {
      scoreDelta = {
        scoreA: scoreA.score,
        scoreB: scoreB.score,
        delta: scoreA.score - scoreB.score,
        gradeA: scoreA.grade,
        gradeB: scoreB.grade,
      };
      if (scoreA.score < 50 || scoreB.score < 50) {
        checks.push({ id: 'c08', item: 'Score delta', status: 'WARN', detail: `Score delta computed (A: ${scoreA.grade}/${scoreA.score}, B: ${scoreB.grade}/${scoreB.score}, Δ${scoreA.score - scoreB.score > 0 ? '+' : ''}${scoreA.score - scoreB.score}) — one or both scores are low` });
      } else {
        checks.push({ id: 'c08', item: 'Score delta', status: 'PASS', detail: `Score delta computed (A: ${scoreA.grade}/${scoreA.score}, B: ${scoreB.grade}/${scoreB.score}, Δ${scoreA.score - scoreB.score > 0 ? '+' : ''}${scoreA.score - scoreB.score})` });
      }
    } else {
      checks.push({ id: 'c08', item: 'Score delta', status: 'FAIL', detail: 'Could not run /score on one or both URLs' });
    }
  } catch {
    checks.push({ id: 'c08', item: 'Score delta', status: 'FAIL', detail: 'Score API error — could not compute score delta' });
  }

  // Compute compare score (diff completeness, not design quality)
  const pass = checks.filter((c) => c.status === 'PASS').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const points = pass + warn * 0.5;
  const score = Math.round((points / checks.length) * 100);

  return {
    ok: true,
    urlA,
    urlB,
    score,
    grade: computeGrade(score),
    pass,
    warn,
    fail,
    total: checks.length,
    tokensA: countA,
    tokensB: countB,
    added,
    removed,
    renamed,
    valueChanged,
    scaleDiff,
    structureDelta,
    contrastDrift,
    scoreDelta,
    checks,
  };
}

// ── Cached wrapper ───────────────────────────────────────────────────────────

const COMPARE_TTL = 60 * 60 * 24; // 24h

const scoreCompare = unstable_cache(scoreCompareUncached, ['designesy-compare'], {
  revalidate: COMPARE_TTL,
  tags: ['compare'],
});

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Maximum 30 compare scans per hour.' },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: { urlA?: string; urlB?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const targetA = normalizeInputUrl(body.urlA || '');
  const targetB = normalizeInputUrl(body.urlB || '');

  if (!isValidUrl(targetA) || !isValidUrl(targetB)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid URL. Provide two public http(s) URLs.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (targetA === targetB) {
    return NextResponse.json(
      { ok: false, error: 'Both URLs are identical — comparison requires two different URLs.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const result = await scoreCompare(targetA, targetB);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { 'Cache-Control': 'no-store' },
  });
}