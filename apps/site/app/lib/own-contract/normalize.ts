// Own-contract normalization (engine spec section 3.2): colors to 8-bit sRGB
// plus alpha, dimensions to px, line heights, type roles, families, durations
// and easings. Shared by both format readers and by the page reader, so a
// declared value and a shipped value are always compared in one form.
//
// Every parser here is a hand-written tokenizer or a regex anchored on short,
// bounded input; none is built from caller input, and none backtracks
// (section 12: "Regular expressions: none built from contract or page input").

import { ROOT_PX } from './limits';
import type { Dimension, LineHeight, Rgba8, TypeRole } from './types';

// ── Colors ──────────────────────────────────────────────────────────────────

/** CSS named colors (CSS Color 4), name to 6-digit hex. */
const NAMED_SRC =
  'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 ' +
  'blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 ' +
  'chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b ' +
  'darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b ' +
  'darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f ' +
  'darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 ' +
  'deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 ' +
  'fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f ' +
  'grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa ' +
  'lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff ' +
  'lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a ' +
  'lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 ' +
  'lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd ' +
  'mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a ' +
  'mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 ' +
  'navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 ' +
  'palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 ' +
  'peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f ' +
  'royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d ' +
  'silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f ' +
  'steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 ' +
  'white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32';
export const NAMED_COLORS: ReadonlyMap<string, string> = new Map(
  NAMED_SRC.split(' ').map((pair) => {
    const [n, h] = pair.split(':');
    return [n, h];
  }),
);

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const to8 = (x: number) => Math.round(clamp01(x) * 255);

export function rgbaFromUnit(r: number, g: number, b: number, a = 1): Rgba8 {
  return { r: to8(r), g: to8(g), b: to8(b), a: Math.round(clamp01(a) * 1000) / 1000 };
}

