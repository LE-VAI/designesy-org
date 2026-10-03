'use client';

// M3 → DTCG converter — client-side token format bridge.
//
// Parses M3 token CSS (--md-sys-color-primary, --md-ref-palette-primary40, etc.)
// or M3 JSON token files, converts to W3C DTCG 2025.10 format with
// $type/$value/$description, validates the output, and provides download.
//
// All conversion is client-side — no data sent to any server.

import { useState, useMemo, useCallback } from 'react';
import { Segmented } from '../lib/engine/command-bar';
import { Instrument } from '../lib/engine/instrument';
import { display, type Outcomes, type Phase, type RegistryCheck, type RegistryView } from '../lib/engine/types';

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
  if (tokenName.includes('ref-palette')) return `M3 reference palette token: raw color value`;
  if (tokenName.includes('sys-color')) return `M3 system color token: semantic color role`;
  if (tokenName.includes('sys-shape')) return `M3 system shape token: corner radius`;
  if (tokenName.includes('sys-motion-duration')) return `M3 motion duration token`;
  if (tokenName.includes('sys-motion-easing')) return `M3 motion easing token`;
  if (tokenName.includes('sys-typescale')) return `M3 typography token`;
  if (tokenName.includes('sys-elevation')) return `M3 elevation token`;
  if (tokenName.includes('sys-state')) return `M3 state layer token`;
  if (tokenName.includes('comp-')) return `M3 component token: component-specific override`;
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
        : `${colorCount} colors are bare strings; they should use { colorSpace, components }`
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

// The five checks validateDtcg() runs, in its order, as the instrument draws
// them. Outcomes are matched by position and the names asserted below, so a
// check added to validateDtcg without a row here shows up as a mismatch.
const VALIDATION: RegistryCheck[] = [
  { id: 'b01', label: '$schema declared', item: 'The file points at the DTCG schema', pass: 'A $schema pointer is present', group: 'dtcg' },
  { id: 'b02', label: 'Tokens present', item: 'At least one token converted', pass: 'One or more tokens in the file', group: 'dtcg' },
  { id: 'b03', label: 'Every token typed', item: 'Each token declares a $type', pass: 'No token is missing $type', group: 'dtcg' },
  { id: 'b04', label: 'Every token valued', item: 'Each token has a $value', pass: 'No token is missing $value', group: 'dtcg' },
  { id: 'b05', label: 'Colors structured', item: 'Colors are written as colorSpace and components', pass: 'No color is a bare string', group: 'dtcg' },
];
const VALIDATION_NAMES = ['$schema present', 'Tokens present', 'All tokens have $type', 'All tokens have $value', 'Colors structured (not bare hex)'];
const VIEW: RegistryView = {
  checks: VALIDATION,
  groups: [{ id: 'dtcg', label: 'DTCG validation', hint: 'The converted file, checked against the W3C format.' }],
  machine: '/contracts/tokens.json',
};

