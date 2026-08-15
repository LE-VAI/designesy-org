/**
 * @designesy/stylelint-plugin-dtcg-tokens
 *
 * DTCG 2025.10 token flattener — converts a parsed DTCG token JSON object
 * into a flat map of CSS custom property names to resolved values.
 *
 * Used by both the stylelint plugin and the standalone PostCSS plugin.
 *
 * DTCG tokens use dot-path group names (e.g. `color.primary` → `--color-primary`).
 * The $-prefixed keys ($type, $value, $description, $ref, $deprecated) are
 * DTCG property keys, not group names.
 */

/** A flattened token: CSS custom property name + its resolved value + type. */
export interface FlattenedToken {
  /** CSS custom property name, e.g. `--color-primary` */
  name: string;
  /** Raw value string (may contain var() references to other tokens) */
  value: string;
  /** DTCG $type if available, e.g. `color`, `dimension`, `duration` */
  type?: string;
  /** DTCG $description if available */
  description?: string;
  /** Whether this token has $deprecated set */
  deprecated?: boolean;
}

/** DTCG $-prefixed property keys (not group names or token names). */
const DTCG_PROPERTY_KEYS = new Set([
  '$value', '$type', '$description', '$ref', '$deprecated',
  '$extensions', '$schema', '$version',
]);

/**
 * Extract a usable string value from a DTCG $value.
 * DTCG values can be:
 *   - string: "#ff0000", "16px", "400ms"
 *   - object: { colorSpace: "oklch", components: [0.7, 0.2, 0.1], alpha: 1 }
 *   - array: [{ color: ..., position: 0 }, ...] (gradient/stroke stops)
 *   - reference: "{path.to.token}" (alias)
 */
function extractValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    // Composite types (shadow array, gradient stops, cubicBezier)
    return JSON.stringify(value);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Structured color: { colorSpace, components, alpha }
    if ('colorSpace' in obj && 'components' in obj) {
      const cs = String(obj.colorSpace);
      const comps = Array.isArray(obj.components)
        ? (obj.components as number[]).join(' ')
        : String(obj.components);
      const alpha = 'alpha' in obj ? ` / ${obj.alpha}` : '';
      return `oklch(${comps}${alpha})`; // simplified
    }
    // Composite type (shadow, border, transition, typography)
    const parts = Object.entries(obj)
      .map(([k, v]) => `${k}: ${extractValue(v)}`)
      .join('; ');
    return `{ ${parts} }`;
  }
  return String(value ?? '');
}

/**
 * Check if a node is a DTCG token (has $value or $ref).
 */
function isTokenNode(node: Record<string, unknown>): boolean {
  return '$value' in node || '$ref' in node;
}

/**
 * Check if a node is a DTCG group (has non-$ child keys that are objects).
 */
function isGroupNode(node: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(node)) {
    if (!key.startsWith('$') && val !== null && typeof val === 'object' && !Array.isArray(val)) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve a DTCG alias reference "{path.to.token}" to a CSS var() reference.
 * "color.primary" → "var(--color-primary)"
 */
function aliasToVar(ref: string): string {
  const clean = ref.replace(/[{}]/g, '').trim();
  return `var(--${clean.replace(/\./g, '-')})`;
}

/**
 * Flatten a DTCG token file into CSS custom property names.
 *
 * Traverses the token tree, converting dot-path groups to hyphenated CSS names.
 * Tokens with $value: "{ref}" are kept as var() references (aliases).
 *
 * @param tokenFile - The parsed DTCG token JSON object
 * @returns Map of CSS custom property name → FlattenedToken
 */
export function flattenTokens(tokenFile: Record<string, unknown>): Map<string, FlattenedToken> {
  const result = new Map<string, FlattenedToken>();

  function traverse(node: Record<string, unknown>, namePath: string[]): void {
    for (const [key, val] of Object.entries(node)) {
      // Skip $-prefixed DTCG property keys at this level
      if (key.startsWith('$')) continue;

      const cssName = `--${[...namePath, key].join('-')}`;

      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        const child = val as Record<string, unknown>;

        if (isTokenNode(child)) {
          // This is a token — extract its value and metadata
          const rawValue = '$value' in child ? child.$value : null;
          const ref = '$ref' in child ? child.$ref : null;

          let value: string;
          if (ref !== null && typeof ref === 'string') {
            value = aliasToVar(ref);
          } else if (rawValue !== null && typeof rawValue === 'string' && /^\{.+\}$/.test(rawValue)) {
            // $value: "{path.to.token}" alias form
            value = aliasToVar(rawValue);
          } else {
            value = extractValue(rawValue);
          }

          result.set(cssName, {
            name: cssName,
            value,
            type: typeof child.$type === 'string' ? child.$type : undefined,
            description: typeof child.$description === 'string' ? child.$description : undefined,
            deprecated: child.$deprecated === true,
          });

          // If the token also has child groups (rare but valid), continue traversing
          if (isGroupNode(child)) {
            traverse(child, [...namePath, key]);
          }
        } else if (isGroupNode(child)) {
          // This is a pure group — recurse
          traverse(child, [...namePath, key]);
        }
      }
    }
  }

  // Skip $-prefixed root-level keys ($schema, $version, $description)
  for (const [key, val] of Object.entries(tokenFile)) {
    if (key.startsWith('$')) continue;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      traverse(val as Record<string, unknown>, [key]);
    }
  }

  return result;
}

