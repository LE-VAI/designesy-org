/**
 * @designesy/tokens — DTCG 2025.10 token validator.
 *
 * 10 conformance checks against the W3C Design Tokens Format Module
 * 2025.10 stable spec (CG-FINAL, 2025-10-28).
 *
 * Zero dependencies. Works offline. No network calls.
 *
 * Spec references:
 *   https://www.designtokens.org/schemas/2025.10/format.json
 *   https://www.w3.org/community/design-tokens/
 */

// ── Types ────────────────────────────────────────────────────────────────

export type CheckStatus = 'PASS' | 'FAIL' | 'WARN';

export interface CheckResult {
  id: string;
  item: string;
  status: CheckStatus;
  detail: string;
}

export interface ValidationResult {
  url: string | null;
  file: string | null;
  score: number;
  grade: string;
  valid: boolean;
  pass: number;
  warn: number;
  fail: number;
  total: number;
  checks: CheckResult[];
  tokensCount: number;
}

// ── DTCG token tree traversal ────────────────────────────────────────────

interface TokenNode {
  $type?: string;
  $value?: unknown;
  $description?: string;
  $schema?: string;
  $extensions?: Record<string, unknown>;
  $ref?: string;
  [key: string]: unknown;
}

interface TraversalResult {
  tokens: Array<{
    path: string;
    type: string | null;
    value: unknown;
    description: string | null;
    ref: string | null;
    extensions: Record<string, unknown> | null;
    depth: number;
    isGroup: boolean;
  }>;
  hasSchema: boolean;
  groups: number;
}

const DTCG_TYPES = new Set([
  'color',
  'dimension',
  'fontFamily',
  'duration',
  'cubicBezier',
  'number',
  'boolean',
  'string',
  'strokeStyle',
  'border',
  'shadow',
  'gradient',
  'transition',
  'typography',
]);

const PROPERTY_KEYS = new Set([
  '$type',
  '$value',
  '$description',
  '$schema',
  '$extensions',
  '$ref',
]);

