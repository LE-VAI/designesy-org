// /api/drift — Designesy Drift Radar
//
// Detects AI-generated UI drift by fetching a URL, extracting CSS + :root
// tokens, and running 12 drift-specific checks against the four documented
// 2026 drift failure modes: token fabrication, within-session drift,
// between-session amnesia, silent breaking changes.
//
// All 12 checks are static CSS/HTML analysis — no browser needed.
//
// Contract: /contracts/drift.json (designesy.drift v0.1.0)

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { normalizeInputUrl, isValidUrl, safeFetch } from '../../lib/url-guard';

// ── URL utilities (shared hardened guard — see app/lib/url-guard.ts) ──────────
// Imported above. Closes IPv6 loopback/link-local/ULA, cloud metadata
// (169.254.169.254), full 172.16.0.0/12, and encoded-IP bypass paths.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Scope system (mirrors score engine) ──────────────────────────────────────
//
// The drift engine has the same fairness gap as the score engine: some checks
// penalize ABSENCE of a feature (no CSS custom properties → "no token system")
// rather than DRIFT (variance within a system that exists). A site that uses
// Tailwind, Sass variables, or well-organized static CSS has zero :root custom
// properties but isn't "drifting" — it just doesn't use that particular
// token mechanism.
//
// Scope modes:
//   contract  — all 12 checks penalize absence (strict, for designesy.org self-scan)
//   universal — absence-only checks SKIP on absence (fair to external sites)
//
// Only d01 is a pure-absence check in the drift engine. d03 has a mild absence
// component (no color tokens → WARN on inline colors) but its WARN threshold
// is informative rather than punitive, so it stays in tier 1. All other checks
// measure genuine variance/consistency, which IS drift by definition.

export type DriftScope = 'contract' | 'universal';

// d01: "Token registry declared" — fails if <5 :root custom properties.
// In universal scope, a site with no custom properties SKIPs rather than FAILs,
// because absence of a CSS-custom-property system is an architectural choice,
// not drift. The check still fires (FAIL) if the site HAS a token system but
// it's tiny (1-4 tokens) — that's a weak system, not absence.
const TIER2_ABSENCE_PATTERNS: Array<{ id: string; absenceMatch: RegExp }> = [
  // Only match the 0-tokens case (pure absence). 1-4 tokens = weak system = real FAIL.
  { id: 'd01', absenceMatch: /^Only 0 :root custom properties/ },
];

function applyDriftScopeFilter(checks: CheckResult[], scope: DriftScope): CheckResult[] {
  if (scope === 'contract') return checks;
  return checks.map((c) => {
    const tier2 = TIER2_ABSENCE_PATTERNS.find((t) => t.id === c.id);
    if (tier2 && (c.status === 'WARN' || c.status === 'FAIL')) {
      if (tier2.absenceMatch.test(c.detail)) {
        return {
          ...c,
          status: 'SKIP' as CheckResult['status'],
          detail: `${c.detail} (skipped: scope=universal — absence of CSS custom properties is an architectural choice, not drift)`,
        };
      }
    }
    return c;
  });
}

function autoDetectDriftScope(targetUrl: string): DriftScope {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    if (host === 'designesy.org' || host === 'www.designesy.org') return 'contract';
  } catch { /* fall through */ }
  return 'universal';
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMIT = 50;
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

// ── Fetching (mirrors score route) ─────────────────────────────────────────────

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
    const resp = await safeFetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
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
//
// Tokens declared in CSS custom properties can live in three scopes:
//   1. :root { ... }                    — global theme tokens
//   2. [data-theme="light"] :root { }   — theme override (still global)
//   3. .component { --x: ...; }         — component-scoped (CSS spec valid)
//   4. JS: el.style.setProperty('--x')  — runtime-injected state
//
// The original d02 check only scanned :root, which produced a high false-
// positive count on real CSS that legitimately uses local-scope custom
// properties (Krehel /better-ui pattern, magnetic-cursor effect, filter
// segmented controls, grade badges). This now scans ALL custom property
// declarations in the stylesheet so component-scoped state tokens are
// recognized as declared, not fabricated.

function extractRootTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  // All custom property declarations across the whole stylesheet — both
  // :root blocks and component-scoped. Later declarations win so theme
  // overrides resolve correctly (matches browser cascade behaviour).
  // Accepts `;` OR `}` OR end-of-string as the value terminator because
  // CSS allows omitting the trailing semicolon on the last declaration in
  // a block (minifiers exploit this aggressively).
  const propRe = /(--[\w-]+)\s*:\s*([^;{}]+?)(?:;|}|$)/g;
  let p;
  while ((p = propRe.exec(css)) !== null) {
    tokens[p[1]] = p[2].trim();
  }
  return tokens;
}

