// /api/guardrails — Designesy Guardrails Emitter
//
// Ingests a design system (by URL), extracts its :root tokens, and emits a
// frozen build-contract bundle for AI coding agents:
//   1. tokens       — DTCG-format token file
//   2. lintConfig   — Stylelint config generated from token values
//   3. agentRules   — AGENTS.md-format rules with token allowlist
//   4. componentContract — allowed prop patterns derived from tokens
//   5. antiPatterns — what NOT to do (inline values, fabricated tokens)
//   6. designMd     — DESIGN.md-format file (Google's open spec,
//                     google-labs-code/design.md, Apache-2.0). YAML front matter
//                     (colors, typography, rounded, spacing, components) +
//                     markdown body in canonical section order. The de-facto
//                     AI-readable design-context standard — gives AI agents
//                     persistent understanding of a design system.
//
// The 6 checks (g01–g06) verify emission completeness, not design quality.
// This is an output generator, not a scoring engine.
//
// Contract: /contracts/guardrails.json (designesy.guardrails v0.1.0)

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { normalizeInputUrl, isValidUrl, safeFetch } from '../../lib/url-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── URL utilities (shared hardened guard — see app/lib/url-guard.ts) ──────────
// Imported above. Closes IPv6 loopback/link-local/ULA, cloud metadata
// (169.254.169.254), full 172.16.0.0/12, and encoded-IP bypass paths.

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

// ── Fetching (mirrors drift/score route) ──────────────────────────────────────

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

// ── CheckResult type ─────────────────────────────────────────────────────────

type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
};

// ── DTCG token transformation ─────────────────────────────────────────────────

type DTCGToken = {
  $type: string;
  $value: string;
  $description?: string;
};

type DTCGTokenGroup = {
  [key: string]: DTCGToken | DTCGTokenGroup;
};

function inferTokenType(name: string, value: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('color') || lower.includes('bg') || lower.includes('ink') || lower.includes('line') || lower.includes('surface') || lower.includes('muted') || lower.includes('signal') || lower.includes('activation')) {
    return 'color';
  }
  if (/#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(/i.test(value)) {
    return 'color';
  }
  if (lower.includes('font') || lower.includes('family')) {
    return 'fontFamily';
  }
  if (lower.includes('size') || lower.includes('scale')) {
    return 'dimension';
  }
  if (lower.includes('space') || lower.includes('gap') || lower.includes('pad') || lower.includes('margin')) {
    return 'spacing';
  }
  if (lower.includes('radius')) {
    return 'dimension';
  }
  if (lower.includes('duration') || lower.includes('delay')) {
    return 'duration';
  }
  if (lower.includes('ease') || lower.includes('bezier') || lower.includes('transition')) {
    return 'cubicBezier';
  }
  if (lower.includes('shadow')) {
    return 'shadow';
  }
  if (lower.includes('z-index') || lower.includes('weight') || lower.includes('line-height') || lower.includes('letter-spacing')) {
    return 'number';
  }
  return 'string';
}

function groupTokensByPrefix(tokens: Record<string, string>): DTCGTokenGroup {
  const root: DTCGTokenGroup = {};
  for (const [name, value] of Object.entries(tokens)) {
    // Strip leading --
    const clean = name.replace(/^--/, '');
    // Split on first dash to create groups
    const parts = clean.split('-');
    let cursor = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const group = parts[i];
      if (!cursor[group] || typeof cursor[group] !== 'object' || '$type' in (cursor[group] as DTCGToken)) {
        cursor[group] = {};
      }
      cursor = cursor[group] as DTCGTokenGroup;
    }
    const leaf = parts[parts.length - 1];
    const type = inferTokenType(name, value);
    cursor[leaf] = {
      $type: type,
      $value: value.replace(/var\(([^)]+)\)/g, '{$1}'),
    };
  }
  return root;
}

function generateDTCG(tokens: Record<string, string>, origin: string): object {
  return {
    $schema: 'https://designtokens.org/schema',
    $meta: {
      source: origin,
      extracted: new Date().toISOString(),
      generator: 'Designesy Guardrails v0.1.0',
    },
    ...groupTokensByPrefix(tokens),
  };
}

