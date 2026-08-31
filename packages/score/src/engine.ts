/**
 * @designesy/score — 42-check design-contract scoring engine.
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
  v24: 'Ensure all interactive elements (buttons, links, inputs) have a min-height and min-width of at least 44px (WCAG 2.5.5 Target Size Enhanced, AAA; 2.5.8 Minimum AA is 24px — this check enforces the stricter bar). For small icon buttons, add padding or min-height to reach the 44px floor.',
  v25: 'Use exactly one <h1> per page as the main heading, and don\'t skip heading levels (no h1→h3 jumps). Screen readers and SEO both rely on a logical heading outline. Audit your heading order with a browser extension or Lighthouse.',
  v26: 'Limit font-family declarations to 3 or fewer (1 body family, 1 heading family, 1 mono for code). More than 3 families signals inconsistency and hurts performance. Consolidate by removing unused families or using weight variations of a single family.',
  v27: 'Set input font-size to at least 16px (1rem) to prevent iOS Safari auto-zoom on focus. Inputs below 16px trigger a layout-shift zoom on iPhone that breaks the mobile UX. Use font-size: 1rem or larger on all input, textarea, and select elements.',
  v28: 'Constrain body/article/paragraph max-width to 45-75ch (66ch ideal) for readable line length. Lines longer than 75ch are hard to track; shorter than 45ch feels choppy. Use max-width: 66ch on prose containers.',
  v29: 'Structure design tokens in layers: primitive (raw values like --color-blue-500: #3b82f6), semantic (aliases like --color-accent: var(--color-blue-500)), and component (references like --button-bg: var(--color-accent)). At minimum, alias some tokens via var() so a color change propagates through the system. Full 3-tier architecture is DSAF A1.1 maturity level.',
  v42: 'Name your color tokens by ROLE, not by hue. The contract names colors by what they mean: --ink (text), --paper (background), --surface (panels), --muted (secondary text), --signal (brand accent), --ok/--warn/--error (status). Hue names like --blue-500 or --slate-900 describe wavelength, not usage — when the brand palette shifts or dark mode lands, every hue-named reference must be hunted down and rewritten. Keep hue primitives in a separate tier and alias them to role tokens via var().',
  v43: 'Express UI states as semantic color roles: --ok/--success (verification pass), --warn/--warning (caution), --error/--danger (failure), --info (notice). The contract ships --ok, --warn, and --error for exactly this. Status colors named by state let components consume meaning — a score badge, a form error, and a toast all read the same token — and stay legible when the palette evolves.',
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
// Computes both WCAG 2.1 ratio (the scoring standard) AND APCA Lc (the
// WCAG 3 candidate, polarity-aware). APCA is supplementary — it does not
// change pass/fail, but surfaces dark-mode contrast issues WCAG 2.1 misses.
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
  if (worst.status === 'FAIL') return { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper (WCAG 2.1 + APCA)', category: 'accessibility', status: 'FAIL', detail: `${detail} — ${worst.name} below 3:1` };
  if (worst.status === 'WARN') return { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper (WCAG 2.1 + APCA)', category: 'accessibility', status: 'WARN', detail: `${detail} — ${worst.name} below 4.5:1 AA` };
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
// press-related contexts. Contract: 0.96 cells, 0.985 cards, 0.995 large surfaces,
// all above the 0.95 floor. We look for scale(0.9[5-9]|0.99[0-9]) and confirm
// at least one press-scale exists; below-floor values in :active contexts FAIL.
// Decorative below-floor scales (theme icons, hidden elements with opacity:0)
// are downgraded to WARN — they are not press-feedback glitches.
function checkPressScale(css: string): CheckResult {
  // Strip @keyframes blocks — scale(0) inside a ripple/particle keyframe is a
  // legitimate animation starting point, not a press scale.
  const stripped = css.replace(/@keyframes\s+[^{]+\{[^@]*?\}/gi, '');

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
    return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', status: 'FAIL', detail: `found scale(${activeBelowVal}) in :active context — below 0.95 floor, reads as a glitch` };
  }

  // Decorative below-floor scales: WARN (not a press glitch, but worth reviewing).
  if (decorativeBelowFloor.length > 0) {
    const realPressScales = pressScales.filter(s => s >= 0.95 && s < 1);
    if (realPressScales.length > 0) {
      const vals = realPressScales.map(s => s.toFixed(3)).join(', ');
      return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', status: 'PASS', detail: `${realPressScales.length} press-scale(s) found: ${vals}; ${decorativeBelowFloor.length} decorative scale(s) below floor (non-press, ignored)` };
    }
    return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', status: 'WARN', detail: `${decorativeBelowFloor.length} decorative scale(s) below 0.95 floor: ${decorativeBelowFloor.join(', ')} — not in :active context, but no valid press scales found` };
  }

  const realPressScales = pressScales.filter(s => s > 0);
  if (realPressScales.length > 0) {
    const vals = realPressScales.map(s => s.toFixed(3)).join(', ');
    return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', status: 'PASS', detail: `${realPressScales.length} press-scale(s) found: ${vals}` };
  }
  // Only scale(0) found (animation initial states) — not a press scale signal.
  if (pressScales.length > 0) return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', status: 'WARN', detail: 'only scale(0) found (animation initial states) — no press scale detected' };
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

// v24 — Touch target sizes ≥44px (WCAG 2.5.5 Target Size Enhanced, AAA; 2.5.8 Minimum AA is 24px — this check enforces the stricter bar).
// Static half: scans CSS for min-height/min-width ≥44px on interactive selectors.
// Full verification needs a browser (getBoundingClientRect on rendered elements).
function checkTouchTargets(css: string): CheckResult {
  // Look for min-height/min-width ≥ 44px on button, a, input, [role=button] selectors.
  const interactiveRe = /(?:^|[,}\s])\s*(?:button|a\b|input|textarea|select|\[role\s*=\s*["']?button["']?\]|\.btn|\.button|\.chip|\.tab|\.nav-link)\s*[^{]*\{[^}]*(?:min-height|min-width)\s*:\s*(\d+(?:\.\d+)?)(px|rem)/gim;
  const targets: number[] = [];
  let m;
  while ((m = interactiveRe.exec(css)) !== null) {
    const val = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    const px = unit === 'rem' ? val * 16 : val;
    targets.push(px);
  }
  if (targets.length === 0) return { id: 'v24', item: 'Touch targets ≥44px on interactive elements (WCAG 2.5.5 Enhanced)', category: 'accessibility', status: 'WARN', detail: 'no explicit min-height/min-width on interactive selectors — full verification needs browser' };
  const below = targets.filter(t => t < 44);
  if (below.length > 0) return { id: 'v24', item: 'Touch targets ≥44px on interactive elements (WCAG 2.5.5 Enhanced)', category: 'accessibility', status: 'WARN', detail: `${targets.length} target(s) found, ${below.length} below 44px floor (${below.join(', ')}px)` };
  return { id: 'v24', item: 'Touch targets ≥44px on interactive elements (WCAG 2.5.5 Enhanced)', category: 'accessibility', status: 'PASS', detail: `${targets.length} interactive element(s) with min-height/width ≥44px` };
}

// v25 — Heading hierarchy: single h1, no skipped levels (h1→h3 jump = fail).
// Scans HTML for heading order. design-auditor + Lighthouse heading-order check.
function checkHeadingHierarchy(html: string): CheckResult {
  const visibleHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const headings = [...visibleHtml.matchAll(/<h([1-6])\b/gi)];
  if (headings.length === 0) return { id: 'v25', item: 'Heading hierarchy: single h1, no skipped levels', category: 'accessibility', status: 'WARN', detail: 'no heading elements found — page may lack structure' };
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
function checkFontFamilyCount(css: string): CheckResult {
  const families = new Set<string>();
  const re = /font-family\s*:\s*([^;}]+)/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    // Normalize: strip quotes, take first family in a stack, lowercase.
    const stack = m[1].split(',')[0].trim().replace(/["']/g, '').toLowerCase();
    // Skip generic keywords that shouldn't count as "a family choice."
    const generic = ['inherit', 'initial', 'unset', 'revert', 'serif', 'sans-serif', 'monospace', 'system-ui', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica', 'arial'];
    if (generic.includes(stack)) continue;
    families.add(stack);
  }
  const count = families.size;
  const list = [...families].slice(0, 6).join(', ');
  if (count <= 3) return { id: 'v26', item: 'Font family count ≤3 (body + heading + mono)', category: 'cadence', status: 'PASS', detail: `${count} family/families: ${list}` };
  if (count <= 5) return { id: 'v26', item: 'Font family count ≤3 (body + heading + mono)', category: 'cadence', status: 'WARN', detail: `${count} families (recommended ≤3): ${list}` };
  return { id: 'v26', item: 'Font family count ≤3 (body + heading + mono)', category: 'cadence', status: 'FAIL', detail: `${count} families — palette drift (recommended ≤3): ${list}` };
}

// v27 — Input font-size 16px floor (iOS Safari auto-zoom prevention).
// Scans CSS for input/textarea/select font-size below 16px (1rem).
function checkInputFontFloor(css: string): CheckResult {
  // Find input/textarea/select rules with font-size < 16px or < 1rem.
  const inputRe = /(?:input|textarea|select|\.input|\.field)[^{]*\{[^}]*font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)/gi;
  const below: string[] = [];
  let m;
  while ((m = inputRe.exec(css)) !== null) {
    const val = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    const px = unit === 'rem' ? val * 16 : val;
    if (px < 16) below.push(`${val}${unit} (${px}px)`);
  }
  if (below.length === 0) {
    // Also check: is there a global input font-size ≥16px? (e.g. `input { font-size: 1rem }`)
    // The strict form `input\s*\{` matches standalone rules; the grouped form
    // `input,...,{` matches selectors merged by CSS minifiers (e.g. `input,textarea,select{font-size:1rem}`).
    const hasGlobalFloor = /input\s*\{[^}]*font-size\s*:\s*(?:1rem|16px|1\.0(?:\d+)?rem|[2-9]\dpx)/i.test(css)
      || /input\s*[,][^{]*\{[^}]*font-size\s*:\s*(?:1rem|16px|1\.0(?:\d+)?rem|[2-9]\dpx)/i.test(css);
    if (hasGlobalFloor) return { id: 'v27', item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)', category: 'accessibility', status: 'PASS', detail: 'input font-size floor detected' };
    return { id: 'v27', item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)', category: 'accessibility', status: 'WARN', detail: 'no explicit input font-size ≥16px detected — iOS Safari may auto-zoom on focus' };
  }
  return { id: 'v27', item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)', category: 'accessibility', status: 'FAIL', detail: `${below.length} input(s) below 16px floor: ${below.join(', ')}` };
}

// v28 — Reading width 45-75ch (design-auditor Reading Width module).
// Scans CSS for max-width in ch units on prose containers. 66ch ideal.
function checkReadingWidth(css: string): CheckResult {
  const chRe = /max-width\s*:\s*(\d+(?:\.\d+)?)ch/gi;
  const widths: number[] = [];
  let m;
  while ((m = chRe.exec(css)) !== null) {
    widths.push(parseFloat(m[1]));
  }
  if (widths.length === 0) return { id: 'v28', item: 'Reading width 45-75ch on prose containers', category: 'cadence', status: 'WARN', detail: 'no max-width in ch units found — line length may exceed 75ch on wide screens' };
  const inRange = widths.filter(w => w >= 45 && w <= 75);
  const outOfRange = widths.filter(w => w < 45 || w > 75);
  if (inRange.length > 0 && outOfRange.length === 0) return { id: 'v28', item: 'Reading width 45-75ch on prose containers', category: 'cadence', status: 'PASS', detail: `${inRange.length} measure(s) in 45-75ch range: ${inRange.join(', ')}ch` };
  if (inRange.length > 0) return { id: 'v28', item: 'Reading width 45-75ch on prose containers', category: 'cadence', status: 'PASS', detail: `${inRange.length} in range, ${outOfRange.length} out: ${widths.join(', ')}ch` };
  return { id: 'v28', item: 'Reading width 45-75ch on prose containers', category: 'cadence', status: 'WARN', detail: `${widths.length} ch-measure(s) found, all outside 45-75ch: ${widths.join(', ')}ch` };
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
    return { id: 'v29', item: 'Token architecture: primitive → semantic → component layers', category: 'tokens', status: 'WARN', detail: `${primitiveCount} primitive token(s), zero var() references — no aliasing layer` };
  }
  const layers = (primitiveCount > 0 ? 1 : 0) + (semanticCount > 0 ? 1 : 0) + (componentCount > 0 ? 1 : 0);
  const detail = `${layers} layer(s): ${primitiveCount} primitive, ${semanticCount} semantic, ${componentCount} component`;
  if (layers >= 3) {
    return { id: 'v29', item: 'Token architecture: primitive → semantic → component layers', category: 'tokens', status: 'PASS', detail: `${detail} — full 3-tier architecture (DSAF A1.1 maturity)` };
  }
  if (layers >= 2) {
    return { id: 'v29', item: 'Token architecture: primitive → semantic → component layers', category: 'tokens', status: 'PASS', detail: `${detail} — 2-tier aliasing detected` };
  }
  return { id: 'v29', item: 'Token architecture: primitive → semantic → component layers', category: 'tokens', status: 'WARN', detail: `${detail} — only 1 layer, no aliasing` };
}

// ── Semantic category checks (v42, v43) ─────────────────────────────────────
// Mirrors apps/site/app/api/score/route.ts — wired 2026-08-30. Scores whether
// the site's color system speaks in ROLES (meaning) rather than hues. WARN-only
// (style-craft, not user harm); self-SKIPs when there are no color tokens.
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

function checkSemanticColorVocabulary(tokens: Record<string, string>): CheckResult {
  const item = 'Semantic color vocabulary: role-named tokens, not hue-named';
  const colorTokens = Object.entries(tokens).filter(([, v]) => isColorValue(v));
  if (colorTokens.length < 4) {
    return { id: 'v42', item, category: 'semantic', status: 'SKIP', detail: `too few color tokens to assess (${colorTokens.length})` };
  }
  let role = 0;
  let hue = 0;
  for (const [name] of colorTokens) {
    const c = classifyColorToken(name);
    if (c === 'role') role++;
    else if (c === 'hue') hue++;
  }
  const named = role + hue;
  if (named === 0) {
    return { id: 'v42', item, category: 'semantic', status: 'SKIP', detail: `${colorTokens.length} color tokens, all neutrally named — vocabulary unclassifiable` };
  }
  const share = Math.round((role / named) * 100);
  if (role >= 3 && share >= 60) {
    return { id: 'v42', item, category: 'semantic', status: 'PASS', detail: `${role} role-named vs ${hue} hue-named color tokens (${share}% role share) — color speaks in meaning` };
  }
  return { id: 'v42', item, category: 'semantic', status: 'WARN', detail: `${role} role-named vs ${hue} hue-named color tokens (${share}% role share) — color vocabulary leans on hue names` };
}

function checkSemanticStatusRoles(tokens: Record<string, string>): CheckResult {
  const item = 'Semantic status colors: ok/warn/error/info state roles present';
  const colorTokens = Object.entries(tokens).filter(([, v]) => isColorValue(v));
  if (colorTokens.length === 0) {
    return { id: 'v43', item, category: 'semantic', status: 'SKIP', detail: 'no color tokens in :root' };
  }
  const families: Record<string, boolean> = { ok: false, warn: false, error: false, info: false };
  for (const [name] of colorTokens) {
    const segments = name.toLowerCase().split(/[-_]/);
    if (segments.some((s) => ['ok', 'success', 'pass', 'positive'].includes(s))) families.ok = true;
    if (segments.some((s) => ['warn', 'warning', 'caution'].includes(s))) families.warn = true;
    if (segments.some((s) => ['error', 'danger', 'fail', 'critical', 'negative'].includes(s))) families.error = true;
    if (segments.some((s) => ['info', 'notice', 'informational'].includes(s))) families.info = true;
  }
  const found = Object.entries(families).filter(([, v]) => v).map(([k]) => k);
  const missing = Object.entries(families).filter(([, v]) => !v).map(([k]) => k);
  if (found.length >= 3) {
    return { id: 'v43', item, category: 'semantic', status: 'PASS', detail: `${found.length}/4 status families present (${found.join(', ')}) — states expressed as semantic roles` };
  }
  return { id: 'v43', item, category: 'semantic', status: 'WARN', detail: `${found.length}/4 status families present${found.length ? ` (${found.join(', ')})` : ''} — missing: ${missing.join(', ')}` };
}

// v34 — AI-Disclosure Readiness (EU AI Act Article 50, effective 2026-08-02).
// Static-only v1: scans fetched HTML for AI-interactive surfaces (chatbots,
// AI agents, AI-generated content) and disclosure signals (visible labels,
// aria-label, C2PA meta, generator meta, JSON-LD, data-ai-disclosure).
// Four conditions:
//   A — no AI surface detected → PASS (disclosure not required)
//   B — AI surface + disclosure signal → PASS
//   C — AI surface + NO disclosure → FAIL (Art 50 violation)
//   D — uncertain (possible AI surface) → WARN (manual review)
// Green-field check: no competitor (Mozaika, Lighthouse, axe, WAVE, DESIGN.md)
// has an AI-disclosure check. Designesy can be first.
function checkAiDisclosure(html: string): CheckResult {
  const ITEM = 'AI-Disclosure Readiness (EU AI Act Art 50, effective 2026-08-02)';
  const CATEGORY = 'identity';

  // Strip scripts/styles for visible-text checks but keep them for script-src
  // and JSON-LD detection. We use both raw html and a visible-only variant.
  const visibleHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  // Text-only: strip all tags so attribute values like class="chatbot" don't
  // false-positive as disclosure TEXT. Disclosure text must be human-readable
  // content between tags, not class/id/aria attribute values.
  const textOnly = visibleHtml.replace(/<[^>]+>/g, ' ');

  // ── AI-surface detection ────────────────────────────────────────────────
  const chatbotContainerRe = /<(?:iframe|div|section|aside)\b[^>]*(?:class|id)\s*=\s*["'][^"']*\b(?:chatbot|chat-bot|ai-assistant|ai_chat|assistant-widget|intercom|drift|zendesk-chat|tawk(?:\.to)?|crisp\.chat|livechat|chat-widget|chat-container)\b/i;
  const aiScriptRe = /<script\b[^>]*src\s*=\s*["'][^"']*\b(?:chatbot|assistant|ai-widget|gpt|claude|gemini|dialogflow|rasa|intercom|drift|tawk|crisp|livechat|chatbot\.ai|conversational)\b/i;
  const aiTextRe = /\b(?:chat\s*with\s*(?:ai|our\s*bot|ai\s*assistant)|ask\s+ai|ai\s+assistant|talk\s+to\s+(?:our\s+)?bot|powered\s+by\s+ai|ai-generated|ai\s+chatbot|virtual\s+assistant)\b/i;
  const aiInputRe = /<(?:input|textarea|form)\b[^>]*(?:placeholder|aria-label)\s*=\s*["'][^"']*\b(?:ask\s+ai|message\s+ai|chat\s+with\s+ai|ai\s+assistant)\b/i;

  const surfaceSignals: string[] = [];
  if (chatbotContainerRe.test(html)) surfaceSignals.push('chatbot container');
  if (aiScriptRe.test(html)) surfaceSignals.push('AI widget script');
  if (aiTextRe.test(textOnly)) surfaceSignals.push('AI prompt text');
  if (aiInputRe.test(html)) surfaceSignals.push('AI input');

  // ── Disclosure detection ────────────────────────────────────────────────
  const disclosureTextRe = /\b(?:ai\s+assistant|ai\s+chatbot|ai-powered|powered\s+by\s+ai|automated\s+assistant|virtual\s+assistant|chatbot)\b/i;
  const ariaDisclosureRe = /aria-(?:label|description)\s*=\s*["'][^"']*\b(?:ai|assistant|bot|automated|chatbot)\b/i;
  const generatorMetaRe = /<meta\s+name\s*=\s*["']generator["'][^>]*content\s*=\s*["'][^"']*\b(?:ai|gpt|claude|gemini|llm|generated|artificial\s+intelligence)\b/i;
  const c2paRe = /(?:<link\s+rel\s*=\s*["']c2pa-manifest["']|<meta\s+name\s*=\s*["']c2pa["'])/i;
  const jsonldAiRe = /<script\s+type\s*=\s*["']application\/ld\+json["'][\s\S]*?"@type"\s*:\s*"[^"]*\b(?:ai|softwareapplication)\b[^"]*"[\s\S]*?(?:"applicationCategory"\s*:\s*"[^"]*ai[^"]*"|"[^"]*ai[^"]*")/i;
  const dataAiRe = /data-ai-disclosure\s*=/i;

  const disclosureSignals: string[] = [];
  if (disclosureTextRe.test(textOnly)) disclosureSignals.push('visible AI text');
  if (ariaDisclosureRe.test(html)) disclosureSignals.push('aria-label');
  if (generatorMetaRe.test(html)) disclosureSignals.push('generator meta');
  if (c2paRe.test(html)) disclosureSignals.push('C2PA manifest');
  if (jsonldAiRe.test(html)) disclosureSignals.push('JSON-LD');
  if (dataAiRe.test(html)) disclosureSignals.push('data-ai-disclosure');

  // ── Condition evaluation ────────────────────────────────────────────────
  if (surfaceSignals.length === 0) {
    const ambiguousRe = /<(?:iframe|div|section)\b[^>]*(?:class|id)\s*=\s*["'][^"']*\b(?:contact-widget|smart-search|virtual-agent|message-us|help-widget)\b/i;
    if (ambiguousRe.test(html)) {
      return { id: 'v34', item: ITEM, category: CATEGORY, status: 'WARN', detail: 'possible AI-interactive surface (ambiguous widget) — manual review recommended for Art 50 compliance' };
    }
    return { id: 'v34', item: ITEM, category: CATEGORY, status: 'PASS', detail: 'no AI-interactive surface detected — disclosure not required' };
  }

  if (disclosureSignals.length > 0) {
    return { id: 'v34', item: ITEM, category: CATEGORY, status: 'PASS', detail: `AI surface detected (${surfaceSignals.join(', ')}); disclosure present (${disclosureSignals.join(', ')})` };
  }

  return { id: 'v34', item: ITEM, category: CATEGORY, status: 'FAIL', detail: `AI-interactive surface detected (${surfaceSignals.join(', ')}) but no disclosure found — EU AI Act Art 50(1) requires disclosure at first interaction` };
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
  const hasForcedColorsMedia = /@media[^{]*forced-colors\s*:\s*active/i.test(css);
  // Secondary signal: forced-color-adjust property used anywhere
  const hasForcedColorAdjust = /forced-color-adjust\s*:/i.test(css);
  // Tertiary signal: -ms-high-contrast (legacy Edge/IE) — still relevant
  const hasHighContrast = /@media[^{]*-ms-high-contrast/i.test(css);

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
    return { id: 'v35', item: ITEM, category: CATEGORY, status: 'WARN', detail: 'legacy -ms-high-contrast media query present — modernize to @media (forced-colors: active) and add forced-color-adjust: none on brand-critical elements' };
  }
  if (hasForcedColorAdjust) {
    return { id: 'v35', item: ITEM, category: CATEGORY, status: 'WARN', detail: 'forced-color-adjust used but no @media (forced-colors: active) block — add the media query guard' };
  }
  return { id: 'v35', item: ITEM, category: CATEGORY, status: 'WARN', detail: 'no forced-colors media query or forced-color-adjust detected — Windows HCM users may see illegible UI' };
}

// Scan a string for confusable characters. Returns array of { char, pos,
// ascii } for each confusable found.
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
  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  const urlConfusables: string[] = [];
  const scannedUrls = new Set<string>();
  while ((m = urlRe.exec(css)) !== null) {
    const urlPath = m[1];
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
      detail: `scanned ${Object.keys(tokens).length} token names, ${scannedClasses.size} classes, ${scannedIds.size} ids, ${scannedUrls.size} url refs — no UTS #39 confusables detected (Unicode 16.0.0)`,
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
      detail: `${totalConfusables} confusable(s) found — ${allFindings.slice(0, 5).join('; ')}${allFindings.length > 5 ? ` (+${allFindings.length - 5} more)` : ''}. Token-name confusables enable shadowing attacks: a --соlor-bg token (Cyrillic с) looks identical to --color-bg but resolves to a different value.`,
    };
  }

  return {
    id: 'v36',
    item: ITEM,
    category: CATEGORY,
    status: 'WARN',
    detail: `${totalConfusables} confusable(s) in identifiers/urls — ${allFindings.slice(0, 5).join('; ')}${allFindings.length > 5 ? ` (+${allFindings.length - 5} more)` : ''}. No token names affected, but class/id/url confusables can spoof UI elements or redirect asset loads.`,
  };
}

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


function checkButtonTextVerb(html: string): CheckResult {
  const ITEM = 'Button text is a verb phrase or recognized command — not a bare noun';
  const CATEGORY = 'copywriting';

  // Extract <button> and [role="button"] text content
  const buttonRe = /<button[^>]*>([\s\S]*?)<\/button>/gi;
  const roleButtonRe = /<(?:a|div|span)[^>]*role=["']button["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/gi;

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

  const buttonTexts: string[] = [];
  let m;
  // Strip keyboard shortcut hints that are fused to or appended after the
  // button label — e.g. "Find⌘K", "Search ⌘+K", "Save Ctrl+S". These are
  // visual hints, not part of the verb. Ranges: ⌘ (U+2318), ⌃ (U+2303),
  // ⌥ (U+2325), ⇧ (U+21E7), and common "Ctrl+", "Cmd+", "Shift+" prefixes.
  const SHORTCUT_RE = /[\s]*[\u2303\u2318\u2325\u21E7\u21E7\u2387].*$/i;
  const TEXT_SHORTCUT_RE = /[\s]*(?:Ctrl|Cmd|Shift|Alt|Option|Command)\s*\+.*$/i;
  while ((m = buttonRe.exec(html)) !== null) {
    let text = m[1].replace(/<[^>]*>/g, '').trim();
    // Strip leading icon characters so "✕Close" → "Close"
    text = text.replace(ICON_PREFIX_RE, '').trim();
    // Strip trailing keyboard shortcut hints so "Find⌘K" → "Find"
    text = text.replace(SHORTCUT_RE, '').replace(TEXT_SHORTCUT_RE, '').trim();
    // Icon-only button with an accessible name: use the aria-label verb.
    if (!text) {
      const aria = /aria-label=["']([^"']+)["']/i.exec(m[0]);
      if (aria) text = aria[1].trim();
    }
    if (text) buttonTexts.push(text);
  }
  while ((m = roleButtonRe.exec(html)) !== null) {
    let text = m[1].replace(/<[^>]*>/g, '').trim();
    text = text.replace(ICON_PREFIX_RE, '').trim();
    text = text.replace(SHORTCUT_RE, '').replace(TEXT_SHORTCUT_RE, '').trim();
    if (!text) {
      const aria = /aria-label=["']([^"']+)["']/i.exec(m[0]);
      if (aria) text = aria[1].trim();
    }
    if (text) buttonTexts.push(text);
  }

  if (buttonTexts.length === 0) {
    return { id: 'v38', item: ITEM, category: CATEGORY, status: 'SKIP', detail: 'no button elements found in HTML' };
  }

  const violations: string[] = [];
  for (const text of buttonTexts) {
    // Skip text that's clearly not a button label — if it's longer than ~40 chars
    // it's likely a regex false positive from nested content (e.g. a div
    // containing a whole section being matched as role="button")
    if (text.length > 40) continue;
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) continue;
    const firstWord = words[0].toLowerCase();

    // Allow recognized single-word commands
    if (RECOGNIZED_BUTTON_COMMANDS.has(firstWord)) continue;
    // Allow if first word is verb-like
    if (isVerbLike(firstWord)) continue;
    // Allow "Get X", "Set X", "Try X" patterns (Get/Set/Try are in the set)
    // If we get here, the first word is likely a noun → potential violation
    violations.push(`"${text}"`);
  }

  if (violations.length === 0) {
    return { id: 'v38', item: ITEM, category: CATEGORY, status: 'PASS', detail: `${buttonTexts.length} button(s) checked — all start with a verb or recognized command` };
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

  const buttonRe = /<button[^>]*>([\s\S]*?)<\/button>/gi;
  const labelRe = /<label[^>]*>([\s\S]*?)<\/label>/gi;
  const tabRe = /<[a-z]+[^>]*role=["']tab["'][^>]*>([\s\S]*?)<\/[a-z]+>/gi;

  const texts: { type: string; text: string }[] = [];
  let m;
  while ((m = buttonRe.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]*>/g, '').trim();
    if (text) texts.push({ type: 'button', text });
  }
  while ((m = labelRe.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]*>/g, '').trim();
    if (text) texts.push({ type: 'label', text });
  }
  while ((m = tabRe.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]*>/g, '').trim();
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
    return { id: 'v39', item: ITEM, category: CATEGORY, status: 'PASS', detail: `${texts.length} element(s) checked — no trailing periods on buttons, labels, or tabs` };
  }
  return {
    id: 'v39',
    item: ITEM,
    category: CATEGORY,
    status: 'WARN',
    detail: `${violations.length}/${texts.length} element(s) have trailing periods: ${violations.slice(0, 3).map(v => `"${v.text}"`).join(', ')}${violations.length > 3 ? ` (+${violations.length - 3} more)` : ''}. Microsoft Fluent: "Don't end text for buttons, radio buttons, labels, or checkboxes with a period."`,
  };
}

const NON_DESCRIPTIVE_LINK_TEXT = /^(click here|here|learn more|read more|more|link|this|that|continue|see more|view details)$/i;


function checkLinkTextDescriptive(html: string): CheckResult {
  const ITEM = 'Link text is descriptive — not bare "click here", "learn more", "here"';
  const CATEGORY = 'copywriting';

  const linkRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  const linkTexts: string[] = [];
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]*>/g, '').trim();
    if (text) linkTexts.push(text);
  }

  if (linkTexts.length === 0) {
    return { id: 'v40', item: ITEM, category: CATEGORY, status: 'SKIP', detail: 'no anchor elements found in HTML' };
  }

  const violations = linkTexts.filter(t => NON_DESCRIPTIVE_LINK_TEXT.test(t));

  if (violations.length === 0) {
    return { id: 'v40', item: ITEM, category: CATEGORY, status: 'PASS', detail: `${linkTexts.length} link(s) checked — all have descriptive text` };
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
  const elementRe = /<(button|a|label|td|th|p|li|h[1-6])\s([^>]*?)>([\s\S]*?)<\/\1>/gi;
  const violations: string[] = [];
  let m;
  while ((m = elementRe.exec(html)) !== null) {
    const attrs = m[2] || '';
    const text = m[3].replace(/<[^>]*>/g, '').trim();
    if (!text || text.length < 4) continue;

    // Skip eyebrow labels (class contains "eyebrow" or "label" — per typography
    // contract, eyebrows are intentionally uppercase)
    if (/class=["'][^"']*(eyebrow|eyebro|meta-label)[^"']*["']/i.test(attrs)) continue;
    // Skip elements with text-transform: uppercase in inline style
    if (/style=["'][^"']*text-transform:\s*uppercase[^"']*["']/i.test(attrs)) continue;

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
    checkSemanticColorVocabulary(tokens),
    checkSemanticStatusRoles(tokens),
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