/** '#rrggbbaa', lowercase (the digest's color form). */
export function hexOf(c: Rgba8): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${h(Math.round(c.a * 255))}`;
}

/** '#RRGGBB' for display (alpha left out). */
export function hex6(c: Rgba8): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}

function parseHex(s: string): Rgba8 | null {
  const h = s.slice(1);
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  const n = h.length;
  if (n === 3 || n === 4) {
    const d = [...h].map((c) => parseInt(c + c, 16));
    return { r: d[0], g: d[1], b: d[2], a: n === 4 ? Math.round((d[3] / 255) * 1000) / 1000 : 1 };
  }
  if (n === 6 || n === 8) {
    const d = [0, 2, 4, 6].slice(0, n / 2).map((i) => parseInt(h.slice(i, i + 2), 16));
    return { r: d[0], g: d[1], b: d[2], a: n === 8 ? Math.round((d[3] / 255) * 1000) / 1000 : 1 };
  }
  return null;
}

/** Split function arguments on commas, or on spaces with an optional "/ alpha". */
function fnArgs(inner: string): { parts: string[]; alpha: string | null } | null {
  const s = inner.trim();
  if (s.includes(',')) {
    const parts = s.split(',').map((x) => x.trim());
    if (parts.some((p) => !p)) return null;
    const alpha = parts.length === 4 ? parts.pop()! : null;
    return { parts, alpha };
  }
  const [main, alpha, extra] = s.split('/');
  if (extra !== undefined) return null;
  const parts = main.trim().split(/\s+/).filter(Boolean);
  return { parts, alpha: alpha !== undefined ? alpha.trim() : null };
}

function num(tok: string): number | null {
  if (tok === 'none') return 0;
  if (tok.length > 64) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(tok)) return null;
  return parseFloat(tok);
}

/** A number or a percentage scaled so 100% = `full`. */
function numPct(tok: string, full: number): number | null {
  if (tok.endsWith('%')) {
    const n = num(tok.slice(0, -1));
    return n === null ? null : (n / 100) * full;
  }
  return num(tok);
}

function hueDeg(tok: string): number | null {
  if (tok.length > 64) return null;
  const m = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(deg|rad|grad|turn)?$/i.exec(tok);
  if (tok === 'none') return 0;
  if (!m) return null;
  const v = parseFloat(m[1]);
  const u = (m[2] || 'deg').toLowerCase();
  return u === 'rad' ? (v * 180) / Math.PI : u === 'grad' ? v * 0.9 : u === 'turn' ? v * 360 : v;
}

function alphaOf(tok: string | null): number | null {
  if (tok === null) return 1;
  const v = numPct(tok, 1);
  return v === null ? null : clamp01(v);
}

const srgbToLinear = (c: number) => (Math.abs(c) <= 0.04045 ? c / 12.92 : Math.sign(c) * Math.pow((Math.abs(c) + 0.055) / 1.055, 2.4));
const linearToSrgb = (c: number) => (Math.abs(c) <= 0.0031308 ? 12.92 * c : Math.sign(c) * (1.055 * Math.pow(Math.abs(c), 1 / 2.4) - 0.055));

function hslToSrgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function hwbToSrgb(h: number, w: number, b: number): [number, number, number] {
  if (w + b >= 1) {
    const g = w / (w + b);
    return [g, g, g];
  }
  const rgb = hslToSrgb(h, 1, 0.5);
  return rgb.map((c) => c * (1 - w - b) + w) as [number, number, number];
}

function linearSrgbFromXyzD65(x: number, y: number, z: number): [number, number, number] {
  return [
    3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z,
    -0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z,
    0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z,
  ];
}

function xyzD50ToD65(x: number, y: number, z: number): [number, number, number] {
  return [
    0.955473421488075 * x - 0.02309845494876471 * y + 0.06325924320057072 * z,
    -0.0283697093338637 * x + 1.0099953980813041 * y + 0.021041441191917323 * z,
    0.012314014864481998 * x - 0.020507649298898964 * y + 1.330365926242124 * z,
  ];
}

function labToXyzD50(L: number, a: number, b: number): [number, number, number] {
  const k = 24389 / 27;
  const e = 216 / 24389;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
  const yr = L > k * e ? ((L + 16) / 116) ** 3 : L / k;
  const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  return [xr * 0.3457 / 0.3585, yr, zr * (1 - 0.3457 - 0.3585) / 0.3585];
}

function oklabToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function linearSrgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function p3LinearToXyzD65(r: number, g: number, b: number): [number, number, number] {
  return [
    0.4865709486482162 * r + 0.26566769316909306 * g + 0.1982172852343625 * b,
    0.2289745640697488 * r + 0.6917385218365064 * g + 0.079286914093745 * b,
    0 * r + 0.04511338185890264 * g + 1.043944368900976 * b,
  ];
}

/** A color in one of the spaces both CSS and DTCG name, components in each space's own ranges. */
export function fromSpace(space: string, c: number[], alpha = 1): Rgba8 | null {
  const [x, y, z] = c;
  if ([x, y, z].some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null;
  let rgb: [number, number, number];
  switch (space) {
    case 'srgb':
      rgb = [x, y, z];
      break;
    case 'srgb-linear':
      rgb = [linearToSrgb(x), linearToSrgb(y), linearToSrgb(z)];
      break;
    case 'hsl':
      rgb = hslToSrgb(x, y / 100, z / 100);
      break;
    case 'hwb':
      rgb = hwbToSrgb(x, y / 100, z / 100);
      break;
    case 'lab': {
      const lin = linearSrgbFromXyzD65(...xyzD50ToD65(...labToXyzD50(x, y, z)));
      rgb = lin.map(linearToSrgb) as [number, number, number];
      break;
    }
    case 'lch': {
      const h = (z * Math.PI) / 180;
      const lin = linearSrgbFromXyzD65(...xyzD50ToD65(...labToXyzD50(x, y * Math.cos(h), y * Math.sin(h))));
      rgb = lin.map(linearToSrgb) as [number, number, number];
      break;
    }
    case 'oklab':
      rgb = oklabToLinearSrgb(x, y, z).map(linearToSrgb) as [number, number, number];
      break;
    case 'oklch': {
      const h = (z * Math.PI) / 180;
      rgb = oklabToLinearSrgb(x, y * Math.cos(h), y * Math.sin(h)).map(linearToSrgb) as [number, number, number];
      break;
    }
    case 'display-p3': {
      const lin = linearSrgbFromXyzD65(...p3LinearToXyzD65(srgbToLinear(x), srgbToLinear(y), srgbToLinear(z)));
      rgb = lin.map(linearToSrgb) as [number, number, number];
      break;
    }
    case 'xyz':
    case 'xyz-d65':
      rgb = linearSrgbFromXyzD65(x, y, z).map(linearToSrgb) as [number, number, number];
      break;
    case 'xyz-d50':
      rgb = linearSrgbFromXyzD65(...xyzD50ToD65(x, y, z)).map(linearToSrgb) as [number, number, number];
      break;
    default:
      return null;
  }
  return rgbaFromUnit(rgb[0], rgb[1], rgb[2], alpha);
}

/** The spaces fromSpace() converts (DTCG names). */
export const SUPPORTED_SPACES = new Set(['srgb', 'srgb-linear', 'hsl', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'display-p3', 'xyz', 'xyz-d65', 'xyz-d50']);

/** Words that are never a color for membership (section 5.1 exclusions). */
const NOT_A_COLOR = new Set(['currentcolor', 'transparent', 'inherit', 'initial', 'unset', 'revert', 'none']);

/**
 * Parse one CSS color string (no var(): callers substitute first). Covers every
 * DESIGN.md color form: hex 3/4/6/8, named, rgb(a), hsl(a), hwb, lab, lch,
 * oklab, oklch, color(), color-mix(in srgb|srgb-linear|oklab, ...).
 */
export function parseColor(input: string, depth = 0): Rgba8 | null {
  const s = input.trim().toLowerCase();
  if (!s || s.length > 200 || depth > 4) return null;
  if (s.startsWith('#')) return parseHex(s);
  if (NOT_A_COLOR.has(s)) return null;
  const named = NAMED_COLORS.get(s);
  if (named) return parseHex(`#${named}`);
  const open = s.indexOf('(');
  if (open < 1 || !s.endsWith(')')) return null;
  const fn = s.slice(0, open);
  const inner = s.slice(open + 1, -1);
  if (fn === 'color-mix') return parseColorMix(inner, depth);
  const args = fnArgs(inner);
  if (!args) return null;
  const a = alphaOf(args.alpha);
  if (a === null) return null;
  const p = args.parts;
  switch (fn) {
    case 'rgb':
    case 'rgba': {
      if (p.length !== 3) return null;
      const v = p.map((t) => numPct(t, 255));
      if (v.some((x) => x === null)) return null;
      return rgbaFromUnit(v[0]! / 255, v[1]! / 255, v[2]! / 255, a);
    }
    case 'hsl':
    case 'hsla': {
      if (p.length !== 3) return null;
      const h = hueDeg(p[0]);
      const sat = numPct(p[1].endsWith('%') ? p[1] : `${p[1]}%`, 100);
      const lig = numPct(p[2].endsWith('%') ? p[2] : `${p[2]}%`, 100);
      if (h === null || sat === null || lig === null) return null;
      return fromSpace('hsl', [h, sat, lig], a);
    }
    case 'hwb': {
      if (p.length !== 3) return null;
      const h = hueDeg(p[0]);
      const w = numPct(p[1].endsWith('%') ? p[1] : `${p[1]}%`, 100);
      const bl = numPct(p[2].endsWith('%') ? p[2] : `${p[2]}%`, 100);
      if (h === null || w === null || bl === null) return null;
      return fromSpace('hwb', [h, w, bl], a);
    }
    case 'lab':
    case 'lch': {
      if (p.length !== 3) return null;
      const L = numPct(p[0], 100);
      const second = numPct(p[1], fn === 'lab' ? 125 : 150);
      const third = fn === 'lab' ? numPct(p[2], 125) : hueDeg(p[2]);
      if (L === null || second === null || third === null) return null;
      return fromSpace(fn, [L, second, third], a);
    }
    case 'oklab':
    case 'oklch': {
      if (p.length !== 3) return null;
      const L = numPct(p[0], 1);
      const second = numPct(p[1], 0.4);
      const third = fn === 'oklab' ? numPct(p[2], 0.4) : hueDeg(p[2]);
      if (L === null || second === null || third === null) return null;
      return fromSpace(fn, [L, second, third], a);
    }
    case 'color': {
      if (p.length !== 4) return null;
      const space = p[0];
      const v = p.slice(1).map((t) => numPct(t, 1));
      if (v.some((x) => x === null)) return null;
      return fromSpace(space, v as number[], a);
    }
    default:
      return null;
  }
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function parseColorMix(inner: string, depth: number): Rgba8 | null {
  const parts = splitTopLevel(inner, ',');
  if (parts.length !== 3) return null;
  const space = /^in\s+(srgb|srgb-linear|oklab)$/.exec(parts[0]);
  if (!space) return null;
  const side = (s: string): { c: Rgba8; p: number | null } | null => {
    const m = /\s(\d+(?:\.\d+)?)%$/.exec(s);
    const colorText = m ? s.slice(0, m.index) : s;
    const c = parseColor(colorText, depth + 1) ?? (colorText.trim() === 'transparent' ? { r: 0, g: 0, b: 0, a: 0 } : null);
    return c ? { c, p: m ? parseFloat(m[1]) / 100 : null } : null;
  };
  const a = side(parts[1]);
  const b = side(parts[2]);
  if (!a || !b) return null;
  let pa = a.p;
  let pb = b.p;
  if (pa === null && pb === null) { pa = 0.5; pb = 0.5; }
  else if (pa === null) pa = 1 - pb!;
  else if (pb === null) pb = 1 - pa;
  const total = pa + pb!;
  if (total <= 0) return null;
  const wa = pa / total;
  const wb = pb! / total;
  const alpha = a.c.a * wa + b.c.a * wb;
  const toSpace = (c: Rgba8): [number, number, number] => {
    const lin = [c.r / 255, c.g / 255, c.b / 255].map(srgbToLinear) as [number, number, number];
    if (space[1] === 'srgb') return [c.r / 255, c.g / 255, c.b / 255];
    if (space[1] === 'srgb-linear') return lin;
    return linearSrgbToOklab(...lin);
  };
  // Premultiplied interpolation, as CSS Color 5 defines it.
  const ca = toSpace(a.c).map((v) => v * a.c.a);
  const cb = toSpace(b.c).map((v) => v * b.c.a);
  const mixed = ca.map((v, i) => (alpha === 0 ? 0 : (v * wa + cb[i] * wb) / alpha)) as [number, number, number];
  let rgb: [number, number, number];
  if (space[1] === 'srgb') rgb = mixed;
  else if (space[1] === 'srgb-linear') rgb = mixed.map(linearToSrgb) as [number, number, number];
  else rgb = oklabToLinearSrgb(...mixed).map(linearToSrgb) as [number, number, number];
  // A percentage sum under 100% scales alpha (CSS Color 5).
  const scale = total < 1 ? total : 1;
  return rgbaFromUnit(rgb[0], rgb[1], rgb[2], alpha * scale);
}