/**
 * Extract all var() references from a CSS value string.
 * Returns an array of custom property names: ["--color-primary", "--space-md"]
 */
export function extractVarRefs(value: string): string[] {
  const refs: string[] = [];
  // Match var(--name) and var(--name, fallback)
  const re = /var\(\s*(--[\w-]+)/g;
  let m;
  while ((m = re.exec(value)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}

/**
 * Check if a CSS value is a bare hex color (not wrapped in var()).
 * Matches #rgb, #rrggbb, #rrggbbaa, #rgba — but only when not inside var().
 */
export function isBareHex(value: string): boolean {
  // Skip if the entire value is a var() reference
  if (/^var\(/.test(value.trim())) return false;
  // Check for hex color pattern (may appear in compound values like "1px solid #ff0000")
  return /#[0-9a-fA-F]{3,8}\b/.test(value);
}

/**
 * Extract the hex values from a CSS declaration value.
 */
export function extractHexValues(value: string): string[] {
  const matches: string[] = [];
  const re = /#[0-9a-fA-F]{3,8}\b/g;
  let m;
  while ((m = re.exec(value)) !== null) {
    matches.push(m[0]);
  }
  return matches;
}

/**
 * Properties where a bare pixel value suggests a missing token reference.
 * These are the properties where design systems typically enforce tokens.
 */
export const TOKEN_ENFORCED_PROPERTIES = new Set([
  'color', 'background', 'background-color', 'border-color',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'outline', 'outline-color', 'fill', 'stroke',
  'font-size', 'line-height', 'letter-spacing', 'word-spacing',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'top', 'right', 'bottom', 'left',
  'border-radius', 'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'transition-duration', 'animation-duration',
  'z-index',
]);

/**
 * Check if a CSS value is a "magic number" — a bare pixel/rem value
 * on a token-enforced property, not wrapped in var() or calc(var()).
 */
export function isMagicNumber(prop: string, value: string): boolean {
  if (!TOKEN_ENFORCED_PROPERTIES.has(prop)) return false;
  // Skip if the value uses var()
  if (/var\(/.test(value)) return false;
  // Skip if the value is a keyword (inherit, initial, unset, etc.)
  if (/^(inherit|initial|unset|revert|auto|none|currentcolor|transparent)$/i.test(value.trim())) return false;
  // Skip if it's a function call (calc, clamp, min, max — these are intentional)
  if (/^(calc|clamp|min|max|env|constant)\s*\(/i.test(value.trim())) return false;
  // Check for bare px or rem values
  return /\b\d+(?:\.\d+)?(?:px|rem)\b/.test(value);
}

/**
 * Extract the magic number values from a declaration.
 */
export function extractMagicNumbers(prop: string, value: string): string[] {
  if (!TOKEN_ENFORCED_PROPERTIES.has(prop)) return [];
  const matches: string[] = [];
  const re = /\b(\d+(?:\.\d+)?(?:px|rem))\b/g;
  let m;
  while ((m = re.exec(value)) !== null) {
    matches.push(m[0]);
  }
  return matches;
}