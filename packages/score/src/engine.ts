/**
 * @designesy/score — 40-check design-contract scoring engine.
 *
 * Scores a URL against the Designesy design-system contract: fetches the page,
 * extracts CSS + :root tokens, runs 40 deterministic checks, computes a weighted
 * score (0-100), assigns a letter grade (A-F), and applies anti-slop deductions
 * + originality lifts.
 *
 * Zero dependencies. Uses node:https (not fetch/undici) to avoid the Windows
 * libuv crash during process exit.
 *
 * Extracted from apps/site/app/api/score/route.ts — same engine, same checks,
 * same scoring math. The API route wraps this module; the CLI calls it directly.
 *
 * Spec references:
 *   https://www.designesy.org/contracts/score
 *   WCAG 2.1 §1.4.3 (contrast), WCAG 2.5.8 (touch targets), WCAG 2.4.4 (link purpose)
 *   APCA-W3 0.0.98G-4g (perceptual contrast)
 */

import { get as httpsGet } from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupOptions, LookupAddress } from 'node:dns';

// ── Types ────────────────────────────────────────────────────────────────────

export type ScoreScope = 'contract' | 'universal';

export type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'MANUAL';
  detail: string;
  weight?: number;
  remediation?: string;
};

export type ScoreResult = {
  score: number;
  grade: string;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
  manual: number;
  total: number;
  scored: number;
  scope: ScoreScope;
  a11yFloorApplied: boolean;
  hardFailCeilingApplied: boolean;
  hardFailCeilingReason: string | null;
  categoryScores: Record<string, { score: number | null; weight: number; pass: number; fail: number; warn: number; skip: number; manual: number }>;
  checks: CheckResult[];
  tokensExtracted: number;
  slop: { total: number; findings: SlopFinding[]; convergences: string | null };
  originality: { points: number; signals: OriginalitySignal[]; summary: string | null; slopGateApplied: boolean };
};

interface SlopFinding {
  id: string;
  label: string;
  severity: number;
  instances: number;
  evidence: string[];
  deduction?: number;
}

interface OriginalitySignal {
  id: string;
  label: string;
  points: number;
  evidence: string;
}

// ── Scope system: contract vs universal ──────────────────────────────────────

const TIER2_ABSENCE_PATTERNS: Array<{ id: string; absenceMatch: RegExp }> = [
  { id: 'v08', absenceMatch: /^missing:/ },
  { id: 'v10', absenceMatch: /^missing:/ },
  { id: 'v13', absenceMatch: /^no press-scale|only scale\(0\)|no press-scale \(scale/ },
  { id: 'v15', absenceMatch: /missing complete font-smoothing/ },
  { id: 'v19', absenceMatch: /^only \d+ instances/ },
  { id: 'v20', absenceMatch: /^no ::selection rule found/ },
  { id: 'v23', absenceMatch: /^only \d+\/5 duration tokens|no.*duration tokens/i },
  { id: 'v28', absenceMatch: /^no max-width in ch units/ },
  { id: 'x01', absenceMatch: /^no font-synthesis rule/ },
  { id: 'x02', absenceMatch: /^no text-underline-position rule/ },
  { id: 'x03', absenceMatch: /^no text-decoration-skip-ink rule/ },
];

const TIER3_CONTRACT_ONLY = new Set(['v01', 'v22', 'v29']);

function applyScopeFilter(checks: CheckResult[], scope: ScoreScope): CheckResult[] {
  if (scope === 'contract') return checks;
  return checks.map((c) => {
    if (TIER3_CONTRACT_ONLY.has(c.id)) {
      if (c.status === 'FAIL' || c.status === 'WARN') {
        return { ...c, status: 'SKIP', detail: `${c.detail} (skipped: scope=universal — this check verifies Designesy-specific token naming; the site may use different token names)` };
      }
      return c;
    }
    const tier2 = TIER2_ABSENCE_PATTERNS.find((t) => t.id === c.id);
    if (tier2 && (c.status === 'WARN' || c.status === 'FAIL')) {
      if (tier2.absenceMatch.test(c.detail)) {
        return { ...c, status: 'SKIP', detail: `${c.detail} (skipped: scope=universal — this feature is optional; not present on this site)` };
      }
    }
    return c;
  });
}

function autoDetectScope(targetUrl: string): ScoreScope {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    if (host === 'designesy.org' || host === 'www.designesy.org') return 'contract';
  } catch { /* default universal */ }
  return 'universal';
}

// ── URL normalization + zero-dep SSRF guard ──────────────────────────────────

export function normalizeInputUrl(raw: string): string {
  let clean = raw.trim();
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
  try { return new URL(clean).href; } catch { return clean; }
}

export function isValidUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') && !host.includes(':')) return false;
  if (host.includes('::ffff:') || host.includes('::ffff:')) return false;
  if (host.includes(':')) return false; // reject all IPv6
  if (/^\d+$/.test(host)) return false;
  if (host.split('.').some((o) => o.startsWith('0') && o.length > 1 && /^0[0-7]+$/.test(o))) return false;
  if (host.split('.').some((o) => /^0x[0-9a-f]+$/i.test(o))) return false;
  if (isPrivateIPv4(host)) return false;
  return true;
}

function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  const oct = parts.map((p) => { const n = parseInt(p, 10); return Number.isNaN(n) ? -1 : n; });
  if (oct.some((n) => n < 0 || n > 255)) return false;
  const [a, b] = oct;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;
  if (a === 100 && b >= 64) return true;
  return false;
}

// ── Zero-dep HTTPS fetch (avoids Windows libuv crash) ───────────────────────

/**
 * TOCTOU-safe SSRF guard: custom DNS lookup that validates every resolved IP
 * against the private-range blocklist BEFORE the socket connects. This runs
 * inside the connection's resolution step — there is no window between
 * validation and connection for DNS rebinding to exploit.
 *
 * The synchronous `isValidUrl` remains for fast initial filtering (protocol,
 * IPv6, encoded IPs, IP-literal private ranges). This lookup function adds
 * the DNS-resolution layer that catches hostnames that resolve to private IPs.
 *
 * References:
 *   OWASP SSRF Prevention Cheat Sheet (DNS pinning — resolve A+AAAA, validate every address)
 *   CWE-367 (Time-of-check Time-of-use race condition)
 *   CVE-2026-27826 (MCP Atlassian DNS-rebinding TOCTOU bypass)
 */
function safeLookup(
  hostname: string,
  options: LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family: number) => void,
): void {
  const host = hostname.toLowerCase();
  const all = options.all === true;

  // Fast path: IP literal — validate directly without DNS resolution
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIPv4(host)) {
      callback(new Error(`SSRF blocked: private IP ${host}`), '', 4);
      return;
    }
    if (all) {
      callback(null, [{ address: host, family: 4 }], 4);
    } else {
      callback(null, host, 4);
    }
    return;
  }

  // Hostname: resolve all addresses and validate each (fail-closed)
  dnsLookup(host, { all: true })
    .then((addresses) => {
      for (const addr of addresses) {
        const ip = addr.address.toLowerCase();
        if (isPrivateIPv4(ip)) {
          callback(new Error(`SSRF blocked: ${host} resolves to private IP ${ip}`), '', addr.family);
          return;
        }
        if (addr.family === 6) {
          if (ip === '::1' || ip === '::' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
            callback(new Error(`SSRF blocked: ${host} resolves to private IPv6 ${ip}`), '', 6);
            return;
          }
        }
      }
      // Return validated addresses — honor options.all for Node v24 compat
      if (all) {
        callback(null, addresses, addresses[0]?.family ?? 4);
      } else {
        const first = addresses[0];
        callback(null, first.address, first.family);
      }
    })
    .catch((err: NodeJS.ErrnoException) => {
      callback(err, '', 4);
    });
}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
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

function httpsFetch(url: string, headers?: Record<string, string>, timeoutMs = 8000): Promise<{ ok: boolean; status: number; text: string; redirected: boolean; finalUrl: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (r: { ok: boolean; status: number; text: string; redirected: boolean; finalUrl: string }) => {
      if (resolved) return;
      resolved = true;
      resolve(r);
    };
    try {
      const req = httpsGet(url, { headers: { ...BROWSER_HEADERS, ...(headers || {}) }, timeout: timeoutMs, lookup: safeLookup as typeof import('node:dns').lookup }, (res) => {
        // Follow one redirect manually (3xx → Location)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          try {
            const next = new URL(res.headers.location, url).href;
            res.resume();
            // SSRF guard: re-validate every redirect target before following it
            if (!isValidUrl(next)) {
              done({ ok: false, status: 0, text: '', redirected: false, finalUrl: url });
              return;
            }
            // Follow up to 3 redirects
            httpsFetch(next, headers, timeoutMs).then(done);
            return;
          } catch { /* fall through */ }
        }
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          done({ ok: (res.statusCode || 0) < 400, status: res.statusCode || 0, text: body, redirected: res.statusCode !== undefined && res.statusCode >= 300 && res.statusCode < 400, finalUrl: url });
        });
        res.on('error', () => done({ ok: false, status: 0, text: '', redirected: false, finalUrl: url }));
      });
      req.on('error', () => done({ ok: false, status: 0, text: '', redirected: false, finalUrl: url }));
      req.on('timeout', () => { req.destroy(); done({ ok: false, status: 0, text: '', redirected: false, finalUrl: url }); });
    } catch {
      done({ ok: false, status: 0, text: '', redirected: false, finalUrl: url });
    }
  });
}

// ── CSS extraction + token parsing ──────────────────────────────────────────

function extractCssLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html)) !== null) links.push(m[1]);
  const linkRe = /<link[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']/gi;
  while ((m = linkRe.exec(html)) !== null) {
    try { links.push(new URL(m[1], baseUrl).href); } catch { /* skip */ }
  }
  return links;
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
    if (!isValidUrl(candidate)) continue;
    const r = await httpsFetch(candidate);
    if (r.ok && r.text.length > 50) { html = r.text; break; }
  }
  if (!html) return { html: '<html><body></body></html>', css: '' };

  const parts = extractCssLinks(html, targetUrl);
  const cssParts: string[] = [];
  for (const part of parts) {
    if (part.startsWith('http')) {
      if (!isValidUrl(part)) continue;
      const r = await httpsFetch(part);
      if (r.text) cssParts.push(r.text);
    } else {
      cssParts.push(part);
    }
  }
  return { html, css: cssParts.join('\n') };
}