/** OKLab distance between two colors (alpha ignored), for "nearest declared color". */
export function oklabDistance(a: Rgba8, b: Rgba8): number {
  const la = linearSrgbToOklab(srgbToLinear(a.r / 255), srgbToLinear(a.g / 255), srgbToLinear(a.b / 255));
  const lb = linearSrgbToOklab(srgbToLinear(b.r / 255), srgbToLinear(b.g / 255), srgbToLinear(b.b / 255));
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

/** RGB within 1 per channel (membership; alpha ignored, the d05 precedent). */
export function sameRgb(a: Rgba8, b: Rgba8): boolean {
  return Math.abs(a.r - b.r) <= 1 && Math.abs(a.g - b.g) <= 1 && Math.abs(a.b - b.b) <= 1;
}

/** f01's color match: 1 per channel and 0.01 alpha. */
export function sameRgba(a: Rgba8, b: Rgba8): boolean {
  return sameRgb(a, b) && Math.abs(a.a - b.a) <= 0.01;
}

/** `fg` over `bg` (source-over), for a text color with alpha. */
export function composite(fg: Rgba8, bg: Rgba8): Rgba8 {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const ch = (f: number, b: number) => Math.round((f * fg.a + b * bg.a * (1 - fg.a)) / a);
  return { r: ch(fg.r, bg.r), g: ch(fg.g, bg.g), b: ch(fg.b, bg.b), a };
}

function relativeLuminance(c: Rgba8): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG 2.x contrast ratio, unrounded. Translucent colors are composited first (bg over white). */
export function contrastRatio(text: Rgba8, background: Rgba8): number {
  const white: Rgba8 = { r: 255, g: 255, b: 255, a: 1 };
  const bg = background.a < 1 ? composite(background, white) : background;
  const fg = text.a < 1 ? composite(text, bg) : text;
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** APCA-W3 0.0.98G Lc (reported, never scored: the v06 precedent). */
export function apcaLc(text: Rgba8, background: Rgba8): number {
  const y = (c: Rgba8) => {
    const ch = (v: number) => (v / 255) ** 2.4;
    const raw = 0.2126729 * ch(c.r) + 0.7151522 * ch(c.g) + 0.072175 * ch(c.b);
    return raw > 0.022 ? raw : raw + (0.022 - raw) ** 1.414;
  };
  const yt = y(text);
  const yb = y(background);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  let s: number;
  if (yb > yt) {
    s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return Math.round((s < 0.1 ? 0 : (s - 0.027) * 100) * 10) / 10;
  }
  s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return Math.round((s > -0.1 ? 0 : (s + 0.027) * 100) * 10) / 10;
}

// ── Dimensions ──────────────────────────────────────────────────────────────

export function dimension(value: number, unit: string): Dimension | null {
  if (!Number.isFinite(value)) return null;
  const u = unit.toLowerCase();
  if (u === 'px') return { value, unit: 'px', px: value };
  if (u === 'rem') return { value, unit: 'rem', px: Math.round(value * ROOT_PX * 10000) / 10000 };
  if (u === 'em') return { value, unit: 'em', px: null };
  return null;
}

/** '16px', '1.5rem', '.5em'. Null for anything else (bare numbers, %, pt, vw...). */
export function parseDimension(raw: string): Dimension | null {
  if (raw.length > 64) return null;
  const m = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|rem|em)\s*$/i.exec(raw);
  return m ? dimension(parseFloat(m[1]), m[2]) : null;
}

/** Does the string carry a length unit scoring does not compare ('12pt', '50%', '2vw')? */
export function hasOtherUnit(raw: string): boolean {
  if (raw.length > 64) return false;
  return /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:%|[a-z]+)\s*$/i.test(raw) && !parseDimension(raw);
}