// ── Stylelint config generation ──────────────────────────────────────────────

function generateStylelintConfig(tokens: Record<string, string>): object {
  const colorValues: string[] = [];
  const spacingValues: string[] = [];
  const radiusValues: string[] = [];
  const durationValues: string[] = [];
  const fontFamilyValues: string[] = [];

  for (const [name, value] of Object.entries(tokens)) {
    const lower = name.toLowerCase();
    if (lower.includes('color') || lower.includes('bg') || lower.includes('ink') || lower.includes('line') || lower.includes('surface') || lower.includes('muted') || lower.includes('signal') || /#[0-9a-fA-F]|rgba?|hsla?|oklch/i.test(value)) {
      colorValues.push(value);
    }
    if (lower.includes('space') || lower.includes('gap') || lower.includes('pad')) {
      spacingValues.push(value);
    }
    if (lower.includes('radius')) {
      radiusValues.push(value);
    }
    if (lower.includes('duration')) {
      durationValues.push(value);
    }
    if (lower.includes('font-family') || lower.includes('family')) {
      fontFamilyValues.push(value);
    }
  }

  const tokenNames = Object.keys(tokens);

  return {
    extends: ['stylelint-config-standard'],
    rules: {
      'color-no-hex': [true, { severity: 'warning' }],
      'declaration-property-value-allowed-list': {
        color: [...colorValues, 'inherit', 'transparent', 'currentColor'],
        '/^padding/': [...spacingValues, '0', 'inherit'],
        '/^margin/': [...spacingValues, '0', 'inherit', 'auto'],
        'border-radius': [...radiusValues, '0', '50%'],
        '/^transition/': durationValues.length > 0 ? [...durationValues] : undefined,
        'font-family': fontFamilyValues.length > 0 ? [...fontFamilyValues, 'inherit'] : undefined,
      },
      'scale-unlimited-implicit': true,
      'custom-property-empty-line-before': 'never',
      'no-duplicate-selectors': true,
      'no-invalid-position-at-import-rule': true,
      'named-grid-areas-no-invalid': true,
      'no-irregular-whitespace': true,
      'function-calc-no-unspaced-operator': true,
      'comment-no-empty': true,
      'declaration-block-no-redundant-longhand-properties': true,
      'no-descending-specificity': true,
      'unit-no-unknown': true,
    },
    overrides: [
      {
        files: ['*.css'],
        customSyntax: 'postcss-css',
      },
    ],
    tokenNames,
  };
}

// ── AGENTS.md rules generation ───────────────────────────────────────────────

function generateAgentRules(tokens: Record<string, string>, origin: string): string {
  const tokenNames = Object.keys(tokens);
  const colorTokens = tokenNames.filter((n) => /color|bg|ink|line|surface|muted|signal/i.test(n));
  const spacingTokens = tokenNames.filter((n) => /space|gap|pad/i.test(n));
  const radiusTokens = tokenNames.filter((n) => /radius/i.test(n));
  const durationTokens = tokenNames.filter((n) => /duration|delay/i.test(n));
  const fontTokens = tokenNames.filter((n) => /font/i.test(n));

  return `# AGENTS.md — Design System Guardrails

> Auto-generated by Designesy Guardrails v0.1.0
> Source: ${origin}
> Extracted: ${new Date().toISOString()}

## Token allowlist

This project uses a design token system. **Never use raw values** (hex colors,
magic numbers, inline spacing). Always reference tokens via \`var(--token-name)\`.

### Color tokens (${colorTokens.length})
${colorTokens.map((t) => `- \`${t}\` → ${tokens[t]}`).join('\n')}

### Spacing tokens (${spacingTokens.length})
${spacingTokens.length > 0 ? spacingTokens.map((t) => `- \`${t}\` → ${tokens[t]}`).join('\n') : '- (none detected)'}

### Border-radius tokens (${radiusTokens.length})
${radiusTokens.length > 0 ? radiusTokens.map((t) => `- \`${t}\` → ${tokens[t]}`).join('\n') : '- (none detected)'}