function extractRootTokens(css: string): Record<string, string> {
  const stripped = css.replace(/@media[^{]*\{[^@]*?\}\s*\}/gi, '');
  const tokens: Record<string, string> = {};
  const rootRe = /:root\s*\{([^}]*)\}/g;
  let m;
  while ((m = rootRe.exec(stripped)) !== null) {
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
  '--paper': ['--bg', '--background', '--surface', '--bg-primary', '--background-color', '--canvas', '--page', '--page-bg', '--bg-base', '--surface-base', '--color-bg', '--color-background', '--color-surface', '--app-bg'],
  '--ink': ['--text', '--fg', '--foreground', '--text-primary', '--color-text', '--color-foreground', '--text-main', '--text-base', '--body-text'],
  '--signal': ['--accent', '--primary', '--brand', '--accent-color', '--color-accent', '--color-primary', '--color-brand', '--brand-color', '--link'],
  '--muted': ['--text-muted', '--text-secondary', '--secondary', '--fg-muted', '--color-text-secondary', '--color-muted', '--text-subtle'],
  '--muted-dim': ['--text-dim', '--text-disabled', '--fg-dim', '--text-faint'],
  '--duration-quick': ['--duration-fast', '--transition-fast', '--motion-fast', '--dur-fast'],
  '--duration-slow': ['--duration-slow-1', '--transition-slow', '--motion-slow', '--dur-slow'],
};

function resolveVar(value: string, tokens: Record<string, string>, depth = 0): string {
  if (depth > 5) return value.trim();
  const m = value.match(/^\s*var\(\s*(--[\w-]+)/);
  if (!m) return value.trim();
  const ref = tokens[m[1]];
  if (!ref) return value.trim();
  return resolveVar(ref, tokens, depth + 1);
}

function inferTokensFromCss(css: string, tokens: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = { ...tokens };
  for (const [canonical, aliases] of Object.entries(TOKEN_ALIASES)) {
    if (!result[canonical]) {
      for (const alias of aliases) {
        if (result[canonical]) break;
        if (result[alias]) {
          result[canonical] = resolveVar(result[alias], result);
        }
      }
    }
  }
  return result;
}

// ── Color utilities ──────────────────────────────────────────────────────────

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

function srgbChannelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: [number, number, number]): number {
  return 0.2126 * srgbChannelToLinear(rgb[0]) + 0.7152 * srgbChannelToLinear(rgb[1]) + 0.0722 * srgbChannelToLinear(rgb[2]);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

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
  const rgbMatch = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  return null;
}

// APCA-W3 0.0.98G-4g
function sRGBtoY_APCA(rgb: [number, number, number]): number {
  const r = Math.pow(rgb[0] / 255, 2.4);
  const g = Math.pow(rgb[1] / 255, 2.4);
  const b = Math.pow(rgb[2] / 255, 2.4);
  let ys = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  if (ys < 0.022) ys += Math.pow(0.022 - ys, 1.414);
  return ys;
}

function apcaContrast(txtRgb: [number, number, number], bgRgb: [number, number, number]): number {
  const txtYs = sRGBtoY_APCA(txtRgb);
  const bgYs = sRGBtoY_APCA(bgRgb);
  if (Math.abs(bgYs - txtYs) < 0.0005) return 0;
  let sapc: number;
  if (bgYs > txtYs) { sapc = (Math.pow(bgYs, 0.56) - Math.pow(txtYs, 0.57)) * 1.14; }
  else { sapc = (Math.pow(bgYs, 0.65) - Math.pow(txtYs, 0.62)) * 1.14; }
  if (Math.abs(sapc) < 0.0005) return 0;
  sapc = sapc < 0 ? sapc + 0.027 : sapc - 0.027;
  return sapc * 100;
}

// ── Remediation table ────────────────────────────────────────────────────────

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
  v24: 'Ensure all interactive elements (buttons, links, inputs) have a min-height and min-width of at least 44px (WCAG 2.5.8 Target Size Minimum, AA in 2.2). For small icon buttons, add padding or min-height to reach the 44px floor.',
  v25: 'Use exactly one <h1> per page as the main heading, and don\'t skip heading levels (no h1→h3 jumps). Screen readers and SEO both rely on a logical heading outline. Audit your heading order with a browser extension or Lighthouse.',
  v26: 'Limit font-family declarations to 3 or fewer (1 body family, 1 heading family, 1 mono for code). More than 3 families signals inconsistency and hurts performance. Consolidate by removing unused families or using weight variations of a single family.',
  v27: 'Set input font-size to at least 16px (1rem) to prevent iOS Safari auto-zoom on focus. Inputs below 16px trigger a layout-shift zoom on iPhone that breaks the mobile UX. Use font-size: 1rem or larger on all input, textarea, and select elements.',
  v28: 'Constrain body/article/paragraph max-width to 45-75ch (66ch ideal) for readable line length. Lines longer than 75ch are hard to track; shorter than 45ch feels choppy. Use max-width: 66ch on prose containers.',
  v29: 'Structure design tokens in layers: primitive (raw values like --color-blue-500: #3b82f6), semantic (aliases like --color-accent: var(--color-blue-500)), and component (references like --button-bg: var(--color-accent)). At minimum, alias some tokens via var() so a color change propagates through the system. Full 3-tier architecture is DSAF A1.1 maturity level.',
  v34: 'EU AI Act Article 50(1) requires AI chatbots/agents to disclose their AI nature at the first interaction, accessible to people with disabilities (effective 2026-08-02). Fix options: add visible "AI Assistant" text in the chatbot UI header, add aria-label="AI assistant" to the chatbot container, add <meta name="generator" content="AI-powered"> to the page head, or add a persistent AI-disclosure badge.',
  v35: 'Add a forced-colors readiness block: @media (forced-colors: active) { ... } with forced-color-adjust: none on elements that must preserve brand identity (logos, charts, semantic-color indicators). Test with Windows High Contrast Mode.',
  v36: 'Remove UTS #39 confusable characters from CSS identifiers and token names. Confusables are Unicode characters from different scripts (Cyrillic, Greek, fullwidth) that look identical to ASCII letters. Audit all custom property names and class names for non-ASCII characters.',
  v37: 'Publish a DESIGN.md file at /DESIGN.md in your repo root and serve it publicly. Google\'s @google/design.md CLI validates the file format. Install: npm install -g @google/design.md. Lint locally: npx @google/design.md lint DESIGN.md.',
  v38: 'Rewrite button labels to start with a verb or recognized command. NN/g: "Lead with verbs or verb phrases that clearly outline what will happen after the command is selected." Use "Save changes" not "Changes", "Delete file" not "File".',
  v39: 'Remove trailing periods from button text, labels, and tab text. Microsoft Fluent: "Don\'t end text for buttons, radio buttons, labels, or checkboxes with a period."',
  v40: 'Replace non-descriptive link text with destination-revealing text. WCAG 2.4.4 Link Purpose: link text should describe the destination. Use "Read the typography guide" not "Click here".',
  v41: 'Convert ALL CAPS UI text to sentence case. IBM Carbon: "All caps has been shown to be slower to read." Only eyebrow labels and acronyms should be uppercase.',
  S1: 'Replace overused AI-signal fonts with a distinctive choice from your brand system. Inter, Roboto, Open Sans, Montserrat, Poppins, Lato, Space Grotesk, Instrument Serif, and Geist are the fonts AI defaults to when it has no design brief.',
  S2: 'Remove or reduce full-page gradient backgrounds. The 60%+ viewport gradient is the most recognizable AI slop pattern. Use a solid or subtle textured background instead.',
  S3: 'Remove purple/violet gradient overlays (#615fff, #8e51ff, #4f39f6, #7f22fe family). This is the "VibeCode Purple" tell — the most hardcoded gradient in AI-generated UIs.',
  S4: 'Remove gradient text (background-clip: text + color: transparent). Gradient text is decorative, harms readability, and kills scannability. Use solid text colors that pass WCAG contrast.',
  S5: 'Replace default Tailwind/Bootstrap hex values with brand-specific colors. Default indigo-500 (#6366f1), violet-500 (#8b5cf6), slate-900 (#0f172a) signal no design system.',
  S6: 'Vary your card layouts. Repeated identical cards in a rigid grid are the universal AI feature-card template. Mix sizes, use asymmetric layouts, vary content density.',
  S7: 'Replace emoji icons with SVG or icon-library icons. Emoji render differently across operating systems, do not inherit CSS color, do not adapt to dark mode, and do not scale cleanly.',
  S8: 'Remove "AI-powered", "Generate", "Chat with AI", "Powered by AI" pill badges from your hero or marketing copy. The user already knows what your product does.',
  S9: 'Remove all Lorem ipsum placeholder text. It signals the page is unfinished or was generated without real content. Replace with actual copy.',
  S10: 'Use at least 2 font families: one for display/headings, one for body text (and optionally a mono for code). A single font family for everything signals no typographic hierarchy.',
  S11: 'Replace marketing buzzwords (streamline, empower, supercharge, world-class, enterprise-grade, unlock, leverage, seamless, cutting-edge, revolutionize) with specific, concrete copy.',
  S12: 'Replace placeholder/stock image URLs (via.placeholder.com, placehold.co, picsum.photos, unsplash.com/random) with real assets.',
};

// ── Check implementations ──────────────────────────────────────────────────

function checkPaperToken(tokens: Record<string, string>): CheckResult {
  const val = tokens['--paper'];
  if (val) return { id: 'v01', item: 'Token values match live site :root foundation', category: 'tokens', status: 'PASS', detail: `--paper resolved to ${val}` };
  return { id: 'v01', item: 'Token values match live site :root foundation', category: 'tokens', status: 'FAIL', detail: '--paper background token not declared in :root' };
}

function checkContrastSignal(tokens: Record<string, string>): CheckResult {
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
  if (bestRatio >= 4.5) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'PASS', detail: `${bestName} on --signal: ${ratioStr} (passes AA)` };
  if (bestRatio >= 3) return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'WARN', detail: `${bestName} on --signal: ${ratioStr} (passes AA Large, fails AA Normal)` };
  return { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', status: 'FAIL', detail: `${bestName} on --signal: ${ratioStr} (fails AA)` };
}

