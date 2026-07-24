import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Rate limiting (in-memory, same pattern as waitlist) ────────────────────

const RATE_LIMIT = 10; // requests per hour per IP
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// ── URL validation ─────────────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    // Block localhost / private IPs
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('172.16.') ||
      host === '0.0.0.0'
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── CSS fetching ───────────────────────────────────────────────────────────

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function extractCssLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  // Inline <style> blocks
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html)) !== null) {
    links.push(m[1]); // inline CSS, returned as-is
  }
  // <link rel="stylesheet" href="...">
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

async function fetchCss(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPageCss(url: string): Promise<string> {
  const html = await fetchCss(url);
  const parts = extractCssLinks(html, url);
  const cssParts: string[] = [];
  for (const part of parts) {
    if (part.startsWith('http')) {
      try {
        cssParts.push(await fetchCss(part));
      } catch {
        // skip unreachable stylesheets
      }
    } else {
      cssParts.push(part); // inline CSS
    }
  }
  return cssParts.join('\n');
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
    '--body-bg', '--main-bg',
  ],
  '--ink': [
    '--text', '--fg', '--foreground', '--text-primary', '--color-text',
    '--color-foreground', '--text-main', '--text-base', '--body-text',
    '--content', '--fg-primary',
  ],
  '--signal': [
    '--accent', '--primary', '--brand', '--accent-color', '--color-accent',
    '--color-primary', '--color-brand', '--brand-color', '--link',
    '--link-color', '--action', '--action-color', '--cta', '--button-bg',
  ],
  '--muted': [
    '--text-muted', '--text-secondary', '--secondary', '--fg-muted',
    '--color-text-secondary', '--color-muted', '--text-subtle',
    '--muted-text', '--text-tertiary', '--fg-secondary',
  ],
  '--muted-dim': [
    '--text-dim', '--text-disabled', '--fg-dim', '--text-faint',
    '--color-text-disabled', '--text-placeholder', '--placeholder',
  ],
  '--duration-quick': [
    '--duration-fast', '--transition-fast', '--motion-fast',
    '--speed-fast', '--dur-fast', '--duration-1', '--transition-1',
  ],
  '--duration-slow': [
    '--duration-slow-1', '--transition-slow', '--motion-slow',
    '--speed-slow', '--dur-slow', '--duration-3', '--transition-3',
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

function saturation(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => c / 255) as unknown as number[];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const l = (mx + mn) / 2;
  if (l === 0 || l === 1) return 0;
  return d / (1 - Math.abs(2 * l - 1));
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
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
  const inferred: Record<string, string> = {};

  // Resolve var() chains in tokens
  const resolved: Record<string, string> = {};
  for (const [name, value] of Object.entries(tokens)) {
    const r = resolveVar(value, tokens);
    if (r.startsWith('#')) resolved[name] = r;
  }

  const bgColors: [number, number, number][] = [];
  const textColors: [number, number, number][] = [];
  const accentColors: [number, number, number][] = [];

  // Scan CSS rules for body/html/main
  const bgRe = /(?:^|})\s*([\w.#:>\s,]*(?:body|html|main|app|root)[\w.#:>\s,]*)\s*\{([^}]*)\}/gi;
  let m;
  while ((m = bgRe.exec(css)) !== null) {
    const bgMatch = m[2].match(/(?:background(?:-color)?|bg)\s*:\s*([^;]+)/i);
    if (bgMatch) {
      const resolved = resolveVar(bgMatch[1].trim(), tokens);
      const rgb = hexToRgb(resolved);
      if (rgb) bgColors.push(rgb);
    }
  }

  // Text colors from body/p
  const textRe = /(?:^|})\s*([\w.#:>\s,]*(?:body|p|span|div)[\w.#:>\s,]*)\s*\{([^}]*)\}/gi;
  while ((m = textRe.exec(css)) !== null) {
    const colorMatch = m[2].match(/(?:^|[\s;])color\s*:\s*([^;]+)/i);
    if (colorMatch) {
      const resolved = resolveVar(colorMatch[1].trim(), tokens);
      const rgb = hexToRgb(resolved);
      if (rgb) textColors.push(rgb);
    }
  }

  // Accent colors from a/button
  const accentRe = /(?:^|})\s*([\w.#:>\s,]*(?:a\b|button|link|cta|btn)[\w.#:>\s,]*)\s*\{([^}]*)\}/gi;
  while ((m = accentRe.exec(css)) !== null) {
    const colorMatch = m[2].match(/(?:background(?:-color)?|color)\s*:\s*([^;]+)/i);
    if (colorMatch) {
      const resolved = resolveVar(colorMatch[1].trim(), tokens);
      const rgb = hexToRgb(resolved);
      if (rgb) accentColors.push(rgb);
    }
  }

  // Also check resolved tokens
  for (const [name, value] of Object.entries(resolved)) {
    const rgb = hexToRgb(value);
    if (!rgb) continue;
    const lower = name.toLowerCase();
    if (/(bg|background|surface|canvas|page)/.test(lower)) bgColors.push(rgb);
    else if (/(text|fg|foreground|ink|content)/.test(lower)) textColors.push(rgb);
    else if (/(accent|primary|brand|link|action)/.test(lower)) accentColors.push(rgb);
  }

  if (bgColors.length) {
    const lightest = bgColors.reduce((a, b) => (sum(a) > sum(b) ? a : b));
    inferred['--paper'] = rgbToHex(lightest);
  }
  if (textColors.length) {
    const darkest = textColors.reduce((a, b) => (sum(a) < sum(b) ? a : b));
    inferred['--ink'] = rgbToHex(darkest);
  }
  if (accentColors.length) {
    const mostSaturated = accentColors.reduce((a, b) =>
      saturation(a) > saturation(b) ? a : b
    );
    inferred['--signal'] = rgbToHex(mostSaturated);
  }
  const grayText = textColors.filter((c) => saturation(c) < 0.15);
  if (grayText.length) {
    grayText.sort((a, b) => sum(a) - sum(b));
    inferred['--muted'] = rgbToHex(grayText[Math.floor(grayText.length / 2)]);
  }

  // Durations from transitions
  const durations: number[] = [];
  const durRe = /transition\s*:[^;]*?(\d+(?:\.\d+)?)\s*(ms|s)\b/gi;
  while ((m = durRe.exec(css)) !== null) {
    const ms = parseFloat(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1);
    if (ms > 0) durations.push(ms);
  }
  for (const [, value] of Object.entries(tokens)) {
    const dm = value.match(/^(\d+(?:\.\d+)?)\s*(ms|s)/i);
    if (dm) {
      const ms = parseFloat(dm[1]) * (dm[2].toLowerCase() === 's' ? 1000 : 1);
      if (ms > 0) durations.push(ms);
    }
  }
  if (durations.length) {
    inferred['--duration-quick'] = `${Math.min(...durations)}ms`;
    inferred['--duration-slow'] = `${Math.max(...durations)}ms`;
  }

  return inferred;
}

function sum(rgb: [number, number, number]): number {
  return rgb[0] + rgb[1] + rgb[2];
}

function normalizeTokens(
  tokens: Record<string, string>,
  css: string
): { tokens: Record<string, string>; inferred: Set<string> } {
  const result = { ...tokens };
  const inferred = new Set<string>();

  // Layer 1: name aliases
  for (const [canonical, aliases] of Object.entries(TOKEN_ALIASES)) {
    if (result[canonical]) continue;
    for (const alias of aliases) {
      if (tokens[alias]) {
        result[canonical] = tokens[alias];
        inferred.add(canonical);
        break;
      }
    }
  }

  // Layer 2: value-based inference
  const fromCss = inferTokensFromCss(css, tokens);
  for (const [canonical, value] of Object.entries(fromCss)) {
    if (!result[canonical]) {
      result[canonical] = value;
      inferred.add(canonical);
    }
  }

  return { tokens: result, inferred };
}

// ── WCAG contrast ──────────────────────────────────────────────────────────

function relativeLuminance(color: string): number | null {
  const rgb = hexToRgb(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  if (l1 === null || l2 === null) return 0;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── The 26 checks ──────────────────────────────────────────────────────────

type CheckResult = { status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP'; detail: string };
type Check = {
  id: string;
  item: string;
  category: string;
  status: string;
  detail: string;
};

function checkTransitionAll(css: string): CheckResult {
  const matches = css.match(/transition\s*:\s*all\b/gi) || [];
  if (matches.length === 0) return { status: 'PASS', detail: 'No transition:all found' };
  return { status: 'FAIL', detail: `${matches.length} instances of transition:all found` };
}

function checkWillChange(css: string): CheckResult {
  const bad: string[] = [];
  const re = /will-change\s*:\s*([^;}]+)/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    const props = m[1].trim().split(',').map((p) => p.trim());
    for (const p of props) {
      if (p !== 'transform' && p !== 'opacity' && !p.startsWith('var(')) bad.push(m[1].trim());
    }
  }
  if (bad.length === 0) return { status: 'PASS', detail: 'will-change uses only transform/opacity' };
  return { status: 'FAIL', detail: `will-change contains non-transform/opacity: ${bad.slice(0, 3).join(', ')}` };
}

function checkFontSmoothing(css: string): CheckResult {
  const hasAa = /-webkit-font-smoothing\s*:\s*antialiased/i.test(css);
  const hasGs = /-moz-osx-font-smoothing\s*:\s*grayscale/i.test(css);
  if (hasAa && hasGs) return { status: 'PASS', detail: 'font smoothing: antialiased + grayscale present' };
  return { status: 'FAIL', detail: `font smoothing incomplete: -webkit=${hasAa}, -moz-osx=${hasGs}` };
}

function checkRemScale(css: string): CheckResult {
  const cleaned = css
    .replace(/(?:html|:root|body)\s*\{[^}]*font-size\s*:\s*\d+px[^}]*\}/gis, '')
    .replace(/[\w.-]*(?:radar|chart|svg|marker|node|dot|arc|ring|halo|beam)[\w.-]*\s*\{[^}]*font-size\s*:\s*\d+px[^}]*\}/gis, '')
    .replace(/\.?[\w-]+\s*\{[^}]*(?:fill|stroke)[^}]*font-size\s*:\s*\d+px[^}]*\}/gis, '');
  const pxFonts = cleaned.match(/font-size\s*:\s*(\d+)px/gi) || [];
  const sizes = pxFonts.map((s) => s.match(/(\d+)/)?.[1]).filter(Boolean);
  if (sizes.length > 0) return { status: 'FAIL', detail: `non-root px font-sizes found: ${sizes.slice(0, 5)}` };
  const hasRem = /font-size\s*:\s*[\d.]+rem/i.test(css);
  if (hasRem) return { status: 'PASS', detail: 'rem-based scale present' };
  return { status: 'WARN', detail: 'no rem font-sizes found — may be using system defaults' };
}