/** A line height: a unitless number is a ratio, a dimension a length (section 3.2). */
export function parseLineHeight(raw: unknown): LineHeight | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return { kind: 'ratio', value: raw };
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length > 64) return null;
  if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return { kind: 'ratio', value: parseFloat(s) };
  const d = parseDimension(s);
  return d ? { kind: 'length', dim: d } : null;
}

/** A line height as a ratio, when it is one or its style declares a px or rem size. */
export function lineHeightRatio(lh: LineHeight | undefined, fontSize: Dimension | undefined): number | null {
  if (!lh) return null;
  if (lh.kind === 'ratio') return lh.value;
  if (lh.dim.px !== null && fontSize && fontSize.px) return lh.dim.px / fontSize.px;
  return null;
}

// ── Type roles and families ─────────────────────────────────────────────────

/** Role from the token name (section 3.2). */
export function typeRole(name: string): TypeRole {
  const n = name.toLowerCase().split(/[.\/]/).pop() || '';
  if (/^(?:headline|display|title|heading)/.test(n) || /^h[1-6](?:$|[-_])/.test(n)) return 'heading';
  if (/^(?:body|paragraph|text)/.test(n)) return 'body';
  if (/^(?:label|caption|overline)/.test(n)) return 'label';
  if (/^(?:code|mono)/.test(n)) return 'code';
  return 'other';
}