function checkContrastReadable(tokens: Record<string, string>): CheckResult {
  const paperVal = tokens['--paper'];
  const inkVal = tokens['--ink'];
  const mutedVal = tokens['--muted'];
  const dimVal = tokens['--muted-dim'];
  if (!paperVal || !inkVal) return { id: 'v06', item: 'Readable text contrast: --ink/--muted/--muted-dim vs --paper (WCAG AA)', category: 'accessibility', status: 'WARN', detail: 'missing: --paper or --ink token — cannot compute contrast ratio' };
  const paperRgb = resolveColor(paperVal, tokens);
  const inkRgb = resolveColor(inkVal, tokens);
  if (!paperRgb || !inkRgb) return { id: 'v06', item: 'Readable text contrast: --ink/--muted/--muted-dim vs --paper (WCAG AA)', category: 'accessibility', status: 'SKIP', detail: 'token values unresolvable to RGB' };
  const inkRatio = contrastRatio(inkRgb, paperRgb);
  if (inkRatio < 4.5) return { id: 'v06', item: 'Readable text contrast: --ink/--muted/--muted-dim vs --paper (WCAG AA)', category: 'accessibility', status: 'FAIL', detail: `--ink on --paper: ${inkRatio.toFixed(2)}:1 (below 4.5:1 AA)` };
  if (mutedVal) {
    const mutedRgb = resolveColor(mutedVal, tokens);
    if (mutedRgb) {
      const mutedRatio = contrastRatio(mutedRgb, paperRgb);
      if (mutedRatio < 4.5) return { id: 'v06', item: 'Readable text contrast: --ink/--muted/--muted-dim vs --paper (WCAG AA)', category: 'accessibility', status: 'WARN', detail: `--ink: ${inkRatio.toFixed(2)}:1 ✓, --muted: ${mutedRatio.toFixed(2)}:1 (below 4.5:1)` };
    }
  }
  if (dimVal) {
    const dimRgb = resolveColor(dimVal, tokens);
    if (dimRgb) {
      const dimRatio = contrastRatio(dimRgb, paperRgb);
      if (dimRatio < 3) return { id: 'v06', item: 'Readable text contrast: --ink/--muted/--muted-dim vs --paper (WCAG AA)', category: 'accessibility', status: 'WARN', detail: `--ink: ${inkRatio.toFixed(2)}:1 ✓, --muted-dim: ${dimRatio.toFixed(2)}:1 (below 3:1 large text)` };
    }
  }
  return { id: 'v06', item: 'Readable text contrast: --ink/--muted/--muted-dim vs --paper (WCAG AA)', category: 'accessibility', status: 'PASS', detail: `--ink on --paper: ${inkRatio.toFixed(2)}:1 (passes AA)` };
}

function checkTransitionAll(css: string): CheckResult {
  const matches = css.match(/transition\s*:\s*all\b/gi);
  if (!matches) return { id: 'v11', item: 'No transition: all (use named properties)', category: 'motion', status: 'PASS', detail: 'no transition: all found' };
  return { id: 'v11', item: 'No transition: all (use named properties)', category: 'motion', status: 'WARN', detail: `${matches.length} transition: all declaration(s) — causes layout-thrash` };
}

function checkWillChange(css: string): CheckResult {
  const matches = css.match(/will-change\s*:\s*([^;]+)/gi);
  if (!matches) return { id: 'v12', item: 'will-change restricted to transform/opacity on animating elements', category: 'motion', status: 'PASS', detail: 'no will-change found' };
  const bad = matches.filter((m) => {
    const val = m.replace(/will-change\s*:\s*/i, '').trim().toLowerCase();
    return !['transform', 'opacity'].some((p) => val.includes(p));
  });
  if (bad.length > 0) return { id: 'v12', item: 'will-change restricted to transform/opacity on animating elements', category: 'motion', status: 'WARN', detail: `${bad.length} will-change declaration(s) with non-transform/opacity values` };
  return { id: 'v12', item: 'will-change restricted to transform/opacity on animating elements', category: 'motion', status: 'PASS', detail: `${matches.length} will-change declaration(s), all transform/opacity` };
}

