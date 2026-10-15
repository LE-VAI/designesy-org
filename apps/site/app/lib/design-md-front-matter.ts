// The DESIGN.md front matter that /DESIGN.md and /export/designmd serve.
//
// The DESIGN.md format reads tokens from YAML front matter (colors,
// typography, rounded, spacing). The contract's own scorer reads
// them from there too, and a file whose tokens sit only in Markdown tables is
// refused with TOKENS_IN_PROSE. So the served file carries the tokens twice:
// once here, for tools, and once in the tables, for people.
//
// Every value is derived, never typed: colors, the type scale, radii and
// spacing come from designSystemContract, which check-contract-drift.js holds
// to the :root tokens in globals.css. The few values the contract states only
// in prose (heading and body leading, heading weight and tracking) are named
// once below, and
// scripts/check-design-md.mjs holds each of them to the rule in globals.css
// that ships it, and the front matter to the tables and to :root.
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

/** The faces next/font loads into each --font-* variable (app/layout.tsx). */
export const NEXT_FONT_FACES: Readonly<Record<string, string>> = {
  '--font-sans': 'Schibsted Grotesk',
  '--font-display': 'Fraunces',
  '--font-mono': 'Atkinson Hyperlegible Mono',
};

/** Leading, weight and tracking the contract states in prose; each is the value
    of the globals.css rule named beside it. */
export const TYPE_RULES = {
  // `h1, h2, h3, h4` in globals.css; the contract's typography.headings.
  heading: { fontWeight: 700, lineHeight: 1.08, letterSpacing: '-0.02em' },
  // `body` in globals.css; the contract's typography.body.
  body: { lineHeight: 1.55 },
} as const;

/** The format's required `primary` color, as a reference to the contract
    color whose role is the brand accent. */
export const PRIMARY_ALIAS = { name: 'primary', of: 'signal' } as const;

/** The default-theme part of a contract value: "#0A94FF · light: #016ABB" -> "#0A94FF". */
export function defaultThemeValue(value: string): string {
  return value.split('·')[0].trim();
}

/** The front matter name of a contract color: its CSS variable without the dashes. */
export function colorName(spec: ColorSpec): string {
  if (!spec.token.startsWith('--')) throw new Error(`color token ${spec.token} is not a custom property`);
  return spec.token.slice(2);
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
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`${spec.token} has no default-theme hex or reference: ${spec.value}`);
    return [colorName(spec), v];
  })) colors.push([name, value]);

  const scale = c.typography.scale as unknown as Record<string, ScaleSpec | string>;
  const size = (step: 'label' | 'body' | 'lead' | 'h3' | 'h2' | 'h1') => (scale[step] as ScaleSpec).value;
  const display = familyStack('display');
  const sans = familyStack('sans');
  const mono = familyStack('mono');
  const heading = (step: 'h1' | 'h2' | 'h3'): Record<string, string | number> => ({
    fontFamily: display,
    fontSize: size(step),
    fontWeight: TYPE_RULES.heading.fontWeight,
    lineHeight: TYPE_RULES.heading.lineHeight,
    letterSpacing: TYPE_RULES.heading.letterSpacing,
  });
  const typography: Array<[string, Record<string, string | number>]> = [
    ['h1', heading('h1')],
    ['h2', heading('h2')],
    ['h3', heading('h3')],
    ['lead', { fontFamily: sans, fontSize: size('lead') }],
    ['body', { fontFamily: sans, fontSize: size('body'), lineHeight: TYPE_RULES.body.lineHeight }],
    ['label', { fontFamily: mono, fontSize: size('label') }],
  ];

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
