/**
 * @designesy/tokens — DTCG 2025.10 token validator.
 *
 * 20 conformance checks against the W3C Design Tokens Format Module
 * 2025.10 stable spec (CG-FINAL, 2025-10-28).
 *
 * Zero dependencies. Works offline. No network calls.
 *
 * Spec references:
 *   https://www.designtokens.org/TR/2025.10/format/
 *   https://w3c.github.io/cg-reports/design-tokens/CG-FINAL-format-20251028/
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
  $deprecated?: unknown;
  [key: string]: unknown;
}

interface TokenInfo {
  path: string;
  name: string;
  type: string | null;
  value: unknown;
  description: string | null;
  ref: string | null;
  aliasRef: string | null;
  extensions: Record<string, unknown> | null;
  deprecated: unknown;
  depth: number;
  isGroup: boolean;
  node: TokenNode;
}

interface TraversalResult {
  tokens: TokenInfo[];
  hasSchema: boolean;
  groups: number;
  nameSegments: string[];
}

const DTCG_TYPES = new Set([
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
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
  '$deprecated',
  '$extends',
  '$root',
]);

// 14 valid DTCG 2025.10 color spaces (Color Module §4.2)
const VALID_COLOR_SPACES = new Set([
  'srgb',
  'srgb-linear',
  'hsl',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'display-p3',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz-d65',
  'xyz-d50',
]);

// Font weight predefined string keywords (§8.4)
const FONT_WEIGHT_KEYWORDS = new Set([
  'thin',
  'extralight',
  'ultralight',
  'light',
  'normal',
  'regular',
  'medium',
  'semibold',
  'demibold',
  'bold',
  'extrabold',
  'ultrabold',
  'black',
  'heavy',
  'extrablack',
  'ultrablack',
]);

const VALID_DIMENSION_UNITS = new Set(['px', 'rem']);
const VALID_DURATION_UNITS = new Set(['ms', 's']);

// Composite type required children (§9)
const COMPOSITE_REQUIRED: Record<string, string[]> = {
  shadow: ['color', 'offsetX', 'offsetY', 'blur', 'spread'],
  border: ['color', 'width', 'style'],
  transition: ['duration', 'delay', 'timingFunction'],
  typography: ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight'],
};

function isTokenNode(obj: unknown): obj is TokenNode {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

function hasTokenProperties(node: TokenNode): boolean {
  return '$value' in node || '$ref' in node;
}

/**
 * Check if a node is a group (has non-$ child keys that are objects).
 * Groups carry $type for inheritance but don't have $value/$ref themselves.
 */
function isGroupNode(node: TokenNode): boolean {
  for (const [key, val] of Object.entries(node)) {
    if (!key.startsWith('$') && isTokenNode(val)) return true;
  }
  return false;
}

/**
 * Extract a reference path from a $value string like "{path.to.token}".
 * Returns the clean dotted path, or null if the value isn't a reference.
 */
function extractAliasRef(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^\{([^}]+)\}$/);
  return match ? match[1] : null;
}

/**
 * Walk the DTCG tree and collect all token leaves with their inherited type.
 *
 * A node is a **token** if it has $value or $ref (leaf).
 * A node is a **group** if it has non-$ child keys that are objects (branch).
 * A node can be both (has $value AND sub-tokens), but that's unusual —
 * we treat it as a token and still recurse for sub-tokens.
 */
