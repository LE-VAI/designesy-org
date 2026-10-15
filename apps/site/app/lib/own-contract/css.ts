// The page reader for contract mode (contract-mode spec §5.1): one linear pass over
// the page's CSS into declarations, the root custom properties, and the usage
// declarations the fidelity checks count.
//
// Hand-written scanner, no regular expression over the stylesheet: hostile
// CSS (megabytes, long brace runs, 10,000-character selectors, fixture S-7)
// costs one pass. Strings, comments and parentheses are respected, so a brace
// inside content: "{" or url(...) does not end a rule.
//
// What counts:
//   * root custom properties: unscoped `:root`, `:root, :host`, `:host` and
//     `html` blocks, also inside @layer (Tailwind v4 writes its theme there),
//     never under @media or a theme selector (lesser decision L8);
//   * usage: every other declaration of a style rule, minus custom properties,
//     vendor-prefixed properties and theme blocks (`[data-theme]`, `.dark`,
//     `.light`, prefers-color-scheme), so a literal is counted where it is used.

export interface Decl {
  selector: string;
  prop: string;
  value: string;
  important: boolean;
  /** Enclosing at-rule preludes, outermost first. */
  at: string[];
  /** Index of the rule the declaration sits in (shared by its siblings). */
  rule: number;
}

export interface PageCss {
  decls: Decl[];
  rootVars: Map<string, string>;
  usage: Decl[];
}

const GROUPING_AT = /^@(?:media|supports|layer|container|document|scope|starting-style)\b/i;

function isThemeSelector(sel: string): boolean {
  const s = sel.toLowerCase();
  return s.includes('[data-theme') || s.includes('[data-mode') || s.includes('[data-color-scheme') || /(^|[\s,>+~(])(?:html|:root|body)?\.(?:dark|light|theme-[\w-]+)(?![\w-])/.test(s) || /(^|[\s,>+~])\.(?:dark|light)(?![\w-])/.test(s);
}

function isThemeAt(at: string[]): boolean {
  return at.some((a) => a.toLowerCase().includes('prefers-color-scheme'));
}

const ROOT_SELECTORS = new Set([':root', ':root,:host', ':host', 'html', ':root,html', 'html,:root']);

/** Strip comments in one pass, keeping strings intact. */
export function stripComments(css: string): string {
  let out = '';
  let i = 0;
  const n = css.length;
  let start = 0;
  while (i < n) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      i = skipString(css, i);
      continue;
    }
    if (ch === '/' && css[i + 1] === '*') {
      out += css.slice(start, i);
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      start = i;
      out += ' ';
      continue;
    }
    i++;
  }
  return out + css.slice(start);
}

/** Index just past the string that starts at i (an unclosed string ends at the line). */
function skipString(s: string, i: number): number {
  const q = s[i];
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') { j += 2; continue; }
    if (c === q) return j + 1;
    if (c === '\n') return j;
    j++;
  }
  return j;
}

/**
 * For every `{`, the index of its matching `}` (the text length when it never
 * closes), found in one pass with a stack, so nested blocks cost no rescans.
 */
function bracePairs(s: string): Map<number, number> {
  const pairs = new Map<number, number>();
  const open: number[] = [];
  let j = 0;
  while (j < s.length) {
    const c = s[j];
    if (c === '"' || c === "'") { j = skipString(s, j); continue; }
    if (c === '{') open.push(j);
    else if (c === '}' && open.length) pairs.set(open.pop()!, j);
    j++;
  }
  for (const o of open) pairs.set(o, s.length);
  return pairs;
}

/** Split on `sep` at depth 0 (parens and strings respected). */
export function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipString(s, i) - 1; continue; }
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

/** Whitespace-, comma- and slash-separated value components at depth 0. */
export function valueParts(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '"' || c === "'") {
      const end = skipString(value, i);
      cur += value.slice(i, end);
      i = end - 1;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ',' || c === '/')) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

