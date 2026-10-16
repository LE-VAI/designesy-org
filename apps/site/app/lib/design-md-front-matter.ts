// The DESIGN.md front matter that /DESIGN.md and /export/designmd serve.
//
// The DESIGN.md format reads tokens from YAML front matter (colors,
// typography, rounded, spacing). The contract's own scorer reads
// them from there too, and a file whose tokens sit only in Markdown tables is
// refused with TOKENS_IN_PROSE. So the served file carries the tokens twice:
// once here, for tools, and once in the tables, for people.
//
// Every value is derived, never typed: colors, the type scale, the fluid
// sizes and their two ends, the line heights, radii and spacing come from
// designSystemContract, which check-contract-drift.js holds to the :root
// tokens in globals.css. A color the contract writes as a color-mix() of its
// own tokens is resolved here the way CSS resolves it. What the contract does
// not state is named once below: heading weight and tracking (stated in
// prose), and each fluid role's family, weight and leading, each beside the
// stylesheet rules it is read from. scripts/check-design-md.mjs reads every
// one of them back from those rules, and the front matter from the tables and
// from :root.
//
// The front matter describes the default theme, the dark one that :root
// declares. Light-theme values stay in the table roles.
//
// Two choices keep the format's own linter at zero warnings, which is what
// check v37 reads when it lints this file on designesy.org:
//   * `primary` is present: the format requires a primary color and warns
//     without one. It is a reference to `signal`, the contract's brand accent,
//     not a new value, and it is the one front matter color with no table row.
//   * there is no components group: with one, the linter warns about every
//     color no component references (41 of them), and the contract's
//     components are written as states, not as token pairs.

import { designSystemContract } from './design-system-contract';

type ColorSpec = { token: string; value: string; role: string };
type ScaleSpec = { token: string; value: string; role: string };
type FluidSpec = { token: string; value: string; role: string; narrow: string; wide: string; selectors: readonly string[] };
type LeadingSpec = { token: string; value: string; role: string };
type Stack = 'display' | 'sans' | 'mono';
type Step = 'label' | 'body' | 'lead' | 'h3' | 'h2' | 'h1';

/** The faces next/font loads into each --font-* variable (app/layout.tsx). */
export const NEXT_FONT_FACES: Readonly<Record<string, string>> = {
  '--font-sans': 'Schibsted Grotesk',
  '--font-display': 'Fraunces',
  '--font-mono': 'Atkinson Hyperlegible Mono',
};

/** The default-theme part of a contract value: "#0A94FF · light: #016ABB" -> "#0A94FF". */
export function defaultThemeValue(value: string): string {
  return value.split('·')[0].trim();
}

const leadings = designSystemContract.typography.leading as unknown as Record<string, LeadingSpec>;

/** The ratio of a contract leading, by role: 'figure-tight' reads --leading-figure-tight. */
export function leadingRatio(role: string): number {
  const spec = Object.values(leadings).find((l) => l.token === `--leading-${role}`);
  if (!spec) throw new Error(`the contract declares no --leading-${role}`);
  return Number(spec.value);
}

/** Weight and tracking the contract states in prose, and the two leadings it
    states as tokens; each is the value of the globals.css rule named beside it. */
export const TYPE_RULES = {
  // `h1, h2, h3, h4` in globals.css; the contract's typography.headings.
  heading: { fontWeight: 700, lineHeight: leadingRatio('heading'), letterSpacing: '-0.02em' },
  // `body` in globals.css; the contract's typography.body.
  body: { lineHeight: leadingRatio('body') },
} as const;

/** The rule every heading inherits its type from, and the one everything else does. */
const HEADING = 'globals.css h1, h2, h3, h4';
const BODY = 'globals.css body';
const HOME_TITLE = 'home.css .home .home-title';
const HOME_DISPLAY = 'home.css .home .hero-display, .home .home-title';
const WORDMARK = 'labs/poise/poise.css .wordmark-hero';

/** Family, weight and leading of each fluid size's role. The contract states
    the size; these are what the rules give the element it sizes: the first
    rule the contract names for the role, then each rule in `from` in order
    (other rules on the same element, then the one it inherits from, HEADING
    for an h1 to h4 and BODY for anything else), and weight 400 where no rule
    sets one. A rule is written `<stylesheet under app/> <selector list>`.
    .report-hero-value and .report-hero-grade sit on no element any page
    renders, so they inherit from BODY, as any element outside a heading would. */