export function M3BridgeTool() {
  const [input, setInput] = useState('');
  const [inputFormat, setInputFormat] = useState<'css' | 'json'>('css');
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [validation, setValidation] = useState<{ valid: boolean; checks: { name: string; pass: boolean; detail: string }[] } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleConvert = useCallback(() => {
    if (!input.trim()) return;
    const res = inputFormat === 'css' ? parseM3Css(input) : parseM3Json(input);
    setResult(res);
    setValidation(res.count > 0 ? validateDtcg(res.tokens) : null);
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

  const outputJson = useMemo(() => (result && result.count > 0 ? JSON.stringify(result.tokens, null, 2) : ''), [result]);

  // What the pipeline found, counted from the converted file itself.
  const types = useMemo(() => {
    const t: Record<string, number> = {};
    if (result && result.count > 0) traverseTokens(result.tokens as unknown as Record<string, unknown>, (_k, tok) => {
      t[tok.$type] = (t[tok.$type] || 0) + 1;
    });
    return Object.entries(t).sort((a, b) => b[1] - a[1]);
  }, [result]);

  const outcomes: Outcomes = {};
  if (validation) {
    validation.checks.forEach((c, i) => {
      const row = VALIDATION[i];
      if (row && c.name === VALIDATION_NAMES[i]) outcomes[row.id] = { status: c.pass ? 'PASS' : 'FAIL', detail: c.detail };
    });
  }
  const phase: Phase = !result ? 'idle' : result.count > 0 ? 'done' : 'error';
  const passed = validation ? validation.checks.filter((c) => c.pass).length : 0;
  const lines = input ? input.split('\n').length : 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(outputJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard refused */
    }
  };

  const pipeline = (
    <div className="eg-weights" aria-label="Conversion pipeline">
      <span className="eg-label">The conversion</span>
      <ol className="m3-pipe">
        {/* A figure appears once it exists: lines count as you type, the rest
            on conversion. */}
        <li><b>{lines || ''}</b><span>lines read</span></li>
        <li><b>{result ? result.count : ''}</b><span>tokens parsed</span></li>
        <li>
          <b>{result ? types.length : ''}</b>
          <span>{types.length ? types.map(([k, n]) => `${n} ${k}`).join(' · ') : 'types found'}</span>
        </li>
        <li><b>{validation ? `${passed}/${validation.checks.length}` : ''}</b><span>checks pass</span></li>
      </ol>
    </div>
  );

  // What each Material 3 family becomes, in the face beside the counts it
  // produces (it was a list in the side pane, apart from the conversion).
  const mapping = (
    <div className="eg-weights">
      <span className="eg-label">What it maps</span>
      <dl className="m3-map">
        <div><dt>--md-sys-color-*</dt><dd>Color tokens, written as colorSpace and components.</dd></div>
        <div><dt>--md-sys-shape-*</dt><dd>Corner radii, as dimension tokens.</dd></div>
        <div><dt>--md-sys-motion-*</dt><dd>Durations and easing curves.</dd></div>
        <div><dt>--md-sys-typescale-*</dt><dd>Type sizes, weights and line heights.</dd></div>
      </dl>
    </div>
  );

  return (
    <div className="eg-bench">
      <div className="eg-bar m3-input">
        <div className="m3-head">
          <Segmented<'css' | 'json'>
            label="Input"
            value={inputFormat}
            onChange={setInputFormat}
            options={[
              // Short labels, so the two equal segments never wrap one and not
              // the other on a phone; the hint beside them says the rest.
              { value: 'css', label: 'CSS', hint: <>A <code>:root</code> block of <code>--md-sys-*</code> custom properties.</> },
              { value: 'json', label: 'JSON', hint: <>A flat map of <code>md.sys.*</code> names to values.</> },
            ]}
          />
          <button type="button" className="eg-share-btn" onClick={handleLoadSample} data-cuelume-press="tick">
            Load the M3 baseline sample
          </button>
        </div>
        <label className="sr-only" htmlFor="m3-input">Material 3 tokens to convert</label>
        <div className="eg-bar-field is-area">
          <textarea
            id="m3-input"
            className="eg-bar-input m3-textarea"
            wrap="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={
              inputFormat === 'css'
                ? ':root {\n  --md-sys-color-primary: #6750A4;\n  --md-sys-color-on-primary: #FFFFFF;\n  --md-sys-shape-corner-medium: 12px;\n  --md-sys-motion-duration-short-2: 100ms;\n}'
              : '{\n  "md.sys.color.primary": "#6750A4",\n  "md.sys.color.onPrimary": "#FFFFFF"\n}'
            }
          />
        </div>
        <div className="m3-go">
          <p className="eg-bar-status">
            <span>Converted in your browser. Nothing is sent anywhere.</span>
          </p>
          <button type="button" className="eg-bar-go" onClick={() => (input.trim() ? handleConvert() : document.getElementById('m3-input')?.focus())} data-cuelume-press="sparkle">
            <span className="eg-go-l">
              Convert to DTCG
              <svg className="eg-go-glyph" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
              </svg>
            </span>
          </button>
        </div>
      </div>

      <Instrument
        name="M3 to DTCG"
        registry={VIEW}
        face="tiles"
        faceTop={<>{pipeline}{mapping}</>}
        phase={phase}
        target={result ? `${result.count} tokens` : ''}
        outcomes={outcomes}
        verdictNode={
          validation && result ? (
            <>
              <span className="eg-label">Output</span>
              <dl className="eg-figs">
                <div><dt>Tokens</dt><dd>{result.count}</dd></div>
                <div><dt>Checks</dt><dd>{passed}<small> of {validation.checks.length}</small></dd></div>
              </dl>
              <p className="eg-side-note">
                {validation.valid
                  ? 'Valid W3C DTCG 2025.10. Ready to commit as tokens.json.'
                  : 'Converted, with checks to fix before the file is valid DTCG.'}
              </p>
              <div className="eg-share">
                <button type="button" className="eg-share-btn" onClick={handleDownload}>Download tokens.json</button>
                <button type="button" className="eg-share-btn" onClick={copy} aria-live="polite">{copied ? 'Copied' : 'Copy'}</button>
              </div>
            </>
          ) : null
        }
        error={
          <>
            <p><b>No Material 3 tokens found.</b></p>
            {(result?.errors ?? []).slice(0, 3).map((e, i) => <p key={i}>{e}</p>)}
            <p>Tokens need the --md- prefix in CSS, or md. keys in JSON.</p>
          </>
        }
        scoring="valid when all five checks pass"
        restNote="Paste Material 3 tokens, or load the sample, and convert. Each stage of the conversion counts what it found."
        restCard={
          <div className="eg-ref">
            <p className="eg-ref-note">Paths follow the names: --md-sys-color-primary becomes color.primary.</p>
          </div>
        }
      />

      {result && result.warnings.length > 0 && (
        <div className="eg-alerts" role="status">
          <span className="eg-label">{result.warnings.length === 1 ? '1 warning' : `${result.warnings.length} warnings`}</span>
          <ul>
            {result.warnings.slice(0, 5).map((w, i) => <li key={i}>{display(w)}</li>)}
          </ul>
          {result.warnings.length > 5 && <p className="eg-quiet">{result.warnings.length - 5} more in the file</p>}
        </div>
      )}

      {result && result.count > 0 && (
        <section className="eg-section" aria-labelledby="m3-out-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="m3-out-h">tokens.json</h2>
              <p className="eg-section-sub">{result.count} tokens in W3C DTCG 2025.10 format</p>
            </div>
          </div>
          <div className="eg-viewer">
            <pre className="eg-code" tabIndex={0}>
              <code>{outputJson}</code>
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}