export function readPageCss(input: string): PageCss {
  const css = stripComments(input);
  const decls: Decl[] = [];
  const pairs = bracePairs(css);
  // An explicit stack instead of recursion: nesting depth is caller input.
  const stack: Array<{ start: number; end: number; at: string[] }> = [{ start: 0, end: css.length, at: [] }];
  while (stack.length) {
    const frame = stack.pop()!;
    let i = frame.start;
    while (i < frame.end) {
      // Prelude: up to `{`, `;` or `}` at depth 0.
      let j = i;
      let depth = 0;
      while (j < frame.end) {
        const c = css[j];
        if (c === '"' || c === "'") { j = skipString(css, j); continue; }
        if (c === '(') depth++;
        else if (c === ')') depth = Math.max(0, depth - 1);
        else if (depth === 0 && (c === '{' || c === ';' || c === '}')) break;
        j++;
      }
      if (j >= frame.end) break;
      const prelude = css.slice(i, j).trim();
      if (css[j] !== '{') { i = j + 1; continue; } // a statement at-rule or a stray token
      const close = Math.min(pairs.get(j) ?? css.length, frame.end);
      if (prelude.startsWith('@')) {
        // Grouping rules nest; past 32 levels the block is not read (hostile input).
        if (GROUPING_AT.test(prelude) && frame.at.length < 32) stack.push({ start: j + 1, end: close, at: [...frame.at, prelude.slice(0, 200)] });
        // @font-face, @keyframes, @page, @property and others: not usage.
      } else if (prelude) {
        // The rule's source offset orders declarations, so later rules win.
        const rule = j;
        // Nested rules inside a style rule are skipped; only its own declarations count.
        const pieces: string[] = [];
        let k = j + 1;
        let from = k;
        while (k < close) {
          const c = css[k];
          if (c === '"' || c === "'") { k = skipString(css, k); continue; }
          if (c === '{') {
            const head = css.slice(from, k);
            const lastSemi = head.lastIndexOf(';');
            if (lastSemi >= 0) pieces.push(head.slice(0, lastSemi + 1));
            k = Math.min(pairs.get(k) ?? close, close) + 1;
            from = k;
            continue;
          }
          k++;
        }
        pieces.push(css.slice(from, close));
        const flat = pieces.join('');
        for (const part of splitTop(flat, ';')) {
          const colon = part.indexOf(':');
          if (colon < 1) continue;
          const prop = part.slice(0, colon).trim().toLowerCase();
          let value = part.slice(colon + 1).trim();
          const important = /!\s*important\s*$/i.test(value);
          if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
          if (!value || !/^-{0,2}[a-z][a-z0-9-]*$/.test(prop)) continue;
          decls.push({ selector: prelude, prop: part.slice(0, colon).trim().startsWith('--') ? part.slice(0, colon).trim() : prop, value, important, at: frame.at, rule });
        }
      }
      i = close + 1;
    }
  }
  // The stack visits blocks out of source order; restore it.
  decls.sort((a, b) => a.rule - b.rule);

  const rootVars = new Map<string, string>();
  const usage: Decl[] = [];
  for (const d of decls) {
    const theme = isThemeSelector(d.selector) || isThemeAt(d.at);
    if (d.prop.startsWith('--')) {
      const sel = d.selector.replace(/\s+/g, '');
      const plainAt = d.at.every((a) => /^@layer\b/i.test(a));
      if (!theme && plainAt && ROOT_SELECTORS.has(sel.toLowerCase())) rootVars.set(d.prop, d.value);
      continue;
    }
    if (theme || d.prop.startsWith('-')) continue;
    usage.push(d);
  }
  return { decls, rootVars, usage };
}

/**
 * Substitute var() through the root custom properties, with fallbacks.
 * Null when a reference cannot be resolved (or loops).
 */
export function resolveVars(value: string, vars: Map<string, string>, depth = 0): string | null {
  if (depth > 8) return null;
  if (!value.includes('var(')) return value;
  let out = '';
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf('var(', i);
    if (at < 0) { out += value.slice(i); break; }
    out += value.slice(i, at);
    // Find the matching paren.
    let d = 0;
    let j = at + 3;
    for (; j < value.length; j++) {
      if (value[j] === '(') d++;
      else if (value[j] === ')') { d--; if (d === 0) break; }
    }
    const inner = value.slice(at + 4, j);
    const comma = splitTop(inner, ',');
    const name = comma[0].trim();
    const fallback = comma.length > 1 ? comma.slice(1).join(',').trim() : null;
    const raw = vars.get(name);
    let sub: string | null = null;
    if (raw !== undefined) sub = resolveVars(raw, vars, depth + 1);
    if (sub === null && fallback !== null) sub = resolveVars(fallback, vars, depth + 1);
    if (sub === null) return null;
    out += sub;
    i = j + 1;
  }
  return out;
}

/** The custom properties a value references directly, in order. */
export function varNames(value: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf('var(', i);
    if (at < 0) break;
    let j = at + 4;
    while (j < value.length && /\s/.test(value[j])) j++;
    let k = j;
    while (k < value.length && value[k] !== ',' && value[k] !== ')' && !/\s/.test(value[k])) k++;
    if (value.startsWith('--', j)) out.push(value.slice(j, k));
    i = k;
  }
  return out;
}