### Duration tokens (${durationTokens.length})
${durationTokens.length > 0 ? durationTokens.map((t) => `- \`${t}\` → ${tokens[t]}`).join('\n') : '- (none detected)'}

### Font tokens (${fontTokens.length})
${fontTokens.length > 0 ? fontTokens.map((t) => `- \`${t}\` → ${tokens[t]}`).join('\n') : '- (none detected)'}

## Rules

1. **No raw colors.** Use \`var(--<color-token>)\`. Never \`#ffffff\` or \`rgb()\` in declarations.
2. **No magic numbers.** Spacing, radius, and duration must reference tokens.
3. **No fabricated tokens.** Every \`var()\` must resolve to a :root declaration.
4. **No off-system fonts.** Use \`var(--<font-token>)\` for font-family.
5. **Composition over value.** When adding a new value, add a token — don't inline.

## Anti-patterns

\`\`\`css
/* ❌ WRONG — raw value */
color: #ff0000;
padding: 16px;

/* ✅ RIGHT — token reference */
color: var(--signal);
padding: var(--space-md);
\`\`\`

## Lint enforcement

This project uses Stylelint with rules generated from the token system.
Run \`npx stylelint "**/*.css"\` to enforce. CI fails on violations.
`;
}

// ── Component contract derivation ─────────────────────────────────────────────

function generateComponentContract(tokens: Record<string, string>): object {
  const tokenNames = Object.keys(tokens);
  const patterns: { token: string; props: string[]; description: string }[] = [];

  for (const name of tokenNames) {
    const lower = name.toLowerCase();
    if (lower.includes('color') || lower.includes('bg') || lower.includes('ink') || lower.includes('signal') || lower.includes('muted')) {
      patterns.push({
        token: name,
        props: ['color', 'backgroundColor', 'borderColor', 'outlineColor'],
        description: `Use ${name} for color properties — supports color, background, border, outline.`,
      });
    }
    if (lower.includes('space') || lower.includes('gap') || lower.includes('pad')) {
      patterns.push({
        token: name,
        props: ['padding', 'margin', 'gap', 'inset'],
        description: `Use ${name} for spacing — padding, margin, gap, inset.`,
      });
    }
    if (lower.includes('radius')) {
      patterns.push({
        token: name,
        props: ['borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'],
        description: `Use ${name} for corner radii.`,
      });
    }
    if (lower.includes('duration')) {
      patterns.push({
        token: name,
        props: ['transitionDuration', 'animationDuration', 'transitionDelay', 'animationDelay'],
        description: `Use ${name} for motion timing.`,
      });
    }
    if (lower.includes('font-size') || (lower.includes('size') && lower.includes('font'))) {
      patterns.push({
        token: name,
        props: ['fontSize'],
        description: `Use ${name} for font-size.`,
      });
    }
  }

  return {
    version: '0.1.0',
    generator: 'Designesy Guardrails v0.1.0',
    patternCount: patterns.length,
    patterns,
    defaultProps: {
      // Common component defaults derived from tokens
      ...(tokenNames.some((n) => n.includes('radius')) ? { borderRadius: 'var(--radius-md)' } : {}),
      ...(tokenNames.some((n) => n.includes('space')) ? { padding: 'var(--space-md)' } : {}),
      ...(tokenNames.some((n) => n.includes('font-family')) ? { fontFamily: 'var(--font-family)' } : {}),
    },
  };
}

// ── Anti-pattern detection ──────────────────────────────────────────────────

type AntiPatternCategory = {
  count: number;
  examples: string[];
  rule: string;
};

type AntiPatterns = {
  inlineColors: AntiPatternCategory;
  magicNumbers: AntiPatternCategory;
  fabricatedTokens: AntiPatternCategory;
};

