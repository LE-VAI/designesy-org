// W3C DTCG 2025.10 output: the conventions /export/dtcg and /api/guardrails
// share, and the converter guardrails uses to turn a site's :root custom
// properties into a token file.
//
// WHY THIS MODULE EXISTS
// designesy_guardrails emitted its token file with conventions of its own, and
// three of them were not DTCG 2025.10 (measured on www.designesy.org,
// 2026-10-10): a $schema of https://designtokens.org/schema where the site's
// own export uses the 2025.10 format.json; 26 aliases written as CSS variables,
// "{--muted-dim}", where DTCG aliases are {group.token} paths; and 27 colors as
// bare hex strings, which the server's own tokens validator FAILs (t05). It
// also typed values 'spacing' and 'string', which the format does not define,
// carried a $meta root property the format does not allow, and dropped 24 of
// 216 declarations, because a property such as --surface was overwritten by
// the group --surface-raised needs (or the reverse).
//
// The converter below emits the export's conventions: its $schema, colors as
// { colorSpace, components, alpha }, durations as { value, unit }, easings as
// four-number arrays, px/rem dimensions as strings, and vendor data in
// $extensions.designesy. A property that is also a group (--surface beside
// --surface-raised) becomes the group's $root token, the 2025.10 mechanism for
// it, and an alias to it is {surface.$root}. A value the format cannot type
// (calc(), clamp(), gradients, color-mix(), a var() with a fallback, ...) is
// kept verbatim in $extensions.designesy.css under its property name, so no
// declaration is lost.
//
// PURE AND IMPORT-FREE: scripts/check-mcp-accuracy.js runs the guardrails
// route that calls this, and the module stays loadable on its own.

export const DTCG_SCHEMA_URL = 'https://www.designtokens.org/schemas/2025.10/format.json';

export type DtcgColor = { colorSpace: 'srgb'; components: number[]; alpha: number };

const NUM = String.raw`(-?(?:\d+\.?\d*|\.\d+))`;
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CHANNEL = /^(\d+\.?\d*|\.\d+)(%?)$/;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * A CSS color as a DTCG 2025.10 sRGB color, or null when the value is not one
 * that maps to sRGB without converting color spaces: hex (#rgb, #rgba,
 * #rrggbb, #rrggbbaa), rgb()/rgba() in comma or space syntax with an optional
 * alpha, and `transparent`.
 */
export function parseCssColor(raw: string): DtcgColor | null {
  const value = raw.trim();
  const hex = value.match(HEX);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const byte = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { colorSpace: 'srgb', components: [byte(0), byte(2), byte(4)], alpha: h.length === 8 ? byte(6) : 1 };
  }
  const fn = value.match(/^rgba?\(\s*([^()]*?)\s*\)$/i);
  if (fn) {
    const parts = fn[1].split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (parts.length !== 3 && parts.length !== 4) return null;
    const read = parts.map((p) => p.match(CHANNEL));
    if (read.some((m) => m === null)) return null;
    const channel = (m: RegExpMatchArray) => clamp01(m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]) / 255);
    const alphaOf = (m: RegExpMatchArray) => clamp01(m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]));
    const [r, g, b, a] = read as RegExpMatchArray[];
    return { colorSpace: 'srgb', components: [channel(r), channel(g), channel(b)], alpha: a ? alphaOf(a) : 1 };
  }
  if (/^transparent$/i.test(value)) return { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0 };
  return null;
}

/**
 * /export/dtcg's color parser: parseCssColor, then the export's older
 * unanchored rgba() match, then black. The contract colors it reads are all
 * hex or rgba(), so the fallbacks do not fire on today's contract.
 */
export function parseColorValue(value: string): DtcgColor {
  const parsed = parseCssColor(value);
  if (parsed) return parsed;
  const m = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (m) {
    return {
      colorSpace: 'srgb',
      components: [parseFloat(m[1]) / 255, parseFloat(m[2]) / 255, parseFloat(m[3]) / 255],
      alpha: m[4] !== undefined ? parseFloat(m[4]) : 1,
    };
  }
  return { colorSpace: 'srgb', components: [0, 0, 0], alpha: 1 };
}

// ── CSS custom properties to DTCG ─────────────────────────────────────────────

type Converted = { $type: string; $value: unknown };