function isTokenNode(obj: unknown): obj is TokenNode {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

function hasTokenProperties(node: TokenNode): boolean {
  return '$value' in node || '$type' in node || '$ref' in node;
}

/**
 * Walk the DTCG tree and collect all token leaves with their inherited type.
 */
function traverse(
  obj: Record<string, unknown>,
  path: string,
  inheritedType: string | null,
  depth: number,
  result: TraversalResult,
): void {
  for (const [key, child] of Object.entries(obj)) {
    // Skip $-prefixed properties at this level (they belong to the group)
    if (key.startsWith('$') && !PROPERTY_KEYS.has(key)) continue;

    // Collect $-properties from groups
    if (key === '$schema' && depth === 0) {
      result.hasSchema = true;
    }

    if (!isTokenNode(child)) continue;

    const childPath = path ? `${path}.${key}` : key;
    const childType = child.$type ?? inheritedType;

    if (hasTokenProperties(child)) {
      // This is a token (has $value, $type, or $ref)
      result.tokens.push({
        path: childPath,
        type: childType ?? null,
        value: child.$value ?? null,
        description: child.$description ?? null,
        ref: child.$ref ?? null,
        extensions: child.$extensions ?? null,
        depth,
        isGroup: false,
      });
    }

    // Recurse into groups (non-$ keys that are objects)
    for (const [gk, gv] of Object.entries(child)) {
      if (gk.startsWith('$')) continue;
      if (isTokenNode(gv)) {
        result.groups++;
        traverse(child as Record<string, unknown>, childPath, childType, depth + 1, result);
      }
    }
  }
}

// ── Color value validation ───────────────────────────────────────────────

interface StructuredColor {
  colorSpace: string;
  components: Record<string, number>;
}

function isStructuredColor(value: unknown): value is StructuredColor {
  return (
    typeof value === 'object' &&
    value !== null &&
    'colorSpace' in value &&
    'components' in value
  );
}

function isBareHex(value: unknown): boolean {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

function isOKLCH(value: unknown): boolean {
  return typeof value === 'string' && /^oklch\(/i.test(value.trim());
}

function isDisplayP3(value: unknown): boolean {
  return (
    isStructuredColor(value) &&
    (value as StructuredColor).colorSpace === 'display-p3'
  );
}

function isStructuredOKLCH(value: unknown): boolean {
  return (
    isStructuredColor(value) &&
    (value as StructuredColor).colorSpace === 'oklch'
  );
}

// ── Dimension validation ─────────────────────────────────────────────────

const VALID_DIMENSION_UNITS = new Set(['px', 'rem']);

function isDimensionString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = value.match(/^[\d.]+(px|rem|em|vw|vh|vmin|vmax|%|ch|ex|pt|pc|in|cm|mm)$/i);
  if (!match) return false;
  return VALID_DIMENSION_UNITS.has(match[1].toLowerCase());
}

function isDimensionObject(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { value?: unknown; unit?: unknown };
  return (
    typeof v.value === 'number' &&
    typeof v.unit === 'string' &&
    VALID_DIMENSION_UNITS.has(v.unit.toLowerCase())
  );
}

// ── $ref resolution ──────────────────────────────────────────────────────

function resolveRef(ref: string, root: Record<string, unknown>): TokenNode | null {
  // DTCG refs use {path.to.token} syntax
  const clean = ref.replace(/^[{}]/g, '').replace(/[}]$/g, '');
  const parts = clean.split('.');
  let current: unknown = root;
  for (const part of parts) {
    if (!isTokenNode(current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return isTokenNode(current) ? current : null;
}

// ── 10 Conformance Checks ────────────────────────────────────────────────

/**
 * t01: Every token has $type (direct or inherited from parent group).
 */
function checkT01Type(traversal: TraversalResult): CheckResult {
  const missing = traversal.tokens.filter((t) => t.type === null);
  if (missing.length === 0) {
    return { id: 't01', item: 'Every token has $type (direct or inherited)', status: 'PASS', detail: `All ${traversal.tokens.length} tokens typed` };
  }
  const sample = missing.slice(0, 5).map((t) => t.path).join(', ');
  return {
    id: 't01',
    item: 'Every token has $type (direct or inherited)',
    status: 'FAIL',
    detail: `${missing.length} token(s) missing type: ${sample}${missing.length > 5 ? '…' : ''}`,
  };
}

/**
 * t02: Every token has $value.
 */
function checkT02Value(traversal: TraversalResult): CheckResult {
  const missing = traversal.tokens.filter((t) => t.value === null && t.ref === null);
  if (missing.length === 0) {
    return { id: 't02', item: 'Every token has $value', status: 'PASS', detail: `All ${traversal.tokens.length} tokens valued` };
  }
  const sample = missing.slice(0, 5).map((t) => t.path).join(', ');
  return {
    id: 't02',
    item: 'Every token has $value',
    status: 'FAIL',
    detail: `${missing.length} token(s) missing value: ${sample}${missing.length > 5 ? '…' : ''}`,
  };
}

/**
 * t03: Semantic tokens have $description (warn on primitive missing description).
 * Heuristic: tokens at depth > 1 are semantic; depth ≤ 1 are primitives.
 */
function checkT03Description(traversal: TraversalResult): CheckResult {
  const semantic = traversal.tokens.filter((t) => t.depth > 1);
  const primitives = traversal.tokens.filter((t) => t.depth <= 1);
  const semanticMissing = semantic.filter((t) => t.description === null);
  const primitiveMissing = primitives.filter((t) => t.description === null);

  if (semanticMissing.length === 0 && primitiveMissing.length === 0) {
    return { id: 't03', item: 'Semantic tokens have $description', status: 'PASS', detail: `All ${traversal.tokens.length} tokens described` };
  }
  if (semanticMissing.length > 0) {
    const sample = semanticMissing.slice(0, 5).map((t) => t.path).join(', ');
    return {
      id: 't03',
      item: 'Semantic tokens have $description',
      status: 'FAIL',
      detail: `${semanticMissing.length} semantic token(s) missing description: ${sample}${semanticMissing.length > 5 ? '…' : ''}`,
    };
  }
  return {
    id: 't03',
    item: 'Semantic tokens have $description',
    status: 'WARN',
    detail: `${primitiveMissing.length} primitive token(s) missing description (recommended, not required)`,
  };
}

/**
 * t04: Color tokens use OKLCH or Display-P3 (fail on new semantic using bare hex).
 */
function checkT04ColorSpace(traversal: TraversalResult): CheckResult {
  const colorTokens = traversal.tokens.filter((t) => t.type === 'color');
  if (colorTokens.length === 0) {
    return { id: 't04', item: 'Color tokens use OKLCH or Display-P3', status: 'PASS', detail: 'No color tokens found' };
  }

  const semanticColors = colorTokens.filter((t) => t.depth > 1);
  const primitiveColors = colorTokens.filter((t) => t.depth <= 1);

  const semanticHex = semanticColors.filter((t) => isBareHex(t.value));
  const primitiveHex = primitiveColors.filter((t) => isBareHex(t.value));
  const structured = colorTokens.filter(
    (t) => isStructuredOKLCH(t.value) || isDisplayP3(t.value) || isOKLCH(t.value),
  );

  if (semanticHex.length > 0) {
    const sample = semanticHex.slice(0, 5).map((t) => `${t.path}=${t.value}`).join(', ');
    return {
      id: 't04',
      item: 'Color tokens use OKLCH or Display-P3',
      status: 'FAIL',
      detail: `${semanticHex.length} semantic color(s) using bare hex: ${sample}${semanticHex.length > 5 ? '…' : ''}`,
    };
  }

  if (primitiveHex.length > 0 && structured.length === 0) {
    return {
      id: 't04',
      item: 'Color tokens use OKLCH or Display-P3',
      status: 'WARN',
      detail: `${primitiveHex.length} primitive color(s) using legacy hex (valid DTCG, should migrate to OKLCH)`,
    };
  }

  if (primitiveHex.length > 0) {
    return {
      id: 't04',
      item: 'Color tokens use OKLCH or Display-P3',
      status: 'WARN',
      detail: `${structured.length} structured + ${primitiveHex.length} legacy hex primitives`,
    };
  }

  return {
    id: 't04',
    item: 'Color tokens use OKLCH or Display-P3',
    status: 'PASS',
    detail: `All ${colorTokens.length} color tokens use structured color spaces`,
  };
}

/**
 * t05: Custom types namespaced under $extensions.designesy.* (or equivalent).
 */
function checkT05CustomTypes(traversal: TraversalResult): CheckResult {
  const customTypes = traversal.tokens.filter(
    (t) => t.type !== null && !DTCG_TYPES.has(t.type),
  );
  if (customTypes.length === 0) {
    return { id: 't05', item: 'Custom types namespaced under $extensions', status: 'PASS', detail: 'No custom types found' };
  }

  const bare = customTypes.filter((t) => !t.extensions || !t.extensions.designesy);
  if (bare.length > 0) {
    const sample = bare.slice(0, 5).map((t) => `${t.path}($type: ${t.type})`).join(', ');
    return {
      id: 't05',
      item: 'Custom types namespaced under $extensions',
      status: 'FAIL',
      detail: `${bare.length} custom type(s) without $extensions: ${sample}${bare.length > 5 ? '…' : ''}`,
    };
  }

  return {
    id: 't05',
    item: 'Custom types namespaced under $extensions',
    status: 'PASS',
    detail: `All ${customTypes.length} custom type(s) namespaced under $extensions`,
  };
}

/**
 * t06: Aliases ($ref) resolve to valid typed tokens.
 */
function checkT06Aliases(traversal: TraversalResult, root: Record<string, unknown>): CheckResult {
  const refs = traversal.tokens.filter((t) => t.ref !== null);
  if (refs.length === 0) {
    return { id: 't06', item: 'Aliases resolve to valid typed tokens', status: 'PASS', detail: 'No aliases found' };
  }

  const dangling = refs.filter((t) => {
    const target = resolveRef(t.ref!, root);
    return target === null;
  });

  if (dangling.length > 0) {
    const sample = dangling.slice(0, 5).map((t) => `${t.path} → ${t.ref}`).join(', ');
    return {
      id: 't06',
      item: 'Aliases resolve to valid typed tokens',
      status: 'FAIL',
      detail: `${dangling.length} dangling reference(s): ${sample}${dangling.length > 5 ? '…' : ''}`,
    };
  }

  return {
    id: 't06',
    item: 'Aliases resolve to valid typed tokens',
    status: 'PASS',
    detail: `All ${refs.length} alias(es) resolve`,
  };
}

/**
 * t07: $schema property present (warn on missing — no editor validation).
 */
function checkT07Schema(traversal: TraversalResult): CheckResult {
  if (traversal.hasSchema) {
    return { id: 't07', item: '$schema property present', status: 'PASS', detail: '$schema declared' };
  }
  return {
    id: 't07',
    item: '$schema property present',
    status: 'WARN',
    detail: 'Missing $schema (no editor validation, recommended: https://www.designtokens.org/schemas/2025.10/format.json)',
  };
}

/**
 * t08: DTCG 2025.10 structural validation (basic JSON structure checks).
 * Full schema validation requires ajv + the DTCG JSON Schema URL.
 * This check performs structural validation without external dependencies.
 */
function checkT08Structure(root: Record<string, unknown>): CheckResult {
  const errors: string[] = [];

  // Top-level must be an object
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    return { id: 't08', item: 'DTCG 2025.10 structural validation', status: 'FAIL', detail: 'Root is not an object' };
  }

  // $-prefixed top-level properties must be valid
  for (const key of Object.keys(root)) {
    if (key.startsWith('$') && !PROPERTY_KEYS.has(key) && key !== '$version') {
      errors.push(`Unknown $-property at root: ${key}`);
    }
  }

  // Check for circular $ref (basic detection — BFS, max depth 50)
  function hasCircularRef(obj: unknown, visited: Set<string>, path: string): boolean {
    if (!isTokenNode(obj)) return false;
    const ref = (obj as TokenNode).$ref;
    if (ref) {
      const clean = ref.replace(/^[{}]/g, '').replace(/[}]$/g, '');
      if (visited.has(clean)) return true;
      if (visited.size > 50) return true;
      const target = resolveRef(ref, root);
      if (target && hasCircularRef(target, new Set([...visited, clean]), path)) {
        errors.push(`Circular reference: ${path} → ${ref}`);
        return true;
      }
    }
    return false;
  }

  for (const [key, val] of Object.entries(root)) {
    if (key.startsWith('$')) continue;
    if (isTokenNode(val)) hasCircularRef(val, new Set(), key);
  }

  if (errors.length > 0) {
    return {
      id: 't08',
      item: 'DTCG 2025.10 structural validation',
      status: 'FAIL',
      detail: errors.slice(0, 3).join('; '),
    };
  }

  return {
    id: 't08',
    item: 'DTCG 2025.10 structural validation',
    status: 'PASS',
    detail: 'Structural validation passed (basic checks; use @terrazzo/parser for full schema validation)',
  };
}

/**
 * t09: No type drift between themes (same token path, different $type).
 * This check requires multiple theme files to be merged; for a single file,
 * it checks for internal type consistency.
 */
function checkT09TypeDrift(traversal: TraversalResult): CheckResult {
  const byPath = new Map<string, string>();
  const drift: string[] = [];

  for (const token of traversal.tokens) {
    if (token.type === null) continue;
    const existing = byPath.get(token.path);
    if (existing && existing !== token.type) {
      drift.push(`${token.path}: ${existing} → ${token.type}`);
    } else {
      byPath.set(token.path, token.type);
    }
  }

  if (drift.length > 0) {
    return {
      id: 't09',
      item: 'No type drift between themes',
      status: 'FAIL',
      detail: `${drift.length} type drift(s): ${drift.slice(0, 3).join(', ')}${drift.length > 3 ? '…' : ''}`,
    };
  }

  return {
    id: 't09',
    item: 'No type drift between themes',
    status: 'PASS',
    detail: 'Consistent types across all tokens',
  };
}

/**
 * t10: Dimension units are px or rem only.
 */
function checkT10Dimensions(traversal: TraversalResult): CheckResult {
  const dimensions = traversal.tokens.filter((t) => t.type === 'dimension');
  if (dimensions.length === 0) {
    return { id: 't10', item: 'Dimension units are px or rem only', status: 'PASS', detail: 'No dimension tokens found' };
  }

  const invalid = dimensions.filter((t) => {
    if (typeof t.value === 'string') {
      const match = t.value.match(/^[\d.]+(px|rem|em|vw|vh|vmin|vmax|%|ch|ex|pt|pc|in|cm|mm)$/i);
      return match && !VALID_DIMENSION_UNITS.has(match[1].toLowerCase());
    }
    if (isDimensionObject(t.value)) return false;
    return false;
  });

  if (invalid.length > 0) {
    const sample = invalid.slice(0, 5).map((t) => `${t.path}=${t.value}`).join(', ');
    return {
      id: 't10',
      item: 'Dimension units are px or rem only',
      status: 'FAIL',
      detail: `${invalid.length} dimension(s) with non-px/rem units: ${sample}${invalid.length > 5 ? '…' : ''}`,
    };
  }

  return {
    id: 't10',
    item: 'Dimension units are px or rem only',
    status: 'PASS',
    detail: `All ${dimensions.length} dimension(s) use px or rem`,
  };
}

// ── Scoring ──────────────────────────────────────────────────────────────

function scoreChecks(checks: CheckResult[]): { score: number; grade: string; pass: number; warn: number; fail: number } {
  let points = 0;
  let pass = 0;
  let warn = 0;
  let fail = 0;

  for (const check of checks) {
    if (check.status === 'PASS') {
      points += 1;
      pass++;
    } else if (check.status === 'WARN') {
      points += 0.5;
      warn++;
    } else {
      fail++;
    }
  }

  const score = Math.round((points / checks.length) * 100);
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  return { score, grade, pass, warn, fail };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Validate a DTCG token object against 10 conformance checks.
 *
 * @param tokenFile - The parsed DTCG token JSON object
 * @param source - Optional source label (file path or URL) for the result
 * @returns Validation result with score, grade, and per-check details
 */
export function validateTokens(
  tokenFile: Record<string, unknown>,
  source?: string,
): ValidationResult {
  const traversal: TraversalResult = {
    tokens: [],
    hasSchema: false,
    groups: 0,
  };

  traverse(tokenFile, '', null, 0, traversal);

  const checks: CheckResult[] = [
    checkT01Type(traversal),
    checkT02Value(traversal),
    checkT03Description(traversal),
    checkT04ColorSpace(traversal),
    checkT05CustomTypes(traversal),
    checkT06Aliases(traversal, tokenFile),
    checkT07Schema(traversal),
    checkT08Structure(tokenFile),
    checkT09TypeDrift(traversal),
    checkT10Dimensions(traversal),
  ];

  const { score, grade, pass, warn, fail } = scoreChecks(checks);

  const isUrl = source?.startsWith('http://') || source?.startsWith('https://');

  return {
    url: isUrl ? source ?? null : null,
    file: !isUrl ? source ?? null : null,
    score,
    grade,
    valid: fail === 0,
    pass,
    warn,
    fail,
    total: checks.length,
    checks,
    tokensCount: traversal.tokens.length,
  };
}

/**
 * Validate a DTCG token JSON string.
 *
 * @param jsonString - Raw JSON string of a DTCG token file
 * @param source - Optional source label for the result
 * @returns Validation result or error
 */
export function validateTokenString(
  jsonString: string,
  source?: string,
): ValidationResult | { error: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { error: 'Invalid JSON: could not parse token file' };
  }
  return validateTokens(parsed, source);
}