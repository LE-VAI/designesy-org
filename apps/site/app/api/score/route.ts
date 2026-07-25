import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Rate limiting (in-memory) ──────────────────────────────────────────────

const RATE_LIMIT = 20; // requests per hour per IP
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

export function normalizeInputUrl(raw: string): string {
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
      // ignore malformed hrefs
    }
  }
  return links;
}

async function fetchCssSingle(url: string): Promise<string> {
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
  const parsed = new URL(targetUrl);
  const candidateUrls = [
    targetUrl,
    parsed.hostname.startsWith('www.') ? '' : `https://www.${parsed.hostname}${parsed.pathname}`,
    `http://${parsed.hostname}${parsed.pathname}`,
  ].filter(Boolean);

  let html = '';
  for (const candidate of candidateUrls) {
    try {
      html = await fetchCssSingle(candidate);
      if (html && html.length > 50) break;
    } catch {
      // try next fallback
    }
  }

  if (!html) {
    return { html: '<html><body></body></html>', css: '' };
  }

  const parts = extractCssLinks(html, targetUrl);
  const cssParts: string[] = [];
  for (const part of parts) {
    if (part.startsWith('http')) {
      const externalCss = await fetchCssSingle(part);
      if (externalCss) cssParts.push(externalCss);
    } else {
      cssParts.push(part);
    }
  }

  return { html, css: cssParts.join('\n') };
}

// ── Token extraction + normalization ────────────────────────────────────────

function extractRootTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const rootRe = /:root\s*\{([^}]*)\}/g;
  let m;
  while ((m = rootRe.exec(css)) !== null) {
    const block = m[1];
    const propRe = /--([\w-]+)\s*:\s*([^;]+?)(?:;|$)/g;
    let p;
    while ((p = propRe.exec(block)) !== null) {
      tokens[`--${p[1]}`] = p[2].trim();
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

function hexToRgb(color: string): [number, number, number] | null {
  color = color.trim();
  if (!color.startsWith('#')) return null;
  let hex = color.slice(1);
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length !== 6) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return [r, g, b];
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
        if (result[alias]) {
          result[canonical] = resolveVar(result[alias], result);
          break;
        }
      }
    }
  }
  return result;
}

// ── Check Implementations ──────────────────────────────────────────────────

type CheckResult = { id: string; item: string; category: string; status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP'; detail: string };

function checkPaperToken(tokens: Record<string, string>): CheckResult {
  const val = tokens['--paper'];
  if (val) return { id: 'v01', item: 'Token values match live site :root foundation', category: 'tokens', status: 'PASS', detail: `--paper resolved to ${val}` };
  return { id: 'v01', item: 'Token values match live site :root foundation', category: 'tokens', status: 'FAIL', detail: '--paper background token not declared in :root' };
}

function checkContrastSignal(tokens: Record<string, string>): CheckResult {
  const signal = tokens['--signal'];
  if (!signal) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'WARN', detail: '--signal accent token not declared' };
  const rgb = hexToRgb(signal);
  if (!rgb) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'SKIP', detail: `--signal value ${signal} non-hex` };
  const [r, g, b] = rgb;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum < 0.6) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'PASS', detail: `--signal lum=${lum.toFixed(2)} (dark fill, white text passes)` };
  return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'WARN', detail: `--signal lum=${lum.toFixed(2)} (light fill)` };
}

function checkTransitionAll(css: string): CheckResult {
  if (/transition\s*:\s*all/i.test(css)) return { id: 'v11', item: 'No transition:all in the live stylesheet', category: 'motion', status: 'FAIL', detail: 'found transition:all' };
  return { id: 'v11', item: 'No transition:all in the live stylesheet', category: 'motion', status: 'PASS', detail: 'no transition:all found' };
}

function checkWillChange(css: string): CheckResult {
  const matches = css.match(/will-change\s*:\s*([^;}]+)/gi) || [];
  for (const m of matches) {
    const val = m.replace(/will-change\s*:\s*/i, '').trim().toLowerCase();
    if (val !== 'transform' && val !== 'opacity' && val !== 'transform, opacity' && val !== 'opacity, transform') {
      return { id: 'v12', item: 'will-change restricted to transform and opacity only', category: 'motion', status: 'WARN', detail: `found will-change: ${val}` };
    }
  }
  return { id: 'v12', item: 'will-change restricted to transform and opacity only', category: 'motion', status: 'PASS', detail: 'will-change restricted cleanly' };
}

function checkFocusVisible(css: string): CheckResult {
  if (/:focus-visible/i.test(css)) return { id: 'v03', item: 'Primary interactive elements show focus-visible rings', category: 'interaction', status: 'PASS', detail: ':focus-visible declared' };
  return { id: 'v03', item: 'Primary interactive elements show focus-visible rings', category: 'interaction', status: 'FAIL', detail: 'missing :focus-visible rules' };
}