function traverse(
  obj: Record<string, unknown>,
  path: string,
  inheritedType: string | null,
  depth: number,
  result: TraversalResult,
): void {
  for (const [key, child] of Object.entries(obj)) {
    // Collect ALL name segments for naming checks (t12/t13) — including $-prefixed
    result.nameSegments.push(key);

    if (key === '$schema' && depth === 0) {
      result.hasSchema = true;
    }

    // $-prefixed properties are metadata, not groups/tokens — skip after collecting name
    if (key.startsWith('$')) continue;

    if (!isTokenNode(child)) continue;

    const childPath = path ? `${path}.${key}` : key;
    const childType = child.$type ?? inheritedType;
    const isGroup = isGroupNode(child);
    // A node is a token if it has $value/$ref, OR if it has $type but no
    // sub-groups (a typed node with no children is a malformed token, not a group)
    const isToken = hasTokenProperties(child) || ('$type' in child && !isGroup);

    if (isToken) {
      const aliasRef = extractAliasRef(child.$value);

      result.tokens.push({
        path: childPath,
        name: key,
        type: childType ?? null,
        value: child.$value ?? null,
        description: child.$description ?? null,
        ref: child.$ref ?? null,
        aliasRef,
        extensions: child.$extensions ?? null,
        deprecated: child.$deprecated,
        depth,
        isGroup,
        node: child,
      });
    }

    // Recurse into sub-groups (non-$ keys whose values are objects)
    if (isGroup) {
      result.groups++;
      // Recurse into the child's non-$ object properties
      for (const [subKey, subVal] of Object.entries(child)) {
        if (subKey.startsWith('$')) continue;
        if (isTokenNode(subVal)) {
          traverse(
            { [subKey]: subVal } as Record<string, unknown>,
            childPath,
            childType,
            depth + 1,
            result,
          );
        }
      }
    }
  }
}

// ── Color value validation ───────────────────────────────────────────────

interface StructuredColor {
  colorSpace: string;
  components: number[] | Record<string, number>;
  alpha?: number;
  hex?: string;
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
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
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

function isStructuredColorAny(value: unknown): boolean {
  return isStructuredColor(value) && VALID_COLOR_SPACES.has((value as StructuredColor).colorSpace);
}

/**
 * Validate a structured color value's internal structure.
 * Returns an array of error strings (empty if valid).
 */
function validateColorValue(value: unknown): string[] {
  const errors: string[] = [];

  if (!isStructuredColor(value)) {
    if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
      return []; // bare 6-digit hex is valid per Color Module
    }
    if (typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value) && value.length !== 7) {
      errors.push(`hex must be exactly 6 digits, got ${value.length - 1} digits`);
    }
    return errors;
  }

  const color = value as StructuredColor;

  // Validate colorSpace
  if (!VALID_COLOR_SPACES.has(color.colorSpace)) {
    errors.push(`invalid colorSpace "${color.colorSpace}" (must be one of ${VALID_COLOR_SPACES.size} valid spaces)`);
  }

  // Validate components — must be an array of 3 numbers (or 'none' keywords)
  if (!Array.isArray(color.components)) {
    errors.push('components must be an array');
  } else {
    if (color.components.length !== 3) {
      errors.push(`components must have 3 elements, got ${color.components.length}`);
    }
    for (let i = 0; i < color.components.length; i++) {
      const c = color.components[i];
      if (typeof c !== 'number' && c !== 'none') {
        errors.push(`component[${i}] must be a number or "none", got ${typeof c}`);
      }
    }
  }

  // Validate alpha if present
  if (color.alpha !== undefined) {
    if (typeof color.alpha !== 'number' || color.alpha < 0 || color.alpha > 1) {
      errors.push(`alpha must be a number in [0, 1], got ${color.alpha}`);
    }
  }

  // Validate hex if present — must be exactly 6 digits
  if (color.hex !== undefined) {
    if (typeof color.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color.hex)) {
      errors.push(`hex must be in 6-digit CSS hex format (#RRGGBB), got "${color.hex}"`);
    }
  }

  return errors;
}

// ── Primitive value validation ───────────────────────────────────────────

/**
 * Validate that a $value matches the structure expected for its $type.
 * Returns an array of error strings (empty if valid).
 */
