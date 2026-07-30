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
// Pro Plan: lifted from 20/hr to 100/hr. Results are cached 24h via
// unstable_cache, so the effective throughput is much higher — repeat
// scores for the same URL hit the Data Cache and cost nothing.

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

// ── APCA-W3 0.0.98G-4g — supplementary perceptual contrast ───────────────────
// Ported from Myndex/apca-w3 canonical source (W3-licensed for WCAG 3
// conformance tools). APCA is polarity-sensitive (unlike WCAG 2.1) and returns
// a signed Lc value: positive = dark text on light bg, negative = light text
// on dark bg. Use Math.abs(Lc) for threshold comparison. Attribution:
// Andrew Somers / Myndex Research.
// Thresholds (Bronze Simple Mode): Lc 75 body min, Lc 60 content, Lc 45 large.
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
  v24: 'Ensure all interactive elements (buttons, links, inputs) have a min-height and min-width of at least 44px (WCAG 2.5.8 Target Size Minimum, AA in 2.2). For small icon buttons, add padding or min-height to reach the 44px floor. The static check detects CSS min-height ≥44px on button/a/input selectors — full verification needs a browser.',
  v25: 'Use exactly one <h1> per page as the main heading, and don\'t skip heading levels (no h1→h3 jumps). Screen readers and SEO both rely on a logical heading outline. Audit your heading order with a browser extension or Lighthouse.',
  v26: 'Limit font-family declarations to 3 or fewer (1 body family, 1 heading family, 1 mono for code). More than 3 families signals inconsistency and hurts performance. Consolidate by removing unused families or using weight variations of a single family.',
  v27: 'Set input font-size to at least 16px (1rem) to prevent iOS Safari auto-zoom on focus. Inputs below 16px trigger a layout-shift zoom on iPhone that breaks the mobile UX. Use font-size: 1rem or larger on all input, textarea, and select elements.',
  v28: 'Constrain body/article/paragraph max-width to 45-75ch (66ch ideal) for readable line length. Lines longer than 75ch are hard to track; shorter than 45ch feels choppy. Use max-width: 66ch on prose containers.',
  v29: 'Structure design tokens in layers: primitive (raw values like --color-blue-500: #3b82f6), semantic (aliases like --color-accent: var(--color-blue-500)), and component (references like --button-bg: var(--color-accent)). At minimum, alias some tokens via var() so a color change propagates through the system. Full 3-tier architecture is DSAF A1.1 maturity level.',
  v34: 'EU AI Act Article 50(1) requires AI chatbots/agents to disclose their AI nature at the first interaction, accessible to people with disabilities (effective 2026-08-02). Fix options (any one): (1) add visible "AI Assistant" or "Chatbot" text in the chatbot UI header, (2) add aria-label="AI assistant" to the chatbot container, (3) add <meta name="generator" content="AI-powered"> to the page head, (4) add C2PA Content Credentials to AI-generated images, (5) add a persistent AI-disclosure badge in footer/header. US parallels: California AB 2659, Colorado AI Act (Feb 2026).',
  v35: 'Add a forced-colors readiness block: @media (forced-colors: active) { ... } with forced-color-adjust: none on elements that must preserve brand identity (logos, charts, semantic-color indicators). Windows High Contrast Mode and Chrome forced-colors recolor the page — without this media query, critical UI becomes illegible. Also ensure borders/outlines use currentColor or system colors so they adapt. Test with Windows HCM (Settings > Accessibility > Contrast themes).',
  v36: 'Remove UTS #39 confusable characters from CSS identifiers and token names. Confusables are Unicode characters from different scripts (Cyrillic, Greek, fullwidth) that look identical to ASCII letters — e.g. Cyrillic а (U+0430) looks like Latin a (U+0061). In token names they enable shadowing attacks (--соlor-bg with Cyrillic с vs --color-bg). Audit all custom property names, class names, and url() paths for non-ASCII characters using a Unicode confusable detector. Provenance: Unicode Technical Standard #39, Unicode 16.0.0. designesy is the only design verification engine that checks this surface.',
  v37: 'Publish a DESIGN.md file at /DESIGN.md in your repo root and serve it publicly. Google\'s @google/design.md CLI (v0.4.0, Apache-2.0) validates the file format — 11 lint rules covering broken token refs, missing primary colors, WCAG contrast, orphaned tokens, section order, and more. designesy integrates Google\'s linter as the spec layer and runs its own 34-check contract verification as the layer above. Install the CLI: npm install -g @google/design.md. Lint locally: npx @google/design.md lint DESIGN.md. Export to W3C DTCG: npx @google/design.md export --format dtcg DESIGN.md. Note: DESIGN.md uses sRGB hex only — for OKLCH/Display P3 color spaces, use the W3C DTCG JSON format directly.',
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
    // APCA supplementary signal (Lc 75 = body min, Lc 60 = content min)
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
// transition contexts. Contract: 0.96 cells, 0.985 cards, 0.995 large surfaces,
// all above the 0.95 floor. We look for scale(0.9[5-9]|0.99[0-9]) and confirm
// at least one press-scale exists; below-floor values (scale(0.8x-0.94)) FAIL.
function checkPressScale(css: string): CheckResult {
  // Strip @keyframes blocks — scale(0) inside a ripple/particle keyframe is a
  // legitimate animation starting point, not a press scale. We only care about
  // scale() in :active, transition, or component-rule contexts (the press feel).
  const stripped = css.replace(/@keyframes\s+[^{]+\{[^@]*?\}/gi, '');
  const allScales = stripped.match(/scale\(\s*([0-9.]+)\s*\)/gi) || [];
  const pressScales: number[] = [];
  let belowFloor = false;
  let belowVal = '';
  for (const m of allScales) {
    const num = parseFloat(m.replace(/scale\(\s*/i, '').replace(/\s*\)/, ''));
    if (isNaN(num)) continue;
    if (num < 1) {
      pressScales.push(num);
      if (num < 0.95 && num > 0) { belowFloor = true; belowVal = num.toString(); }
      // scale(0) in a transition is suspicious but likely a hidden/initial state,
      // not a press scale — treat as WARN signal, not FAIL.
      if (num === 0) { belowFloor = true; belowVal = num.toString(); }
    }
  }
  // scale(0) is only a FAIL if it's in an :active context (a real press scale
  // below the floor). Otherwise it's a WARN (likely an animation initial state
  // we couldn't fully strip, or a hidden element). Re-scan original CSS for
  // :active + scale(0) specifically.
  const activeScaleZero = /:active[^{]*\{[^}]*scale\(\s*0\s*\)/i.test(stripped);
  if (activeScaleZero) return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', status: 'FAIL', detail: 'found scale(0) in :active context — below 0.95 floor, reads as a glitch' };
  if (pressScales.filter(s => s > 0 && s < 0.95).length > 0) return { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', status: 'FAIL', detail: `found scale(${belowVal}) below 0.95 floor` };
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

// ── Tier 3 coverage checks (v24-v28) — high-impact gaps from the audit ──────

// v24 — Touch target sizes ≥44px (WCAG 2.5.8 Target Size Minimum, AA in 2.2).
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
  if (targets.length === 0) return { id: 'v24', item: 'Touch targets ≥44px on interactive elements (WCAG 2.5.8)', category: 'accessibility', status: 'WARN', detail: 'no explicit min-height/min-width on interactive selectors — full verification needs browser' };
  const below = targets.filter(t => t < 44);
  if (below.length > 0) return { id: 'v24', item: 'Touch targets ≥44px on interactive elements (WCAG 2.5.8)', category: 'accessibility', status: 'WARN', detail: `${targets.length} target(s) found, ${below.length} below 44px floor (${below.join(', ')}px)` };
  return { id: 'v24', item: 'Touch targets ≥44px on interactive elements (WCAG 2.5.8)', category: 'accessibility', status: 'PASS', detail: `${targets.length} interactive element(s) with min-height/width ≥44px` };
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
// has an AI-disclosure check. designesy can be first.
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
  const ITEM = 'DESIGN.md spec-layer validation (Google @google/design.md lint)';
  const CATEGORY = 'spec';

  // Attempt to fetch /DESIGN.md from the target origin. No public convention
  // exists — most sites don't serve it. "Not served" is SKIP, not FAIL.
  const parsed = new URL(targetUrl);
  const designMdUrl = `${parsed.protocol}//${parsed.host}/DESIGN.md`;

  let designMdContent: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(designMdUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      return {
        id: 'v37',
        item: ITEM,
        category: CATEGORY,
        status: 'SKIP',
        detail: `/DESIGN.md not publicly served (HTTP ${resp.status}). No public convention exists — this is expected. designesy scores the shipped CSS directly.`,
      };
    }
    designMdContent = await resp.text();
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
      detail: `could not fetch /DESIGN.md — designesy scores the shipped CSS directly (spec layer optional)`,
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
    const msg = e instanceof Error ? e.message : 'unknown error';
    return {
      id: 'v37',
      item: ITEM,
      category: CATEGORY,
      status: 'WARN',
      detail: `/DESIGN.md fetched but linter unavailable: ${msg}. The @google/design.md package may not be installed in this runtime.`,
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
    const msg = e instanceof Error ? e.message : 'unknown error';
    return {
      id: 'v37',
      item: ITEM,
      category: CATEGORY,
      status: 'WARN',
      detail: `/DESIGN.md fetched but lint failed: ${msg}. The file may use a format version the linter doesn't support yet.`,
    };
  }
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
    checkTouchTargets(css),
    checkHeadingHierarchy(html),
    checkFontFamilyCount(css),
    checkInputFontFloor(css),
    checkReadingWidth(css),
    checkTokenLayerDepth(tokens),
    checkAiDisclosure(html),
    checkForcedColors(css),
    checkSecurityConfusables(css, tokens),
  ];

  // v37 is async (fetches /DESIGN.md from the target origin and runs Google's
  // linter) — added after the synchronous checks array is built.
  checks.push(await checkDesignMdSpec(targetUrl));

  const pass = checks.filter((c) => c.status === 'PASS').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;
  const skip = checks.filter((c) => c.status === 'SKIP').length;
  const total = checks.length;

  // ── Tier 2: per-category weighted scoring ──────────────────────────────────
  // Weights follow the contract's section emphasis (the contract IS the scoring
  // basis), with an accessibility floor so contract sections covering real-user
  // harm cannot be drowned out by cadence's 8 checks. SKIPs fall out of BOTH
  // numerator and denominator (Lighthouse precedent: manual/N/A audits excluded).
  //
  // Weight table (sums to 100%, derived from AnySearch research against
  // Lighthouse axe user-impact, design-auditor category %, and DSAF 50/50):
  //   cadence 18, accessibility 15, semantic 12, motion 10, tokens 9,
  //   takt 8, poise 7, identity 6, interaction 6, performance 6, responsive 3
  const CATEGORY_WEIGHTS: Record<string, number> = {
    cadence: 18, accessibility: 15, semantic: 12, motion: 10, tokens: 9,
    takt: 8, poise: 7, identity: 6, interaction: 6, performance: 6, responsive: 3,
    security: 5, spec: 4,
  };

  // Per-check weight = category weight / number of checks in that category
  // (so each category contributes its full weight, split evenly among its checks).
  const categoryCounts: Record<string, number> = {};
  for (const c of checks) {
    if (c.status === 'SKIP') continue;
    categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
  }

  let weightedPoints = 0;
  let weightedTotal = 0;
  for (const c of checks) {
    if (c.status === 'SKIP') continue;
    const catWeight = CATEGORY_WEIGHTS[c.category] || 5;
    const checkWeight = catWeight / (categoryCounts[c.category] || 1);
    weightedTotal += checkWeight;
    if (c.status === 'PASS') weightedPoints += checkWeight;
    else if (c.status === 'WARN') weightedPoints += checkWeight * 0.5;
    // FAIL = 0 points
  }

  let score = weightedTotal === 0 ? 0 : Math.round((weightedPoints / weightedTotal) * 1000) / 10;

  // ── Per-category sub-scores (the constellation) ─────────────────────────
  // Each category gets its own 0-100 score using the same weighting rule as
  // the composite (PASS 1.0 / WARN 0.5 / FAIL 0, SKIP excluded). Categories
  // with zero scored checks report null so the client can render them as
  // "unscored" rather than fabricating a 0 or 100. This is the same math the
  // composite uses — one source of truth, no client-side re-derivation.
  const catAgg: Record<string, { wp: number; wt: number; pass: number; fail: number; warn: number; skip: number }> = {};
  for (const c of checks) {
    const agg = catAgg[c.category] || (catAgg[c.category] = { wp: 0, wt: 0, pass: 0, fail: 0, warn: 0, skip: 0 });
    if (c.status === 'SKIP') { agg.skip += 1; continue; }
    const checkWeight = (CATEGORY_WEIGHTS[c.category] || 5) / (categoryCounts[c.category] || 1);
    agg.wt += checkWeight;
    if (c.status === 'PASS') { agg.wp += checkWeight; agg.pass += 1; }
    else if (c.status === 'WARN') { agg.wp += checkWeight * 0.5; agg.warn += 1; }
    else agg.fail += 1; // FAIL
  }
  const categoryScores: Record<string, { score: number | null; weight: number; pass: number; fail: number; warn: number; skip: number }> = {};
  for (const [cat, agg] of Object.entries(catAgg)) {
    categoryScores[cat] = {
      score: agg.wt === 0 ? null : Math.round((agg.wp / agg.wt) * 1000) / 10,
      weight: CATEGORY_WEIGHTS[cat] || 5,
      pass: agg.pass,
      fail: agg.fail,
      warn: agg.warn,
      skip: agg.skip,
    };
  }

  // ── Tier 2: accessibility floor (DSAF enterprise-grade precedent) ──────────
  // DSAF enforces A8 Accessibility ≥75% — a system can score 90% combined and
  // still fail enterprise-grade if a11y is 73%. We apply a softer version: if
  // the accessibility category scores below 60%, cap the overall grade at C.
  // This prevents "perfect tokens, zero a11y = A" dishonesty.
  const a11yChecks = checks.filter((c) => c.category === 'accessibility' && c.status !== 'SKIP');
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

  const grade = computeGrade(score);

  // Attach remediation guidance to each check from the lookup table. Every
  // check id has an entry; the table is the single source of truth for "how
  // to fix this" so guidance stays consistent across PASS/FAIL/WARN/SKIP.
  const checksWithRemediation = checks.map((c) => ({
    ...c,
    remediation: REMEDIATION[c.id],
  }));

  return { score, grade, pass, fail, warn, skip, total, scored: total - skip, a11yFloorApplied, categoryScores, checks: checksWithRemediation, tokensExtracted: Object.keys(rawTokens).length };
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
    default: return status.toLowerCase();
  }
}

/** Derive the overall verdict from check results. */
function deriveVerdict(result: ScoreResult): string {
  if (result.fail > 0) return 'fail';
  if (result.warn > 0) return 'needs-changes';
  if (result.pass === 0 && result.skip === result.total) return 'not-scored';
  return 'pass';
}

/** Emission format: designesy (default, native shape — unchanged). */
function emitDesignesy(result: ScoreResult) {
  return { ok: true, ...result };
}

/** Emission format: canonical review-findings.json schema (the superset). */
function emitCanonical(url: string, result: ScoreResult) {
  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    tool: {
      name: 'designesy',
      version: 'v0.3.0',
    },
    subject: {
      type: 'url' as const,
      requested: url,
    },
    categories: Object.entries(result.categoryScores).map(([id, cs]) => ({
      id,
      score: cs.score,
      weight: cs.weight,
      counts: { pass: cs.pass, fail: cs.fail, warn: cs.warn, skip: cs.skip },
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
      countsByStatus: { pass: result.pass, fail: result.fail, warn: result.warn, skip: result.skip },
      countsBySeverity: {
        error: result.fail,
        warning: result.warn,
        pass: result.pass,
        skip: result.skip,
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
  };
}

/** Emission format: Google @google/design.md-compatible shape. */
function emitGoogle(result: ScoreResult) {
  return {
    findings: result.checks.map((c) => ({
      severity: c.status === 'FAIL' ? 'error' : c.status === 'WARN' ? 'warning' : c.status === 'PASS' ? 'info' : 'info',
      path: c.category,
      message: c.detail,
    })),
    summary: {
      errors: result.fail,
      warnings: result.warn,
      infos: result.pass,
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
  const domains = new Map<string, { pass: number; fail: number; warn: number; skip: number }>();
  for (const c of result.checks) {
    const d = domains.get(c.category) || { pass: 0, fail: 0, warn: 0, skip: 0 };
    if (c.status === 'PASS') d.pass++;
    else if (c.status === 'FAIL') d.fail++;
    else if (c.status === 'WARN') d.warn++;
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
    if (c.status === 'PASS' || c.status === 'SKIP') continue;
    num++;
    const severity = c.status === 'FAIL' ? 'HIGH' : 'MEDIUM';
    const before = c.detail.replace(/\|/g, '\\|').substring(0, 80);
    const after = (c.remediation || '').replace(/\|/g, '\\|').substring(0, 80);
    const why = `${c.item} (${c.category})`.replace(/\|/g, '\\|');
    lines.push(`| ${num} | ${severity} | ${c.category} | ${url} | ${before} | ${after} | ${why} |`);
  }
  if (num === 0) {
    lines.push('| — | — | — | — | No actionable findings | — | — |');
  }
  lines.push('');

  // Verdict
  lines.push('## Verdict\n');
  const verdict = deriveVerdict(result);
  if (verdict === 'fail') lines.push('**Block** — at least one HIGH finding (FAIL) remains.');
  else if (verdict === 'needs-changes') lines.push('**Needs changes** — only MEDIUM findings (WARN) remain.');
  else lines.push('**Approve** — no actionable findings remain.');
  lines.push('');
  lines.push(`**Score: ${result.score}% (Grade ${result.grade})** — ${result.pass} PASS / ${result.fail} FAIL / ${result.warn} WARN / ${result.skip} SKIP / ${result.total} total`);

  return lines.join('\n');
}

// ── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Maximum 100 scores per hour.' },
      { status: 429 }
    );
  }

  let body: { url?: unknown; format?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawUrl = typeof body.url === 'string' ? body.url : '';
  const url = normalizeInputUrl(rawUrl);
  const format = typeof body.format === 'string' ? body.format.toLowerCase() : 'designesy';

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

  try {
    const result = await scoreUrl(url);

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
      return NextResponse.json(emitCanonical(url, result), {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // default: designesy (native shape, unchanged)
    return NextResponse.json(
      emitDesignesy(result),
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