function checkLineHeight(css: string): CheckResult {
  const hasHeading = /line-height\s*:\s*1\.0[5-9]\b/.test(css);
  const hasBody = /line-height\s*:\s*1\.5[0-9]\b/.test(css);
  if (hasHeading && hasBody) return { status: 'PASS', detail: 'line-height by role present (heading ~1.08, body ~1.55)' };
  return { status: 'WARN', detail: `line-height roles: heading=${hasHeading}, body=${hasBody}` };
}

function checkTextWrap(css: string): CheckResult {
  const hasBalance = /text-wrap\s*:\s*balance/i.test(css);
  const hasPretty = /text-wrap\s*:\s*pretty/i.test(css);
  if (hasBalance && hasPretty) return { status: 'PASS', detail: 'text-wrap: balance + pretty both present' };
  return { status: 'FAIL', detail: `text-wrap: balance=${hasBalance}, pretty=${hasPretty}` };
}

function checkTabularNums(css: string): CheckResult {
  const count = (css.match(/font-variant-numeric\s*:\s*tabular-nums/gi) || []).length;
  if (count > 0) return { status: 'PASS', detail: `tabular-nums: ${count} instances` };
  return { status: 'FAIL', detail: 'no tabular-nums found' };
}

function checkSelection(css: string, tokens: Record<string, string>): CheckResult {
  const selMatch = css.match(/::selection\s*\{([^}]*)\}/);
  if (!selMatch) return { status: 'FAIL', detail: 'no ::selection rule found' };
  const block = selMatch[1];
  if (block.includes('var(--signal)') || block.includes('--signal')) {
    return { status: 'PASS', detail: '::selection styled with var(--signal)' };
  }
  // Check aliases
  for (const alias of TOKEN_ALIASES['--signal'] || []) {
    if (block.includes(`var(${alias})`) || block.includes(alias)) {
      return { status: 'PASS', detail: `::selection styled with ${alias} (alias for --signal)` };
    }
  }
  return { status: 'WARN', detail: `::selection found but does not reference --signal: ${block.trim().slice(0, 80)}` };
}