function validatePrimitiveValue(type: string, value: unknown): string[] {
  const errors: string[] = [];

  switch (type) {
    case 'dimension': {
      if (typeof value === 'string') {
        const match = value.match(/^[\d.]+(px|rem|em|vw|vh|vmin|vmax|%|ch|ex|pt|pc|in|cm|mm)$/i);
        if (!match) {
          errors.push(`dimension string "${value}" is malformed`);
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const v = value as { value?: unknown; unit?: unknown };
        if (typeof v.value !== 'number') {
          errors.push('dimension.value must be a number');
        }
        if (typeof v.unit !== 'string') {
          errors.push('dimension.unit must be a string');
        }
      } else {
        errors.push(`dimension value must be a string or {value, unit} object, got ${typeof value}`);
      }
      break;
    }

    case 'duration': {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const v = value as { value?: unknown; unit?: unknown };
        if (typeof v.value !== 'number') {
          errors.push('duration.value must be a number');
        }
        if (typeof v.unit !== 'string' || !VALID_DURATION_UNITS.has(v.unit.toLowerCase())) {
          errors.push(`duration.unit must be "ms" or "s", got "${v.unit}"`);
        }
      } else {
        errors.push(`duration value must be a {value, unit} object, got ${typeof value}`);
      }
      break;
    }

    case 'cubicBezier': {
      if (!Array.isArray(value)) {
        errors.push(`cubicBezier value must be an array of 4 numbers, got ${typeof value}`);
      } else if (value.length !== 4) {
        errors.push(`cubicBezier must have exactly 4 numbers, got ${value.length}`);
      } else {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] !== 'number') {
            errors.push(`cubicBezier[${i}] must be a number, got ${typeof value[i]}`);
          }
        }
        // x coordinates (indices 0 and 2) must be in [0, 1]
        if (typeof value[0] === 'number' && (value[0] < 0 || value[0] > 1)) {
          errors.push(`cubicBezier x1 must be in [0, 1], got ${value[0]}`);
        }
        if (typeof value[2] === 'number' && (value[2] < 0 || value[2] > 1)) {
          errors.push(`cubicBezier x2 must be in [0, 1], got ${value[2]}`);
        }
      }
      break;
    }

    case 'number': {
      if (typeof value !== 'number') {
        errors.push(`number value must be a JSON number, got ${typeof value}`);
      }
      break;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        errors.push(`boolean value must be true or false, got ${typeof value}`);
      }
      break;
    }

    case 'string': {
      if (typeof value !== 'string') {
        errors.push(`string value must be a JSON string, got ${typeof value}`);
      }
      break;
    }

    case 'fontFamily': {
      if (typeof value !== 'string' && !Array.isArray(value)) {
        errors.push(`fontFamily value must be a string or array of strings, got ${typeof value}`);
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] !== 'string') {
            errors.push(`fontFamily[${i}] must be a string, got ${typeof value[i]}`);
          }
        }
      }
      break;
    }

    case 'fontWeight': {
      if (typeof value === 'number') {
        if (value < 1 || value > 1000) {
          errors.push(`fontWeight number must be in [1, 1000], got ${value}`);
        }
      } else if (typeof value === 'string') {
        if (!FONT_WEIGHT_KEYWORDS.has(value)) {
          errors.push(`fontWeight string "${value}" is not a valid keyword`);
        }
      } else {
        errors.push(`fontWeight must be a number (1-1000) or keyword string, got ${typeof value}`);
      }
      break;
    }

    case 'color': {
      errors.push(...validateColorValue(value));
      break;
    }
  }

  return errors;
}

/**
 * Validate composite type structure (shadow, border, transition, gradient, typography).
 * Returns an array of error strings (empty if valid).
 */
