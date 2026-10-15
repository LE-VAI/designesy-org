// The contract digest (contract-mode spec §11.2): sha256 over a canonical JSON
// of the model. Prose, names, problems, the source and key or token order do
// not move it; a token value, a path, a pair, an alias, an omission or the
// token map does.

import { createHash } from 'node:crypto';
import { hexOf } from './normalize';
import type { Dimension, LineHeight, OwnContract } from './types';

type Canon = null | boolean | number | string | Canon[] | { [k: string]: Canon };

/** Objects with sorted keys; numbers in JavaScript's shortest round-trip form. */
export function canonicalJson(v: Canon): string {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 'null';
    return JSON.stringify(Object.is(v, -0) ? 0 : v);
  }
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
}

const dim = (d: Dimension): Canon => ({ value: d.value, unit: d.unit });
const lh = (l: LineHeight): Canon => (l.kind === 'ratio' ? { kind: 'ratio', value: l.value } : { kind: 'length', value: l.dim.value, unit: l.dim.unit });
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** The canonical document the digest hashes (exported for the stability tests). */
export function canonicalModel(c: Pick<OwnContract, 'format' | 'colors' | 'typography' | 'families' | 'radii' | 'spacing' | 'sizes' | 'durations' | 'easings' | 'pairs' | 'aliases' | 'omitted' | 'tokenMap'>): Canon {
  const tokens: Array<{ path: string; value: Canon }> = [];
  for (const t of c.colors) tokens.push({ path: t.path, value: hexOf(t.rgba) });
  for (const t of c.typography) {
    const v: { [k: string]: Canon } = {};
    if (t.families) v.families = t.families.map((f) => f.toLowerCase());
    if (t.fontSize) v.fontSize = dim(t.fontSize);
    if (t.fontWeight !== undefined) v.fontWeight = t.fontWeight;
    if (t.lineHeight) v.lineHeight = lh(t.lineHeight);
    if (t.letterSpacing) v.letterSpacing = dim(t.letterSpacing);
    if (t.features && t.features.length) v.features = [...t.features].sort();
    tokens.push({ path: t.path, value: v });
  }
  for (const t of c.families) if (!c.typography.some((s) => s.path === t.path)) tokens.push({ path: t.path, value: t.families.map((f) => f.toLowerCase()) });
  for (const t of c.radii) tokens.push({ path: t.path, value: dim(t.dim) });
  for (const t of c.spacing) tokens.push({ path: t.path, value: dim(t.dim) });
  for (const t of c.sizes) tokens.push({ path: t.path, value: { ...(dim(t.dim) as object), interactive: t.interactive } as Canon });
  for (const t of c.durations) tokens.push({ path: t.path, value: t.ms });
  for (const t of c.easings) tokens.push({ path: t.path, value: t.points.map(r6) });
  // Sort by path; a path that appears in two groups (a component's literal
  // radius beside its size) keeps both, ordered by their value text.
  tokens.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : canonicalJson(a.value) < canonicalJson(b.value) ? -1 : 1));
  const aliases = [...c.aliases].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : 1)).map((a) => ({ from: a.from, to: a.to }));
  const pairs = [...c.pairs]
    .map((p) => ({ source: p.source, text: p.text, background: p.background, role: p.role, largeText: p.largeText }))
    .sort((a, b) => canonicalJson(a) < canonicalJson(b) ? -1 : 1);
  const omitted = [...c.omitted].map((o) => ({ group: o.group, reason: o.reason ?? null })).sort((a, b) => (a.group < b.group ? -1 : 1));
  const tokenMap: { [k: string]: Canon } = {};
  for (const [k, v] of c.tokenMap) tokenMap[k] = v;
  return { format: c.format, tokens, aliases, pairs, omitted, tokenMap } as Canon;
}

export function contractDigest(c: Parameters<typeof canonicalModel>[0]): string {
  return createHash('sha256').update(canonicalJson(canonicalModel(c)), 'utf8').digest('hex');
}