/** Generic keywords: fallbacks, never faces. */
export const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert',
  '-apple-system', 'blinkmacsystemfont',
]);

/** One family name, quotes stripped, whitespace collapsed (original case kept). */
export function cleanFamily(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
}

/** Case-folded comparison key for a family. */
export function familyKey(raw: string): string {
  return cleanFamily(raw).toLowerCase();
}

/** A font-family stack (string or list) as cleaned names, generics kept. */
export function splitFamilies(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : typeof raw === 'string' ? splitTopLevel(raw, ',') : [];
  return list.map(cleanFamily).filter(Boolean);
}

export function isGenericFamily(name: string): boolean {
  return GENERIC_FAMILIES.has(familyKey(name));
}

// ── Durations and easings ───────────────────────────────────────────────────

/** '200ms', '0.2s' to milliseconds. */
export function parseDurationMs(raw: string): number | null {
  if (raw.length > 64) return null;
  const m = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))(ms|s)\s*$/i.exec(raw);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Math.round((m[2].toLowerCase() === 's' ? v * 1000 : v) * 1000) / 1000;
}

export const EASING_KEYWORDS: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  linear: [0, 0, 1, 1],
};

/** 'cubic-bezier(a, b, c, d)' or a keyword to four numbers. */
export function parseEasing(raw: string): [number, number, number, number] | null {
  const s = raw.trim().toLowerCase();
  if (EASING_KEYWORDS[s]) return EASING_KEYWORDS[s];
  const m = /^cubic-bezier\(([^()]*)\)$/.exec(s);
  if (!m) return null;
  const parts = m[1].split(',').map((x) => num(x.trim()));
  if (parts.length !== 4 || parts.some((x) => x === null)) return null;
  return parts as [number, number, number, number];
}

/** OpenType tags from a DESIGN.md fontFeature string: "'tnum' 1, 'ss01'" to ['tnum', 'ss01']. */
export function parseFeatureTags(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const m = /^\s*["']([A-Za-z0-9 ]{4})["']\s*(on|off|\d+)?\s*$/.exec(part);
    if (!m) continue;
    if (m[2] === 'off' || m[2] === '0') continue;
    out.push(m[1].toLowerCase());
  }
  return [...new Set(out)];
}
