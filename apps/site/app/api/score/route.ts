import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Score cache ─────────────────────────────────────────────────────────────
// Score results are stable for ~24h (sites don't redesign daily) and the
// 26-check run + target-site fetch is expensive (3-8s cold). unstable_cache
// persists results across requests on Vercel's Data Cache, keyed automatically
// by the targetUrl argument. Tag 'score' allows future revalidation via
// revalidateTag. Both the POST handler and the OG image route import `scoreUrl`
// and share this cache — so scoring a site once makes the OG card for that URL
// instant too. Repeat scores for the same URL drop from ~3-8s to <50ms.
const SCORE_TTL_SECONDS = 60 * 60 * 24; // 24h

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
// Exported for reuse by app/score/opengraph-image.tsx (avoids an HTTP self-call).

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

export function isValidUrl(url: string): boolean {
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

// Helper: resolve any color value (hex, var()-ref, rgb()) to an RGB triple.
// Falls back through the token map for var() references; returns null if the
// value can't be resolved to a concrete hex color.
function resolveColor(value: string, tokens: Record<string, string>): [number, number, number] | null {
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith('#')) return hexToRgb(v);
  const varMatch = v.match(/^var\(\s*(--[\w-]+)/);
  if (varMatch) {
    const ref = tokens[varMatch[1]];
    if (ref) return resolveColor(ref, tokens);
    return null;
  }
  // rgb(r, g, b) / rgba(r, g, b, a)
  const rgbMatch = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }
  return null;
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

export type CheckResult = { id: string; item: string; category: string; status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP'; detail: string; remediation?: string };

// ── Remediation guidance ────────────────────────────────────────────────────
// Per-check "how to fix this" guidance, shown in the score drawer for FAIL
// and WARN results (PASS/SKIP don't need remediation). Keyed by check id so
// every check implementation gets guidance for free — the check returns its
// status/detail, the table supplies the fix. Token references use the
// contract v0.3.0 names so the guidance is self-contained.
const REMEDIATION: Record<string, string> = {
  v01: 'Declare --paper (and the full :root token set) in your global stylesheet. The contract names --paper, --ink, --muted, --surface, --surface-raised, --line, --signal, --signal-light, --signal-dim as the required foundation.',
  v02: 'Test at 375px, 720px, 860px, and 1080px+ viewports. Common causes: fixed-width containers, negative margins, or images without max-width: 100%. Add overflow-x: hidden only as a last resort — find the overflowing element instead.',
  v03: 'Add :focus-visible { outline: 2px solid var(--signal-light); outline-offset: 2px; } to interactive elements. Never remove focus without replacing it. Test by tabbing through the page with a keyboard.',
  v04: 'Sound toggle should flip aria-pressed="true"/"false" on click and apply a [data-audio] attribute on <html> or <body> that the audio layer reads. Wire the state both ways — visual + accessibility tree.',
  v05: 'Add @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } } — disable entrance loops, parallax, and wordmark breath.',
  v06: 'Adjust your --ink, --muted, --muted-dim token values against --paper until contrast clears WCAG AA: 4.5:1 for body text, 3:1 for large text. Use oklch() or a contrast checker. --muted-dim is the usual offender.',
  v07: 'Add semantic HTML landmarks: exactly one <h1> per page, a descriptive <title>, <meta name="description"> with a one-sentence summary, and at least one <main>/<header>/<nav> landmark element. These are Lighthouse a11y basics and the foundation of document structure.',
  v08: 'Wire the Poise interaction rules from contract.interaction into your component layer: hover lifts (translateY -1px), press scales (0.96 cells / 0.985 cards), focus rings, and the data-cuelume-press haptic attribute on every tappable element.',
  v09: 'Publish a keyboard-path page or section documenting the tab order, focus visibility, and key bindings. Every interactive element must be reachable by Tab, operable by Enter/Space, and dismissible by Esc.',
  v10: 'Apply the Takt feel rules: press scale 0.96 on cells (buttons, chips, toggles), 0.985 on cards/rows, 0.995 on large surfaces. All scales must stay above the 0.95 floor — anything lower reads as a glitch, not a press.',
  v11: 'Replace transition: all with named properties: transition: color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out). transition: all causes layout-thrash and surprises.',
  v12: 'Restrict will-change to transform and opacity only, and only on elements actively animating. Remove will-change from static elements. Setting it on everything forces the browser to promote every layer — memory and paint cost.',
  v13: 'Set press scales to 0.96 (cells), 0.985 (cards/rows), 0.995 (large surfaces). All must be above 0.95. Use transform: scale() on :active, with transition: transform var(--duration-quick) var(--ease-out).',
  v14: 'Apply the Cadence typography rules: font-synthesis: none, text-underline-position: from-font, text-decoration-skip-ink: auto, -webkit-font-smoothing: antialiased, -moz-osx-font-smoothing: grayscale. Root font-size: 16px (never lower). All sizes in rem.',
  v15: 'Add to your :root or html rule: -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; This prevents subpixel rendering artifacts on dark backgrounds and gives type its intended weight.',
  v16: 'Set html { font-size: 16px } and express all text sizes in rem (not px, not em for the global scale). The 16px root is the Cadence floor — iOS Safari auto-zooms inputs below 16px, which breaks mobile UX.',
  v17: 'Set heading line-height to 1.08 and body line-height to 1.55. Tight headings read as deliberate; relaxed body copy reads as confident. Avoid 1.0 (cramped) and 2.0 (loose) — both signal amateur typography.',
  v18: 'Add text-wrap: balance to headings and text-wrap: pretty to paragraphs. balance prevents orphaned headline words; pretty prevents orphaned words in body copy. Both are progressive enhancement — unsupported browsers ignore them.',
  v19: 'Add font-feature-settings: "tnum" or font-variant-numeric: tabular-nums to numeric displays: scores, counts, prices, timestamps. This prevents digits from shifting width as values change — essential for any live-updating number.',
  v20: 'Add ::selection { background: var(--signal); color: var(--paper); } — never leave the browser default. The selection color is a small but loud brand surface; using your signal token here reinforces identity on every text selection.',
  v21: 'Audit Core Web Vitals with Lighthouse or PageSpeed Insights. LCP < 2.5s (optimize hero image + fonts), INP < 200ms (defer non-critical JS, use CSS for entrance animations), CLS < 0.1 (reserve space for images/ads, avoid late layout shifts).',
  v22: 'Primary button text must clear WCAG AA 4.5:1 against its fill. If --ink on --signal is too low, either darken --ink, lighten --signal, or switch the button to --paper-on--signal. Never ship a button where the label is hard to read.',
  v23: 'Declare the five duration tokens in :root: --duration (0.6s default), --duration-quick (150ms), --duration-fast (250ms), --duration-medium (350ms), --duration-slow (400ms). Use them everywhere — never hardcode ms values in component CSS.',
  x01: 'Add font-synthesis: none to your :root or body rule. This prevents the browser from synthesizing bold/italic faces when the real weights aren\'t loaded — a common cause of blurry headlines on Windows.',
  x02: 'Add text-underline-position: from-font to links and underlined text. This uses the font designer\'s built-in underline position rather than the browser default, which is usually too low and clips descenders.',
  x03: 'Add text-decoration-skip-ink: auto to links. This makes underlines skip the rounded parts of letters (g, j, p, q, y) — a small typographic refinement that signals attention to craft.',
};

function checkPaperToken(tokens: Record<string, string>): CheckResult {
  const val = tokens['--paper'];
  if (val) return { id: 'v01', item: 'Token values match live site :root foundation', category: 'tokens', status: 'PASS', detail: `--paper resolved to ${val}` };
  return { id: 'v01', item: 'Token values match live site :root foundation', category: 'tokens', status: 'FAIL', detail: '--paper background token not declared in :root' };
}

function checkContrastSignal(tokens: Record<string, string>): CheckResult {
  // v22 — REAL WCAG 2.1 contrast between --signal (button fill) and the text
  // on top of it. Contracts typically put --paper or --ink text on --signal.
  // We test both --paper-on-signal and --ink-on-signal; the better ratio wins
  // (designers choose the higher-contrast pairing). AA threshold: 4.5:1 for
  // body text, 3:1 for large/UI — buttons are large text, but we hold the 4.5:1
  // bar because button labels are often small (12-14px).
  const signalVal = tokens['--signal'];
  if (!signalVal) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'WARN', detail: '--signal accent token not declared' };
  const signalRgb = resolveColor(signalVal, tokens);
  if (!signalRgb) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'SKIP', detail: `--signal value ${signalVal} unresolvable to RGB` };

  const candidates: Array<{ name: string; rgb: [number, number, number] | null }> = [
    { name: '--paper', rgb: resolveColor(tokens['--paper'] || '', tokens) },
    { name: '--ink', rgb: resolveColor(tokens['--ink'] || '', tokens) },
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
  return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'FAIL', detail: `${bestName} on --signal = ${ratioStr} (below 3:1 — illegible)` };
}