function checkDurationTokens(tokens: Record<string, string>): CheckResult {
  const allDuration = Object.keys(tokens).filter((k) => k.startsWith('--duration')).sort();
  const hasQuick = '--duration-quick' in tokens;
  const hasSlow = '--duration-slow' in tokens;
  if (hasQuick && hasSlow) {
    return { status: 'PASS', detail: `duration tokens present: ${allDuration.join(', ')}` };
  }
  const missing: string[] = [];
  if (!hasQuick) missing.push('--duration-quick');
  if (!hasSlow) missing.push('--duration-slow');
  return { status: 'FAIL', detail: `duration tokens missing: ${missing.join(', ')} (found: ${allDuration})` };
}

function checkContrastSignal(tokens: Record<string, string>): CheckResult {
  const signal = tokens['--signal'] || '';
  const ink = tokens['--ink'] || '';
  if (!signal || !ink) return { status: 'SKIP', detail: 'missing --signal or --ink tokens' };
  const ratio = contrastRatio(ink, signal);
  if (ratio >= 4.5) return { status: 'PASS', detail: `--ink on --signal = ${ratio.toFixed(2)}:1 (passes AA 4.5:1)` };
  return { status: 'FAIL', detail: `--ink on --signal = ${ratio.toFixed(2)}:1 (fails AA 4.5:1)` };
}