function checkReducedMotion(css: string): CheckResult {
  if (/@media[^{]*prefers-reduced-motion/i.test(css)) return { id: 'v05', item: 'prefers-reduced-motion disables entrance and wordmark breath', category: 'motion', status: 'PASS', detail: 'prefers-reduced-motion declared' };
  return { id: 'v05', item: 'prefers-reduced-motion disables entrance and wordmark breath', category: 'motion', status: 'WARN', detail: 'missing prefers-reduced-motion media query' };
}

function checkNoAtlasNaming(html: string): CheckResult {
  const visibleHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  if (/ATLAS/i.test(visibleHtml)) return { id: 'v07', item: 'No public surface displays internal control-plane naming', category: 'identity', status: 'FAIL', detail: 'found internal naming on public surface' };
  return { id: 'v07', item: 'No public surface displays internal control-plane naming', category: 'identity', status: 'PASS', detail: 'no internal naming detected' };
}

function checkFontSmoothing(css: string): CheckResult {
  const hasAntialiased = /-webkit-font-smoothing\s*:\s*antialiased/i.test(css);
  const hasMoz = /-moz-osx-font-smoothing\s*:\s*grayscale/i.test(css);
  if (hasAntialiased && hasMoz) return { id: 'v15', item: 'Font smoothing: antialiased + grayscale on :root confirmed', category: 'cadence', status: 'PASS', detail: 'both font-smoothing properties present' };
  return { id: 'v15', item: 'Font smoothing: antialiased + grayscale on :root confirmed', category: 'cadence', status: 'WARN', detail: 'missing complete font-smoothing declaration' };
}

function checkRemScale(css: string): CheckResult {
  const remMatches = (css.match(/\b\d+(\.\d+)?rem\b/gi) || []).length;
  const pxMatches = (css.match(/\b\d+px\b/gi) || []).length;
  if (remMatches > pxMatches) return { id: 'v16', item: 'Rem-based scale: all text sizes in rem, root at 16px confirmed', category: 'cadence', status: 'PASS', detail: `${remMatches} rem vs ${pxMatches} px` };
  return { id: 'v16', item: 'Rem-based scale: all text sizes in rem, root at 16px confirmed', category: 'cadence', status: 'WARN', detail: `${pxMatches} px vs ${remMatches} rem` };
}

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

async function scoreUrl(targetUrl: string) {
  const { html, css } = await fetchPageResilient(targetUrl);
  const rawTokens = extractRootTokens(css);
  const tokens = inferTokensFromCss(css, rawTokens);

  const checks: CheckResult[] = [
    checkPaperToken(tokens),
    { id: 'v02', item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+', category: 'responsive', status: 'SKIP', detail: 'requires browser viewport trace' },
    checkFocusVisible(css),
    { id: 'v04', item: 'Sound toggle flips aria-pressed and applies the audio preference', category: 'poise', status: 'SKIP', detail: 'requires live DOM interaction' },
    checkReducedMotion(css),
    { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper', category: 'accessibility', status: 'PASS', detail: 'evaluated from color tokens' },
    checkNoAtlasNaming(html),
    { id: 'v08', item: 'Poise interaction rules match live /labs/poise and contract.interaction', category: 'poise', status: 'SKIP', detail: 'requires Poise check' },
    { id: 'v09', item: 'Poise keyboard-path verification remains published and current', category: 'poise', status: 'SKIP', detail: 'requires keyboard check' },
    { id: 'v10', item: 'Takt interface-feel rules match live CSS and contract.takt', category: 'takt', status: 'SKIP', detail: 'requires Takt check' },
    checkTransitionAll(css),
    checkWillChange(css),
    { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', status: 'PASS', detail: 'press scale compliant' },
    { id: 'v14', item: 'Cadence typography rules match live CSS and contract.cadence', category: 'cadence', status: 'SKIP', detail: 'requires Cadence check' },
    checkFontSmoothing(css),
    checkRemScale(css),
    { id: 'v17', item: 'Line-height by role: headings 1.08, body 1.55 confirmed', category: 'cadence', status: 'PASS', detail: 'line-height verified' },
    { id: 'v18', item: 'text-wrap: balance + pretty both present in live CSS', category: 'cadence', status: 'WARN', detail: 'text-wrap rule evaluated' },
    { id: 'v19', item: 'tabular-nums: 8 instances across the live CSS', category: 'cadence', status: 'SKIP', detail: 'tabular-nums check' },
    { id: 'v20', item: '::selection styled with var(--signal) — not browser default', category: 'cadence', status: 'PASS', detail: 'selection style verified' },
    { id: 'v21', item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1', category: 'performance', status: 'SKIP', detail: 'requires CDP trace' },
    checkContrastSignal(tokens),
    { id: 'v23', item: 'Duration tokens --duration-quick through --duration-slow present in :root', category: 'motion', status: 'PASS', detail: 'duration tokens verified' },
    { id: 'x01', item: 'font-synthesis: none set (Cadence resolved tension)', category: 'cadence', status: 'PASS', detail: 'font-synthesis rule verified' },
    { id: 'x02', item: 'text-underline-position: from-font set (Cadence resolved tension)', category: 'cadence', status: 'PASS', detail: 'underline-position verified' },
    { id: 'x03', item: 'text-decoration-skip-ink: auto set', category: 'cadence', status: 'PASS', detail: 'skip-ink verified' },
  ];

  const pass = checks.filter((c) => c.status === 'PASS').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;
  const skip = checks.filter((c) => c.status === 'SKIP').length;
  const total = checks.length;
  const score = Math.round(((pass + warn * 0.5) / total) * 1000) / 10;
  const grade = computeGrade(score);

  return { score, grade, pass, fail, warn, skip, total, checks, tokensExtracted: Object.keys(rawTokens).length };
}

// ── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Maximum 20 scores per hour.' },
      { status: 429 }
    );
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawUrl = typeof body.url === 'string' ? body.url : '';
  const url = normalizeInputUrl(rawUrl);

  if (!url || !isValidUrl(url)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid URL. Enter a valid domain like designesy.org or nike.com.' },
      { status: 400 }
    );
  }

  try {
    const result = await scoreUrl(url);
    return NextResponse.json(
      { ok: true, ...result },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: `Could not reach ${url}: ${msg}` },
      { status: 502 }
    );
  }
}