// CSS's named timing functions, as the cubic-bezier() each one is defined as.
const NAMED_EASINGS: Readonly<Record<string, number[]>> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

const DIMENSION = new RegExp(`^${NUM}(px|rem)$`);
const DURATION = /^(\d+\.?\d*|\.\d+)(ms|s)$/i;
const NUMBER = new RegExp(`^${NUM}$`);
const BEZIER = new RegExp(`^cubic-bezier\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)$`, 'i');
const LENGTH = new RegExp(`^${NUM}(px|rem)?$`);

const LENGTH_NAME = /space|gap|pad|margin|radius|size|width|height|inset|offset|gutter/i;
const EASING_NAME = /ease|easing|timing|bezier|curve/i;
const WEIGHT_NAME = /weight/i;
const FONT_NAME = /font|family|sans|serif|mono|display|typeface/i;
const SHADOW_NAME = /shadow|elev|glow/i;

/** A length in a shadow: px/rem kept as written, a unitless 0 written 0px. */
function shadowLength(s: string): string | null {
  const m = s.match(LENGTH);
  if (!m) return null;
  if (m[2]) return s;
  return parseFloat(m[1]) === 0 ? '0px' : null;
}

/** Split on commas that are not inside parentheses or quotes. */
function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(value.slice(start).trim());
  return out;
}

// Lengths are matched as lengths, so the optional spread cannot swallow the
// first word of the color ("rgba(0,").
const SHADOW = new RegExp(`^(${NUM.slice(1, -1)}(?:px|rem)?)\\s+(${NUM.slice(1, -1)}(?:px|rem)?)\\s+(${NUM.slice(1, -1)}(?:px|rem)?)(?:\\s+(${NUM.slice(1, -1)}(?:px|rem)?))?\\s+(.+)$`);

/** One shadow ("0 1px 3px rgba(0,0,0,.4)") as a DTCG shadow object, or null. */
function parseShadow(s: string): Record<string, unknown> | null {
  const m = s.trim().match(SHADOW);
  if (!m) return null;
  const [offsetX, offsetY, blur] = [m[1], m[2], m[3]].map(shadowLength);
  const spread = m[4] === undefined ? '0px' : shadowLength(m[4]);
  const color = parseCssColor(m[5]);
  if (!offsetX || !offsetY || !blur || !spread || !color) return null;
  return { color, offsetX, offsetY, blur, spread };
}

