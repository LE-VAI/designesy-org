// Page-level null rules (contract-mode spec §9), evaluated
// on the fetched page before scoring, in this mode only.
//
// Hand-written scans (indexOf, bounded tag reads): hostile HTML costs one pass.

export const EMPTY_SHELL_TEXT_MAX = 280;
export const NO_CSS_BYTES = 500;
const MOUNT_IDS = new Set(['root', 'app', '__next', '__nuxt', 'svelte']);

/** Remove whole elements by tag name (script, style, noscript, template) in one pass. */
function dropElements(html: string, tags: string[]): string {
  let out = html;
  for (const tag of tags) {
    const low = out.toLowerCase();
    let res = '';
    let i = 0;
    while (i < out.length) {
      const open = low.indexOf(`<${tag}`, i);
      if (open < 0) { res += out.slice(i); break; }
      res += out.slice(i, open);
      const close = low.indexOf(`</${tag}`, open);
      if (close < 0) { i = out.length; break; }
      const end = low.indexOf('>', close);
      i = end < 0 ? out.length : end + 1;
    }
    out = res;
  }
  return out;
}

/** Visible text: elements that render no text removed, then every tag, whitespace collapsed. */
export function visibleText(html: string): string {
  const stripped = dropElements(html, ['script', 'style', 'noscript', 'template']);
  let text = '';
  let i = 0;
  while (i < stripped.length) {
    const lt = stripped.indexOf('<', i);
    if (lt < 0) { text += stripped.slice(i); break; }
    text += `${stripped.slice(i, lt)} `;
    const gt = stripped.indexOf('>', lt);
    i = gt < 0 ? stripped.length : gt + 1;
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** Opening tags as { name, attrs, end }, read one at a time. */
function* tags(html: string): Generator<{ name: string; attrs: string; end: number }> {
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) return;
    const gt = html.indexOf('>', lt);
    if (gt < 0) return;
    const inner = html.slice(lt + 1, gt);
    i = gt + 1;
    if (!inner || inner[0] === '/' || inner[0] === '!' || inner[0] === '?') continue;
    let k = 0;
    while (k < inner.length && /[A-Za-z0-9-]/.test(inner[k])) k++;
    yield { name: inner.slice(0, k).toLowerCase(), attrs: inner.slice(k), end: gt + 1 };
  }
}

function attr(attrs: string, name: string): string | null {
  const low = attrs.toLowerCase();
  let at = 0;
  while (true) {
    const idx = low.indexOf(name, at);
    if (idx < 0) return null;
    const before = idx === 0 ? ' ' : low[idx - 1];
    let j = idx + name.length;
    while (j < low.length && low[j] === ' ') j++;
    if (/[\s"']/.test(before) && low[j] === '=') {
      j++;
      while (j < low.length && low[j] === ' ') j++;
      const q = attrs[j];
      if (q === '"' || q === "'") {
        const e = attrs.indexOf(q, j + 1);
        return attrs.slice(j + 1, e < 0 ? attrs.length : e);
      }
      let e = j;
      while (e < attrs.length && !/[\s>]/.test(attrs[e])) e++;
      return attrs.slice(j, e);
    }
    if (/[\s"']/.test(before) && (j >= low.length || /[\s/]/.test(low[j]))) return '';
    at = idx + name.length;
  }
}

/**
 * Empty shell: visible text under 280 characters, an empty mount node (id
 * root, app, __next, __nuxt or svelte, or an app-root element) and a script
 * with src or type="module".
 */
export function isEmptyShell(html: string): boolean {
  if (visibleText(html).length >= EMPTY_SHELL_TEXT_MAX) return false;
  let mount = false;
  let script = false;
  for (const t of tags(html)) {
    if (t.name === 'script') {
      if (attr(t.attrs, 'src') !== null || (attr(t.attrs, 'type') ?? '').trim().toLowerCase() === 'module') script = true;
      continue;
    }
    const id = attr(t.attrs, 'id');
    if (!mount && (t.name === 'app-root' || (id !== null && MOUNT_IDS.has(id.trim())))) {
      // Empty: only whitespace up to its own closing tag.
      let j = t.end;
      while (j < html.length && /\s/.test(html[j])) j++;
      if (html.startsWith(`</${t.name}`, j) || html.slice(j, j + t.name.length + 2).toLowerCase() === `</${t.name}`) mount = true;
    }
    if (mount && script) return true;
  }
  return mount && script;
}

/** No CSS: inline plus fetched CSS under 500 bytes after trimming. */
export function hasNoCss(css: string): boolean {
  return new TextEncoder().encode(css.trim()).length < NO_CSS_BYTES;
}

export const NULL_DETAIL = {
  empty_shell: 'This page builds itself in the browser: its HTML holds an empty mount node and a script, so there is nothing to compare without running JavaScript.',
  no_css: (bytes: number) => `This page has no styles the engine could read: ${bytes} bytes of CSS, under the ${NO_CSS_BYTES} the engine needs.`,
};