export const FLUID_TYPE: Readonly<Record<string, { family: Stack; weight: number; leading?: string; from: readonly string[] }>> = {
  title: { family: 'display', weight: 700, leading: 'title', from: [HEADING] },
  lede: { family: 'sans', weight: 400, leading: 'lede', from: [BODY] },
  thesis: { family: 'sans', weight: 400, leading: 'prose', from: [BODY] },
  sub: { family: 'sans', weight: 400, leading: 'meta', from: [BODY] },
  'card-title': { family: 'display', weight: 700, leading: 'heading', from: [HEADING] },
  'run-title': { family: 'sans', weight: 650, leading: 'snug', from: [BODY] },
  section: { family: 'display', weight: 400, leading: 'heading', from: [HEADING] },
  'home-section': { family: 'display', weight: 700, leading: 'heading', from: [HOME_TITLE, HOME_DISPLAY, HEADING] },
  statement: { family: 'display', weight: 700, leading: 'heading', from: [HOME_TITLE, HOME_DISPLAY, HEADING] },
  compact: { family: 'display', weight: 700, leading: 'heading', from: [HOME_TITLE, HOME_DISPLAY, HEADING] },
  hero: { family: 'display', weight: 340, leading: 'title', from: [HEADING] },
  'hero-phone': { family: 'display', weight: 340, leading: 'display', from: ['home.css .hero-display', HEADING] },
  'home-hero': { family: 'display', weight: 700, leading: 'heading', from: [HOME_DISPLAY, HEADING] },
  'home-hero-phone': { family: 'display', weight: 700, leading: 'heading', from: [HOME_DISPLAY, HEADING] },
  'panel-title': { family: 'display', weight: 700, leading: 'figure', from: [] },
  metric: { family: 'sans', weight: 700, leading: 'body', from: [BODY] },
  'report-grade': { family: 'sans', weight: 800, leading: 'single', from: [BODY] },
  readout: { family: 'display', weight: 700, leading: 'single', from: [] },
  'console-grade': { family: 'display', weight: 700, leading: 'numeral', from: [] },
  'engine-grade': { family: 'display', weight: 700, leading: 'numeral', from: [] },
  figure: { family: 'sans', weight: 600, leading: 'single', from: [] },
  fidelity: { family: 'display', weight: 700, leading: 'fidelity', from: [] },
  'fidelity-null': { family: 'display', weight: 700, leading: 'figure-tight', from: [] },
  stat: { family: 'sans', weight: 600, leading: 'figure', from: [] },
  'stat-solo': { family: 'sans', weight: 600, leading: 'figure', from: ['data.css .dx-stats dd'] },
  'orb-title': { family: 'display', weight: 500, leading: 'heading', from: [HEADING] },
  wordmark: { family: 'sans', weight: 800, leading: 'display', from: [WORDMARK, BODY] },
  'wordmark-demo': { family: 'sans', weight: 800, leading: 'display', from: [WORDMARK, BODY] },
  'wordmark-hero': { family: 'sans', weight: 800, leading: 'display', from: [BODY] },
};

/** Leadings no size entry carries, each with the family of the first rule
    that ships it (globals.css first, then the other stylesheets by path),
    read the same way: `ship`, then each rule in `from`. A leading entry has
    no fontSize: a leading is a line height, and one token serves text of
    several sizes, so no single size would be true of it. */
export const LEADING_TYPE: Readonly<Record<string, { family: Stack; ship: string; from: readonly string[] }>> = {
  step: { family: 'display', ship: 'home-inspect.css .inspect-step-title', from: [] },
  segment: { family: 'sans', ship: 'lib/engine/command-bar.css .eg-seg-opt', from: ['lib/engine/command-bar.css .eg-seg-opt'] },
  tight: { family: 'sans', ship: 'globals.css .nav-drawer .nav-drawer-group-list a', from: [BODY] },
  compact: { family: 'sans', ship: 'globals.css .cmdk-item-meta', from: [BODY] },
  card: { family: 'sans', ship: 'globals.css .principle-body h3', from: [] },
  'cell-title': { family: 'sans', ship: 'globals.css .check-cell-title', from: [BODY] },
  'cell-meta': { family: 'sans', ship: 'globals.css .check-cell-meta', from: [BODY] },
  note: { family: 'sans', ship: 'globals.css .principle-body p', from: [BODY] },
  reading: { family: 'sans', ship: 'brand/brand.css .brand-section p', from: [BODY] },
};

/** The format's required `primary` color, as a reference to the contract
    color whose role is the brand accent. */
export const PRIMARY_ALIAS = { name: 'primary', of: 'signal' } as const;

/** The front matter name of a contract color: its CSS variable without the dashes. */
export function colorName(spec: ColorSpec): string {
  if (!spec.token.startsWith('--')) throw new Error(`color token ${spec.token} is not a custom property`);
  return spec.token.slice(2);
}

/** A color as 0-255 sRGB channels and a 0-1 alpha. */
export type Rgba = [number, number, number, number];

