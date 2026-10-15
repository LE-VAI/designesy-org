/**
 * Critical CSS for app/globals.css: the shared library behind
 * scripts/build-critical-css.mjs (runs before `next build`) and
 * scripts/check-critical-css.mjs (runs after it).
 *
 * WHY (2026-10-11)
 * Every route waited for the global stylesheet before its first paint. Under
 * Lighthouse's mobile throttling it was the last render-blocking response on
 * every route: about 255 KB decoded, 47 KB on the wire, landing well after the
 * HTML. The fix inlines the part of globals.css that the server-rendered markup
 * uses and loads the whole file without blocking paint (app/lib/critical-css.tsx).
 *
 * WHY NOT A NEXT.JS OPTION
 * Next 15.5 offers two. `experimental.optimizeCss` runs only in the pages
 * router. `experimental.inlineCss` inlines EVERY stylesheet in full into every
 * HTML response, and the same CSS travels a second time inside the RSC payload,
 * so the home page roughly triples its HTML. Neither inlines a subset.
 *
 * WHY THE PIPELINE IS REPRODUCED HERE
 * globals.css is no longer imported by the root layout in production (an import
 * there is always a render-blocking <link>), so Next no longer builds it. This
 * file builds it the way Next does: the same PostCSS plugins with the same
 * options and browser targets, then the same minifier with the same options.
 * The output was checked byte for byte against the chunk Next 15.5.27 emitted
 * for the same source (255,336 bytes, identical), and again against the chunk
 * Next 16.4.1 emits with `next build --webpack` (232,637 bytes, identical; the
 * Next 16 browser floor drops the older vendor prefixes). This is the webpack
 * pipeline: Turbopack builds CSS with lightningcss instead, so a move to
 * Turbopack means revisiting this file. `next` is pinned exactly in
 * package.json, so the internals used below cannot move under a caret range.
 *
 * WHAT COUNTS AS CRITICAL
 * A style rule is critical when one of its selectors matches an element in the
 * server-rendered HTML of any page, or (when the manifest is refreshed with
 * --hydrated) in a page's DOM after it hydrates. Matching is static (no layout),
 * so it is deliberately generous:
 *   - every media query counts as true (both phone and desktop rules ship);
 *   - state pseudo-classes and pseudo-elements are ignored when matching
 *     (:hover, :focus-visible, ::before ...), so a rule for a visible element's
 *     focus ring or ::before mark ships with it;
 *   - state that scripts set is treated as present and absent at once: on
 *     <html> before paint (data-theme, data-motion, js-ready), so BOTH themes
 *     and the paused-motion rules ship and neither theme flashes, and on
 *     elements after hydration (aria-pressed, data-state ...; STATE_ATTRS);
 *   - a selector the matcher cannot parse counts as matched.
 * Always kept: @font-face (the tuned fallback faces), @property, and every
 * @keyframes that kept CSS names. Never kept: @media print.
 *
 * The set of critical rules is committed as app/critical-css.manifest.json
 * (rule keys, not bodies), so a build needs no browser and no second pass, and a
 * rule whose body changes ships its new body. check-critical-css.mjs fails the
 * build when a page uses a rule the manifest lacks; `npm run update-critical-css`
 * refreshes it.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { parseDocument } from 'htmlparser2';
import { selectOne, compile } from 'css-select';

const require = createRequire(import.meta.url);

/** Build globals.css exactly as Next's production webpack pipeline does. */
export async function buildGlobalsCss(siteDir) {
  const req = (m) => require(require.resolve(m, { paths: [siteDir] }));
  const postcss = req('postcss');
  const { getSupportedBrowsers } = req('next/dist/build/utils');
  const browsers = getSupportedBrowsers(siteDir, false);
  const from = path.join(siteDir, 'app', 'globals.css');
  const src = fs.readFileSync(from, 'utf8');
  // next/dist/build/webpack/config/blocks/css/plugins.js getDefaultPlugins()
  const stage1 = await postcss([
    req('next/dist/compiled/postcss-flexbugs-fixes'),
    req('next/dist/compiled/postcss-preset-env')({
      browsers,
      autoprefixer: { flexbox: 'no-2009' },
      stage: 3,
      features: { 'custom-properties': false },
    }),
  ]).process(src, { from, map: false });
  // next/dist/build/webpack/plugins/css-minimizer-plugin.js
  const min = await postcss([req('next/dist/compiled/cssnano-simple')({ colormin: false }, postcss)])
    .process(stage1.css, { from: 'globals.css', to: 'globals.css', parser: req('next/dist/compiled/postcss-scss'), map: false });
  return min.css;
}