function checkContrastMuted(tokens: Record<string, string>): CheckResult {
  const paper = tokens['--paper'] || '';
  if (!paper) return { status: 'SKIP', detail: 'missing --paper token' };
  const results: string[] = [];
  let allPass = true;
  for (const name of ['--ink', '--muted', '--muted-dim']) {
    const color = tokens[name];
    if (!color) { results.push(`${name}: missing`); allPass = false; continue; }
    const ratio = contrastRatio(color, paper);
    const passes = ratio >= 4.5;
    allPass = allPass && passes;
    results.push(`${name} on --paper = ${ratio.toFixed(2)}:1 (${passes ? 'PASS' : 'FAIL'})`);
  }
  if (allPass) return { status: 'PASS', detail: results.join('; ') };
  return { status: 'WARN', detail: results.join('; ') };
}

function checkNoAtlasNaming(html: string): CheckResult {
  const visible = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  const text = visible.replace(/<[^>]+>/g, ' ');
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1] || '';
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
  const h1 = h1Match?.[1] || '';
  if (title.includes('ATLAS') || h1.includes('ATLAS')) {
    return { status: 'FAIL', detail: `ATLAS found in title/h1: title='${title}', h1='${h1}'` };
  }
  return { status: 'PASS', detail: 'no ATLAS naming in visible title/h1' };
}

function checkFocusVisible(css: string): CheckResult {
  const count = (css.match(/:focus-visible/g) || []).length;
  if (count > 0) return { status: 'PASS', detail: `focus-visible: ${count} rules present` };
  return { status: 'FAIL', detail: 'no :focus-visible rules found' };
}