/** The default-theme value of every contract color and surface token, by custom property. */
function contractColorValues(): Map<string, string> {
  const values = new Map<string, string>();
  for (const group of [designSystemContract.colors, designSystemContract.surfaces_and_lines] as unknown as Record<string, ColorSpec>[]) {
    for (const spec of Object.values(group)) if (spec && typeof spec.token === 'string' && typeof spec.value === 'string') values.set(spec.token, defaultThemeValue(spec.value));
  }
  return values;
}

/** Resolve a color value as CSS does: a hex or rgb()/rgba() literal, var() of a
    contract color, or color-mix(in srgb, ...) mixed with premultiplied alpha. */
export function resolveColor(value: string, values: ReadonlyMap<string, string> = contractColorValues(), depth = 0): Rgba {
  if (depth > 8) throw new Error(`color reference too deep: ${value}`);
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(v);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(hex[2] ? parseInt(hex[2], 16) / 255 : 1) as Rgba;
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  if (v === 'transparent') return [0, 0, 0, 0];
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  if (ref) {
    const next = values.get(ref[1]);
    if (next === undefined) throw new Error(`${ref[1]} is not a contract color`);
    return resolveColor(next, values, depth + 1);
  }
  const mix = /^color-mix\(\s*in srgb\s*,\s*(var\(--[a-z0-9-]+\)|transparent)(?:\s+([\d.]+)%)?\s*,\s*(var\(--[a-z0-9-]+\)|transparent)(?:\s+([\d.]+)%)?\s*\)$/.exec(v);
  if (mix) {
    const a = resolveColor(mix[1], values, depth + 1);
    const b = resolveColor(mix[3], values, depth + 1);
    // CSS Color 5: a missing percentage is the rest of 100%, the pair is
    // normalized to sum to 1, and a pair summing under 100% scales the alpha.
    const pa0 = mix[2] === undefined ? (mix[4] === undefined ? 50 : 100 - Number(mix[4])) : Number(mix[2]);
    const pb0 = mix[4] === undefined ? 100 - pa0 : Number(mix[4]);
    const sum = pa0 + pb0;
    if (!(sum > 0)) throw new Error(`color-mix percentages sum to ${sum}: ${value}`);
    const pa = pa0 / sum;
    const pb = pb0 / sum;
    const premultiplied = a[3] * pa + b[3] * pb;
    const channel = (i: number) => (premultiplied === 0 ? 0 : (a[i] * a[3] * pa + b[i] * b[3] * pb) / premultiplied);
    return [channel(0), channel(1), channel(2), premultiplied * Math.min(1, sum / 100)];
  }
  throw new Error(`cannot resolve color ${value}`);
}

/** #RRGGBB, or #RRGGBBAA for a translucent color. */
export function toHex(c: Rgba): string {
  const byte = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0').toUpperCase();
  return `#${byte(c[0])}${byte(c[1])}${byte(c[2])}${c[3] >= 1 ? '' : byte(c[3] * 255)}`;
}

export interface FrontMatterTokens {
  colors: Array<[string, string]>;
  typography: Array<[string, Record<string, string | number>]>;
  rounded: Array<[string, string]>;
  spacing: Array<[string, string | number]>;
}

/** Resolve a stack token's value into face names: var(--font-x) becomes its face. */
function familyStack(stackKey: 'sans' | 'serif' | 'mono' | 'display'): string {
  const stacks = designSystemContract.typography.font_stacks as Record<string, { token: string; value: string }>;
  let value = stacks[stackKey].value;
  for (let hop = 0; hop < 4; hop++) {
    const alias = /^var\(--([a-z]+)\)$/.exec(value.trim());
    if (!alias) break;
    const target = Object.values(stacks).find((s) => s.token === `--${alias[1]}`);
    if (!target) throw new Error(`font stack ${stackKey} points at --${alias[1]}, which the contract does not declare`);
    value = target.value;
  }
  return value.replace(/var\((--font-[a-z]+)\)/g, (_, v: string) => {
    const face = NEXT_FONT_FACES[v];
    if (!face) throw new Error(`no face is named for ${v}`);
    return face;
  });
}

