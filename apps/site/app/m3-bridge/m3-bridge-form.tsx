'use client';

// M3 → DTCG converter — client-side token format bridge.
//
// Parses M3 token CSS (--md-sys-color-primary, --md-ref-palette-primary40, etc.)
// or M3 JSON token files, converts to W3C DTCG 2025.10 format with
// $type/$value/$description, validates the output, and provides download.
//
// All conversion is client-side — no data sent to any server.

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';

// ── Types ───────────────────────────────────────────────────────────────────

interface DTCGToken {
  $type: 'color' | 'dimension' | 'duration' | 'cubicBezier' | 'fontFamily' | 'number' | 'string';
  $value: unknown;
  $description?: string;
}

interface DTCGFile {
  $schema: string;
  [key: string]: DTCGToken | DTCGFile | string;
}

interface ConversionResult {
  tokens: DTCGFile;
  count: number;
  errors: string[];
  warnings: string[];
}

// ── M3 token patterns ───────────────────────────────────────────────────────

// M3 CSS custom properties follow the pattern: --md-{tier}-{category}-{role}
// Tiers: ref (reference), sys (system), comp (component)
// Examples: --md-sys-color-primary, --md-ref-palette-primary40,
//           --md-sys-shape-corner-small, --md-sys-motion-duration-short-1

const M3_CSS_PATTERN = /--(md-[\w-]+)\s*:\s*([^;]+);/g;
const M3_JSON_KEY_PATTERN = /^(md\.[\w.]+)$/;

// M3 token name → DTCG path mapping
// --md-ref-palette-primary40 → palette.primary.40
// --md-sys-color-primary → color.primary
// --md-sys-shape-corner-small → shape.corner.small
// --md-sys-motion-duration-short-1 → motion.duration.short-1
// --md-sys-typescale.body-large → typescale.body-large

function m3TokenToDtcgPath(tokenName: string): string[] {
  // Remove 'md-' prefix, split by '-'
  const clean = tokenName.replace(/^md-/, '');
  // Special handling for ref palette tokens like 'ref-palette-primary40'
  // → ['palette', 'primary', '40']
  if (clean.startsWith('ref-palette-')) {
    const rest = clean.replace('ref-palette-', '');
    // Match patterns like 'primary40', 'neutral-variant-80'
    const m = rest.match(/^([\w-]+?)(\d+)$/);
    if (m) {
      return ['palette', m[1], m[2]];
    }
    return ['palette', rest];
  }
  // sys-color-primary → ['color', 'primary']
  if (clean.startsWith('sys-color-')) {
    return ['color', clean.replace('sys-color-', '')];
  }
  // sys-shape-corner-small → ['shape', 'corner', 'small']
  if (clean.startsWith('sys-shape-')) {
    return ['shape', ...clean.replace('sys-shape-', '').split('-')];
  }
  // sys-motion-duration-short-1 → ['motion', 'duration', 'short-1']
  if (clean.startsWith('sys-motion-duration-')) {
    return ['motion', 'duration', clean.replace('sys-motion-duration-', '')];
  }
  // sys-motion-easing-emphasized → ['motion', 'easing', 'emphasized']
  if (clean.startsWith('sys-motion-easing-')) {
    return ['motion', 'easing', clean.replace('sys-motion-easing-', '')];
  }
  // sys-typescale-body-large → ['typescale', 'body-large']
  if (clean.startsWith('sys-typescale-')) {
    return ['typescale', clean.replace('sys-typescale-', '')];
  }
  // sys-state-layer-opacity → ['state', 'layer', 'opacity']
  if (clean.startsWith('sys-state-')) {
    return ['state', ...clean.replace('sys-state-', '').split('-')];
  }
  // sys-elevation-1 → ['elevation', '1']
  if (clean.startsWith('sys-elevation-')) {
    return ['elevation', clean.replace('sys-elevation-', '')];
  }
  // comp-* → ['component', ...rest]
  if (clean.startsWith('comp-')) {
    return ['component', ...clean.replace('comp-', '').split('-')];
  }
  // Fallback: split by '-'
  return clean.split('-');
}