/** A font stack as the family names DTCG's fontFamily holds, or null. */
function parseFontStack(value: string): string[] | null {
  const names = splitTopLevel(value).map((n) => n.replace(/^(['"])(.*)\1$/, '$2').trim());
  return names.length > 0 && names.every((n) => /^-?\w[\w -]*$/.test(n)) ? names : null;
}

/** What DTCG type and value a literal CSS value converts to, or null. */
function convertLiteral(name: string, raw: string): Converted | null {
  const value = raw.trim();
  const color = parseCssColor(value);
  if (color) return { $type: 'color', $value: color };
  const duration = value.match(DURATION);
  if (duration) return { $type: 'duration', $value: { value: parseFloat(duration[1]), unit: duration[2].toLowerCase() } };
  const bezier = value.match(BEZIER);
  if (bezier) {
    const n = bezier.slice(1, 5).map(Number);
    if (n[0] >= 0 && n[0] <= 1 && n[2] >= 0 && n[2] <= 1) return { $type: 'cubicBezier', $value: n };
    return null;
  }
  if (EASING_NAME.test(name) && NAMED_EASINGS[value.toLowerCase()]) {
    return { $type: 'cubicBezier', $value: [...NAMED_EASINGS[value.toLowerCase()]] };
  }
  if (DIMENSION.test(value)) return { $type: 'dimension', $value: value };
  if (NUMBER.test(value)) {
    const n = Number(value);
    if (n === 0 && LENGTH_NAME.test(name)) return { $type: 'dimension', $value: '0px' };
    if (WEIGHT_NAME.test(name) && Number.isInteger(n) && n >= 1 && n <= 1000) return { $type: 'fontWeight', $value: n };
    return { $type: 'number', $value: n };
  }
  if (SHADOW_NAME.test(name)) {
    const layers = splitTopLevel(value).map(parseShadow);
    if (layers.length > 0 && layers.every((l) => l !== null)) {
      return { $type: 'shadow', $value: layers.length === 1 ? layers[0] : layers };
    }
    return null;
  }
  if (FONT_NAME.test(name) && !/[()]/.test(value)) {
    const stack = parseFontStack(value);
    if (stack) return { $type: 'fontFamily', $value: stack.length === 1 ? stack[0] : stack };
  }
  return null;
}

type Token = { $type: string; $value: unknown; alias?: string };
type Node = { token?: Token; children: Map<string, Node> };

/**
 * Convert a site's custom properties (name -> CSS value, in declaration order)
 * to a DTCG 2025.10 document.
 */
export function cssTokensToDtcg(
  tokens: Record<string, string>,
  meta: { source: string; generator: string; extracted: string },
): Record<string, unknown> {
  const names = Object.keys(tokens);
  const css: Record<string, string> = {};
  const pathOf = new Map<string, string[]>();
  const root: Node = { children: new Map() };

  // The tree is laid out in declaration order first, so groups keep the order
  // the stylesheet gives them whichever pass fills them.
  const nodeOf = (name: string): Node => {
    let node = root;
    for (const part of pathOf.get(name)!) {
      if (!node.children.has(part)) node.children.set(part, { children: new Map() });
      node = node.children.get(part)!;
    }
    return node;
  };
  for (const name of names) {
    const path = name.replace(/^--/, '').split('-').filter(Boolean);
    if (path.length === 0) css[name] = tokens[name];
    else {
      pathOf.set(name, path);
      nodeOf(name);
    }
  }

  // Pass 1: values the format can type. Two names on one path (--a--b and
  // --a-b) keep the first; the second is kept as CSS.
  const placed = new Map<string, string>(); // name -> $type
  const pending: Array<[string, string]> = []; // [alias name, target name]
  for (const name of names) {
    if (!pathOf.has(name)) continue;
    const alias = tokens[name].trim().match(/^var\(\s*(--[\w-]+)\s*\)$/);
    if (alias) {
      pending.push([name, alias[1]]);
      continue;
    }
    const converted = convertLiteral(name, tokens[name]);
    const node = nodeOf(name);
    if (converted && !node.token) {
      node.token = { $type: converted.$type, $value: converted.$value };
      placed.set(name, converted.$type);
    } else css[name] = tokens[name];
  }

  // Pass 2: aliases, each once its target is a token, taking the target's
  // type. One that never resolves (an undeclared or unconverted target, or a
  // cycle) is kept as CSS.
  for (let progress = true; progress; ) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const [name, target] = pending[i];
      if (!placed.has(target)) continue;
      const node = nodeOf(name);
      if (node.token) css[name] = tokens[name];
      else {
        node.token = { $type: placed.get(target)!, $value: null, alias: target };
        placed.set(name, placed.get(target)!);
      }
      pending.splice(i--, 1);
      progress = true;
    }
  }
  for (const [name] of pending) css[name] = tokens[name];

  // A node that holds a token beside child tokens is a group with a $root token.
  const holdsTokens = (node: Node): boolean => !!node.token || [...node.children.values()].some(holdsTokens);
  const isGroup = (node: Node) => [...node.children.values()].some(holdsTokens);
  const refOf = (name: string): string => `{${pathOf.get(name)!.join('.')}${isGroup(nodeOf(name)) ? '.$root' : ''}}`;
  const leaf = (t: Token) => ({ $type: t.$type, $value: t.alias ? refOf(t.alias) : t.$value });
  const emit = (node: Node): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (node.token) out.$root = leaf(node.token);
    for (const [key, child] of node.children) {
      if (!holdsTokens(child)) continue;
      out[key] = child.token && !isGroup(child) ? leaf(child.token) : emit(child);
    }
    return out;
  };

  return {
    $schema: DTCG_SCHEMA_URL,
    $description: `Design tokens extracted from ${meta.source} by ${meta.generator}: W3C DTCG 2025.10 format. Values the format cannot type are kept verbatim in $extensions.designesy.css.`,
    ...emit(root),
    $extensions: {
      designesy: {
        source: meta.source,
        extracted: meta.extracted,
        generator: meta.generator,
        css,
      },
    },
  };
}