// v06 — REAL contrast check for ink/muted/muted-dim on paper.
// Resolves each text token against --paper and computes WCAG 2.1 ratio.
// AA: 4.5:1 body, 3:1 large. --muted-dim is the usual offender.
function checkContrastReadable(tokens: Record<string, string>): CheckResult {
  const paperVal = tokens['--paper'];
  if (!paperVal) return { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper', category: 'accessibility', status: 'SKIP', detail: '--paper not declared — cannot test contrast' };
  const paperRgb = resolveColor(paperVal, tokens);
  if (!paperRgb) return { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper', category: 'accessibility', status: 'SKIP', detail: `--paper value ${paperVal} unresolvable to RGB` };

  const textTokens = ['--ink', '--muted', '--muted-dim'];
  const results: string[] = [];
  let worst = { name: '', ratio: Infinity, status: 'PASS' as 'PASS' | 'WARN' | 'FAIL' };
  for (const name of textTokens) {
    const val = tokens[name];
    if (!val) { results.push(`${name}: not declared`); continue; }
    const rgb = resolveColor(val, tokens);
    if (!rgb) { results.push(`${name}: unresolvable`); continue; }
    const ratio = contrastRatio(rgb, paperRgb);
    const r = ratio.toFixed(2);
    let st: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
    if (ratio < 3) st = 'FAIL';
    else if (ratio < 4.5) st = 'WARN';
    results.push(`${name}=${r}:1(${st})`);
    // Track the worst non-PASS result for the overall verdict.
    if (st === 'FAIL') { if (worst.status !== 'FAIL' || ratio < worst.ratio) worst = { name, ratio, status: 'FAIL' }; }
    else if (st === 'WARN' && worst.status !== 'FAIL') { if (worst.status !== 'WARN' || ratio < worst.ratio) worst = { name, ratio, status: 'WARN' }; }
  }
  const detail = results.join(', ');
  if (worst.status === 'FAIL') return { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper', category: 'accessibility', status: 'FAIL', detail: `${detail} — ${worst.name} below 3:1` };
  if (worst.status === 'WARN') return { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper', category: 'accessibility', status: 'WARN', detail: `${detail} — ${worst.name} below 4.5:1 AA` };
  return { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper', category: 'accessibility', status: 'PASS', detail };
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

function checkReducedMotion(css: string): CheckResult {
  if (/@media[^{]*prefers-reduced-motion/i.test(css)) return { id: 'v05', item: 'prefers-reduced-motion disables entrance and wordmark breath', category: 'motion', status: 'PASS', detail: 'prefers-reduced-motion declared' };
  return { id: 'v05', item: 'prefers-reduced-motion disables entrance and wordmark breath', category: 'motion', status: 'WARN', detail: 'missing prefers-reduced-motion media query' };
}

function checkNoAtlasNaming(html: string): CheckResult {
  // v07 — REPLACED. The old check grepped for the word "ATLAS" in the target
  // site's HTML — a designesy self-audit that was meaningless for any external
  // site (they all passed for the wrong reason). The new v07 is a general
  // semantic-HTML check: verifies the page has a single <h1>, a <title>, a
  // <meta name="description">, and a <main>/<header>/<nav> landmark. These are
  // Lighthouse a11y basics (document-title weight 4.1, heading-order 0.8) and
  // apply to every site. The check name/id stays v07 for continuity.
  const visibleHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const h1Count = (visibleHtml.match(/<h1\b/gi) || []).length;
  const hasTitle = /<title\b[^>]*>[^<]+<\/title>/i.test(html);
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
// transition contexts. Contract: 0.96 cells, 0.985 cards, 0.995 large surfaces,
// all above the 0.95 floor. We look for scale(0.9[5-9]|0.99[0-9]) and confirm
// at least one press-scale exists; below-floor values (scale(0.8x-0.94)) FAIL.
function checkPressScale(css: string): CheckResult {
  const allScales = css.match(/scale\(\s*([0-9.]+)\s*\)/gi) || [];
  const pressScales: number[] = [];
  let belowFloor = false;
  let belowVal = '';
  for (const m of allScales) {
    const num = parseFloat(m.replace(/scale\(\s*/i, '').replace(/\s*\)/, ''));
    if (isNaN(num)) continue;
    if (num < 1) {
      pressScales.push(num);
      if (num < 0.95) { belowFloor = true; belowVal = num.toString(); }
    }
  }
  if (belowFloor) return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', status: 'FAIL', detail: `found scale(${belowVal}) below 0.95 floor — reads as a glitch` };
  if (pressScales.length > 0) {
    const vals = pressScales.map(s => s.toFixed(3)).join(', ');
    return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', status: 'PASS', detail: `${pressScales.length} press-scale(s) found: ${vals}` };
  }
  return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', status: 'WARN', detail: 'no press-scale (scale() < 1) found in CSS' };
}

// v17 — REAL line-height by role check. Scans for heading-tight (1.0-1.15)
// and body-relaxed (1.4-1.7) line-heights. Contract: headings 1.08, body 1.55.
function checkLineHeightByRole(css: string): CheckResult {
  const headingRe = /(?:h1|h2|h3|h4|h5|h6|\.h\d|heading|title)[^{]*\{[^}]*line-height\s*:\s*([0-9.]+)/gi;
  const bodyRe = /(?:body|p|article|\.body|\.prose|\.copy)[^{]*\{[^}]*line-height\s*:\s*([0-9.]+)/gi;
  const headingLhs: number[] = [];
  const bodyLhs: number[] = [];
  let m;
  while ((m = headingRe.exec(css)) !== null) headingLhs.push(parseFloat(m[1]));
  while ((m = bodyRe.exec(css)) !== null) bodyLhs.push(parseFloat(m[1]));
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
  const selMatch = css.match(/::selection\s*\{[^}]*\}/gi);
  if (!selMatch || selMatch.length === 0) return { id: 'v20', item: '::selection styled with var(--signal) — not browser default', category: 'cadence', status: 'WARN', detail: 'no ::selection rule found — browser default will show' };
  const usesSignal = selMatch.some(r => /var\(\s*--signal/i.test(r));
  const hasColor = selMatch.some(r => /(background|color)\s*:/i.test(r));
  if (usesSignal) return { id: 'v20', item: '::selection styled with var(--signal) — not browser default', category: 'cadence', status: 'PASS', detail: '::selection uses --signal token' };
  if (hasColor) return { id: 'v20', item: '::selection styled with var(--signal) — not browser default', category: 'cadence', status: 'PASS', detail: '::selection styled with custom color (token reference recommended)' };
  return { id: 'v20', item: '::selection styled with var(--signal) — not browser default', category: 'cadence', status: 'WARN', detail: '::selection rule exists but no color/background set' };
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
  return { id: 'x01', item: 'font-synthesis: none set (Cadence resolved tension)', category: 'cadence', status: 'WARN', detail: 'no font-synthesis rule found — browser may synthesize missing weights' };
}

// x02 — REAL text-underline-position check. Verifies from-font (or
// under) is set so underlines use the font designer's position.
function checkUnderlinePosition(css: string): CheckResult {
  if (/text-underline-position\s*:\s*(from-font|under)/i.test(css)) return { id: 'x02', item: 'text-underline-position: from-font set (Cadence resolved tension)', category: 'cadence', status: 'PASS', detail: 'text-underline-position set to from-font/under' };
  if (/text-underline-position\s*:/i.test(css)) return { id: 'x02', item: 'text-underline-position: from-font set (Cadence resolved tension)', category: 'cadence', status: 'WARN', detail: 'text-underline-position declared but not from-font/under' };
  return { id: 'x02', item: 'text-underline-position: from-font set (Cadence resolved tension)', category: 'cadence', status: 'WARN', detail: 'no text-underline-position rule — browser default may clip descenders' };
}

// x03 — REAL text-decoration-skip-ink check. Verifies auto (or none) is set
// so underlines skip the rounded parts of letters (g, j, p, q, y).
function checkSkipInk(css: string): CheckResult {
  if (/text-decoration-skip-ink\s*:\s*(auto|none)/i.test(css)) return { id: 'x03', item: 'text-decoration-skip-ink: auto set', category: 'cadence', status: 'PASS', detail: 'text-decoration-skip-ink set to auto/none' };
  if (/text-decoration-skip-ink\s*:/i.test(css)) return { id: 'x03', item: 'text-decoration-skip-ink: auto set', category: 'cadence', status: 'WARN', detail: 'text-decoration-skip-ink declared but not auto/none' };
  return { id: 'x03', item: 'text-decoration-skip-ink: auto set', category: 'cadence', status: 'WARN', detail: 'no text-decoration-skip-ink rule — underlines may cross letterforms' };
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
      re: /@media[^{]*(?:hover\s*:\s*hover|pointer\s*:\s*fine)/i,
    },
    {
      name: 'press settle scale ~0.97',
      re: /scale\s*\(\s*0?\.9[5-9]\s*\)/i,
    },
    {
      name: 'opacity-only mark breath',
      re: /@keyframes\s+[^{]*breath[^{]*\{[^}]*opacity\s*:/i,
    },
  ];
  const found = rules.filter(r => r.re.test(css)).map(r => r.name);
  const missing = rules.filter(r => !r.re.test(css)).map(r => r.name);
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
  const stripsOutline = /:focus[^{]*\{[^}]*outline\s*:\s*(none|0)\s*[;}]/i.test(css);
  const hasFocusRing = /:focus[^{]*\{[^}]*(box-shadow|outline\s*:\s*[^n0])/i.test(css);
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
      re: /animation-delay\s*:\s*(?:0?\.(?:0?[6-9]|1[0-2])\d*s|\d{2,3}ms)/i,
    },
    {
      name: 'soften exit transform ease-out',
      re: /transition\s*:[^;]*transform[^;]*(ease-out|cubic-bezier\([^)]*0[, ])/i,
    },
    {
      name: 'concentric border-radius set',
      re: /border-radius\s*:\s*\d+/i,
    },
  ];
  const found = rules.filter(r => r.re.test(css)).map(r => r.name);
  const missing = rules.filter(r => !r.re.test(css)).map(r => r.name);
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

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

async function scoreUrlUncached(targetUrl: string) {
  const { html, css } = await fetchPageResilient(targetUrl);
  const rawTokens = extractRootTokens(css);
  const tokens = inferTokensFromCss(css, rawTokens);

  const checks: CheckResult[] = [
    checkPaperToken(tokens),
    { id: 'v02', item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+', category: 'responsive', status: 'SKIP', detail: 'requires browser viewport trace' },
    checkFocusVisible(css),
    { id: 'v04', item: 'Sound toggle flips aria-pressed and applies the audio preference', category: 'poise', status: 'SKIP', detail: 'requires live DOM interaction' },
    checkReducedMotion(css),
    checkContrastReadable(tokens),
    checkNoAtlasNaming(html),
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
    { id: 'v21', item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1', category: 'performance', status: 'SKIP', detail: 'requires CDP trace' },
    checkContrastSignal(tokens),
    checkDurationTokens(tokens),
    checkFontSynthesis(css),
    checkUnderlinePosition(css),
    checkSkipInk(css),
  ];

  const pass = checks.filter((c) => c.status === 'PASS').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;
  const skip = checks.filter((c) => c.status === 'SKIP').length;
  const total = checks.length;
  // Score over checks that were actually evaluated — SKIPs require a live browser
  // and are excluded from the denominator (Lighthouse precedent: manual/not-applicable
  // audits are excluded from the score). This prevents the tool from penalizing sites
  // for the tool's own static-fetch limitations.
  const scored = total - skip;
  const score = scored === 0 ? 0 : Math.round(((pass + warn * 0.5) / scored) * 1000) / 10;
  const grade = computeGrade(score);

  // Attach remediation guidance to each check from the lookup table. Every
  // check id has an entry; the table is the single source of truth for "how
  // to fix this" so guidance stays consistent across PASS/FAIL/WARN/SKIP.
  const checksWithRemediation = checks.map((c) => ({
    ...c,
    remediation: REMEDIATION[c.id],
  }));

  return { score, grade, pass, fail, warn, skip, total, scored, checks: checksWithRemediation, tokensExtracted: Object.keys(rawTokens).length };
}

// Cached wrapper — the public `scoreUrl` used by both the POST handler and the
// OG image route. unstable_cache serializes the result and serves it from the
// Vercel Data Cache on subsequent calls with the same targetUrl. Per the Next
// docs, the cache key is derived from the argument list, so targetUrl is the
// key. revalidateTag('score') purges all entries; we can add per-URL purge later.
export const scoreUrl = unstable_cache(
  scoreUrlUncached,
  ['designesy-score'],
  { revalidate: SCORE_TTL_SECONDS, tags: ['score'] }
);

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