// Extract all var() references from CSS
function extractVarRefs(css: string): string[] {
  const refs: string[] = [];
  const varRe = /var\(\s*(--[\w-]+)/g;
  let m;
  while ((m = varRe.exec(css)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}

// Extract all var() references with their fallback chains
function extractVarChains(css: string): { primary: string; fallback?: string }[] {
  const chains: { primary: string; fallback?: string }[] = [];
  const chainRe = /var\(\s*(--[\w-]+)\s*(?:,\s*var\(\s*(--[\w-]+)\s*\))?\)/g;
  let m;
  while ((m = chainRe.exec(css)) !== null) {
    chains.push({ primary: m[1], fallback: m[2] });
  }
  return chains;
}

// ── Value extraction helpers ─────────────────────────────────────────────────

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

// ── CheckResult type ─────────────────────────────────────────────────────────

type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  detail: string;
};

// ── The 12 drift checks ───────────────────────────────────────────────────────

function checkD01TokenRegistry(tokens: Record<string, string>): CheckResult {
  const count = Object.keys(tokens).length;
  if (count >= 5) {
    return { id: 'd01', item: 'Token registry declared', category: 'tokens', status: 'PASS', detail: `Token registry found with ${count} custom properties` };
  }
  return { id: 'd01', item: 'Token registry declared', category: 'tokens', status: 'FAIL', detail: `Only ${count} :root custom properties — the site has no token system` };
}

function checkD02FabricatedTokens(tokens: Record<string, string>, varRefs: string[]): CheckResult {
  const declared = new Set(Object.keys(tokens));
  const undeclared = varRefs.filter((r) => !declared.has(r));
  // Filter known JS-injected runtime state tokens — these are real custom
  // properties set via el.style.setProperty() in components (magnetic-cursor,
  // grade badges, bundle-tabs indicator). They never appear in CSS source
  // because they're per-element state, not design tokens. Listing them here
  // keeps the check honest about what's a real fabrication vs runtime state.
  const JS_INJECTED_TOKENS = new Set([
    '--scroll-y', '--spot-x', '--spot-y', '--tilt-rx', '--tilt-ry', // magnetic-cursor
    '--bar-i',                                                          // progress bars
    '--accent',                                                         // magnetic-cursor focus accent
    '--indicator-w', '--indicator-x',                                   // bundle-tabs / filter segmented
    '--grade-a-line', '--grade-a-text', '--grade-b-line', '--grade-b-text',
    '--grade-c-line', '--grade-c-text', '--grade-d-line', '--grade-d-text',
    '--grade-f-line', '--grade-f-text',                                  // grade badges (set inline)
  ]);
  const uniqueUndeclared = [...new Set(undeclared)].filter((t) => !JS_INJECTED_TOKENS.has(t));
  const runtimeCount = [...new Set(undeclared)].filter((t) => JS_INJECTED_TOKENS.has(t)).length;
  if (uniqueUndeclared.length === 0) {
    return {
      id: 'd02',
      item: 'No fabricated tokens',
      category: 'tokens',
      status: 'PASS',
      detail: `All ${varRefs.length} var() references resolve (${runtimeCount} runtime-injected JS tokens excluded — known JS state)`,
    };
  }
  if (uniqueUndeclared.length <= 2) {
    return { id: 'd02', item: 'No fabricated tokens', category: 'tokens', status: 'WARN', detail: `${uniqueUndeclared.length} undeclared references: ${uniqueUndeclared.slice(0, 3).join(', ')} (${runtimeCount} runtime tokens excluded) ${uniqueUndeclared.length === 0 ? '' : '— investigate'}` };
  }
  return { id: 'd02', item: 'No fabricated tokens', category: 'tokens', status: 'FAIL', detail: `${uniqueUndeclared.length} var() references to undeclared custom properties: ${uniqueUndeclared.slice(0, 5).join(', ')}... — token fabrication detected (${runtimeCount} runtime tokens excluded)` };
}

function checkD03InlineColors(css: string, tokens: Record<string, string>): CheckResult {
  const colorRe = /(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\))/g;
  const matches = css.match(colorRe) || [];
  // Filter out colors inside var() definitions (they're the token values, not inline usage)
  const tokenValues = new Set(Object.values(tokens).map((v) => v.trim().toLowerCase()));
  const inline = matches.filter((m) => !tokenValues.has(m.toLowerCase()));
  const colorTokenCount = Object.values(tokens).filter((v) => /#[0-9a-fA-F]|rgba?|hsla?|oklch/i.test(v)).length;
  if (inline.length <= 5 && colorTokenCount > 0) {
    return { id: 'd03', item: 'Inline color values minimized', category: 'color', status: 'PASS', detail: `${inline.length} inline color values (${colorTokenCount} color tokens available)` };
  }
  if (inline.length > 20) {
    return { id: 'd03', item: 'Inline color values minimized', category: 'color', status: 'FAIL', detail: `${inline.length} inline color values — color system bypassed` };
  }
  return { id: 'd03', item: 'Inline color values minimized', category: 'color', status: 'WARN', detail: `${inline.length} inline color values — partial token adoption` };
}

function checkD04SpacingVariance(css: string): CheckResult {
  const values = extractValuesByProperty(css, ['padding', 'margin']);
  // Extract numeric values (px, rem, em)
  const numeric = values.map((v) => {
    const m = v.match(/([\d.]+)\s*(px|rem|em)/);
    return m ? parseFloat(m[1]) * (m[2] === 'rem' ? 16 : m[2] === 'em' ? 16 : 1) : null;
  }).filter((v): v is number => v !== null);
  const distinct = uniqueValues(numeric.map((n) => String(Math.round(n))));
  if (distinct.length <= 6) {
    return { id: 'd04', item: 'Spacing values cluster on a scale', category: 'spacing', status: 'PASS', detail: `Spacing values cluster on ${distinct.length} distinct steps` };
  }
  if (distinct.length > 15) {
    return { id: 'd04', item: 'Spacing values cluster on a scale', category: 'spacing', status: 'FAIL', detail: `${distinct.length} distinct spacing values — no spacing scale` };
  }
  return { id: 'd04', item: 'Spacing values cluster on a scale', category: 'spacing', status: 'WARN', detail: `${distinct.length} distinct spacing values — loose scale` };
}

function checkD05ColorVariance(css: string, tokens: Record<string, string>): CheckResult {
  // Look for the same semantic color role with different raw values
  const colorRe = /(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\))/g;
  const matches = (css.match(colorRe) || []).map((c) => c.toLowerCase());
  const groups = new Map<string, number>();
  for (const c of matches) {
    groups.set(c, (groups.get(c) || 0) + 1);
  }
  // If >60% of colors are the same 3 values, it's consistent
  const top3 = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const top3Count = top3.reduce((sum, [, count]) => sum + count, 0);
  const total = matches.length;
  if (total === 0) {
    return { id: 'd05', item: 'Color values consistent', category: 'color', status: 'PASS', detail: 'No raw color values found in CSS' };
  }
  const ratio = top3Count / total;
  if (ratio > 0.6) {
    return { id: 'd05', item: 'Color values consistent', category: 'color', status: 'PASS', detail: `Top 3 colors cover ${Math.round(ratio * 100)}% of ${total} color declarations — consistent` };
  }
  if (ratio < 0.3) {
    return { id: 'd05', item: 'Color values consistent', category: 'color', status: 'FAIL', detail: `${groups.size} distinct color values across ${total} declarations — color drift` };
  }
  return { id: 'd05', item: 'Color values consistent', category: 'color', status: 'WARN', detail: `${groups.size} distinct color values — moderate consistency` };
}

function checkD06FontFamily(css: string): CheckResult {
  const families = extractValuesByProperty(css, ['font-family']);
  const stacks = uniqueValues(families.map((f) => f.split(',')[ 0]?.trim() || ''));
  if (stacks.length <= 2) {
    return { id: 'd06', item: 'Font-family consistent', category: 'typography', status: 'PASS', detail: `${stacks.length} distinct font-family stacks — consistent` };
  }
  if (stacks.length > 4) {
    return { id: 'd06', item: 'Font-family consistent', category: 'typography', status: 'FAIL', detail: `${stacks.length} distinct font-family stacks — typography drift` };
  }
  return { id: 'd06', item: 'Font-family consistent', category: 'typography', status: 'WARN', detail: `${stacks.length} distinct font-family stacks` };
}

function checkD07BorderRadius(css: string): CheckResult {
  const values = extractValuesByProperty(css, ['border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius']);
  const numeric = values.map((v) => {
    const m = v.match(/([\d.]+)\s*(px|rem|em|%)/);
    return m ? m[1] : null;
  }).filter((v): v is string => v !== null);
  const distinct = uniqueValues(numeric);
  if (distinct.length <= 4) {
    return { id: 'd07', item: 'Border-radius values cluster', category: 'shape', status: 'PASS', detail: `Border-radius values cluster on ${distinct.length} distinct radii` };
  }
  if (distinct.length > 8) {
    return { id: 'd07', item: 'Border-radius values cluster', category: 'shape', status: 'FAIL', detail: `${distinct.length} distinct border-radius values — radius drift` };
  }
  return { id: 'd07', item: 'Border-radius values cluster', category: 'shape', status: 'WARN', detail: `${distinct.length} distinct border-radius values` };
}

function checkD08ShadowVariance(css: string): CheckResult {
  const shadows = extractValuesByProperty(css, ['box-shadow']);
  const distinct = uniqueValues(shadows);
  if (distinct.length <= 3) {
    return { id: 'd08', item: 'Shadow values consistent', category: 'elevation', status: 'PASS', detail: `${distinct.length} distinct box-shadow values` };
  }
  if (distinct.length > 6) {
    return { id: 'd08', item: 'Shadow values consistent', category: 'elevation', status: 'FAIL', detail: `${distinct.length} distinct box-shadow values — shadow drift` };
  }
  return { id: 'd08', item: 'Shadow values consistent', category: 'elevation', status: 'WARN', detail: `${distinct.length} distinct box-shadow values` };
}

function checkD09TransitionVariance(css: string): CheckResult {
  const transitions = extractValuesByProperty(css, ['transition', 'transition-duration']);
  // Extract duration values
  const durations = transitions.map((t) => {
    const m = t.match(/([\d.]+)\s*(ms|s)/g);
    return m ? m.join(', ') : null;
  }).filter((v): v is string => v !== null);
  const distinct = uniqueValues(durations);
  if (distinct.length <= 4) {
    return { id: 'd09', item: 'Transition duration/easing consistent', category: 'motion', status: 'PASS', detail: `Transition durations cluster on ${distinct.length} distinct values` };
  }
  if (distinct.length > 8) {
    return { id: 'd09', item: 'Transition duration/easing consistent', category: 'motion', status: 'FAIL', detail: `${distinct.length} distinct transition durations — motion drift` };
  }
  return { id: 'd09', item: 'Transition duration/easing consistent', category: 'motion', status: 'WARN', detail: `${distinct.length} distinct transition durations` };
}

function checkD10ZIndex(css: string): CheckResult {
  const zValues = extractValuesByProperty(css, ['z-index']);
  const numeric = zValues.map((z) => parseInt(z, 10)).filter((n) => !isNaN(n));
  const max = Math.max(...numeric, 0);
  const distinct = uniqueValues(numeric.map(String));
  if (max <= 100 && distinct.length <= 10) {
    return { id: 'd10', item: 'Z-index values within a sane range', category: 'stacking', status: 'PASS', detail: `All z-index values within 0-${max}, ${distinct.length} distinct levels` };
  }
  if (max > 100 || distinct.length > 10) {
    return { id: 'd10', item: 'Z-index values within a sane range', category: 'stacking', status: 'FAIL', detail: `Z-index values reach ${max}, ${distinct.length} distinct levels — stacking chaos` };
  }
  return { id: 'd10', item: 'Z-index values within a sane range', category: 'stacking', status: 'WARN', detail: `Z-index values reach ${max}, ${distinct.length} levels` };
}

function checkD11UndeclaredRatio(tokens: Record<string, string>, varRefs: string[]): CheckResult {
  if (varRefs.length === 0) {
    return { id: 'd11', item: 'Undeclared custom property ratio', category: 'tokens', status: 'PASS', detail: 'No var() references in CSS' };
  }
  const declared = new Set(Object.keys(tokens));
  const undeclared = varRefs.filter((r) => !declared.has(r));
  const ratio = (undeclared.length / varRefs.length) * 100;
  if (ratio < 5) {
    return { id: 'd11', item: 'Undeclared custom property ratio', category: 'tokens', status: 'PASS', detail: `${Math.round(ratio)}% undeclared var() references (${undeclared.length}/${varRefs.length})` };
  }
  if (ratio > 20) {
    return { id: 'd11', item: 'Undeclared custom property ratio', category: 'tokens', status: 'FAIL', detail: `${Math.round(ratio)}% undeclared — widespread token fabrication` };
  }
  return { id: 'd11', item: 'Undeclared custom property ratio', category: 'tokens', status: 'WARN', detail: `${Math.round(ratio)}% undeclared — moderate fabrication` };
}

function checkD12AliasChains(css: string, tokens: Record<string, string>): CheckResult {
  const chains = extractVarChains(css);
  const declared = new Set(Object.keys(tokens));
  const dangling = chains.filter((c) => !declared.has(c.primary) && (!c.fallback || !declared.has(c.fallback)));
  if (dangling.length === 0) {
    return { id: 'd12', item: 'Token alias chains resolve', category: 'tokens', status: 'PASS', detail: chains.length > 0 ? `All ${chains.length} alias chains resolve to declared values` : 'No alias chains found' };
  }
  if (dangling.length <= 2) {
    return { id: 'd12', item: 'Token alias chains resolve', category: 'tokens', status: 'WARN', detail: `${dangling.length} dangling alias chains` };
  }
  return { id: 'd12', item: 'Token alias chains resolve', category: 'tokens', status: 'FAIL', detail: `${dangling.length} alias chains reference undeclared tokens — dangling references` };
}

// ── Score computation ────────────────────────────────────────────────────────

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

async function scoreDriftUncached(targetUrl: string, scope?: DriftScope) {
  const effectiveScope: DriftScope = scope || autoDetectDriftScope(targetUrl);
  const { html, css } = await fetchPageResilient(targetUrl);

  if (!html && !css) {
    return {
      ok: false,
      error: 'Could not fetch the target URL. Check that the URL is correct and the site is publicly accessible.',
    };
  }

  const allCss = css + (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)?.join('\n') || '');
  const tokens = extractRootTokens(allCss);
  const varRefs = extractVarRefs(allCss);

  let checks: CheckResult[] = [
    checkD01TokenRegistry(tokens),
    checkD02FabricatedTokens(tokens, varRefs),
    checkD03InlineColors(allCss, tokens),
    checkD04SpacingVariance(allCss),
    checkD05ColorVariance(allCss, tokens),
    checkD06FontFamily(allCss),
    checkD07BorderRadius(allCss),
    checkD08ShadowVariance(allCss),
    checkD09TransitionVariance(allCss),
    checkD10ZIndex(allCss),
    checkD11UndeclaredRatio(tokens, varRefs),
    checkD12AliasChains(allCss, tokens),
  ];

  // Apply scope filter AFTER checks run but BEFORE scoring math.
  // Converts absence-only results to SKIP in universal scope.
  checks = applyDriftScopeFilter(checks, effectiveScope);

  // SKIP checks are excluded from scoring (not counted in denominator).
  const scoredChecks = checks.filter((c) => c.status !== 'SKIP');
  const pass = scoredChecks.filter((c) => c.status === 'PASS').length;
  const warn = scoredChecks.filter((c) => c.status === 'WARN').length;
  const fail = scoredChecks.filter((c) => c.status === 'FAIL').length;
  const skip = checks.length - scoredChecks.length;
  const points = pass + warn * 0.5;
  const score = scoredChecks.length > 0
    ? Math.round((points / scoredChecks.length) * 100)
    : 0;
  const grade = computeGrade(score);

  return {
    ok: true,
    url: targetUrl,
    scope: effectiveScope,
    score,
    grade,
    pass,
    warn,
    fail,
    skip,
    total: checks.length,
    tokensExtracted: Object.keys(tokens).length,
    checks,
  };
}

// ── Cached wrapper ───────────────────────────────────────────────────────────

const DRIFT_TTL = 60 * 60 * 24; // 24h

const scoreDrift = unstable_cache(scoreDriftUncached, ['designesy-drift'], {
  revalidate: DRIFT_TTL,
  tags: ['drift'],
});

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Maximum 50 drift scans per hour.' },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: { url?: string; scope?: DriftScope };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const targetUrl = normalizeInputUrl(body.url || '');
  if (!isValidUrl(targetUrl)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid URL. Provide a public http(s) URL.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Scope: explicit body.scope wins; otherwise auto-detect (designesy.org → contract, else universal)
  const scope: DriftScope = body.scope === 'contract' || body.scope === 'universal'
    ? body.scope
    : autoDetectDriftScope(targetUrl);

  const result = await scoreDrift(targetUrl, scope);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { 'Cache-Control': 'no-store' },
  });
}