function validateCompositeValue(type: string, value: unknown): string[] {
  const errors: string[] = [];

  if (type === 'gradient') {
    if (!Array.isArray(value)) {
      errors.push(`gradient value must be an array of stop objects, got ${typeof value}`);
    } else {
      for (let i = 0; i < value.length; i++) {
        const stop = value[i];
        if (typeof stop !== 'object' || stop === null) {
          errors.push(`gradient stop[${i}] must be an object`);
          continue;
        }
        if (!('color' in stop)) {
          errors.push(`gradient stop[${i}] missing required "color"`);
        }
        if (!('position' in stop)) {
          errors.push(`gradient stop[${i}] missing required "position"`);
        } else if (typeof (stop as { position: unknown }).position !== 'number') {
          errors.push(`gradient stop[${i}].position must be a number`);
        }
      }
    }
    return errors;
  }

  if (type === 'shadow') {
    // Shadow can be a single object or an array of objects
    const shadows: unknown[] = Array.isArray(value) ? value : [value];
    for (let i = 0; i < shadows.length; i++) {
      const shadow = shadows[i];
      if (typeof shadow !== 'object' || shadow === null || Array.isArray(shadow)) {
        errors.push(`shadow[${i}] must be an object`);
        continue;
      }
      const required = COMPOSITE_REQUIRED.shadow;
      for (const field of required) {
        if (!(field in (shadow as Record<string, unknown>))) {
          errors.push(`shadow[${i}] missing required "${field}"`);
        }
      }
      // inset is optional
    }
    return errors;
  }

  // Other composite types require an object with specific children
  const required = COMPOSITE_REQUIRED[type];
  if (!required) return errors; // Not a composite type we validate

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push(`${type} value must be an object, got ${typeof value}`);
    return errors;
  }

  for (const field of required) {
    if (!(field in (value as Record<string, unknown>))) {
      errors.push(`${type} missing required "${field}"`);
    }
  }

  return errors;
}

// ── Reference resolution ─────────────────────────────────────────────────