export function parseCss(siteDir, css) {
  const postcss = require(require.resolve('postcss', { paths: [siteDir] }));
  return postcss.parse(css);
}

/** "@media (max-width:640px)>@supports (x)|.a .b" — at-rule chain, then the selector. */
export function ruleKey(rule) {
  const chain = [];
  for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
    if (p.type === 'atrule') chain.unshift(`@${p.name} ${p.params}`);
  }
  return `${chain.join('>')}|${rule.selector}`;
}

const inPrint = (rule) => {
  for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
    if (p.type === 'atrule' && p.name === 'media' && /^\s*print\b/i.test(p.params)) return true;
  }
  return false;
};
const inKeyframes = (rule) => {
  for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
    if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return true;
  }
  return false;
};

// State that scripts set: on <html> before first paint (js-ready, data-theme,
// data-motion), and on elements once the page hydrates (a toggle's
// aria-pressed, a measured data-fits, a revealed data-reveal ...). The server's
// HTML holds one value or none, so each condition is dropped: treated as both
// present and absent, which keeps the rule for every state of the element.
const STATE_ATTRS = [
  'data-theme', 'data-motion', 'data-scroll-lock', 'aria-pressed', 'aria-expanded', 'aria-checked', 'aria-selected',
  'data-state', 'data-shown', 'data-copied', 'data-fits', 'data-sized', 'data-overflow', 'data-status', 'data-reveal',
  'data-quiet', 'data-cuelume-hover', 'open',
];
const HTML_STATE = [
  /:not\(\s*\.js-ready\s*\)/g,
  /\.js-ready(?![-\w])/g,
  ...STATE_ATTRS.map((name) => new RegExp(`\\[${name}(?:[~|^$*]?=(?:"[^"]*"|'[^']*'|[^\\]]*))?(?:\\s+[is])?\\]`, 'g')),
];
// Interaction and runtime pseudo-classes, and every pseudo-element. Ignored for
// matching: the rule is critical when the element it styles is in the page.
const STATE_PSEUDO = new RegExp(
  '::?(?:' + [
    'hover', 'focus', 'focus-visible', 'focus-within', 'active', 'visited', 'target', 'target-within',
    'checked', 'indeterminate', 'placeholder-shown', 'autofill', '-webkit-autofill', 'popover-open', 'open', 'closed',
    'modal', 'fullscreen', 'user-invalid', 'user-valid', 'invalid', 'valid', 'in-range', 'out-of-range',
    'defined', 'playing', 'paused', 'current', 'past', 'future', 'local-link', 'any-link', 'link',
    'read-only', 'read-write', 'default', 'optional', 'required', 'enabled', 'disabled', 'blank',
  ].join('|') + ')(?![-\\w])', 'g');
const PSEUDO_ELEMENT = /::[-\w]+(?:\((?:[^()]|\([^()]*\))*\))?|:(?:before|after|first-line|first-letter)(?![-\w])/g;

/** Normalise a selector for static matching, or null if it reduces to "everything". */
export function matchableSelector(sel) {
  let s = sel;
  for (const re of HTML_STATE) s = s.replace(re, '');
  s = s.replace(PSEUDO_ELEMENT, '').replace(STATE_PSEUDO, '');
  // A :not() / :is() / :where() / :has() with an alternative the stripping
  // emptied ("(,", ",,", ",)", "()") stood for "any state", so the whole
  // pseudo-class is dropped: an over-inclusion, never a miss.
  s = s.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, (m) => (/\(\s*,|,\s*,|,\s*\)|\(\s*\)/.test(m) ? '' : m));
  s = s.replace(/\s+/g, ' ').trim();
  // A compound left empty after a combinator ("html > ", "a + ") means "any".
  s = s.replace(/([>+~])\s*$/, '$1 *').replace(/^\s*([>+~])/, '* $1');
  if (s === '' || s === '*') return null;
  return s;
}