function detectAntiPatterns(css: string, tokens: Record<string, string>): AntiPatterns {
  const tokenValues = new Set(Object.values(tokens).map((v) => v.trim().toLowerCase()));

  // Inline colors
  const colorRe = /(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\))/g;
  const colorMatches = (css.match(colorRe) || []).filter((m) => !tokenValues.has(m.toLowerCase()));

  // Magic numbers in spacing
  const spacingRe = /(?:padding|margin|gap)\s*:\s*([^;]+?)(?:;|$)/gi;
  const spacingMatches: string[] = [];
  let sm;
  while ((sm = spacingRe.exec(css)) !== null) {
    const val = sm[1].trim();
    if (/^\d/.test(val) && !val.includes('var(')) {
      spacingMatches.push(val);
    }
  }

  // Undeclared var() references
  const declared = new Set(Object.keys(tokens));
  const varRe = /var\(\s*(--[\w-]+)/g;
  const undeclaredRefs: string[] = [];
  let vm;
  while ((vm = varRe.exec(css)) !== null) {
    if (!declared.has(vm[1])) undeclaredRefs.push(vm[1]);
  }

  return {
    inlineColors: {
      count: colorMatches.length,
      examples: [...new Set(colorMatches)].slice(0, 10),
      rule: 'Replace inline color values with var(--<color-token>) references.',
    },
    magicNumbers: {
      count: spacingMatches.length,
      examples: [...new Set(spacingMatches)].slice(0, 10),
      rule: 'Replace raw spacing values with var(--<spacing-token>) references.',
    },
    fabricatedTokens: {
      count: [...new Set(undeclaredRefs)].length,
      examples: [...new Set(undeclaredRefs)].slice(0, 10),
      rule: 'Every var() must resolve to a :root declaration. Remove or declare fabricated tokens.',
    },
  };
}

// ── DESIGN.md generation (Google open spec — google-labs-code/design.md) ──────
// Spec: YAML front matter (machine-readable tokens) + markdown body (human-
// readable rationale) in canonical section order: Overview, Colors, Typography,
// Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts.
// Front matter keys: version, name, description, omitted, colors, typography,
// rounded, spacing, components. Token references use {path.to.token} syntax.
// https://github.com/google-labs-code/design.md (Apache-2.0, open-sourced Apr 21 2026)