function resolveRef(ref: string, root: Record<string, unknown>): TokenNode | null {
  // Handle both {path.to.token} and bare path.to.token
  const clean = ref.replace(/^\{/, '').replace(/\}$/, '');
  const parts = clean.split('.');
  let current: unknown = root;
  for (const part of parts) {
    if (!isTokenNode(current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return isTokenNode(current) ? current : null;
}

/**
 * Resolve a reference and return both the target node and its resolved type.
 */
function resolveAliasWithType(
  ref: string,
  root: Record<string, unknown>,
  allTokens: TokenInfo[],
): { node: TokenNode | null; type: string | null } {
  const node = resolveRef(ref, root);
  if (!node) return { node: null, type: null };

  // Try to find the type from the token list (handles inherited types)
  const clean = ref.replace(/^\{/, '').replace(/\}$/, '');
  const tokenInfo = allTokens.find((t) => t.path === clean);
  const type = tokenInfo?.type ?? node.$type ?? null;

  return { node, type };
}

/**
 * Detect circular reference chains using DFS.
 * Follows both $ref and $value: "{ref}" syntaxes.
 */
function detectCircularRefs(
  allTokens: TokenInfo[],
  root: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function check(token: TokenInfo, stack: string[]): void {
    const ref = token.ref ?? token.aliasRef;
    if (!ref) return;

    const clean = ref.replace(/^\{/, '').replace(/\}$/, '');

    if (inStack.has(clean)) {
      // Found a cycle — report all tokens in the chain
      const cycleStart = stack.indexOf(clean);
      const chain = [...stack.slice(cycleStart), clean];
      errors.push(`Circular reference: ${chain.join(' → ')}`);
      return;
    }

    if (visited.has(clean)) return; // Already fully explored
    visited.add(clean);
    inStack.add(clean);

    // Find the target token and recurse
    const targetToken = allTokens.find((t) => t.path === clean);
    if (targetToken) {
      check(targetToken, [...stack, clean]);
    }

    inStack.delete(clean);
  }

  for (const token of allTokens) {
    const ref = token.ref ?? token.aliasRef;
    if (!ref) continue;
    const clean = ref.replace(/^\{/, '').replace(/\}$/, '');
    if (!visited.has(token.path)) {
      visited.add(token.path);
      inStack.add(token.path);
      check(token, [token.path]);
      inStack.delete(token.path);
    }
  }

  return errors;
}

// ── 20 Conformance Checks ────────────────────────────────────────────────

/**
 * t01: Every token has $type (direct or inherited from parent group).
 * §5.2.2: "If the $type property is not set on a token, then the token's type
 * MUST be determined as follows: [3-tier algorithm]... Otherwise... the token
 * MUST be considered invalid."
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
 * §5.1: "Name and value are both required."
 */
function checkT02Value(traversal: TraversalResult): CheckResult {
  const missing = traversal.tokens.filter((t) => t.value === null && t.ref === null && t.aliasRef === null);
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
 * Expanded to recognize all 14 valid DTCG color spaces.
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
    (t) => isStructuredOKLCH(t.value) || isDisplayP3(t.value) || isOKLCH(t.value) || isStructuredColorAny(t.value),
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
 * t06: Aliases ($ref and $value:"{ref}") resolve to valid typed tokens.
 * §7.2.2: "tools MUST follow each reference until they find a token with an
 * explicit value."
 */
function checkT06Aliases(traversal: TraversalResult, root: Record<string, unknown>): CheckResult {
  const refs = traversal.tokens.filter((t) => t.ref !== null || t.aliasRef !== null);
  if (refs.length === 0) {
    return { id: 't06', item: 'Aliases resolve to valid typed tokens', status: 'PASS', detail: 'No aliases found' };
  }

  const dangling = refs.filter((t) => {
    const ref = t.ref ?? t.aliasRef!;
    const target = resolveRef(ref, root);
    return target === null;
  });

  if (dangling.length > 0) {
    const sample = dangling.slice(0, 5).map((t) => `${t.path} → ${t.ref ?? t.aliasRef}`).join(', ');
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
 * Enhanced: also checks for unknown $-prefixed properties inside groups/tokens.
 */
function checkT08Structure(root: Record<string, unknown>, traversal: TraversalResult): CheckResult {
  const errors: string[] = [];

  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    return { id: 't08', item: 'DTCG 2025.10 structural validation', status: 'FAIL', detail: 'Root is not an object' };
  }

  // Check unknown $-prefixed properties at root
  for (const key of Object.keys(root)) {
    if (key.startsWith('$') && !PROPERTY_KEYS.has(key) && key !== '$version') {
      errors.push(`Unknown $-property at root: ${key}`);
    }
  }

  // Check unknown $-prefixed properties inside tokens
  for (const token of traversal.tokens) {
    for (const key of Object.keys(token.node)) {
      if (key.startsWith('$') && !PROPERTY_KEYS.has(key)) {
        errors.push(`Unknown $-property in token ${token.path}: ${key}`);
      }
    }
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
    detail: 'Structural validation passed',
  };
}

/**
 * t09: No type drift between themes (same token path, different $type).
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

// ── New checks (t11-t20) ─────────────────────────────────────────────────

/**
 * t11: $type is one of the 15 valid spec types.
 * §5.2.2: "The $type property MUST be a plain JSON string, whose value is one
 * of the values specified in this specification's respective type definitions."
 */
function checkT11ValidTypeNames(traversal: TraversalResult): CheckResult {
  const invalid = traversal.tokens.filter(
    (t) => t.type !== null && !DTCG_TYPES.has(t.type),
  );
  if (invalid.length === 0) {
    return { id: 't11', item: '$type is one of 15 valid spec types', status: 'PASS', detail: `All typed tokens use valid spec types` };
  }
  const sample = invalid.slice(0, 5).map((t) => `${t.path}: "${t.type}"`).join(', ');
  return {
    id: 't11',
    item: '$type is one of 15 valid spec types',
    status: 'FAIL',
    detail: `${invalid.length} token(s) with invalid $type: ${sample}${invalid.length > 5 ? '…' : ''}`,
  };
}

/**
 * t12: Token names don't start with $ (except $root).
 * §5.1.1: "token and group names MUST NOT begin with the $ character."
 * §6.2: "$root is a reserved token name" — the only exception.
 */
function checkT12NamingDollar(traversal: TraversalResult): CheckResult {
  // DTCG property keys ($type, $value, etc.) are valid — only flag
  // $-prefixed names that aren't recognized properties or $root
  const invalid = traversal.nameSegments.filter(
    (name) => name.startsWith('$') && name !== '$root' && !PROPERTY_KEYS.has(name),
  );
  if (invalid.length === 0) {
    return { id: 't12', item: 'Token names don\u2019t start with $ (except $root)', status: 'PASS', detail: 'All names valid' };
  }
  const unique = [...new Set(invalid)];
  return {
    id: 't12',
    item: 'Token names don\u2019t start with $ (except $root)',
    status: 'FAIL',
    detail: `${unique.length} name(s) starting with $: ${unique.slice(0, 5).join(', ')}${unique.length > 5 ? '…' : ''}`,
  };
}

/**
 * t13: Token names don't contain {, }, or .
 * §5.1.1: "the following characters MUST NOT be used anywhere in a token or
 * group name: { (left curly bracket), } (right curly bracket), . (period)"
 */
function checkT13NamingChars(traversal: TraversalResult): CheckResult {
  const invalid = traversal.nameSegments.filter(
    (name) => name.includes('{') || name.includes('}') || name.includes('.'),
  );
  if (invalid.length === 0) {
    return { id: 't13', item: 'Token names don\u2019t contain {, }, or .', status: 'PASS', detail: 'All names valid' };
  }
  const unique = [...new Set(invalid)];
  return {
    id: 't13',
    item: 'Token names don\u2019t contain {, }, or .',
    status: 'FAIL',
    detail: `${unique.length} name(s) with forbidden characters: ${unique.slice(0, 5).join(', ')}${unique.length > 5 ? '…' : ''}`,
  };
}

/**
 * t14: $value matches $type structure (primitive types).
 * §8: "every design token MUST use one of these types. Furthermore, that
 * token's value MUST then follow rules and syntax for the chosen type."
 */
function checkT14PrimitiveValueShape(traversal: TraversalResult): CheckResult {
  const primitiveTypes = new Set(['dimension', 'duration', 'cubicBezier', 'number', 'boolean', 'string', 'fontFamily', 'fontWeight', 'color']);
  const toCheck = traversal.tokens.filter(
    (t) => t.type !== null && primitiveTypes.has(t.type) && t.aliasRef === null,
  );
  if (toCheck.length === 0) {
    return { id: 't14', item: '$value matches $type structure (primitives)', status: 'PASS', detail: 'No primitive tokens to validate' };
  }

  const invalid: string[] = [];
  for (const token of toCheck) {
    const errors = validatePrimitiveValue(token.type!, token.value);
    if (errors.length > 0) {
      invalid.push(`${token.path}: ${errors[0]}`);
    }
  }

  if (invalid.length > 0) {
    return {
      id: 't14',
      item: '$value matches $type structure (primitives)',
      status: 'FAIL',
      detail: `${invalid.length} token(s) with mismatched value: ${invalid.slice(0, 3).join('; ')}${invalid.length > 3 ? '…' : ''}`,
    };
  }

  return {
    id: 't14',
    item: '$value matches $type structure (primitives)',
    status: 'PASS',
    detail: `All ${toCheck.length} primitive token(s) have valid value structure`,
  };
}

/**
 * t15: Color value well-formedness.
 * Color Module §4: structured colors must have valid colorSpace, correct
 * components array, alpha in [0,1], hex in 6-digit format.
 */
function checkT15ColorWellFormedness(traversal: TraversalResult): CheckResult {
  const colorTokens = traversal.tokens.filter(
    (t) => t.type === 'color' && t.aliasRef === null,
  );
  if (colorTokens.length === 0) {
    return { id: 't15', item: 'Color value well-formedness', status: 'PASS', detail: 'No color tokens to validate' };
  }

  const invalid: string[] = [];
  for (const token of colorTokens) {
    const errors = validateColorValue(token.value);
    if (errors.length > 0) {
      invalid.push(`${token.path}: ${errors[0]}`);
    }
  }

  if (invalid.length > 0) {
    return {
      id: 't15',
      item: 'Color value well-formedness',
      status: 'FAIL',
      detail: `${invalid.length} color(s) malformed: ${invalid.slice(0, 3).join('; ')}${invalid.length > 3 ? '…' : ''}`,
    };
  }

  return {
    id: 't15',
    item: 'Color value well-formedness',
    status: 'PASS',
    detail: `All ${colorTokens.length} color token(s) well-formed`,
  };
}

/**
 * t16: Composite type structure.
 * §9: composite tokens must have required child properties.
 */
function checkT16CompositeStructure(traversal: TraversalResult): CheckResult {
  const compositeTypes = new Set(['shadow', 'border', 'transition', 'gradient', 'typography', 'strokeStyle']);
  const toCheck = traversal.tokens.filter(
    (t) => t.type !== null && compositeTypes.has(t.type) && t.aliasRef === null,
  );
  if (toCheck.length === 0) {
    return { id: 't16', item: 'Composite type structure', status: 'PASS', detail: 'No composite tokens to validate' };
  }

  const invalid: string[] = [];
  for (const token of toCheck) {
    const errors = validateCompositeValue(token.type!, token.value);
    if (errors.length > 0) {
      invalid.push(`${token.path}: ${errors[0]}`);
    }
  }

  if (invalid.length > 0) {
    return {
      id: 't16',
      item: 'Composite type structure',
      status: 'FAIL',
      detail: `${invalid.length} composite token(s) malformed: ${invalid.slice(0, 3).join('; ')}${invalid.length > 3 ? '…' : ''}`,
    };
  }

  return {
    id: 't16',
    item: 'Composite type structure',
    status: 'PASS',
    detail: `All ${toCheck.length} composite token(s) have valid structure`,
  };
}

/**
 * t17: Canonical $value:"{ref}" alias syntax recognized.
 * §7.1.1: "Curly brace references can ONLY target complete tokens."
 * This check validates that alias references have valid {path.to.token} syntax.
 */
function checkT17AliasSyntax(traversal: TraversalResult): CheckResult {
  const aliases = traversal.tokens.filter((t) => t.aliasRef !== null);
  if (aliases.length === 0) {
    return { id: 't17', item: 'Canonical $value:"{ref}" alias syntax', status: 'PASS', detail: 'No $value aliases found' };
  }

  // All aliasRefs were already validated by extractAliasRef — if it's non-null,
  // the syntax is {path}. Just verify the path isn't empty.
  const invalid = aliases.filter((t) => !t.aliasRef || t.aliasRef.trim() === '');
  if (invalid.length > 0) {
    return {
      id: 't17',
      item: 'Canonical $value:"{ref}" alias syntax',
      status: 'FAIL',
      detail: `${invalid.length} alias(es) with empty reference path`,
    };
  }

  return {
    id: 't17',
    item: 'Canonical $value:"{ref}" alias syntax',
    status: 'PASS',
    detail: `All ${aliases.length} $value alias(es) have valid syntax`,
  };
}

/**
 * t18: Alias type compatibility.
 * §7.2: A reference's resolved target should have a compatible $type.
 */
function checkT18AliasTypeCompat(
  traversal: TraversalResult,
  root: Record<string, unknown>,
): CheckResult {
  const aliases = traversal.tokens.filter(
    (t) => (t.ref !== null || t.aliasRef !== null) && t.type !== null,
  );
  if (aliases.length === 0) {
    return { id: 't18', item: 'Alias type compatibility', status: 'PASS', detail: 'No typed aliases to check' };
  }

  const mismatches: string[] = [];
  for (const token of aliases) {
    const ref = token.ref ?? token.aliasRef!;
    const { type: targetType } = resolveAliasWithType(ref, root, traversal.tokens);
    if (targetType !== null && targetType !== token.type) {
      mismatches.push(`${token.path} (${token.type}) → ${ref} (${targetType})`);
    }
  }

  if (mismatches.length > 0) {
    return {
      id: 't18',
      item: 'Alias type compatibility',
      status: 'FAIL',
      detail: `${mismatches.length} type mismatch(es): ${mismatches.slice(0, 3).join('; ')}${mismatches.length > 3 ? '…' : ''}`,
    };
  }

  return {
    id: 't18',
    item: 'Alias type compatibility',
    status: 'PASS',
    detail: `All ${aliases.length} alias(es) have compatible types`,
  };
}

/**
 * t19: Circular reference detection (both $ref and $value:"{ref}" forms).
 * §7.2.3: "References MUST NOT be circular... Tools MUST detect and report
 * this as an error affecting all tokens in the circular chain."
 */
function checkT19CircularRefs(
  traversal: TraversalResult,
  root: Record<string, unknown>,
): CheckResult {
  const errors = detectCircularRefs(traversal.tokens, root);
  if (errors.length > 0) {
    return {
      id: 't19',
      item: 'Circular reference detection',
      status: 'FAIL',
      detail: errors.slice(0, 3).join('; '),
    };
  }
  return {
    id: 't19',
    item: 'Circular reference detection',
    status: 'PASS',
    detail: 'No circular references detected',
  };
}

/**
 * t20: $deprecated value valid.
 * §5.2.4: "$deprecated MAY be used to mark a token as deprecated."
 * Valid values: true (deprecated), false (not deprecated), string (reason).
 */
function checkT20Deprecated(traversal: TraversalResult): CheckResult {
  const withDeprecated = traversal.tokens.filter(
    (t) => t.deprecated !== undefined && t.deprecated !== null,
  );
  if (withDeprecated.length === 0) {
    return { id: 't20', item: '$deprecated value valid', status: 'PASS', detail: 'No $deprecated properties found' };
  }

  const invalid = withDeprecated.filter(
    (t) => typeof t.deprecated !== 'boolean' && typeof t.deprecated !== 'string',
  );

  if (invalid.length > 0) {
    const sample = invalid.slice(0, 5).map((t) => `${t.path}: ${typeof t.deprecated}`).join(', ');
    return {
      id: 't20',
      item: '$deprecated value valid',
      status: 'FAIL',
      detail: `${invalid.length} invalid $deprecated value(s): ${sample}${invalid.length > 5 ? '…' : ''}`,
    };
  }

  return {
    id: 't20',
    item: '$deprecated value valid',
    status: 'PASS',
    detail: `All ${withDeprecated.length} $deprecated value(s) valid`,
  };
}

// ── Dimension helpers (used by t10) ──────────────────────────────────────

function isDimensionObject(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { value?: unknown; unit?: unknown };
  return (
    typeof v.value === 'number' &&
    typeof v.unit === 'string' &&
    VALID_DIMENSION_UNITS.has(v.unit.toLowerCase())
  );
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
 * Validate a DTCG token object against 20 conformance checks.
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
    nameSegments: [],
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
    checkT08Structure(tokenFile, traversal),
    checkT09TypeDrift(traversal),
    checkT10Dimensions(traversal),
    checkT11ValidTypeNames(traversal),
    checkT12NamingDollar(traversal),
    checkT13NamingChars(traversal),
    checkT14PrimitiveValueShape(traversal),
    checkT15ColorWellFormedness(traversal),
    checkT16CompositeStructure(traversal),
    checkT17AliasSyntax(traversal),
    checkT18AliasTypeCompat(traversal, tokenFile),
    checkT19CircularRefs(traversal, tokenFile),
    checkT20Deprecated(traversal),
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