// Classes required by a selector outside any parentheses (a cheap prefilter:
// a document without one of them cannot match).
function requiredClasses(sel) {
  let depth = 0; let out = ''; for (const ch of sel) { if (ch === '(') depth++; else if (ch === ')') depth--; else if (depth === 0) out += ch; }
  return [...out.matchAll(/\.(-?[_a-zA-Z][-\w]*)/g)].map((m) => m[1]);
}

export function loadDoc(html) {
  const doc = parseDocument(html, { decodeEntities: true });
  const classes = new Set();
  const walk = (n) => { if (n.attribs?.class) for (const c of n.attribs.class.split(/\s+/)) if (c) classes.add(c); if (n.children) n.children.forEach(walk); };
  walk(doc);
  return { doc, classes };
}

/**
 * Keys of the style rules that match at least one document.
 * docs: [{ name, doc, classes }]. Returns { keys:Set, byKey:Map(key -> first doc name), unparsable:[] }.
 */
export function matchRules(root, docs) {
  const keys = new Set();
  const firstDoc = new Map();
  const unparsable = [];
  const candidates = [];
  root.walkRules((rule) => {
    if (inKeyframes(rule) || inPrint(rule)) return;
    candidates.push(rule);
  });
  for (const rule of candidates) {
    const key = ruleKey(rule);
    if (keys.has(key)) continue;
    let matched = false;
    for (const raw of rule.selectors) {
      const sel = matchableSelector(raw);
      if (sel === null) { matched = true; firstDoc.set(key, '(any)'); break; }
      let fn;
      try { fn = compile(sel); } catch { unparsable.push(raw); matched = true; firstDoc.set(key, '(unparsable)'); break; }
      const need = requiredClasses(sel);
      for (const d of docs) {
        if (need.some((c) => !d.classes.has(c))) continue;
        let hit = false;
        try { hit = !!selectOne(fn, d.doc); } catch { hit = true; }
        if (hit) { matched = true; firstDoc.set(key, d.name); break; }
      }
      if (matched) break;
    }
    if (matched) keys.add(key);
  }
  return { keys, firstDoc, unparsable };
}

/** Compose the critical stylesheet: kept style rules plus the at-rules that always ship. */
export function composeCritical(siteDir, fullCss, keep) {
  const root = parseCss(siteDir, fullCss);
  root.walkRules((rule) => {
    if (inKeyframes(rule)) return;
    if (inPrint(rule) || !keep.has(ruleKey(rule))) rule.remove();
  });
  root.walkAtRules((at) => {
    if (at.name === 'media' && /^\s*print\b/i.test(at.params)) at.remove();
  });
  // Containers left empty by the removals.
  let changed = true;
  while (changed) {
    changed = false;
    root.walkAtRules((at) => {
      if (at.nodes && at.nodes.length === 0 && !/keyframes$|^font-face$|^property$|^page$/i.test(at.name)) { at.remove(); changed = true; }
    });
  }
  // Keyframes: keep only those the kept CSS names (outside @keyframes blocks).
  const names = new Set();
  root.walkDecls((d) => {
    if (d.parent && d.parent.parent && d.parent.parent.type === 'atrule' && /keyframes$/i.test(d.parent.parent.name)) return;
    for (const m of d.value.matchAll(/[-\w]+/g)) names.add(m[0]);
  });
  root.walkAtRules((at) => {
    if (/keyframes$/i.test(at.name) && !names.has(at.params.trim())) at.remove();
  });
  return root.toString();
}

export function contentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Every prerendered page under .next/server/app (static and ISR HTML). */
export function prerenderedPages(siteDir) {
  const base = path.join(siteDir, '.next', 'server', 'app');
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) out.push({ name: '/' + path.relative(base, p).replace(/\\/g, '/').replace(/(^|\/)index\.html$/, '').replace(/\.html$/, ''), file: p });
    }
  };
  if (fs.existsSync(base)) walk(base);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export const MANIFEST = 'app/critical-css.manifest.json';
export const GENERATED = 'app/lib/critical-css.generated.json';
export const PUBLIC_DIR = 'public/_css';