// ── Value type detection ────────────────────────────────────────────────────

function detectType(value: string): DTCGToken['$type'] {
  const v = value.trim();
  // Color: hex, rgb, rgba, hsl, hsla, oklch
  if (/^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(|color\()/.test(v)) {
    return 'color';
  }
  // Duration: ends with 'ms' or 's'
  if (/^\d*\.?\d+(ms|s)$/.test(v)) {
    return 'duration';
  }
  // Dimension: ends with 'px', 'rem', 'em', '%', 'vw', 'vh'
  if (/^[\d.]+(px|rem|em|%|vw|vh|ch|ex|pt|pc)$/.test(v)) {
    return 'dimension';
  }
  // Cubic bezier: cubic-bezier(...)
  if (/^cubic-bezier\(/.test(v)) {
    return 'cubicBezier';
  }
  // Font family: contains quotes or known font names
  if (/^["']|^([A-Z][a-z]+\s)?[a-z]+(,\s|$)/.test(v) && !/^\d/.test(v)) {
    return 'fontFamily';
  }
  // Number: pure number
  if (/^-?\d*\.?\d+$/.test(v)) {
    return 'number';
  }
  return 'string';
}

// ── Value conversion ────────────────────────────────────────────────────────

function convertValue(value: string, type: DTCGToken['$type']): unknown {
  const v = value.trim();
  switch (type) {
    case 'color': {
      // Convert to DTCG structured color: { colorSpace, components }
      const hexMatch = v.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?$/);
      if (hexMatch) {
        return {
          colorSpace: 'srgb',
          components: {
            red: parseInt(hexMatch[1], 16) / 255,
            green: parseInt(hexMatch[2], 16) / 255,
            blue: parseInt(hexMatch[3], 16) / 255,
            alpha: hexMatch[4] ? parseInt(hexMatch[4], 16) / 255 : 1,
          },
        };
      }
      // Keep as string for rgb/hsl/oklch (DTCG allows string color values too)
      return v;
    }
    case 'cubicBezier': {
      const m = v.match(/cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
      if (m) {
        return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
      }
      return v;
    }
    case 'duration': {
      // Convert to milliseconds
      if (v.endsWith('ms')) return parseFloat(v);
      if (v.endsWith('s')) return parseFloat(v) * 1000;
      return v;
    }
    case 'number':
      return parseFloat(v);
    default:
      return v;
  }
}

// ── Description generation ──────────────────────────────────────────────────

function describeToken(tokenName: string, type: DTCGToken['$type']): string {
  if (tokenName.includes('ref-palette')) return `M3 reference palette token — raw color value`;
  if (tokenName.includes('sys-color')) return `M3 system color token — semantic color role`;
  if (tokenName.includes('sys-shape')) return `M3 system shape token — corner radius`;
  if (tokenName.includes('sys-motion-duration')) return `M3 motion duration token`;
  if (tokenName.includes('sys-motion-easing')) return `M3 motion easing token`;
  if (tokenName.includes('sys-typescale')) return `M3 typography token`;
  if (tokenName.includes('sys-elevation')) return `M3 elevation token`;
  if (tokenName.includes('sys-state')) return `M3 state layer token`;
  if (tokenName.includes('comp-')) return `M3 component token — component-specific override`;
  return `Material 3 ${type} token`;
}

// ── CSS parser ──────────────────────────────────────────────────────────────

function parseM3Css(css: string): ConversionResult {
  const tokens: DTCGFile = {
    $schema: 'https://designtokens.org/schema.json',
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  let count = 0;

  let match: RegExpExecArray | null;
  M3_CSS_PATTERN.lastIndex = 0;
  while ((match = M3_CSS_PATTERN.exec(css)) !== null) {
    const tokenName = match[1];
    const rawValue = match[2].trim();

    if (!tokenName.startsWith('md-')) {
      warnings.push(`Skipped non-M3 token: --${tokenName}`);
      continue;
    }

    const type = detectType(rawValue);
    const value = convertValue(rawValue, type);
    const path = m3TokenToDtcgPath(tokenName);
    const description = describeToken(tokenName, type);

    // Navigate/create nested structure
    let current: Record<string, unknown> = tokens;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    const finalKey = path[path.length - 1];
    current[finalKey] = {
      $type: type,
      $value: value,
      $description: description,
    } as DTCGToken;
    count++;
  }

  if (count === 0) {
    errors.push('No M3 tokens found. Expected CSS custom properties starting with --md- (e.g., --md-sys-color-primary: #6750A4;)');
  }

  return { tokens, count, errors, warnings };
}

// ── JSON parser (M3 JSON token format) ──────────────────────────────────────

function parseM3Json(jsonStr: string): ConversionResult {
  const tokens: DTCGFile = {
    $schema: 'https://designtokens.org/schema.json',
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  let count = 0;

  try {
    const data = JSON.parse(jsonStr);
    // M3 JSON format: flat key-value like "md.sys.color.primary": "#6750A4"
    // or nested { "md": { "sys": { "color": { "primary": "#6750A4" } } } }

    function walk(obj: Record<string, unknown>, prefix: string) {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          walk(value as Record<string, unknown>, fullKey);
        } else if (typeof value === 'string' || typeof value === 'number') {
          const strValue = String(value);
          if (M3_JSON_KEY_PATTERN.test(fullKey) || fullKey.startsWith('md.')) {
            const type = detectType(strValue);
            const val = convertValue(strValue, type);
            // Convert dot notation to path
            const path = fullKey.replace(/^md\./, '').split('.');
            const description = describeToken(fullKey.replace(/\./g, '-'), type);

            let current: Record<string, unknown> = tokens;
            for (let i = 0; i < path.length - 1; i++) {
              const k = path[i];
              if (!current[k] || typeof current[k] !== 'object') {
                current[k] = {};
              }
              current = current[k] as Record<string, unknown>;
            }
            current[path[path.length - 1]] = {
              $type: type,
              $value: val,
              $description: description,
            };
            count++;
          } else {
            warnings.push(`Skipped non-M3 key: ${fullKey}`);
          }
        }
      }
    }

    walk(data, '');
  } catch (e) {
    errors.push(`Invalid JSON: ${(e as Error).message}`);
  }

  if (count === 0 && errors.length === 0) {
    errors.push('No M3 tokens found. Expected keys starting with "md." (e.g., "md.sys.color.primary": "#6750A4")');
  }

  return { tokens, count, errors, warnings };
}

// ── Validation ──────────────────────────────────────────────────────────────

function validateDtcg(tokens: DTCGFile): { valid: boolean; checks: { name: string; pass: boolean; detail: string }[] } {
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // Check 1: $schema present
  checks.push({
    name: '$schema present',
    pass: !!tokens.$schema,
    detail: tokens.$schema ? `Points to ${tokens.$schema}` : 'Missing $schema pointer',
  });

  // Check 2: At least one token
  const tokenCount = countTokens(tokens);
  checks.push({
    name: 'Tokens present',
    pass: tokenCount > 0,
    detail: `${tokenCount} tokens found`,
  });

  // Check 3: All tokens have $type and $value
  let allTyped = true;
  let allValued = true;
  traverseTokens(tokens, (key, token) => {
    if (!token.$type) allTyped = false;
    if (token.$value === undefined) allValued = false;
  });
  checks.push({
    name: 'All tokens have $type',
    pass: allTyped,
    detail: allTyped ? 'Every token declares a $type' : 'Some tokens missing $type',
  });
  checks.push({
    name: 'All tokens have $value',
    pass: allValued,
    detail: allValued ? 'Every token has a $value' : 'Some tokens missing $value',
  });

  // Check 4: Colors use structured format (colorSpace + components)
  let structuredColors = true;
  let colorCount = 0;
  traverseTokens(tokens, (key, token) => {
    if (token.$type === 'color') {
      colorCount++;
      const v = token.$value;
      if (typeof v === 'string') structuredColors = false;
    }
  });
  checks.push({
    name: 'Colors structured (not bare hex)',
    pass: colorCount === 0 || structuredColors,
    detail: colorCount > 0
      ? structuredColors
        ? `${colorCount} colors use colorSpace + components format`
        : `${colorCount} colors are bare strings — should use { colorSpace, components }`
      : 'No color tokens to check',
  });

  return { valid: checks.every((c) => c.pass), checks };
}

function countTokens(obj: Record<string, unknown>): number {
  let count = 0;
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    if (value && typeof value === 'object') {
      if (value && '$type' in (value as Record<string, unknown>)) {
        count++;
      } else {
        count += countTokens(value as Record<string, unknown>);
      }
    }
  }
  return count;
}

function traverseTokens(obj: Record<string, unknown>, fn: (key: string, token: DTCGToken) => void) {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    if (value && typeof value === 'object') {
      if (value && '$type' in (value as Record<string, unknown>)) {
        fn(key, value as DTCGToken);
      } else {
        traverseTokens(value as Record<string, unknown>, fn);
      }
    }
  }
}

// ── Sample M3 CSS ───────────────────────────────────────────────────────────

const SAMPLE_M3_CSS = `:root {
  /* Reference palette */
  --md-ref-palette-primary40: #6750A4;
  --md-ref-palette-primary80: #D0BCFF;
  --md-ref-palette-secondary40: #625B71;
  --md-ref-palette-tertiary40: #7D5260;
  --md-ref-palette-neutral99: #FEF7FF;
  --md-ref-palette-neutral10: #1D1B20;
  --md-ref-palette-neutral-variant90: #E7E0EC;

  /* System colors */
  --md-sys-color-primary: #6750A4;
  --md-sys-color-on-primary: #FFFFFF;
  --md-sys-color-primary-container: #EADDFF;
  --md-sys-color-on-primary-container: #21005D;
  --md-sys-color-surface: #FEF7FF;
  --md-sys-color-on-surface: #1D1B20;
  --md-sys-color-surface-variant: #E7E0EC;
  --md-sys-color-error: #B3261E;
  --md-sys-color-outline: #79747E;

  /* Shape */
  --md-sys-shape-corner-extra-small: 4px;
  --md-sys-shape-corner-small: 8px;
  --md-sys-shape-corner-medium: 12px;
  --md-sys-shape-corner-large: 16px;
  --md-sys-shape-corner-extra-large: 28px;

  /* Motion duration */
  --md-sys-motion-duration-short-1: 50ms;
  --md-sys-motion-duration-short-2: 100ms;
  --md-sys-motion-duration-short-3: 150ms;
  --md-sys-motion-duration-short-4: 200ms;
  --md-sys-motion-duration-medium-1: 250ms;
  --md-sys-motion-duration-medium-2: 300ms;
  --md-sys-motion-duration-medium-3: 350ms;
  --md-sys-motion-duration-medium-4: 400ms;
  --md-sys-motion-duration-long-1: 450ms;
  --md-sys-motion-duration-long-2: 500ms;

  /* Motion easing */
  --md-sys-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --md-sys-motion-easing-emphasized: cubic-bezier(0.2, 0, 0, 1);
  --md-sys-motion-easing-emphasized-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1);
  --md-sys-motion-easing-emphasized-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15);

  /* Elevation */
  --md-sys-elevation-1: 0px 1px 2px rgba(0,0,0,0.3), 0px 1px 3px 1px rgba(0,0,0,0.15);
  --md-sys-elevation-2: 0px 1px 2px rgba(0,0,0,0.3), 0px 2px 6px 2px rgba(0,0,0,0.15);
  --md-sys-elevation-3: 0px 4px 8px 3px rgba(0,0,0,0.15), 0px 1px 3px 1px rgba(0,0,0,0.15);
}`;

// ── Main component ──────────────────────────────────────────────────────────

export function M3BridgeTool() {
  const [input, setInput] = useState('');
  const [inputFormat, setInputFormat] = useState<'css' | 'json'>('css');
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [validation, setValidation] = useState<{ valid: boolean; checks: { name: string; pass: boolean; detail: string }[] } | null>(null);

  const handleConvert = useCallback(() => {
    if (!input.trim()) return;
    const res = inputFormat === 'css' ? parseM3Css(input) : parseM3Json(input);
    setResult(res);
    if (res.count > 0) {
      setValidation(validateDtcg(res.tokens));
    } else {
      setValidation(null);
    }
  }, [input, inputFormat]);

  const handleLoadSample = useCallback(() => {
    setInput(SAMPLE_M3_CSS);
    setInputFormat('css');
  }, []);

  const handleDownload = useCallback(() => {
    if (!result || result.count === 0) return;
    const blob = new Blob([JSON.stringify(result.tokens, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'm3-tokens-dtcg.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const outputJson = useMemo(() => {
    if (!result || result.count === 0) return '';
    return JSON.stringify(result.tokens, null, 2);
  }, [result]);

  return (
    <div className="m3-bridge-tool">
      {/* Input format toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={() => setInputFormat('css')}
          style={{
            padding: '0.4rem 1rem',
            background: inputFormat === 'css' ? 'var(--signal)' : 'var(--surface)',
            color: inputFormat === 'css' ? 'var(--paper)' : 'var(--muted)',
            border: `1px solid ${inputFormat === 'css' ? 'var(--signal)' : 'var(--line)'}`,
            borderRadius: '6px',
            fontSize: '0.8rem',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          CSS custom properties
        </button>
        <button
          onClick={() => setInputFormat('json')}
          style={{
            padding: '0.4rem 1rem',
            background: inputFormat === 'json' ? 'var(--signal)' : 'var(--surface)',
            color: inputFormat === 'json' ? 'var(--paper)' : 'var(--muted)',
            border: `1px solid ${inputFormat === 'json' ? 'var(--signal)' : 'var(--line)'}`,
            borderRadius: '6px',
            fontSize: '0.8rem',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          JSON tokens
        </button>
        <button
          onClick={handleLoadSample}
          style={{
            padding: '0.4rem 1rem',
            background: 'var(--surface)',
            color: 'var(--muted)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            fontSize: '0.8rem',
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          Load M3 sample →
        </button>
      </div>

      {/* Input */}
      <div style={{ marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.5rem' }}>
          Input — Material 3 tokens ({inputFormat === 'css' ? 'CSS custom properties' : 'JSON key-value'})
        </p>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={inputFormat === 'css'
            ? ':root {\n  --md-sys-color-primary: #6750A4;\n  --md-sys-color-on-primary: #FFFFFF;\n  --md-sys-shape-corner-medium: 12px;\n  --md-sys-motion-duration-short-2: 100ms;\n  --md-sys-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);\n  ...'
            : '{\n  "md.sys.color.primary": "#6750A4",\n  "md.sys.color.onPrimary": "#FFFFFF",\n  ...\n}'}
          style={{
            width: '100%',
            minHeight: '200px',
            padding: '1rem',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            color: 'var(--ink)',
            fontFamily: 'var(--mono, ui-monospace, "SF Mono", Menlo, monospace)',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            resize: 'vertical',
            outline: 'none',
          }}
          aria-label="M3 token input"
        />
      </div>

      {/* Convert button */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={handleConvert}
          disabled={!input.trim()}
          className="button primary"
          style={{ fontSize: '0.85rem', opacity: !input.trim() ? 0.5 : 1 }}
          data-cuelume-press="sparkle"
          data-firework="true"
        >
          Convert to DTCG →
        </button>
      </div>

      {/* Results */}
      {result && (
        <div style={{ marginTop: '1.5rem' }}>
          {/* Errors */}
          {result.errors.length > 0 && (
            <div style={{
              padding: '1rem 1.25rem',
              background: 'var(--surface)',
              border: '1px solid var(--error)',
              borderLeft: '3px solid var(--error)',
              borderRadius: '8px',
              marginBottom: '1rem',
            }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--error)', margin: '0 0 0.5rem' }}>Errors</p>
              {result.errors.map((err, i) => (
                <p key={i} style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.25rem 0' }}>{err}</p>
              ))}
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div style={{
              padding: '0.75rem 1.25rem',
              background: 'var(--surface)',
              border: '1px solid var(--warn)',
              borderLeft: '3px solid var(--warn)',
              borderRadius: '8px',
              marginBottom: '1rem',
            }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--warn)', margin: '0 0 0.5rem' }}>
                Warnings ({result.warnings.length})
              </p>
              {result.warnings.slice(0, 5).map((w, i) => (
                <p key={i} style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.15rem 0' }}>{w}</p>
              ))}
              {result.warnings.length > 5 && (
                <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', margin: '0.25rem 0 0' }}>
                  ...and {result.warnings.length - 5} more
                </p>
              )}
            </div>
          )}

          {/* Summary + validation */}
          {result.count > 0 && (
            <>
              <div style={{
                display: 'flex',
                gap: '1rem',
                flexWrap: 'wrap',
                alignItems: 'center',
                padding: '1rem 1.25rem',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                marginBottom: '1rem',
              }}>
                <div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' }}>
                    Tokens converted
                  </p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                    {result.count}
                  </p>
                </div>
                {validation && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {validation.checks.map((check) => (
                      <span
                        key={check.name}
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          border: `1px solid ${check.pass ? 'var(--ok)' : 'var(--error)'}`,
                          color: check.pass ? 'var(--ok)' : 'var(--error)',
                          background: 'var(--paper)',
                        }}
                        title={check.detail}
                      >
                        {check.pass ? '✓' : '✗'} {check.name}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={handleDownload}
                  className="button ghost"
                  style={{ fontSize: '0.8rem', marginLeft: 'auto' }}
                  data-cuelume-hover="tick"
                  data-cuelume-press="tick"
                >
                  Download tokens.json ↓
                </button>
              </div>

              {/* Output */}
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.5rem' }}>
                  Output — W3C DTCG 2025.10 format
                </p>
                <pre
                  style={{
                    padding: '1.25rem',
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    color: 'var(--ink)',
                    fontFamily: 'var(--mono, ui-monospace, "SF Mono", Menlo, monospace)',
                    fontSize: '0.8rem',
                    lineHeight: 1.6,
                    overflow: 'auto',
                    maxHeight: '500px',
                    margin: 0,
                  }}
                >
                  {outputJson}
                </pre>
              </div>

              {/* CTA */}
              <div style={{
                display: 'flex',
                gap: '1rem',
                flexWrap: 'wrap',
                marginTop: '1.5rem',
                alignItems: 'center',
              }}>
                <Link
                  href="/score"
                  className="button primary"
                  style={{ fontSize: '0.85rem' }}
                >
                  Score your site with Designesy →
                </Link>
                <Link
                  href="/contracts/tokens"
                  className="button ghost"
                  style={{ fontSize: '0.85rem' }}
                >
                  View Designesy token contract
                </Link>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted-dim)', marginLeft: 'auto' }}>
                  Conversion is client-side — no data sent to any server.
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}