function generateDesignMd(tokens: Record<string, string>, origin: string): string {
  const tokenNames = Object.keys(tokens);

  // ── Classify tokens by inferred type ──
  const colorTokens: Record<string, string> = {};
  const fontTokens: Record<string, string> = {};
  const fontSizeTokens: Record<string, string> = {};
  const fontWeightTokens: Record<string, string> = {};
  const lineHeightTokens: Record<string, string> = {};
  const letterSpacingTokens: Record<string, string> = {};
  const roundedTokens: Record<string, string> = {};
  const spacingTokens: Record<string, string> = {};

  for (const [name, value] of Object.entries(tokens)) {
    const lower = name.toLowerCase();
    const cleanName = name.replace(/^--/, '');

    if (lower.includes('color') || lower.includes('bg') || lower.includes('ink') || lower.includes('line') || lower.includes('surface') || lower.includes('muted') || lower.includes('signal') || lower.includes('activation') || /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(/i.test(value)) {
      colorTokens[cleanName] = value;
    }
    if (lower.includes('font-family') || lower.includes('family') || (lower === '--font' || lower === '--typeface')) {
      fontTokens[cleanName] = value;
    }
    if (lower.includes('font-size') || (lower.includes('size') && lower.includes('font'))) {
      fontSizeTokens[cleanName] = value;
    }
    if (lower.includes('font-weight') || lower.includes('weight')) {
      fontWeightTokens[cleanName] = value;
    }
    if (lower.includes('line-height')) {
      lineHeightTokens[cleanName] = value;
    }
    if (lower.includes('letter-spacing')) {
      letterSpacingTokens[cleanName] = value;
    }
    if (lower.includes('radius') || lower.includes('rounded')) {
      const scaleKey = cleanName.replace(/.*radius[-_]?/i, '').replace(/[-_]/g, '-') || 'md';
      roundedTokens[scaleKey] = value;
    }
    if (lower.includes('space') || lower.includes('gap') || lower.includes('pad') || lower.includes('margin')) {
      const scaleKey = cleanName.replace(/.*(space|gap|pad|margin)[-_]?/i, '').replace(/[-_]/g, '-') || 'md';
      spacingTokens[scaleKey] = value;
    }
  }

  // ── Build YAML front matter ──
  const yamlLines: string[] = ['---'];
  yamlLines.push('version: "alpha"');
  yamlLines.push(`name: Design System from ${origin}`);
  yamlLines.push(`description: Auto-generated by Designesy Guardrails from extracted :root tokens. ${tokenNames.length} tokens detected.`);

  // Colors
  if (Object.keys(colorTokens).length > 0) {
    yamlLines.push('colors:');
    for (const [k, v] of Object.entries(colorTokens)) {
      yamlLines.push(`  ${k}: "${v}"`);
    }
  }

  // Typography — group font properties into named typography objects
  const fontKeys = Object.keys(fontTokens);
  const sizeKeys = Object.keys(fontSizeTokens);
  if (fontKeys.length > 0 || sizeKeys.length > 0) {
    yamlLines.push('typography:');
    // Build named entries from font-size tokens (h1, h2, body, etc.)
    const sizeEntries = sizeKeys.length > 0 ? sizeKeys : ['default'];
    for (const sizeKey of sizeEntries) {
      const famKey = fontKeys[0] || 'font-family';
      yamlLines.push(`  ${sizeKey}:`);
      if (fontTokens[famKey]) {
        yamlLines.push(`    fontFamily: ${fontTokens[famKey].replace(/['"]/g, '')}`);
      }
      if (fontSizeTokens[sizeKey]) {
        yamlLines.push(`    fontSize: ${fontSizeTokens[sizeKey]}`);
      }
      if (fontWeightTokens[sizeKey] || Object.keys(fontWeightTokens).length > 0) {
        const wKey = Object.keys(fontWeightTokens).find((k) => k.includes(sizeKey)) || Object.keys(fontWeightTokens)[0];
        if (wKey) yamlLines.push(`    fontWeight: ${fontWeightTokens[wKey]}`);
      }
      if (lineHeightTokens[sizeKey] || Object.keys(lineHeightTokens).length > 0) {
        const lhKey = Object.keys(lineHeightTokens).find((k) => k.includes(sizeKey)) || Object.keys(lineHeightTokens)[0];
        if (lhKey) yamlLines.push(`    lineHeight: ${lineHeightTokens[lhKey]}`);
      }
    }
    // If we have fonts but no named sizes, emit a single body entry
    if (sizeKeys.length === 0 && fontKeys.length > 0) {
      yamlLines.push('  body:');
      yamlLines.push(`    fontFamily: ${fontTokens[fontKeys[0]].replace(/['"]/g, '')}`);
    }
  }

  // Rounded
  if (Object.keys(roundedTokens).length > 0) {
    yamlLines.push('rounded:');
    for (const [k, v] of Object.entries(roundedTokens)) {
      yamlLines.push(`  ${k}: ${v}`);
    }
  }

  // Spacing
  if (Object.keys(spacingTokens).length > 0) {
    yamlLines.push('spacing:');
    for (const [k, v] of Object.entries(spacingTokens)) {
      yamlLines.push(`  ${k}: ${v}`);
    }
  }

  // Components — derive basic button component from tokens
  const hasColors = Object.keys(colorTokens).length > 0;
  const hasRadius = Object.keys(roundedTokens).length > 0;
  const hasSpacing = Object.keys(spacingTokens).length > 0;
  if (hasColors || hasRadius || hasSpacing) {
    yamlLines.push('components:');
    yamlLines.push('  button:');
    if (hasColors) {
      const bgKey = Object.keys(colorTokens).find((k) => k.includes('signal') || k.includes('activation') || k.includes('primary') || k.includes('accent')) || Object.keys(colorTokens)[0];
      const textKey = Object.keys(colorTokens).find((k) => k.includes('ink') || k.includes('on') || k.includes('text')) || Object.keys(colorTokens)[1] || Object.keys(colorTokens)[0];
      yamlLines.push(`    backgroundColor: "{colors.${bgKey}}"`);
      yamlLines.push(`    textColor: "{colors.${textKey}}"`);
    }
    if (hasRadius) {
      const rKey = Object.keys(roundedTokens).find((k) => k.includes('md')) || Object.keys(roundedTokens)[0];
      yamlLines.push(`    rounded: "{rounded.${rKey}}"`);
    }
    if (hasSpacing) {
      const sKey = Object.keys(spacingTokens).find((k) => k.includes('md')) || Object.keys(spacingTokens)[0];
      yamlLines.push(`    padding: "{spacing.${sKey}}"`);
    }
  }

  yamlLines.push('---');

  // ── Build markdown body (canonical section order) ──
  const bodyLines: string[] = [];
  const host = (() => { try { return new URL(origin).hostname; } catch { return origin; } })();

  // Overview
  bodyLines.push('## Overview');
  bodyLines.push('');
  bodyLines.push(`Design system extracted from ${origin} by Designesy Guardrails.`);
  bodyLines.push(`${tokenNames.length} design tokens detected in :root custom properties. This file gives AI agents a persistent understanding of the system — colors, typography, spacing, shapes, and component patterns — so generated UI stays on-brand.`);
  bodyLines.push('');

  // Colors
  if (Object.keys(colorTokens).length > 0) {
    bodyLines.push('## Colors');
    bodyLines.push('');
    bodyLines.push(`The palette has ${Object.keys(colorTokens).length} color tokens. Use these via \`var(--<name>)\` — never raw hex values.`);
    bodyLines.push('');
    for (const [k, v] of Object.entries(colorTokens)) {
      bodyLines.push(`- **${k}** (\`${v}\`): design token for ${k.replace(/[-_]/g, ' ')}.`);
    }
    bodyLines.push('');
  }

  // Typography
  if (Object.keys(fontTokens).length > 0 || Object.keys(fontSizeTokens).length > 0) {
    bodyLines.push('## Typography');
    bodyLines.push('');
    const famCount = Object.keys(fontTokens).length;
    const sizeCount = Object.keys(fontSizeTokens).length;
    bodyLines.push(`${famCount} font famil${famCount === 1 ? 'y' : 'ies'} and ${sizeCount} size token${sizeCount === 1 ? '' : 's'} detected. Reference fonts via \`var(--<font-token>)\` and sizes via \`var(--<size-token>)\`.`);
    bodyLines.push('');
    for (const [k, v] of Object.entries(fontTokens)) {
      bodyLines.push(`- **${k}**: \`${v}\``);
    }
    for (const [k, v] of Object.entries(fontSizeTokens)) {
      bodyLines.push(`- **${k}**: \`${v}\``);
    }
    bodyLines.push('');
  }

  // Layout (spacing)
  if (Object.keys(spacingTokens).length > 0) {
    bodyLines.push('## Layout');
    bodyLines.push('');
    bodyLines.push(`${Object.keys(spacingTokens).length} spacing tokens detected. Use \`var(--<spacing-token>)\` for padding, margin, and gap — never raw pixel values.`);
    bodyLines.push('');
    for (const [k, v] of Object.entries(spacingTokens)) {
      bodyLines.push(`- **${k}**: \`${v}\``);
    }
    bodyLines.push('');
  }

  // Elevation & Depth
  const shadowTokens = tokenNames.filter((n) => n.toLowerCase().includes('shadow'));
  if (shadowTokens.length > 0) {
    bodyLines.push('## Elevation & Depth');
    bodyLines.push('');
    bodyLines.push(`${shadowTokens.length} shadow tokens detected. Reference elevation via \`var(--<shadow-token>)\`.`);
    bodyLines.push('');
    for (const t of shadowTokens) {
      bodyLines.push(`- **${t}**: \`${tokens[t]}\``);
    }
    bodyLines.push('');
  }

  // Shapes
  if (Object.keys(roundedTokens).length > 0) {
    bodyLines.push('## Shapes');
    bodyLines.push('');
    bodyLines.push(`${Object.keys(roundedTokens).length} border-radius tokens detected. Use \`var(--<radius-token>)\` for corners — never raw pixel values.`);
    bodyLines.push('');
    for (const [k, v] of Object.entries(roundedTokens)) {
      bodyLines.push(`- **${k}**: \`${v}\``);
    }
    bodyLines.push('');
  }

  // Components
  if (hasColors || hasRadius || hasSpacing) {
    bodyLines.push('## Components');
    bodyLines.push('');
    bodyLines.push('Component tokens derived from the design system. These give AI agents the allowed property bindings — which tokens apply to which component props.');
    bodyLines.push('');
    bodyLines.push('- **button**: primary action component. Uses the signal/activation color for background, ink color for text, medium radius, and medium spacing for padding.');
    bodyLines.push('');
  }

  // Do's and Don'ts
  bodyLines.push("## Do's and Don'ts");
  bodyLines.push('');
  bodyLines.push('### Do');
  bodyLines.push('');
  bodyLines.push('- Reference tokens via `var(--<name>)` in all CSS declarations.');
  bodyLines.push('- Add a new token when a new value is needed — don\'t inline.');
  bodyLines.push('- Use the lint config (Stylelint) to enforce token usage in CI.');
  bodyLines.push('- Keep this DESIGN.md alongside the codebase so AI agents read it.');
  bodyLines.push('');
  bodyLines.push("### Don't");
  bodyLines.push('');
  bodyLines.push("- Don't use raw hex colors, magic numbers, or inline values.");
  bodyLines.push("- Don't fabricate `var()` references that don't resolve to :root.");
  bodyLines.push("- Don't mix off-system fonts — use the declared font tokens.");
  bodyLines.push("- Don't scatter spacing values — use the spacing scale.");
  bodyLines.push('');

  return [...yamlLines, '', ...bodyLines].join('\n');
}

// ── The 6 emission checks ────────────────────────────────────────────────────

function checkG01TokenExtraction(tokens: Record<string, string>): CheckResult {
  const count = Object.keys(tokens).length;
  if (count >= 5) {
    return {
      id: 'g01',
      item: 'Token extraction — :root custom properties captured',
      category: 'tokens',
      status: 'PASS',
      detail: `${count} tokens extracted and converted to DTCG format`,
    };
  }
  return {
    id: 'g01',
    item: 'Token extraction — :root custom properties captured',
    category: 'tokens',
    status: 'FAIL',
    detail: `Only ${count} :root custom properties found — nothing to guardrail`,
  };
}

function checkG02LintConfig(tokens: Record<string, string>): CheckResult {
  const count = Object.keys(tokens).length;
  if (count >= 5) {
    return {
      id: 'g02',
      item: 'Lint config generated — Stylelint rules from token values',
      category: 'lint',
      status: 'PASS',
      detail: `Stylelint config with ${count} token references generated`,
    };
  }
  return {
    id: 'g02',
    item: 'Lint config generated — Stylelint rules from token values',
    category: 'lint',
    status: 'FAIL',
    detail: 'Insufficient token data to generate lint rules',
  };
}

function checkG03AgentRules(tokens: Record<string, string>): CheckResult {
  const count = Object.keys(tokens).length;
  if (count >= 5) {
    return {
      id: 'g03',
      item: 'Agent rules emitted — AGENTS.md format with token allowlist',
      category: 'rules',
      status: 'PASS',
      detail: `AGENTS.md rules file generated with ${count} token references`,
    };
  }
  return {
    id: 'g03',
    item: 'Agent rules emitted — AGENTS.md format with token allowlist',
    category: 'rules',
    status: 'FAIL',
    detail: 'Could not generate agent rules — no tokens to document',
  };
}

function checkG04ComponentContract(tokens: Record<string, string>): CheckResult {
  const count = Object.keys(tokens).length;
  if (count >= 5) {
    return {
      id: 'g04',
      item: 'Component contract derived — allowed prop patterns',
      category: 'contract',
      status: 'PASS',
      detail: `Component contract with patterns derived from ${count} tokens`,
    };
  }
  return {
    id: 'g04',
    item: 'Component contract derived — allowed prop patterns',
    category: 'contract',
    status: 'FAIL',
    detail: 'No tokens to derive component patterns from',
  };
}

function checkG05AntiPatterns(css: string, tokens: Record<string, string>): CheckResult {
  const anti = detectAntiPatterns(css, tokens);
  const totalIssues = anti.inlineColors.count + anti.magicNumbers.count + anti.fabricatedTokens.count;
  if (totalIssues === 0) {
    return {
      id: 'g05',
      item: 'Anti-patterns documented — what NOT to do',
      category: 'anti',
      status: 'PASS',
      detail: 'No inline values detected — clean token system',
    };
  }
  // Even if we found anti-patterns, that's still a PASS — we documented them
  return {
    id: 'g05',
    item: 'Anti-patterns documented — what NOT to do',
    category: 'anti',
    status: 'PASS',
    detail: `${totalIssues} anti-patterns detected and documented (${anti.inlineColors.count} inline colors, ${anti.magicNumbers.count} magic numbers, ${anti.fabricatedTokens.count} fabricated tokens)`,
  };
}

function checkG06DesignMd(tokens: Record<string, string>): CheckResult {
  const count = Object.keys(tokens).length;
  if (count >= 5) {
    return {
      id: 'g06',
      item: 'DESIGN.md emitted — Google open spec (google-labs-code/design.md)',
      category: 'designmd',
      status: 'PASS',
      detail: `DESIGN.md generated with YAML front matter + markdown body from ${count} tokens`,
    };
  }
  return {
    id: 'g06',
    item: 'DESIGN.md emitted — Google open spec (google-labs-code/design.md)',
    category: 'designmd',
    status: 'FAIL',
    detail: 'Insufficient tokens to generate a DESIGN.md — need ≥5 :root custom properties',
  };
}

// ── Score computation ────────────────────────────────────────────────────────

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

async function emitGuardrailsUncached(targetUrl: string) {
  const { html, css } = await fetchPageResilient(targetUrl);

  if (!html && !css) {
    return {
      ok: false,
      error: 'Could not fetch the target URL. Check that the URL is correct and the site is publicly accessible.',
    };
  }

  const allCss = css + (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)?.join('\n') || '');
  const tokens = extractRootTokens(allCss);

  // Generate the bundle
  const dtcg = generateDTCG(tokens, targetUrl);
  const lintConfig = generateStylelintConfig(tokens);
  const agentRules = generateAgentRules(tokens, targetUrl);
  const componentContract = generateComponentContract(tokens);
  const antiPatterns = detectAntiPatterns(allCss, tokens);
  const designMd = generateDesignMd(tokens, targetUrl);

  // Run the 6 emission checks
  const checks: CheckResult[] = [
    checkG01TokenExtraction(tokens),
    checkG02LintConfig(tokens),
    checkG03AgentRules(tokens),
    checkG04ComponentContract(tokens),
    checkG05AntiPatterns(allCss, tokens),
    checkG06DesignMd(tokens),
  ];

  const pass = checks.filter((c) => c.status === 'PASS').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const points = pass + warn * 0.5;
  const score = Math.round((points / checks.length) * 100);
  const grade = computeGrade(score);

  return {
    ok: true,
    url: targetUrl,
    score,
    grade,
    pass,
    warn,
    fail,
    total: checks.length,
    tokensExtracted: Object.keys(tokens).length,
    bundle: {
      tokens: dtcg,
      lintConfig,
      agentRules,
      componentContract,
      antiPatterns,
      designMd,
    },
    checks,
  };
}

// ── Cached wrapper ───────────────────────────────────────────────────────────

const GUARDRAILS_TTL = 60 * 60 * 24; // 24h

const emitGuardrails = unstable_cache(emitGuardrailsUncached, ['designesy-guardrails'], {
  revalidate: GUARDRAILS_TTL,
  tags: ['guardrails'],
});

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Maximum 50 guardrail generations per hour.' },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: { url?: string };
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

  const result = await emitGuardrails(targetUrl);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { 'Cache-Control': 'no-store' },
  });
}