export function frontMatterTokens(): FrontMatterTokens {
  const c = designSystemContract;
  const colorSpecs = c.colors as Record<string, ColorSpec>;
  const names = new Set(Object.values(colorSpecs).map(colorName));

  if (!names.has(PRIMARY_ALIAS.of)) throw new Error(`primary points at ${PRIMARY_ALIAS.of}, which is not a contract color`);
  const colors: Array<[string, string]> = [[PRIMARY_ALIAS.name, `{colors.${PRIMARY_ALIAS.of}}`]];
  for (const [name, value] of Object.values(colorSpecs).map((spec): [string, string] => {
    const v = defaultThemeValue(spec.value);
    const ref = /^var\(--([a-z0-9-]+)\)$/.exec(v);
    if (ref) {
      if (!names.has(ref[1])) throw new Error(`${spec.token} refers to --${ref[1]}, which is not a contract color`);
      return [colorName(spec), `{colors.${ref[1]}}`];
    }
    if (/^color-mix\(/.test(v)) return [colorName(spec), toHex(resolveColor(v))];
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`${spec.token} has no default-theme hex, reference or color-mix(): ${spec.value}`);
    return [colorName(spec), v];
  })) colors.push([name, value]);

  const scale = c.typography.scale as unknown as Record<string, ScaleSpec | string>;
  const size = (step: Step) => (scale[step] as ScaleSpec).value;
  const stacks: Record<Stack, string> = { display: familyStack('display'), sans: familyStack('sans'), mono: familyStack('mono') };
  const heading = (step: 'h1' | 'h2' | 'h3'): Record<string, string | number> => ({
    fontFamily: stacks.display,
    fontSize: size(step),
    fontWeight: TYPE_RULES.heading.fontWeight,
    lineHeight: TYPE_RULES.heading.lineHeight,
    letterSpacing: TYPE_RULES.heading.letterSpacing,
  });
  const typography: Array<[string, Record<string, string | number>]> = [
    ['h1', heading('h1')],
    ['h2', heading('h2')],
    ['h3', heading('h3')],
    ['lead', { fontFamily: stacks.sans, fontSize: size('lead') }],
    ['body', { fontFamily: stacks.sans, fontSize: size('body'), lineHeight: TYPE_RULES.body.lineHeight }],
    ['label', { fontFamily: stacks.mono, fontSize: size('label') }],
  ];

  // A fontSize cannot hold a clamp(), so each fluid size is two entries, its
  // narrow and wide ends, which the contract states beside the clamp.
  const carried = new Set(['heading', 'body']);
  const fluid = c.typography.fluid as unknown as Record<string, FluidSpec>;
  for (const spec of Object.values(fluid)) {
    const role = spec.token.replace(/^--text-/, '');
    const type = FLUID_TYPE[role];
    if (!type) throw new Error(`FLUID_TYPE names no family, weight or leading for ${spec.token}`);
    for (const [end, px] of [['narrow', spec.narrow], ['wide', spec.wide]] as const) {
      const style: Record<string, string | number> = { fontFamily: stacks[type.family], fontSize: px, fontWeight: type.weight };
      if (type.leading) style.lineHeight = leadingRatio(type.leading);
      typography.push([`${role}-${end}`, style]);
    }
    if (type.leading) carried.add(type.leading);
  }
  // Every other leading gets an entry of its own, so each line height the
  // site ships is a front matter token.
  for (const spec of Object.values(leadings)) {
    const role = spec.token.replace(/^--leading-/, '');
    if (carried.has(role)) continue;
    const type = LEADING_TYPE[role];
    if (!type) throw new Error(`LEADING_TYPE names no family for ${spec.token}`);
    typography.push([`leading-${role}`, { fontFamily: stacks[type.family], lineHeight: Number(spec.value) }]);
  }

  const rounded: Array<[string, string]> = Object.entries(c.rounded as Record<string, { token: string; value: string }>).map(([k, spec]) => [k, spec.value]);

  const spacingScale = c.layout.spacing_scale as Record<string, { token: string; value: string }>;
  const spacing: Array<[string, string | number]> = Object.values(spacingScale).map((spec) => [spec.token.slice(2), spec.value === '0' ? 0 : spec.value]);

  return { colors, typography, rounded, spacing };
}

/** A YAML scalar: numbers bare, everything else double-quoted. */
function scalar(v: string | number): string {
  if (typeof v === 'number') return String(v);
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The token groups as YAML lines, to sit inside the front matter. */
export function frontMatterYaml(t: FrontMatterTokens = frontMatterTokens()): string {
  const out: string[] = ['colors:'];
  for (const [k, v] of t.colors) out.push(`  ${k}: ${scalar(v)}`);
  out.push('typography:');
  for (const [k, style] of t.typography) {
    out.push(`  ${k}:`);
    for (const [f, v] of Object.entries(style)) out.push(`    ${f}: ${scalar(v)}`);
  }
  out.push('rounded:');
  for (const [k, v] of t.rounded) out.push(`  ${k}: ${scalar(v)}`);
  out.push('spacing:');
  for (const [k, v] of t.spacing) out.push(`  ${k}: ${scalar(v)}`);
  return out.join('\n');
}