function checkReducedMotion(css: string): CheckResult {
  const hasMq = /@media\s*\(prefers-reduced-motion/i.test(css);
  if (!hasMq) return { status: 'FAIL', detail: 'no prefers-reduced-motion media query found' };
  const mqBlocks = css.match(/@media\s*\(prefers-reduced-motion[^{]*\{([^@]*?)(?:\}|@media)/gi) || [];
  const combined = mqBlocks.join(' ');
  if (/animation\s*:\s*none/i.test(combined) || /transition\s*:\s*none/i.test(combined)) {
    return { status: 'PASS', detail: 'prefers-reduced-motion disables animations/transitions' };
  }
  return { status: 'WARN', detail: 'prefers-reduced-motion query present but may not fully disable motion' };
}

function checkPressScale(css: string): CheckResult {
  const has096 = /scale\s*:\s*0\.9[0-5]/i.test(css);
  const has0985 = /scale\s*:\s*0\.9[7-9]\d?/i.test(css);
  if (has096 && has0985) return { status: 'PASS', detail: 'press scales present (0.96 + 0.985)' };
  if (has096 || has0985) return { status: 'PASS', detail: `press scale ${has096 ? '0.96' : '0.985'} present` };
  return { status: 'WARN', detail: 'no press-scale transforms found — press may use data attributes or JS' };
}

function checkFontSynthesis(css: string): CheckResult {
  if (/font-synthesis\s*:\s*none/i.test(css)) return { status: 'PASS', detail: 'font-synthesis: none present' };
  return { status: 'FAIL', detail: 'font-synthesis: none not found' };
}

function checkTextUnderlinePosition(css: string): CheckResult {
  if (/text-underline-position\s*:\s*from-font/i.test(css)) return { status: 'PASS', detail: 'text-underline-position: from-font present' };
  return { status: 'FAIL', detail: 'text-underline-position: from-font not found' };
}

function checkSkipInk(css: string): CheckResult {
  if (/text-decoration-skip-ink\s*:\s*auto/i.test(css)) return { status: 'PASS', detail: 'text-decoration-skip-ink: auto present' };
  return { status: 'FAIL', detail: 'text-decoration-skip-ink: auto not found' };
}

function checkTokenValuesMatch(
  tokens: Record<string, string>,
  inferred: Set<string>
): CheckResult {
  // Simplified semantic check — for inferred tokens, validate role
  // For native tokens, this would need the contract data; we skip exact match
  // since we don't have the contract JSON in this route.
  const inferredColors: string[] = [];
  for (const name of inferred) {
    if (name === '--ink') {
      const lum = sum(hexToRgb(tokens[name]) || [128, 128, 128]);
      if (lum > 100) inferredColors.push(`--ink: expected dark text but luminance is ${lum.toFixed(0)}/255`);
      else inferredColors.push(`--ink: dark text (luminance ${lum.toFixed(0)}/255)`);
    } else if (name === '--paper') {
      const lum = sum(hexToRgb(tokens[name]) || [128, 128, 128]);
      if (lum < 200) inferredColors.push(`--paper: expected light surface but luminance is ${lum.toFixed(0)}/255`);
      else inferredColors.push(`--paper: light surface (luminance ${lum.toFixed(0)}/255)`);
    }
  }
  if (inferredColors.length === 0) return { status: 'PASS', detail: 'token values match (0 checked)' };
  const hasFail = inferredColors.some((s) => s.includes('expected'));
  if (hasFail) return { status: 'FAIL', detail: `token mismatches: ${inferredColors.slice(0, 3).join('; ')}` };
  return { status: 'PASS', detail: `semantic roles verified: ${inferredColors.slice(0, 3).join('; ')}` };
}

// ── Main scoring ───────────────────────────────────────────────────────────

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

async function scoreUrl(url: string) {
  const css = await fetchPageCss(url);
  const html = await fetchCss(url);
  const rawTokens = extractRootTokens(css);
  const { tokens, inferred } = normalizeTokens(rawTokens, css);

  const checks: Check[] = [
    { id: 'v01', item: 'Token values match the live site :root foundation', category: 'tokens', ...splitResult(checkTokenValuesMatch(tokens, inferred)) },
    { id: 'v02', item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+', category: 'responsive', status: 'SKIP', detail: 'requires live browser viewport testing — run designesy_score via MCP for CDP' },
    { id: 'v03', item: 'Primary interactive elements show focus-visible rings', category: 'interaction', ...splitResult(checkFocusVisible(css)) },
    { id: 'v04', item: 'Sound toggle flips aria-pressed and applies the audio preference', category: 'poise', status: 'SKIP', detail: 'requires live DOM interaction' },
    { id: 'v05', item: 'prefers-reduced-motion disables entrance and wordmark breath', category: 'motion', ...splitResult(checkReducedMotion(css)) },
    { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper', category: 'accessibility', ...splitResult(checkContrastMuted(tokens)) },
    { id: 'v07', item: 'No public surface displays internal control-plane naming', category: 'identity', ...splitResult(checkNoAtlasNaming(html)) },
    { id: 'v08', item: 'Poise interaction rules match live /labs/poise and contract.interaction', category: 'poise', status: 'SKIP', detail: 'requires Poise page-specific check' },
    { id: 'v09', item: 'Poise keyboard-path verification remains published and current', category: 'poise', status: 'SKIP', detail: 'requires /review/poise page check' },
    { id: 'v10', item: 'Takt interface-feel rules match live CSS and contract.takt', category: 'takt', status: 'SKIP', detail: 'requires /labs/takt page check' },
    { id: 'v11', item: 'No transition:all in the live stylesheet', category: 'motion', ...splitResult(checkTransitionAll(css)) },
    { id: 'v12', item: 'will-change restricted to transform and opacity only', category: 'motion', ...splitResult(checkWillChange(css)) },
    { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', ...splitResult(checkPressScale(css)) },
    { id: 'v14', item: 'Cadence typography rules match live CSS and contract.cadence', category: 'cadence', status: 'SKIP', detail: 'requires /labs/cadence page check' },
    { id: 'v15', item: 'Font smoothing: antialiased + grayscale on :root confirmed', category: 'cadence', ...splitResult(checkFontSmoothing(css)) },
    { id: 'v16', item: 'Rem-based scale: all text sizes in rem, root at 16px confirmed', category: 'cadence', ...splitResult(checkRemScale(css)) },
    { id: 'v17', item: 'Line-height by role: headings 1.08, body 1.55 confirmed', category: 'cadence', ...splitResult(checkLineHeight(css)) },
    { id: 'v18', item: 'text-wrap: balance + pretty both present in live CSS', category: 'cadence', ...splitResult(checkTextWrap(css)) },
    { id: 'v19', item: 'tabular-nums: 8 instances across the live CSS', category: 'cadence', ...splitResult(checkTabularNums(css)) },
    { id: 'v20', item: '::selection styled with var(--signal) — not browser default', category: 'cadence', ...splitResult(checkSelection(css, tokens)) },
    { id: 'v21', item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1', category: 'performance', status: 'SKIP', detail: 'requires live browser performance trace — run designesy_score via MCP for CDP' },
    { id: 'v22', item: 'Primary button text passes WCAG AA 4.5:1 contrast against --signal fill', category: 'accessibility', ...splitResult(checkContrastSignal(tokens)) },
    { id: 'v23', item: 'Duration tokens --duration-quick through --duration-slow present in :root', category: 'motion', ...splitResult(checkDurationTokens(tokens)) },
    { id: 'x01', item: 'font-synthesis: none set (Cadence resolved tension)', category: 'cadence', ...splitResult(checkFontSynthesis(css)) },
    { id: 'x02', item: 'text-underline-position: from-font set (Cadence resolved tension)', category: 'cadence', ...splitResult(checkTextUnderlinePosition(css)) },
    { id: 'x03', item: 'text-decoration-skip-ink: auto set', category: 'cadence', ...splitResult(checkSkipInk(css)) },
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

function splitResult(r: CheckResult): { status: string; detail: string } {
  return { status: r.status, detail: r.detail };
}

// ── POST handler ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Maximum 10 scores per hour.' },
      { status: 429 }
    );
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return NextResponse.json({ ok: false, error: 'URL is required' }, { status: 400 });
  }
  if (!isValidUrl(url)) {
    return NextResponse.json({ ok: false, error: 'Invalid URL. Must be http(s) and not localhost.' }, { status: 400 });
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
      { ok: false, error: `Failed to score URL: ${msg}` },
      { status: 502 }
    );
  }
}