function checkFocusVisible(css: string): CheckResult {
  if (/:focus-visible\s*\{/i.test(css)) return { id: 'v03', item: ':focus-visible styles declared (keyboard accessibility)', category: 'accessibility', status: 'PASS', detail: ':focus-visible rule found' };
  return { id: 'v03', item: ':focus-visible styles declared (keyboard accessibility)', category: 'accessibility', status: 'FAIL', detail: 'no :focus-visible rule found — keyboard users have no focus indicator' };
}

function checkTextWrap(css: string): CheckResult {
  const hasBalance = /text-wrap\s*:\s*balance/i.test(css);
  const hasPretty = /text-wrap\s*:\s*pretty/i.test(css);
  if (hasBalance && hasPretty) return { id: 'v18', item: 'text-wrap: balance (headings) + pretty (paragraphs)', category: 'cadence', status: 'PASS', detail: 'both text-wrap: balance and pretty found' };
  if (hasBalance || hasPretty) return { id: 'v18', item: 'text-wrap: balance (headings) + pretty (paragraphs)', category: 'cadence', status: 'WARN', detail: `only ${hasBalance ? 'balance' : 'pretty'} found — use both` };
  return { id: 'v18', item: 'text-wrap: balance (headings) + pretty (paragraphs)', category: 'cadence', status: 'WARN', detail: 'no text-wrap rules found' };
}

function checkCadenceRules(css: string): CheckResult {
  const hasSynthesis = /font-synthesis\s*:\s*none/i.test(css);
  const hasUnderlinePos = /text-underline-position\s*:\s*from-font/i.test(css);
  const hasSkipInk = /text-decoration-skip-ink\s*:\s*auto/i.test(css);
  const missing: string[] = [];
  if (!hasSynthesis) missing.push('font-synthesis: none');
  if (!hasUnderlinePos) missing.push('text-underline-position: from-font');
  if (!hasSkipInk) missing.push('text-decoration-skip-ink: auto');
  if (missing.length === 0) return { id: 'v14', item: 'Cadence typography rules present (font-synthesis, underline-position, skip-ink)', category: 'cadence', status: 'PASS', detail: 'all three Cadence rules found' };
  return { id: 'v14', item: 'Cadence typography rules present (font-synthesis, underline-position, skip-ink)', category: 'cadence', status: 'WARN', detail: `missing: ${missing.join(', ')}` };
}

function checkTabularNums(css: string): CheckResult {
  const hasTnum = /font-feature-settings\s*:[^;]*"tnum"/i.test(css) || /font-variant-numeric\s*:\s*tabular-nums/i.test(css);
  if (hasTnum) return { id: 'v19', item: 'tabular-nums on numeric displays (scores, prices, counts)', category: 'cadence', status: 'PASS', detail: 'tabular-nums or "tnum" found' };
  const numDisplays = css.match(/(?:score|price|count|stat|metric|rating|timer|counter)/gi);
  if (numDisplays && numDisplays.length >= 3) return { id: 'v19', item: 'tabular-nums on numeric displays (scores, prices, counts)', category: 'cadence', status: 'WARN', detail: `only ${numDisplays.length} instances of numeric display patterns but no tabular-nums` };
  return { id: 'v19', item: 'tabular-nums on numeric displays (scores, prices, counts)', category: 'cadence', status: 'WARN', detail: 'only 0 instances of numeric display patterns found' };
}

function checkReducedMotion(css: string): CheckResult {
  if (/@media[^{]*prefers-reduced-motion/i.test(css)) return { id: 'v05', item: '@media (prefers-reduced-motion) block present', category: 'accessibility', status: 'PASS', detail: 'prefers-reduced-motion media query found' };
  return { id: 'v05', item: '@media (prefers-reduced-motion) block present', category: 'accessibility', status: 'FAIL', detail: 'no prefers-reduced-motion media query — motion-sensitive users have no escape' };
}

function checkNoAtlasNaming(html: string): CheckResult {
  const atlasPattern = /\batlas\b/gi;
  const matches = html.match(atlasPattern);
  if (!matches || matches.length === 0) return { id: 'v07', item: 'No "ATLAS" naming in public-facing HTML', category: 'identity', status: 'PASS', detail: 'no "atlas" text found in HTML' };
  const visible = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const visibleMatches = visible.match(atlasPattern);
  if (visibleMatches && visibleMatches.length > 0) return { id: 'v07', item: 'No "ATLAS" naming in public-facing HTML', category: 'identity', status: 'FAIL', detail: `${visibleMatches.length} "atlas" reference(s) found in visible HTML` };
  return { id: 'v07', item: 'No "ATLAS" naming in public-facing HTML', category: 'identity', status: 'PASS', detail: `"atlas" only in script/style blocks (${matches.length} total)` };
}

function checkPressScale(css: string): CheckResult {
  const scales = css.match(/scale\((\d*\.?\d+)\)/gi) || [];
  const pressScales = scales.map((s) => parseFloat(s.replace(/scale\(|\)/gi, '')));
  const active = css.match(/:active[^{]*\{[^}]*scale/gi);
  if (!active || active.length === 0) return { id: 'v13', item: 'Press scale on interactive elements (0.96 cells, 0.985 cards)', category: 'takt', status: 'WARN', detail: 'no press-scale (:active with scale()) found' };
  const below = pressScales.filter((s) => s < 0.95 && s > 0);
  if (below.length > 0) return { id: 'v13', item: 'Press scale on interactive elements (0.96 cells, 0.985 cards)', category: 'takt', status: 'FAIL', detail: `${below.length} scale(s) below 0.95 floor: ${below.join(', ')}` };
  return { id: 'v13', item: 'Press scale on interactive elements (0.96 cells, 0.985 cards)', category: 'takt', status: 'PASS', detail: `${active.length} press-scale rule(s) found, all above 0.95 floor` };
}

function checkLineHeightByRole(css: string): CheckResult {
  const headings = css.match(/(?:h1|h2|h3|h4|h5|h6)[^{]*\{[^}]*line-height\s*:\s*([0-9.]+)/gi) || [];
  const bodies = css.match(/(?:body|p|article)[^{]*\{[^}]*line-height\s*:\s*([0-9.]+)/gi) || [];
  const headingLh = headings.map((m) => parseFloat(m.match(/line-height\s*:\s*([0-9.]+)/i)?.[1] || '0'));
  const bodyLh = bodies.map((m) => parseFloat(m.match(/line-height\s*:\s*([0-9.]+)/i)?.[1] || '0'));
  const tightH = headingLh.some((lh) => lh > 0 && lh <= 1.2);
  const relaxedB = bodyLh.some((lh) => lh > 0 && lh >= 1.4);
  if (tightH && relaxedB) return { id: 'v17', item: 'Heading line-height ≤ 1.2, body line-height ≥ 1.4', category: 'cadence', status: 'PASS', detail: `headings ≤1.2, bodies ≥1.4 found` };
  if (headingLh.length || bodyLh.length) return { id: 'v17', item: 'Heading line-height ≤ 1.2, body line-height ≥ 1.4', category: 'cadence', status: 'WARN', detail: `heading LHs: ${headingLh.join(',') || 'none'}, body LHs: ${bodyLh.join(',') || 'none'}` };
  return { id: 'v17', item: 'Heading line-height ≤ 1.2, body line-height ≥ 1.4', category: 'cadence', status: 'WARN', detail: 'no role-specific line-height rules found' };
}

function checkSelectionStyled(css: string): CheckResult {
  if (/::selection\s*\{/i.test(css)) return { id: 'v20', item: '::selection styled with brand color', category: 'identity', status: 'PASS', detail: '::selection rule found' };
  return { id: 'v20', item: '::selection styled with brand color', category: 'identity', status: 'WARN', detail: 'no ::selection rule found — browser default will be used' };
}

function checkDurationTokens(tokens: Record<string, string>): CheckResult {
  const durationTokens = ['--duration', '--duration-quick', '--duration-fast', '--duration-medium', '--duration-slow'];
  const found = durationTokens.filter((t) => tokens[t]);
  if (found.length === 5) return { id: 'v23', item: 'Five duration tokens declared in :root', category: 'motion', status: 'PASS', detail: `all 5 duration tokens found` };
  return { id: 'v23', item: 'Five duration tokens declared in :root', category: 'motion', status: 'WARN', detail: `only ${found.length}/5 duration tokens found: ${found.join(', ') || 'none'}` };
}

function checkFontSynthesis(css: string): CheckResult {
  if (/font-synthesis\s*:\s*none/i.test(css)) return { id: 'x01', item: 'font-synthesis: none declared', category: 'cadence', status: 'PASS', detail: 'font-synthesis: none found' };
  return { id: 'x01', item: 'font-synthesis: none declared', category: 'cadence', status: 'WARN', detail: 'no font-synthesis rule found' };
}

function checkUnderlinePosition(css: string): CheckResult {
  if (/text-underline-position\s*:\s*from-font/i.test(css)) return { id: 'x02', item: 'text-underline-position: from-font declared', category: 'cadence', status: 'PASS', detail: 'text-underline-position: from-font found' };
  return { id: 'x02', item: 'text-underline-position: from-font declared', category: 'cadence', status: 'WARN', detail: 'no text-underline-position rule found' };
}

function checkSkipInk(css: string): CheckResult {
  if (/text-decoration-skip-ink\s*:\s*auto/i.test(css)) return { id: 'x03', item: 'text-decoration-skip-ink: auto declared', category: 'cadence', status: 'PASS', detail: 'text-decoration-skip-ink: auto found' };
  return { id: 'x03', item: 'text-decoration-skip-ink: auto declared', category: 'cadence', status: 'WARN', detail: 'no text-decoration-skip-ink rule found' };
}

function checkTouchTargets(css: string): CheckResult {
  const buttonMin = css.match(/(?:button|a|input|\.btn)[^{]*\{[^}]*min-height\s*:\s*(\d+)/gi) || [];
  const sizes = buttonMin.map((m) => parseInt(m.match(/min-height\s*:\s*(\d+)/i)?.[1] || '0'));
  const adequate = sizes.filter((s) => s >= 44);
  if (adequate.length > 0) return { id: 'v24', item: 'Touch targets ≥ 44px (WCAG 2.5.8)', category: 'accessibility', status: 'PASS', detail: `${adequate.length} element(s) with min-height ≥44px` };
  if (sizes.length > 0) return { id: 'v24', item: 'Touch targets ≥ 44px (WCAG 2.5.8)', category: 'accessibility', status: 'WARN', detail: `${sizes.length} min-height(s) found but none ≥44px: ${sizes.join(', ')}` };
  return { id: 'v24', item: 'Touch targets ≥ 44px (WCAG 2.5.8)', category: 'accessibility', status: 'WARN', detail: 'no min-height on interactive elements — static check, full verification needs browser' };
}

function checkHeadingHierarchy(html: string): CheckResult {
  const h1s = html.match(/<h1\b/gi) || [];
  const headings = html.match(/<h([1-6])\b/gi) || [];
  if (h1s.length === 0) return { id: 'v25', item: 'Heading hierarchy: one h1, no skipped levels', category: 'semantic', status: 'WARN', detail: 'no h1 found' };
  if (h1s.length > 1) return { id: 'v25', item: 'Heading hierarchy: one h1, no skipped levels', category: 'semantic', status: 'FAIL', detail: `${h1s.length} h1 elements — should be exactly one` };
  const levels = headings.map((h) => parseInt(h.match(/<h([1-6])/i)?.[1] || '0'));
  let skipped = false;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) { skipped = true; break; }
  }
  if (skipped) return { id: 'v25', item: 'Heading hierarchy: one h1, no skipped levels', category: 'semantic', status: 'FAIL', detail: 'heading levels skipped (e.g. h1→h3)' };
  return { id: 'v25', item: 'Heading hierarchy: one h1, no skipped levels', category: 'semantic', status: 'PASS', detail: 'one h1, no skipped levels' };
}

function checkFontFamilyCount(css: string): CheckResult {
  const families = css.match(/font-family\s*:([^;}{]+)/gi) || [];
  const unique = new Set<string>();
  for (const f of families) {
    const first = f.replace(/^font-family\s*:/i, '').split(',')[0].trim().replace(/["']/g, '').toLowerCase();
    if (first && !['serif', 'sans-serif', 'monospace', 'system-ui', 'inherit', 'initial', 'unset'].includes(first)) unique.add(first);
  }
  if (unique.size <= 3) return { id: 'v26', item: 'Font families ≤ 3', category: 'identity', status: 'PASS', detail: `${unique.size} font family/families: ${[...unique].join(', ')}` };
  return { id: 'v26', item: 'Font families ≤ 3', category: 'identity', status: 'WARN', detail: `${unique.size} font families: ${[...unique].join(', ')}` };
}

function checkInputFontFloor(css: string): CheckResult {
  const inputs = css.match(/(?:input|textarea|select)[^{]*\{[^}]*font-size\s*:\s*([0-9.]+)/gi) || [];
  const sizes = inputs.map((m) => parseFloat(m.match(/font-size\s*:\s*([0-9.]+)/i)?.[1] || '0'));
  const below = sizes.filter((s) => s > 0 && s < 16);
  if (below.length > 0) return { id: 'v27', item: 'Input font-size ≥ 16px (prevent iOS auto-zoom)', category: 'responsive', status: 'FAIL', detail: `${below.length} input(s) below 16px: ${below.join(', ')}px` };
  if (sizes.length > 0) return { id: 'v27', item: 'Input font-size ≥ 16px (prevent iOS auto-zoom)', category: 'responsive', status: 'PASS', detail: `${sizes.length} input(s) all ≥16px` };
  return { id: 'v27', item: 'Input font-size ≥ 16px (prevent iOS auto-zoom)', category: 'responsive', status: 'PASS', detail: 'no input font-size rules found (likely using rem from body)' };
}

function checkReadingWidth(css: string): CheckResult {
  const maxW = css.match(/max-width\s*:\s*(\d+)ch/gi);
  if (maxW) return { id: 'v28', item: 'Reading width constrained (max-width in ch units)', category: 'cadence', status: 'PASS', detail: `max-width in ch found: ${maxW[0]}` };
  return { id: 'v28', item: 'Reading width constrained (max-width in ch units)', category: 'cadence', status: 'WARN', detail: 'no max-width in ch units found' };
}

function checkTokenLayerDepth(tokens: Record<string, string>): CheckResult {
  const varRefs = Object.values(tokens).filter((v) => /var\(/.test(v));
  if (varRefs.length >= 3) return { id: 'v29', item: 'Token layering: primitive → semantic → component', category: 'tokens', status: 'PASS', detail: `${varRefs.length} token(s) reference other tokens via var()` };
  if (varRefs.length >= 1) return { id: 'v29', item: 'Token layering: primitive → semantic → component', category: 'tokens', status: 'WARN', detail: `only ${varRefs.length} token(s) reference other tokens` };
  return { id: 'v29', item: 'Token layering: primitive → semantic → component', category: 'tokens', status: 'WARN', detail: 'no token layering — all tokens are flat values' };
}

function checkAiDisclosure(html: string): CheckResult {
  const hasAiText = /\bAI\b|artificial intelligence|chatbot|assistant/gi.test(html);
  const hasDisclosure = /ai-assistant|aria-label="ai|data-ai|class="ai-disclosure/gi.test(html);
  const hasMeta = /<meta[^>]*generator[^>]*ai/gi.test(html);
  if (hasDisclosure || hasMeta) return { id: 'v34', item: 'AI disclosure for chatbots/agents (EU AI Act Art 50)', category: 'accessibility', status: 'PASS', detail: 'AI disclosure marker found in HTML' };
  if (hasAiText) return { id: 'v34', item: 'AI disclosure for chatbots/agents (EU AI Act Art 50)', category: 'accessibility', status: 'WARN', detail: 'AI-related text found but no disclosure marker (aria-label, meta generator, or badge)' };
  return { id: 'v34', item: 'AI disclosure for chatbots/agents (EU AI Act Art 50)', category: 'accessibility', status: 'SKIP', detail: 'no AI/chatbot content detected — disclosure not required' };
}

function checkForcedColors(css: string): CheckResult {
  if (/@media[^{]*forced-colors/i.test(css)) return { id: 'v35', item: 'forced-colors media query present (Windows HCM)', category: 'accessibility', status: 'PASS', detail: 'forced-colors media query found' };
  return { id: 'v35', item: 'forced-colors media query present (Windows HCM)', category: 'accessibility', status: 'WARN', detail: 'no forced-colors media query — Windows High Contrast Mode users may see illegible UI' };
}

function checkSecurityConfusables(css: string, tokens: Record<string, string>): CheckResult {
  const allNames = [...Object.keys(tokens), ...css.match(/\.[a-zA-Z_\u0080-\uFFFF][\w\u0080-\uFFFF-]*/g) || []].join('\n');
  const cyrillic = allNames.match(/[\u0400-\u04FF]/g);
  const greek = allNames.match(/[\u0370-\u03FF]/g);
  const fullwidth = allNames.match(/[\uFF00-\uFFEF]/g);
  const total = (cyrillic?.length || 0) + (greek?.length || 0) + (fullwidth?.length || 0);
  if (total > 0) return { id: 'v36', item: 'No Unicode confusable characters (UTS #39)', category: 'security', status: 'FAIL', detail: `${total} confusable character(s) detected (Cyrillic/Greek/fullwidth)` };
  return { id: 'v36', item: 'No Unicode confusable characters (UTS #39)', category: 'security', status: 'PASS', detail: 'no confusable characters found' };
}

function checkButtonTextVerb(html: string): CheckResult {
  const buttons = html.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];
  const links = html.match(/<a[^>]*role="button"[^>]*>([\s\S]*?)<\/a>/gi) || [];
  const allBtns = [...buttons, ...links];
  const VERBS = ['save', 'cancel', 'delete', 'edit', 'share', 'close', 'back', 'next', 'create', 'add', 'remove', 'submit', 'send', 'download', 'upload', 'copy', 'cut', 'paste', 'open', 'view', 'show', 'hide', 'start', 'stop', 'play', 'pause', 'resume', 'retry', 'continue', 'accept', 'reject', 'approve', 'deny', 'confirm', 'dismiss', 'enable', 'disable', 'install', 'uninstall', 'connect', 'disconnect', 'sign', 'log', 'register', 'join', 'leave', 'buy', 'purchase', 'order', 'checkout', 'apply', 'try', 'test', 'run', 'build', 'deploy', 'generate', 'scan', 'detect', 'assess', 'enforce', 'verify', 'check', 'inspect', 'review', 'analyze', 'export', 'import', 'configure', 'manage', 'update', 'upgrade', 'refresh', 'reset', 'restore', 'rebuild'];
  const bare: string[] = [];
  for (const btn of allBtns) {
    const text = btn.replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (!text || text.length > 40) continue;
    const firstWord = text.split(/\s+/)[0];
    if (!VERBS.includes(firstWord) && !VERBS.includes(text)) bare.push(text);
  }
  if (bare.length === 0) return { id: 'v38', item: 'Button text starts with a verb or recognized command', category: 'copywriting', status: 'PASS', detail: `${allBtns.length} button(s) checked, all start with verbs` };
  return { id: 'v38', item: 'Button text starts with a verb or recognized command', category: 'copywriting', status: 'WARN', detail: `${bare.length} button(s) without verb: ${bare.slice(0, 5).join(', ')}` };
}

function checkNoTrailingPeriod(html: string): CheckResult {
  const buttons = html.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];
  const labels = html.match(/<label[^>]*>([\s\S]*?)<\/label>/gi) || [];
  const all = [...buttons, ...labels];
  const bad: string[] = [];
  for (const el of all) {
    const text = el.replace(/<[^>]+>/g, '').trim();
    if (text.endsWith('.') && !text.endsWith('...')) bad.push(text);
  }
  if (bad.length === 0) return { id: 'v39', item: 'No trailing periods in button/label text', category: 'copywriting', status: 'PASS', detail: `${all.length} element(s) checked, no trailing periods` };
  return { id: 'v39', item: 'No trailing periods in button/label text', category: 'copywriting', status: 'WARN', detail: `${bad.length} element(s) with trailing period: ${bad.slice(0, 3).join(', ')}` };
}

function checkLinkTextDescriptive(html: string): CheckResult {
  const links = html.match(/<a[^>]*href[^>]*>([\s\S]*?)<\/a>/gi) || [];
  const generic = ['click here', 'learn more', 'read more', 'more', 'here', 'link', 'this', 'see more', 'continue reading'];
  const bad: string[] = [];
  for (const link of links) {
    const text = link.replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (text && generic.includes(text)) bad.push(text);
  }
  if (bad.length === 0) return { id: 'v40', item: 'Link text describes destination (WCAG 2.4.4)', category: 'copywriting', status: 'PASS', detail: `${links.length} link(s) checked, all descriptive` };
  return { id: 'v40', item: 'Link text describes destination (WCAG 2.4.4)', category: 'copywriting', status: 'WARN', detail: `${bad.length} generic link(s): ${bad.slice(0, 5).join(', ')}` };
}

function checkNoAllCaps(html: string): CheckResult {
  const headings = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi) || [];
  const buttons = html.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];
  const all = [...headings, ...buttons];
  const bad: string[] = [];
  for (const el of all) {
    const text = el.replace(/<[^>]+>/g, '').trim();
    if (text.length > 3 && text === text.toUpperCase() && /[a-z]/.test(text.toLowerCase()) && !/^[A-Z\s]+$/.test(text)) {
      // Only flag if ALL caps and not an acronym (≤4 chars)
      if (text.length > 4) bad.push(text.substring(0, 30));
    }
  }
  if (bad.length === 0) return { id: 'v41', item: 'No ALL CAPS headings/buttons (sentence case)', category: 'copywriting', status: 'PASS', detail: `${all.length} element(s) checked, no ALL CAPS` };
  return { id: 'v41', item: 'No ALL CAPS headings/buttons (sentence case)', category: 'copywriting', status: 'WARN', detail: `${bad.length} ALL CAPS element(s): ${bad.slice(0, 3).join(', ')}` };
}

function checkPoiseInteractionRules(css: string): CheckResult {
  const hasHover = /:hover[^{]*\{[^}]*translateY/i.test(css);
  const hasPress = /:active[^{]*\{[^}]*scale/i.test(css);
  const hasFocus = /:focus[^{]*\{[^}]*(?:outline|box-shadow)/i.test(css);
  if (hasHover && hasPress && hasFocus) return { id: 'v08', item: 'Poise interaction rules: hover lift, press scale, focus ring', category: 'poise', status: 'PASS', detail: 'hover lift, press scale, and focus ring all present' };
  const missing: string[] = [];
  if (!hasHover) missing.push('hover lift (translateY)');
  if (!hasPress) missing.push('press scale');
  if (!hasFocus) missing.push('focus ring');
  return { id: 'v08', item: 'Poise interaction rules: hover lift, press scale, focus ring', category: 'poise', status: 'WARN', detail: `missing: ${missing.join(', ')}` };
}

function checkPoiseKeyboardPath(css: string, html: string): CheckResult {
  const hasFocusVisible = /:focus-visible/i.test(css);
  const hasTabIndex = /tabindex/i.test(html);
  if (hasFocusVisible && hasTabIndex) return { id: 'v09', item: 'Keyboard path documented: tab order visible, elements reachable', category: 'poise', status: 'PASS', detail: ':focus-visible and tabindex found' };
  if (hasFocusVisible) return { id: 'v09', item: 'Keyboard path documented: tab order visible, elements reachable', category: 'poise', status: 'WARN', detail: ':focus-visible found but no tabindex management' };
  return { id: 'v09', item: 'Keyboard path documented: tab order visible, elements reachable', category: 'poise', status: 'WARN', detail: 'missing: :focus-visible and tabindex' };
}

function checkTaktFeelRules(css: string): CheckResult {
  const hasScale096 = /scale\(\s*0\.9[0-9]/i.test(css);
  const hasScale098 = /scale\(\s*0\.9[89]/i.test(css);
  if (hasScale096 || hasScale098) return { id: 'v10', item: 'Takt feel rules: press scales (0.96 cells, 0.985 cards)', category: 'takt', status: 'PASS', detail: 'press scales in 0.96-0.99 range found' };
  return { id: 'v10', item: 'Takt feel rules: press scales (0.96 cells, 0.985 cards)', category: 'takt', status: 'WARN', detail: 'missing: press scales in 0.96-0.99 range' };
}

function checkFontSmoothing(css: string): CheckResult {
  const webkit = /-webkit-font-smoothing\s*:\s*antialiased/i.test(css);
  const moz = /-moz-osx-font-smoothing\s*:\s*grayscale/i.test(css);
  if (webkit && moz) return { id: 'v15', item: 'Font smoothing: -webkit + -moz-osx', category: 'cadence', status: 'PASS', detail: 'both font-smoothing rules found' };
  return { id: 'v15', item: 'Font smoothing: -webkit + -moz-osx', category: 'cadence', status: 'WARN', detail: 'missing complete font-smoothing stack' };
}

function checkRemScale(css: string): CheckResult {
  const htmlFont = css.match(/html\s*\{[^}]*font-size\s*:\s*([0-9.]+)px/i);
  const rootFont = css.match(/:root\s*\{[^}]*font-size\s*:\s*([0-9.]+)px/i);
  const size = htmlFont ? parseFloat(htmlFont[1]) : rootFont ? parseFloat(rootFont[1]) : 16;
  if (size >= 16) return { id: 'v16', item: 'Root font-size ≥ 16px (rem scale anchor)', category: 'cadence', status: 'PASS', detail: `root font-size: ${size}px` };
  return { id: 'v16', item: 'Root font-size ≥ 16px (rem scale anchor)', category: 'cadence', status: 'FAIL', detail: `root font-size: ${size}px — below 16px floor (iOS Safari auto-zoom)` };
}

async function checkDesignMdSpec(targetUrl: string): Promise<CheckResult> {
  const ITEM = 'DESIGN.md spec-layer validation (Google @google/design.md lint)';
  const CATEGORY = 'spec';
  const parsed = new URL(targetUrl);
  const designMdUrl = `${parsed.protocol}//${parsed.host}/DESIGN.md`;
  if (!isValidUrl(designMdUrl)) return { id: 'v37', item: ITEM, category: CATEGORY, status: 'SKIP', detail: '/DESIGN.md URL failed SSRF guard' };
  const r = await httpsFetch(designMdUrl, { Accept: 'text/markdown, text/plain, */*' }, 5000);
  if (!r.ok || r.text.length < 50) return { id: 'v37', item: ITEM, category: CATEGORY, status: 'SKIP', detail: `/DESIGN.md not publicly served (HTTP ${r.status}). No public convention exists — this is expected.` };
  if (!r.text.includes('---')) return { id: 'v37', item: ITEM, category: CATEGORY, status: 'WARN', detail: `/DESIGN.md served but no YAML frontmatter found` };
  // Try Google's linter if available (optional dependency — SKIP if not installed)
  try {
    // @ts-ignore — optional dependency, may not be installed
    const mod = await import('@google/design.md/linter');
    const report = mod.lint(r.text);
    const errors = report.summary?.errors || 0;
    const warnings = report.summary?.warnings || 0;
    if (errors > 0) return { id: 'v37', item: ITEM, category: CATEGORY, status: 'FAIL', detail: `/DESIGN.md linted: ${errors} error(s), ${warnings} warning(s)` };
    if (warnings > 0) return { id: 'v37', item: ITEM, category: CATEGORY, status: 'WARN', detail: `/DESIGN.md linted: ${warnings} warning(s)` };
    return { id: 'v37', item: ITEM, category: CATEGORY, status: 'PASS', detail: `/DESIGN.md linted clean` };
  } catch {
    return { id: 'v37', item: ITEM, category: CATEGORY, status: 'PASS', detail: `/DESIGN.md served with valid frontmatter (linter not installed — install @google/design.md for full lint)` };
  }
}

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ── Main scoring function ───────────────────────────────────────────────────

export async function scoreUrl(targetUrl: string, scope?: ScoreScope): Promise<ScoreResult> {
  const { html, css } = await fetchPageResilient(targetUrl);
  const rawTokens = extractRootTokens(css);
  const tokens = inferTokensFromCss(css, rawTokens);
  const effectiveScope: ScoreScope = scope || autoDetectScope(targetUrl);

  let checks: CheckResult[] = [
    checkPaperToken(tokens),
    { id: 'v02', item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+', category: 'responsive', status: 'MANUAL', detail: 'requires browser viewport trace — run the full audit to resolve' },
    checkFocusVisible(css),
    { id: 'v04', item: 'Sound toggle flips aria-pressed and applies the audio preference', category: 'poise', status: 'MANUAL', detail: 'requires live DOM interaction — run the full audit to resolve' },
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
    { id: 'v21', item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1', category: 'performance', status: 'MANUAL', detail: 'requires CDP trace — run the full audit to resolve' },
    checkContrastSignal(tokens),
    checkDurationTokens(tokens),
    checkFontSynthesis(css),
    checkUnderlinePosition(css),
    checkSkipInk(css),
    checkTouchTargets(css),
    checkHeadingHierarchy(html),
    checkFontFamilyCount(css),
    checkInputFontFloor(css),
    checkReadingWidth(css),
    checkTokenLayerDepth(tokens),
    checkAiDisclosure(html),
    checkForcedColors(css),
    checkSecurityConfusables(css, tokens),
    checkButtonTextVerb(html),
    checkNoTrailingPeriod(html),
    checkLinkTextDescriptive(html),
    checkNoAllCaps(html),
  ];

  // v37 is async — added after the synchronous checks array
  checks.push(await checkDesignMdSpec(targetUrl));

  checks = applyScopeFilter(checks, effectiveScope);

  const pass = checks.filter((c) => c.status === 'PASS').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;
  const skip = checks.filter((c) => c.status === 'SKIP').length;
  const manual = checks.filter((c) => c.status === 'MANUAL').length;
  const total = checks.length;

  // ── Anti-slop deductions ──────────────────────────────────────────────────
  const slopFindings: SlopFinding[] = [];

  // S1. Overused font families
  {
    const overusedFonts = new Set(['inter', 'roboto', 'open sans', 'montserrat', 'poppins', 'lato', 'space grotesk', 'instrument serif', 'geist']);
    const fontMatches = css.match(/font-family\s*:([^;}{]+)/gi) || [];
    const usedFonts = new Set<string>();
    for (const match of fontMatches) {
      const families = match.replace(/^font-family\s*:/i, '').split(',');
      for (const fam of families) {
        const clean = fam.trim().replace(/["']/g, '').toLowerCase();
        if (overusedFonts.has(clean)) usedFonts.add(clean);
      }
    }
    if (usedFonts.size > 0) slopFindings.push({ id: 'S1', label: 'Overused font family', severity: 5, instances: usedFonts.size, evidence: [...usedFonts] });
  }

  // S2. Full-page gradient background
  {
    const isGridPattern = (text: string) => /(?:transparent|rgba\([^)]+\))\s+1px(?:\s*,)/.test(text);
    const bodyGrad = css.match(/(?:^|})\s*(?:body|html)(?!::)[^{]*\{[^}]*background(?:-image)?\s*:[^;{}]*linear-gradient\s*\([^)]*,\s*[^)]*\)/gi) || [];
    const overlayGrad: string[] = [];
    const gradBlockRe = /\{[^{}]{0,500}?linear-gradient\s*\(\s*[^)]*,\s*[^)]{4,}\)[^{}]{0,500}?\}/gi;
    let block: RegExpExecArray | null;
    while ((block = gradBlockRe.exec(css)) !== null) {
      const decl = block[0];
      const fullBleed = /position\s*:\s*fixed/i.test(decl) || /inset\s*:\s*0\b/i.test(decl) || /width\s*:\s*100vw/i.test(decl) || /height\s*:\s*100vh/i.test(decl);
      const hairline = /(?:height|width)\s*:\s*1px\b/.test(decl) || /border(?:-top|-bottom)?-width\s*:\s*1px\b/.test(decl);
      if (fullBleed && !hairline) overlayGrad.push(decl.slice(0, 160));
    }
    const bodyGradFiltered = bodyGrad.filter(m => !isGridPattern(m));
    const overlayGradFiltered = overlayGrad.filter(m => !isGridPattern(m));
    const instances = bodyGradFiltered.length + overlayGradFiltered.length;
    if (instances > 0) slopFindings.push({ id: 'S2', label: 'Full-page gradient background', severity: 5, instances, evidence: [...bodyGradFiltered, ...overlayGradFiltered].slice(0, 3) });
  }

  // S3. Purple/violet gradient
  {
    const purplePattern = /(?:background(?:-image)?\s*:[^;]*linear-gradient[^;]*(?:#?(?:615fff|8e51ff|4f39f6|7f22fe|a855f7|9333ea|7c3aed|6d28d9|5b21b6|4c1d95)))/gi;
    const matches = css.match(purplePattern);
    if (matches) slopFindings.push({ id: 'S3', label: 'Purple/violet AI gradient', severity: 4, instances: matches.length, evidence: matches.slice(0, 3) });
  }

  // S4. Gradient text
  {
    const gradientClips = css.match(/[^{]*\{[^}]*background-clip\s*:\s*text[^}]*\}/gi) || [];
    const hueKey = (stop: string): string | null => {
      if (/var\(/.test(stop)) return null;
      const hex = stop.match(/#([0-9a-f]{6})/i);
      if (hex) {
        const n = parseInt(hex[1], 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx - mn < 28) return 'neutral';
        let h = 0; const d = mx - mn;
        if (mx === r) h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = Math.round(((h * 60) + 360) % 360);
        return 'h' + Math.floor(h / 45);
      }
      const rgb = stop.match(/rgba?\(([^)]+)\)/i);
      if (rgb) {
        const p = rgb[1].split(',').map(x => parseFloat(x));
        if (p.length >= 3) {
          const [r, g, b] = p;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx - mn < 28) return 'neutral';
          let h = 0; const d = mx - mn;
          if (mx === r) h = ((g - b) / d) % 6;
          else if (mx === g) h = (b - r) / d + 2;
          else h = (r - g) / d + 4;
          h = Math.round(((h * 60) + 360) % 360);
          return 'h' + Math.floor(h / 45);
        }
      }
      return null;
    };
    const multiColorGradient = gradientClips.filter(block => {
      const gradientMatch = block.match(/linear-gradient\(([\s\S]+)\)\s*;?\s*background-size|linear-gradient\(([^;]+)\)/i);
      const gradText = (gradientMatch && (gradientMatch[1] || gradientMatch[2])) || '';
      const stops = gradText.split(',').map(s => s.trim());
      const hueKeys = new Set(stops.map(hueKey).filter((k): k is string => k !== null && k !== 'neutral'));
      return hueKeys.size >= 2;
    });
    if (multiColorGradient.length > 0) slopFindings.push({ id: 'S4', label: 'Gradient text (background-clip:text)', severity: 4, instances: multiColorGradient.length, evidence: multiColorGradient.slice(0, 2).map(m => m.substring(0, 80)) });
  }

  // S5. Tailwind default palette
  {
    const tailwindDefaults = ['#0f172a', '#1e293b', '#334155', '#615fff', '#8e51ff', '#4f39f6', '#7f22fe', '#6366f1', '#8b5cf6', '#a78bfa', '#0d6efd', '#007bff'];
    const hexPattern = new RegExp(tailwindDefaults.map(h => h.replace('#', '#?')).join('|'), 'gi');
    const allColors = css.match(/#[0-9a-f]{6}/gi) || [];
    const matches = allColors.filter(c => tailwindDefaults.some(t => c.toLowerCase() === t.toLowerCase()));
    if (matches.length >= 3) slopFindings.push({ id: 'S5', label: 'Default Tailwind/Bootstrap palette', severity: 5, instances: matches.length, evidence: [...new Set(matches)].slice(0, 5) });
  }

  // S6. Repeated identical cards
  {
    const cardPattern = /\.(card|panel|tile|feature|item|box|cell|block)\b/gi;
    const cardClasses = css.match(cardPattern) || [];
    const gridCardPattern = /grid-template-columns[^}]*repeat\s*\(\s*(?:auto-fit|auto-fill|\d+)/gi;
    const gridMatches = css.match(gridCardPattern) || [];
    if (cardClasses.length >= 3 && gridMatches.length > 0) slopFindings.push({ id: 'S6', label: 'Repeated identical card grid', severity: 5, instances: 1, evidence: [`${cardClasses.length} card-like classes with repeating grid layouts`] });
  }

  // S7. Emoji as UI icons
  {
    const emojiInButtons = html.match(/(?:<button|<a[^>]*class[^>]*(?:btn|cta|primary|action))[^>]*>[\s\S]{0,200}[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/giu);
    if (emojiInButtons && emojiInButtons.length >= 2) slopFindings.push({ id: 'S7', label: 'Emoji as UI icons', severity: 4, instances: emojiInButtons.length, evidence: [`${emojiInButtons.length} emoji in button/CTA elements`] });
  }

  // S8. AI-pill badges
  {
    const pillPattern = /(?:AI-powered|Generate|Chat with AI|Powered by AI|Built with AI|AI-driven)/gi;
    const matches = html.match(pillPattern) || [];
    if (matches.length > 0) slopFindings.push({ id: 'S8', label: 'AI-pill badge text', severity: 3, instances: matches.length, evidence: [...new Set(matches.map(m => m.trim()))].slice(0, 3) });
  }

  // S9. Lorem ipsum
  {
    const loremPattern = /lorem ipsum|dolor sit amet|consectetur adipiscing|sed do eiusmod|tempor incididunt/gi;
    const matches = html.match(loremPattern) || [];
    if (matches.length > 0) slopFindings.push({ id: 'S9', label: 'Lorem ipsum placeholder text', severity: 5, instances: matches.length, evidence: ['Lorem ipsum detected in page content'] });
  }

  // S10. Single font family
  {
    const fontFamilyMatches = css.match(/font-family\s*:([^;}{]+)/gi) || [];
    const uniqueFamilies = new Set<string>();
    for (const match of fontFamilyMatches) {
      const first = match.replace(/^font-family\s*:/i, '').split(',')[0].trim().replace(/["']/g, '').toLowerCase();
      if (first && !['serif', 'sans-serif', 'monospace', 'system-ui'].includes(first)) uniqueFamilies.add(first);
    }
    if (uniqueFamilies.size === 1) slopFindings.push({ id: 'S10', label: 'Single font family for everything', severity: 4, instances: 1, evidence: [`Only "${[...uniqueFamilies][0]}" used across entire page`] });
  }

  // S11. Marketing buzzwords
  {
    const buzzwords = ['streamline', 'empower', 'supercharge', 'world-class', 'enterprise-grade', 'next-generation', 'unlock', 'leverage', 'seamless', 'cutting-edge', 'revolutionize', 'game-chang', 'disrupt', 'synerg'];
    const bodyText = html.replace(/<[^>]+>/g, ' ').toLowerCase();
    const found: string[] = [];
    for (const word of buzzwords) { if (bodyText.includes(word)) found.push(word); }
    if (found.length >= 2) slopFindings.push({ id: 'S11', label: 'Marketing buzzword copy', severity: 3, instances: found.length, evidence: found.slice(0, 5) });
  }

  // S12. Placeholder/stock images
  {
    const placeholderPatterns = /via\.placeholder|placehold\.co|placeholder\.com|dummyimage|picsum\.photos|loremflickr|unsplash\.com\/(?:random|featured)/gi;
    const matches = html.match(placeholderPatterns) || [];
    if (matches.length > 0) slopFindings.push({ id: 'S12', label: 'Placeholder/stock image URLs', severity: 4, instances: matches.length, evidence: [...new Set(matches)].slice(0, 3) });
  }

  const SLOP_PER_CHECK_CAP = 5;
  const SLOP_TOTAL_CAP = 20;
  const slopDeductions = slopFindings.map((f) => ({ ...f, deduction: Math.min(f.severity * Math.min(f.instances, 3), SLOP_PER_CHECK_CAP) }));
  let slopTotal = slopDeductions.reduce((sum, d) => sum + (d.deduction || 0), 0);
  slopTotal = Math.min(slopTotal, SLOP_TOTAL_CAP);
  const slopConvergences = slopDeductions.length >= 2 ? `${slopDeductions.length} anti-slop pattern${slopDeductions.length !== 1 ? 's' : ''} detected` : slopDeductions.length === 1 ? '1 anti-slop pattern detected' : null;

  // ── Originality lift ──────────────────────────────────────────────────────
  const originalitySignals: OriginalitySignal[] = [];

  // O1. Bespoke easing
  {
    const bezierRe = /cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)/gi;
    const EASING_PRESETS = new Set(['0.25,0.1,0.25,1', '0.42,0,1,1', '0,0,0.58,1', '0.42,0,0.58,1', '0.4,0,0.2,1', '0.4,0,0.6,1', '0,0,0.2,1', '0.4,0,1,1', '0.68,-0.55,0.265,1.55']);
    const distinct = new Set<string>();
    let hasOvershoot = false;
    let m: RegExpExecArray | null;
    while ((m = bezierRe.exec(css)) !== null) {
      const key = `${m[1]},${m[2]},${m[3]},${m[4]}`.replace(/(\.\d*?)0+(?=\D|$)/g, '$1').replace(/\s+/g, '');
      if (EASING_PRESETS.has(key)) continue;
      distinct.add(key);
      const y1 = parseFloat(m[2]), y2 = parseFloat(m[4]);
      if (y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1) hasOvershoot = true;
    }
    const linearSprings = css.match(/linear\(\s*[^)]{20,}\)/gi) || [];
    if (linearSprings.length > 0) hasOvershoot = true;
    const easingCount = distinct.size;
    if (easingCount >= 3) originalitySignals.push({ id: 'O1', label: 'Bespoke motion easing', points: 3 + (hasOvershoot ? 2 : 0), evidence: `${easingCount} custom easing curves${hasOvershoot ? ' incl. spring/overshoot physics' : ''}` });
    else if (easingCount >= 1) originalitySignals.push({ id: 'O1', label: 'Custom easing curve', points: 1, evidence: `${easingCount} custom easing curve${easingCount !== 1 ? 's' : ''}` });
  }

  // O2. Modern layout primitives
  {
    const hasClamp = /clamp\s*\(/.test(css);
    const hasContainer = /container-type\s*:|@container\b/.test(css);
    const hasSubgrid = /subgrid/.test(css);
    const modernCount = (hasClamp ? 1 : 0) + (hasContainer ? 1 : 0) + (hasSubgrid ? 1 : 0);
    if (modernCount >= 2) originalitySignals.push({ id: 'O2', label: 'Modern layout primitives', points: 2, evidence: ['clamp()', hasContainer ? 'container queries' : '', hasSubgrid ? 'subgrid' : ''].filter(Boolean).join(' + ') });
    else if (modernCount === 1) originalitySignals.push({ id: 'O2', label: 'Fluid/container layout', points: 1, evidence: hasClamp ? 'clamp()' : hasContainer ? 'container queries' : 'subgrid' });
  }

  // O3. Typographic detail
  {
    const typoFeats = css.match(/font-feature-settings\s*:|font-variant-numeric\s*:|hanging-punctuation\s*:|text-underline-offset\s*:|font-optical-sizing\s*:/gi) || [];
    if (typoFeats.length >= 2) originalitySignals.push({ id: 'O3', label: 'Typographic detail', points: 2, evidence: `${typoFeats.length} advanced type properties` });
    else if (typoFeats.length === 1) originalitySignals.push({ id: 'O3', label: 'Typographic detail', points: 1, evidence: typoFeats[0].split(':')[0] });
  }

  // O4. Tiered reduced-motion
  {
    const reducedMotion = /@media[^{]*prefers-reduced-motion/i.test(css);
    const blanketKill = /prefers-reduced-motion[\s\S]{0,200}\*\s*\{[^}]*animation\s*:\s*none/i.test(css);
    if (reducedMotion && !blanketKill) originalitySignals.push({ id: 'O4', label: 'Tiered reduced-motion', points: 1, evidence: 'targeted (not blanket) motion reduction' });
  }

  // O5. Advanced motion choreography
  {
    const scrollDriven = /animation-timeline\s*:|scroll-timeline\s*:|view-timeline\s*:|animation-range\s*:/i.test(css);
    const viewTransition = /::view-transition|view-transition-name\s*:/i.test(css);
    const keyframes = css.match(/@keyframes\s+[\w-]+/gi) || [];
    const distinctKeyframes = new Set(keyframes.map((k) => k.replace(/@keyframes\s+/i, '')));
    if (scrollDriven || viewTransition) originalitySignals.push({ id: 'O5', label: 'Advanced motion choreography', points: 2, evidence: scrollDriven ? 'scroll-driven animation' : 'view transitions' });
    else if (distinctKeyframes.size >= 3) originalitySignals.push({ id: 'O5', label: 'Multi-keyframe motion system', points: 1, evidence: `${distinctKeyframes.size} named keyframe animations` });
  }

  // O6. Bespoke iconography
  {
    const inlineSvg = html.match(/<svg[^>]*viewBox=/gi) || [];
    const svgSymbols = html.match(/<symbol[^>]*>/gi) || [];
    if (inlineSvg.length >= 3 || svgSymbols.length >= 2) originalitySignals.push({ id: 'O6', label: 'Bespoke iconography', points: 1, evidence: `${inlineSvg.length} inline SVGs${svgSymbols.length ? ` + ${svgSymbols.length} symbols` : ''}` });
  }

  // O7. Semantic design-token system
  {
    const SHADCN_FINGERPRINT = ['--background', '--foreground', '--card', '--popover', '--primary-foreground', '--ring', '--secondary', '--muted', '--accent', '--destructive', '--border', '--input'];
    const shadcnHits = SHADCN_FINGERPRINT.filter((t) => css.includes(t + ':')).length;
    const referencesTwPrimitives = /var\(--color-[a-z]+-\d{2,3}\)/i.test(css);
    const isShadcnTemplate = shadcnHits >= 6 || (shadcnHits >= 4 && referencesTwPrimitives);
    const customProps = css.match(/--[\w-]+\s*:/g) || [];
    const semanticTokens = customProps.filter((p) => /--(surface|ink|paper|signal|line|muted|elevation|radius|duration|ease|accent|foreground|space|gap|shadow|canvas|action|feedback|success|warning|danger|error|info|subtle|on-[a-z]+)/i.test(p));
    const primitiveHue = /--(?:color|colour)-[a-z]+-\d{2,3}\s*:/i;
    const semanticCount = isShadcnTemplate ? 0 : semanticTokens.filter((p) => !primitiveHue.test(p)).length;
    const hasLayering = /--(?:color|surface|accent|action|feedback)[\w-]*\s*:\s*var\(--/i.test(css);
    const hasTheming = /light-dark\(|prefers-color-scheme\s*:\s*dark|data-theme/i.test(css);
    let tokenPoints = 0;
    const tokenEvidence: string[] = [];
    if (semanticCount >= 8) { tokenPoints += 4; tokenEvidence.push(`${semanticCount} semantic tokens`); }
    else if (semanticCount >= 4) { tokenPoints += 2; tokenEvidence.push(`${semanticCount} semantic tokens`); }
    if (hasLayering) { tokenPoints += 2; tokenEvidence.push('primitive→semantic layering'); }
    if (hasTheming && semanticCount >= 4) { tokenPoints += 2; tokenEvidence.push('theme-aware tokens'); }
    if (tokenPoints > 0) originalitySignals.push({ id: 'O7', label: 'Semantic design tokens', points: Math.min(tokenPoints, 6), evidence: tokenEvidence.join(' · ') });
  }

  const ORIGINALITY_CAP = 8;
  const rawOriginality = originalitySignals.reduce((s, o) => s + o.points, 0);
  const slopGateApplied = slopTotal >= 12;
  const originalityPoints = Math.min(slopGateApplied ? Math.round(rawOriginality * 0.5) : rawOriginality, ORIGINALITY_CAP);
  const originalitySummary = originalitySignals.length > 0
    ? `${originalitySignals.length} craft signal${originalitySignals.length !== 1 ? 's' : ''} (+${originalityPoints}pts${rawOriginality > ORIGINALITY_CAP ? `, capped from +${rawOriginality}` : ''}${slopGateApplied ? ', slop-gated ×0.5' : ''})`
    : null;

  // ── Weighted scoring ─────────────────────────────────────────────────────
  const CATEGORY_WEIGHTS: Record<string, number> = {
    cadence: 18, accessibility: 15, semantic: 12, motion: 10, tokens: 9, takt: 8, poise: 7, identity: 6, interaction: 6, performance: 6, responsive: 3, security: 5, spec: 4, copywriting: 8,
  };

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
  }

  let score = weightedTotal === 0 ? 0 : Math.round((weightedPoints / weightedTotal) * 1000) / 10;

  if (slopTotal > 0) score = Math.max(0, score - slopTotal);
  if (originalityPoints > 0) score = Math.min(100, score + originalityPoints);

  // Per-category sub-scores
  const catAgg: Record<string, { wp: number; wt: number; pass: number; fail: number; warn: number; skip: number; manual: number }> = {};
  for (const c of checks) {
    const agg = catAgg[c.category] || (catAgg[c.category] = { wp: 0, wt: 0, pass: 0, fail: 0, warn: 0, skip: 0, manual: 0 });
    if (c.status === 'SKIP') { agg.skip += 1; continue; }
    if (c.status === 'MANUAL') { agg.manual += 1; continue; }
    const checkWeight = (CATEGORY_WEIGHTS[c.category] || 5) / (categoryCounts[c.category] || 1);
    agg.wt += checkWeight;
    if (c.status === 'PASS') { agg.wp += checkWeight; agg.pass += 1; }
    else if (c.status === 'WARN') { agg.wp += checkWeight * 0.5; agg.warn += 1; }
    else agg.fail += 1;
  }
  const categoryScores: Record<string, { score: number | null; weight: number; pass: number; fail: number; warn: number; skip: number; manual: number }> = {};
  for (const [cat, agg] of Object.entries(catAgg)) {
    categoryScores[cat] = {
      score: agg.wt === 0 ? null : Math.round((agg.wp / agg.wt) * 1000) / 10,
      weight: CATEGORY_WEIGHTS[cat] || 5,
      pass: agg.pass, fail: agg.fail, warn: agg.warn, skip: agg.skip, manual: agg.manual,
    };
  }

  // A11y floor: cap score at C (70) when any accessibility FAIL exists
  let a11yFloorApplied = false;
  for (const c of checks) {
    if (c.category === 'accessibility' && c.status === 'FAIL') {
      if (score > 70) { score = 70; a11yFloorApplied = true; }
      break;
    }
  }

  // Hard-fail ceilings for critical issues
  let hardFailCeilingApplied = false;
  let hardFailCeilingReason: string | null = null;
  for (const c of checks) {
    if (c.status !== 'FAIL') continue;
    let cap: number | null = null;
    let reason = '';
    if (c.id === 'v06') { cap = 65; reason = 'Contrast below WCAG minimum — text is unreadable for many users.'; }
    if (c.id === 'v22') { cap = 70; reason = 'Primary CTA contrast below WCAG AA — the most important interaction on the page is hard to read.'; }
    if (c.id === 'v02') { cap = 70; reason = 'Horizontal overflow detected — content is cut off or scrolls sideways on smaller viewports.'; }
    if (c.id === 'v24') { cap = 75; reason = 'Interactive elements below the 44px minimum touch target — inaccessible on touch devices.'; }
    if (c.id === 'v25') { cap = 75; reason = 'Multiple h1 elements or skipped heading levels — document outline is broken.'; }
    if (c.id === 'v16') { cap = 70; reason = 'Root font-size below 16px — triggers iOS Safari auto-zoom, breaks mobile UX.'; }
    if (cap !== null && score > cap) { score = cap; hardFailCeilingApplied = true; hardFailCeilingReason = reason; }
  }

  const grade = computeGrade(score);

  const checksWithRemediation = checks.map((c) => {
    const catWeight = CATEGORY_WEIGHTS[c.category] || 5;
    const isScored = c.status !== 'SKIP' && c.status !== 'MANUAL';
    const weight = isScored ? catWeight / (categoryCounts[c.category] || 1) : 0;
    return { ...c, weight: Math.round(weight * 1000) / 1000, remediation: REMEDIATION[c.id] };
  });

  return {
    score, grade, pass, fail, warn, skip, manual, total, scored: total - skip - manual,
    scope: effectiveScope, a11yFloorApplied, hardFailCeilingApplied, hardFailCeilingReason,
    categoryScores, checks: checksWithRemediation, tokensExtracted: Object.keys(rawTokens).length,
    slop: { total: slopTotal, findings: slopDeductions, convergences: slopConvergences },
    originality: { points: originalityPoints, signals: originalitySignals, summary: originalitySummary, slopGateApplied },
  };
}

// ── Emission formats ────────────────────────────────────────────────────────

export function emitDesignesy(result: ScoreResult): Record<string, unknown> {
  return { ok: true, contractVersion: 'v0.4.0', ...result };
}

export function emitCanonical(url: string, result: ScoreResult): Record<string, unknown> {
  return {
    schemaVersion: '1.0', generatedAt: new Date().toISOString(),
    tool: { name: 'designesy', version: 'v0.4.0' },
    subject: { type: 'url', requested: url, scope: result.scope },
    categories: Object.entries(result.categoryScores).map(([id, cs]) => ({ id, score: cs.score, weight: cs.weight, counts: { pass: cs.pass, fail: cs.fail, warn: cs.warn, skip: cs.skip, manual: cs.manual } })),
    findings: result.checks.map((c) => ({ id: c.id, item: c.item, category: c.category, status: c.status, severity: c.status === 'FAIL' ? 'error' : c.status === 'WARN' ? 'warning' : c.status === 'PASS' ? 'pass' : c.status === 'SKIP' ? 'skip' : 'manual', severityRaw: c.status, message: c.detail, detail: c.detail, remediation: c.remediation })),
    summary: {
      score: result.score, grade: result.grade,
      countsByStatus: { pass: result.pass, fail: result.fail, warn: result.warn, skip: result.skip, manual: result.manual },
      countsBySeverity: { error: result.fail, warning: result.warn, pass: result.pass, skip: result.skip, manual: result.manual, info: 0 },
      scored: result.scored, total: result.total, a11yFloorApplied: result.a11yFloorApplied,
      categoryScores: Object.fromEntries(Object.entries(result.categoryScores).map(([id, cs]) => [id, cs.score])),
    },
    verdict: result.fail > 0 ? 'fail' : result.warn > 0 ? 'needs-changes' : (result.pass === 0 && (result.skip + result.manual) === result.total) ? 'not-scored' : 'pass',
  };
}

export function emitGoogle(result: ScoreResult): Record<string, unknown> {
  return {
    findings: result.checks.map((c) => ({ severity: c.status === 'FAIL' ? 'error' : c.status === 'WARN' ? 'warning' : 'info', path: c.category, message: c.detail })),
    summary: { errors: result.fail, warnings: result.warn, infos: result.pass, score: result.score, grade: result.grade },
    designSystem: null,
  };
}

export function emitReview(url: string, result: ScoreResult): string {
  const lines: string[] = [];
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
  lines.push('## Findings\n');
  lines.push('| # | Severity | Domain | Location | Before | After | Why |');
  lines.push('|---|---|---|---|---|---|---|');
  let num = 0;
  for (const c of result.checks) {
    if (c.status === 'PASS' || c.status === 'SKIP' || c.status === 'MANUAL') continue;
    num++;
    const severity = c.status === 'FAIL' ? 'HIGH' : 'MEDIUM';
    const before = c.detail.replace(/\|/g, '\\|').substring(0, 80);
    const after = (c.remediation || '').replace(/\|/g, '\\|').substring(0, 80);
    const why = `${c.item} (${c.category})`.replace(/\|/g, '\\|');
    lines.push(`| ${num} | ${severity} | ${c.category} | ${url} | ${before} | ${after} | ${why} |`);
  }
  if (num === 0) lines.push('| — | — | — | — | No actionable findings | — | — |');
  lines.push('');
  lines.push('## Verdict\n');
  const verdict = result.fail > 0 ? 'fail' : result.warn > 0 ? 'needs-changes' : 'pass';
  if (verdict === 'fail') lines.push('**Block** — at least one HIGH finding (FAIL) remains.');
  else if (verdict === 'needs-changes') lines.push('**Needs changes** — only MEDIUM findings (WARN) remain.');
  else lines.push('**Approve** — no actionable findings remain.');
  lines.push('');
  lines.push(`**Score: ${result.score}% (Grade ${result.grade})** — ${result.pass} PASS / ${result.fail} FAIL / ${result.warn} WARN / ${result.manual} MANUAL / ${result.skip} N/A / ${result.total} total`);
  return lines.join('\n');
}