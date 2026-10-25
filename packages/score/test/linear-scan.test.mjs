/**
 * Engine 1.5.1: linear-time scanning returns exactly what the old patterns
 * returned.
 *
 * WHY THIS EXISTS
 * Engine 1.5.1 replaced the regular expressions that read page CSS and HTML
 * by retrying from every candidate start (or by trying every way to split a
 * run between two quantifiers) with helpers that read each run once. The
 * helpers must not change a single result: no check, verdict, detail or score
 * may move. This file is the proof. For every rewritten call site it runs the
 * old pattern, exactly as the engine ran it, and the new helper, exactly as
 * the engine now calls it, on the same input, and requires identical output:
 * the same matches at the same indexes with the same groups, the same string
 * after the same replace, or the same boolean.
 *
 * INPUTS
 *   (a) every fixture page in the repo: the calibration corpus, the parity
 *       page, the offline-engine golden's edge cases, and the own-contract
 *       site pages; whole, and cut into fragments at braces, semicolons and
 *       angle brackets;
 *   (b) recorded pages, when LINEAR_SCAN_PAGES names a folder of JSON files
 *       holding { html, css } (none are committed: they are other sites');
 *   (c) at least 10,000 generated strings per site (seeded): random tokens
 *       from the site's alphabet, mutated samples that match, and long
 *       repeated runs, with whitespace, quotes, brackets and non-ASCII code
 *       units mixed in.
 * The old patterns live only here, as the reference.
 *
 * TIME
 * Each helper is also timed on 100 KB inputs built from long runs of its
 * alphabet and samples, and must finish in 50 ms (it takes a few ms here).
 *
 * The helpers are read from src/engine.ts itself (TypeScript is a dev
 * dependency), so the test runs the code that ships; source-drift holds
 * route.ts to the same text. Zero test dependencies beyond that.
 *
 * ENGINE 1.5.2
 * v46 reads the font shorthand. Its scan, its size test and the selector of
 * a finding's rule are written below as the patterns and the lastIndexOf
 * reads they stand for, and held to the one-pass helpers the engine runs, on
 * the same inputs and to the same 100 KB budget.
 *
 * ENGINE 1.5.4
 * A <link> that writes href before rel=stylesheet is read. The reference for
 * stylesheetLinkMatches is the 1.5.1 pattern with a second alternative for
 * that order; the first alternative still decides every tag it matched, and
 * on every fixture page the helper returns what the 1.5.1 pattern returned
 * (none of them writes href first), which a test below holds.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import { FIXTURES } from './fixtures/corpus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');

/** Every top-level function and const of a TypeScript file, by name. */
function loadSource(path) {
  const src = readFileSync(path, 'utf8');
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true);
  const names = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) names.push(st.name.text);
    else if (ts.isVariableStatement(st)) {
      const exported = (ts.getModifiers(st) || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.push(exported ? `${d.name.text}: exports.${d.name.text}` : d.name.text);
      }
    }
  }
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  // node:https and node:dns are never reached by the functions under test.
  const stub = () => ({});
  return new Function('exports', 'require', 'module', `${js}\nreturn { ${[...new Set(names)].join(', ')} };`)({}, stub, { exports: {} });
}

const E = loadSource(join(HERE, '..', 'src', 'engine.ts'));

// ── The pre-1.5.1 functions rewritten as a whole ─────────────────────────────
// Their text before engine 1.5.1, with types and comments removed. They call
// the helpers they called then, which this release did not change.
const O = (() => {
  const { splitCssTopLevel, stripCssComments } = E;
  function optsIntoMotion(body) {
      if (/@view-transition\s*\{[^}]*navigation\s*:\s*auto/i.test(body))
          return true;
      const declRe = /(?:^|[{;\s])(animation|animation-name|animation-duration|transition|transition-property|transition-duration|scroll-behavior|view-transition-name)\s*:\s*([^;{}]+)/gi;
      let m;
      while ((m = declRe.exec(body)) !== null) {
          const prop = m[1].toLowerCase();
          const value = m[2].replace(/!important/i, '').trim().toLowerCase();
          if (prop === 'scroll-behavior') {
              if (value === 'smooth')
                  return true;
              continue;
          }
          if (/^(?:none|initial|unset|revert|revert-layer|0|0s|0ms)$/.test(value))
              continue;
          const times = [...value.matchAll(/(?:^|[\s,(])(\d*\.?\d+)(ms|s)\b/g)].map((t) => parseFloat(t[1]) * (t[2] === 's' ? 1000 : 1));
          if (times.length > 0 && times.every((t) => t <= 10))
              continue;
          return true;
      }
      return false;
  }
  function checkReducedMotion(css) {
      const ITEM = 'prefers-reduced-motion disables entrance and wordmark breath';
      const CATEGORY = 'motion';
      const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
      const mqRe = /@media[^{]*prefers-reduced-motion\s*:\s*(reduce|no-preference)\b[^{]*\{/gi;
      let match;
      let sawReduce = false;
      let sawMotionOptIn = false;
      let sawNoPreference = false;
      while ((match = mqRe.exec(code)) !== null) {
          const value = match[1].toLowerCase();
          const open = match.index + match[0].length - 1;
          let depth = 0;
          let close = -1;
          for (let i = open; i < code.length; i++) {
              if (code[i] === '{')
                  depth++;
              else if (code[i] === '}') {
                  depth--;
                  if (depth === 0) {
                      close = i;
                      break;
                  }
              }
          }
          const body = close > open ? code.slice(open + 1, close).trim() : '';
          if (value === 'no-preference') {
              sawNoPreference = true;
              if (optsIntoMotion(body))
                  sawMotionOptIn = true;
              continue;
          }
          if (body.length > 0)
              sawReduce = true;
      }
      if (sawReduce) {
          return { id: 'v05', item: ITEM, category: CATEGORY, status: 'PASS', detail: 'prefers-reduced-motion: reduce block declares rules' };
      }
      if (sawMotionOptIn) {
          return { id: 'v05', item: ITEM, category: CATEGORY, status: 'PASS', detail: 'motion is opt-in: declared inside a prefers-reduced-motion: no-preference block, so a reduce preference receives none of it' };
      }
      if (sawNoPreference) {
          return {
              id: 'v05', item: ITEM, category: CATEGORY, status: 'WARN',
              detail: 'a prefers-reduced-motion: no-preference block exists but gates no motion: it is empty, or it only switches motion off, which stills motion for users with no preference and leaves it running for users who asked for less. Declare motion inside no-preference, or switch it off inside reduce.',
          };
      }
      return { id: 'v05', item: ITEM, category: CATEGORY, status: 'WARN', detail: 'missing prefers-reduced-motion: reduce media query' };
  }
  function parseCssRulesUncached(css) {
      const src = stripCssComments(css);
      const n = src.length;
      const rules = [];
      const keyframes = [];
      const stack = [];
      let order = 0;
      let start = 0;
      let paren = 0;
      const close = (f, end) => {
          f.parts.push(src.slice(f.segStart, end));
          const decls = f.parts.join(' ').trim();
          if (f.kind === 'frame' && f.kf)
              f.kf.frames.push({ selector: f.prelude.toLowerCase(), decls });
          else if ((f.kind === 'rule' || (f.kind === 'group' && f.selector)) && decls) {
              rules.push({ selector: f.selector, decls, at: f.at, order: order++ });
          }
      };
      let i = 0;
      while (i < n) {
          const c = src.charCodeAt(i);
          if (c === 34 || c === 39) {
              i++;
              while (i < n) {
                  const d = src.charCodeAt(i);
                  if (d === 92) {
                      i += 2;
                      continue;
                  }
                  i++;
                  if (d === c || d === 10)
                      break;
              }
              continue;
          }
          if ((c === 117 || c === 85) && src.slice(i, i + 4).toLowerCase() === 'url(') {
              let j = i + 4;
              while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r'))
                  j++;
              if (src[j] !== '"' && src[j] !== "'") {
                  const end = src.indexOf(')', j);
                  i = end < 0 ? n : end + 1;
                  continue;
              }
          }
          if (c === 40) {
              paren++;
              i++;
              continue;
          }
          if (c === 41) {
              if (paren > 0)
                  paren--;
              i++;
              continue;
          }
          if (c === 59) {
              if (paren === 0)
                  start = i + 1;
              i++;
              continue;
          }
          if (c === 123) {
              paren = 0;
              const prelude = src.slice(start, i).trim();
              const parent = stack.length ? stack[stack.length - 1] : null;
              if (parent)
                  parent.parts.push(src.slice(parent.segStart, start));
              const at = parent ? parent.at : [];
              const ctx = parent && (parent.kind === 'rule' || parent.kind === 'group') ? parent.selector : '';
              let f;
              if (prelude.startsWith('@')) {
                  const name = (/^@([\w-]+)/.exec(prelude)?.[1] ?? '').toLowerCase();
                  if (/keyframes$/.test(name)) {
                      const kf = { name: prelude.slice(name.length + 1).trim().replace(/^["']|["']$/g, ''), frames: [] };
                      keyframes.push(kf);
                      f = { kind: 'keyframes', prelude, selector: '', at, parts: [], segStart: i + 1, kf };
                  }
                  else if (/^(media|supports|layer|container|document|-moz-document|scope|starting-style)$/.test(name)) {
                      f = { kind: 'group', prelude, selector: ctx, at: [...at, prelude.toLowerCase()], parts: [], segStart: i + 1, kf: null };
                  }
                  else {
                      f = { kind: 'other', prelude, selector: '', at, parts: [], segStart: i + 1, kf: null };
                  }
              }
              else if (parent && parent.kind === 'keyframes') {
                  f = { kind: 'frame', prelude, selector: '', at, parts: [], segStart: i + 1, kf: parent.kf };
              }
              else if (parent && (parent.kind === 'other' || parent.kind === 'frame')) {
                  f = { kind: 'other', prelude, selector: '', at, parts: [], segStart: i + 1, kf: null };
              }
              else {
                  const selector = ctx
                      ? splitCssTopLevel(prelude, ',').map((p) => (p.includes('&') ? p.replace(/&/g, `:is(${ctx})`) : `:is(${ctx}) ${p}`)).join(', ')
                      : prelude;
                  f = { kind: 'rule', prelude, selector, at, parts: [], segStart: i + 1, kf: null };
              }
              stack.push(f);
              start = i + 1;
              i++;
              continue;
          }
          if (c === 125) {
              paren = 0;
              const f = stack.pop();
              if (f) {
                  close(f, i);
                  const parent = stack.length ? stack[stack.length - 1] : null;
                  if (parent)
                      parent.segStart = i + 1;
              }
              start = i + 1;
              i++;
              continue;
          }
          i++;
      }
      while (stack.length) {
          const f = stack.pop();
          if (f)
              close(f, n);
      }
      return { rules, keyframes };
  }
  function cssNumber(token, percentScale) {
      const t = token.trim().toLowerCase();
      if (t === 'none')
          return 0;
      const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|turn|rad|grad)?$/.exec(t);
      if (!m)
          return null;
      const x = parseFloat(m[1]);
      if (m[2] === '%')
          return (x / 100) * percentScale;
      if (m[2] === 'turn')
          return x * 360;
      if (m[2] === 'rad')
          return (x * 180) / Math.PI;
      if (m[2] === 'grad')
          return x * 0.9;
      return x;
  }
  function cssTimeMs(token) {
      const m = /^(-?(?:\d+\.?\d*|\.\d+))(ms|s)$/i.exec(token.trim());
      return m ? parseFloat(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1) : null;
  }
  function v46StaticPx(value) {
      const m = value.trim().match(/^(\d*\.?\d+)(rem|px)$/i);
      if (!m)
          return null;
      return parseFloat(m[1]) * (m[2].toLowerCase() === 'rem' ? 16 : 1);
  }
  function sanitizeErrorText(text) {
      const keep = (label) => (m) => `${label}${/[.,;:!?)]+$/.exec(m)?.[0] ?? ''}`;
      return text
          .replace(/\bfile:\/\/[^\s'"<>`|]*/gi, keep('a local file'))
          .replace(/\\\\[^\\\s'"<>`|]+\\(?:[^\\\r\n'"<>`|*?]+\\)*[^\\\s'"<>`|*?]*/g, keep('a local path'))
          .replace(/(?<![\w\\/])[A-Za-z]:([\\/])(?:[^\\/\r\n'"<>`|*?]+\1)*[^\\/\s'"<>`|*?]*/g, keep('a local path'))
          .replace(/(^|[\s'"`(=,:[])\/(?:home|Users|root|tmp|var|private|opt|usr|srv|mnt|Volumes|Library|app|vercel|workspace|workspaces|github|runner|nix|snap)(?:\/[^/\r\n'"<>`|]+(?=\/))*\/[^/\s'"<>`|]+/g, (m, lead) => `${lead}${keep('a local path')(m.slice(lead.length))}`)
          .replace(/[^\s'"<>`|]*(?:npm-cache|[\\/]_npx[\\/]|[\\/]\.npm[\\/])[^\s'"<>`|]*/gi, keep('the npm cache'));
  }
  const multiStop = (value) => {
      let from = 0;
      for (;;) {
          const at = value.toLowerCase().indexOf('linear-gradient(', from);
          if (at < 0)
              return false;
          let depth = 0;
          let end = -1;
          for (let i = at + 15; i < value.length; i++) {
              if (value[i] === '(')
                  depth++;
              else if (value[i] === ')' && --depth === 0) {
                  end = i;
                  break;
              }
          }
          if (end < 0)
              return false;
          const args = splitCssTopLevel(value.slice(at + 16, end), ',');
          const stops = /^(?:to\s|[-+]?[\d.]+(?:deg|turn|rad|grad)\b)/i.test(args[0] ?? '') ? args.slice(1) : args;
          if (stops.length >= 2)
              return true;
          from = end;
      }
  };
  // v27: the rule a declaration sits in, read with three lastIndexOf scans
  // per declaration. They call isFieldSelector, substituteCssVars and
  // hasZoomableField, which hold their own sites or did not change.
  const { isFieldSelector, substituteCssVars, hasZoomableField } = E;
  function ruleSelectorAt(css, offset) {
      const open = css.lastIndexOf('{', offset);
      if (open < 0 || css.lastIndexOf('}', offset) > open)
          return null;
      const start = Math.max(css.lastIndexOf('}', open - 1), css.lastIndexOf('{', open - 1), css.lastIndexOf(';', open - 1)) + 1;
      return css.slice(start, open);
  }
  function inFieldRule(css, offset) {
      const selector = ruleSelectorAt(css, offset);
      return selector !== null && /input|textarea|select|\.field/i.test(selector.replace(/\/\*[\s\S]*?\*\//g, ' '));
  }
  function resolveFontSizeVars(css, tokens) {
      if (css.indexOf('var(') < 0)
          return css;
      return css.replace(/(font-size\s*:\s*)(var\([^;{}]*\))/gi, (decl, lead, value, offset) => {
          const selector = ruleSelectorAt(css, offset);
          if (selector === null || !isFieldSelector(selector))
              return decl;
          const sub = substituteCssVars(value, [tokens]);
          return sub === null ? decl : lead + sub.trim();
      });
  }
  function checkInputFontFloor(css, html, tokens = {}) {
      const sheet = resolveFontSizeVars(css, tokens);
      const inputRe = /(?:input|textarea|select|\.input|\.field)[^{]*\{[^}]*font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)/gi;
      const below = [];
      let m;
      while ((m = inputRe.exec(sheet)) !== null) {
          if (!inFieldRule(sheet, m.index + m[0].lastIndexOf('font-size')))
              continue;
          const val = parseFloat(m[1]);
          const unit = m[2].toLowerCase();
          const px = unit === 'rem' ? val * 16 : val;
          if (px < 16)
              below.push(`${val}${unit} (${px}px)`);
      }
      if (below.length === 0) {
          const floorRe = /input\s*(?:,[^{]*)?\{[^}]*font-size\s*:\s*(?:1rem|16px|1\.0(?:\d+)?rem|[2-9]\dpx)/gi;
          let hasGlobalFloor = false;
          let f;
          while (!hasGlobalFloor && (f = floorRe.exec(sheet)) !== null) {
              hasGlobalFloor = inFieldRule(sheet, f.index + f[0].lastIndexOf('font-size'));
          }
          if (hasGlobalFloor)
              return { id: 'v27', item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)', category: 'accessibility', status: 'PASS', detail: 'input font-size floor detected' };
          if (!hasZoomableField(html))
              return { id: 'v27', item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)', category: 'accessibility', status: 'SKIP', detail: 'no text input, textarea or select found in HTML: nothing for the 16px floor to protect' };
          return { id: 'v27', item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)', category: 'accessibility', status: 'WARN', detail: 'no explicit input font-size ≥16px detected: iOS Safari may auto-zoom on focus' };
      }
      return { id: 'v27', item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)', category: 'accessibility', status: 'FAIL', detail: `${below.length} input(s) below 16px floor: ${below.join(', ')}` };
  }
  return { optsIntoMotion, checkReducedMotion, parseCssRulesUncached, cssTimeMs, cssNumber, v46StaticPx, sanitizeErrorText, multiStop, ruleSelectorAt, resolveFontSizeVars, checkInputFontFloor };
})();

// ── Engine 1.5.2: v46's shorthand scan and size test, as patterns ────────────
// The scan as a global pattern: a font-size match is read past its value; a
// `font` match is read again from the end of the word, and dropped inside the
// value of the shorthand before it or when its value holds a `{`.
function v46DeclsByPattern(css) {
  const re = /(font-size|(?<![\w-])font)\s*:\s*([^;}]+)/gi;
  const out = [];
  let shorthandEnd = -1;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    if (m[1].toLowerCase() === 'font') {
      re.lastIndex = m.index + m[1].length;
      if (m.index < shorthandEnd || m[2].includes('{')) continue;
      shorthandEnd = m.index + m[0].length;
    }
    out.push({ index: m.index, text: m[0], groups: m.slice(1) });
  }
  return out;
}
const V46_SIZE_TOKEN = /^(?:\d*\.?\d+(?:[a-z]+|%)|(?:xx?-|xxx-)?(?:small|large)|medium|smaller|larger|(?:clamp|min|max|calc)\(.*\))$/i;
// v46's selector read as engine 1.5.1 ran it, once per finding.
function v46SelectorBefore(css, at) {
  const open = css.lastIndexOf('{', at);
  if (open < 0) return '';
  const start = Math.max(css.lastIndexOf('}', open), css.lastIndexOf(';', open), css.lastIndexOf('{', open - 1)) + 1;
  return E.withoutCssComments(css.slice(start, open), ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// ── The reference: each old pattern as the engine ran it ─────────────────────

/**
 * stylesheetLinkMatches's reference from engine 1.5.4: the 1.5.1 pattern
 * (rel before href) as the first alternative, href before rel as the second.
 */
const LINK_1_5_1 = /<link[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']/gi;
const LINK_1_5_4 = /<link(?:[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']|[^>]*href=["']([^"']+)["'][^>]*rel=["']?stylesheet)/gi;

/** The matches of a global regex, as the helpers report them. */
function execAll(re, s) {
  const out = [];
  re.lastIndex = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    out.push({ index: m.index, text: m[0], groups: m.slice(1) });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}
const firstMatch = (m) => (m ? { index: m.index, text: m[0], groups: m.slice(1) } : null);
const asArray = (m) => (m ? [...m] : null);
const callbackMatches = (s, re) => {
  const out = [];
  s.replace(re, (...a) => {
    const groups = a.slice(1, -2);
    out.push({ index: a[a.length - 2], text: a[0], groups });
    return a[0];
  });
  return out;
};

// v27: a :root token table, and the offsets the rule-selector site reads. A
// short input is read at every offset. A long one is read at a stride and
// beside its first braces and semicolons, since the old reference costs the
// distance back to the last brace or semicolon at each offset.
const V27_TOKENS = { '--a': '16px', '--sm': '12px', '--text-body': '1rem' };
const ruleOffsets = (s) => {
  if (s.length <= 2000) return [...Array(s.length + 1).keys()];
  const out = new Set([s.length]);
  const step = Math.ceil(s.length / 500);
  for (let i = 0; i < s.length; i += step) out.add(i);
  for (let i = 0, n = 0; i < s.length && n < 500; i++) {
    if (s[i] === '{' || s[i] === '}' || s[i] === ';') { out.add(i); out.add(i + 1); n++; }
  }
  return [...out].sort((a, b) => a - b);
};
// A WARN carries one fixed detail, so null stands for it and a result is
// produced only when a rule is found.
const floorVerdict = (r) => (r.status === 'WARN' ? null : [r.status, r.detail]);

const WS = [' ', '\t', '\n', '\r', '\u00a0', '\u2028', '\ufeff', '  '];
const ODD = ['\u00e9', '\u017f', '\u212a', '\u0130', '\ud83d\ude00', '\ud83d', '\u2600', '\ufe0f', '\u2b50', '_', '0', '9', 'x', 'A', 'Z', '#', '%', '!', '.', ',', ';', ':', '(', ')', '{', '}', '[', ']', '<', '>', '/', '\\', '"', "'", '=', '-', '+', '*', '@', '`', '|', '&'];

/**
 * One entry per rewritten call site. `old` is the pattern as the engine ran
 * it before 1.5.1, `neu` the helper as it runs now. `alerts` are the code
 * scanning alerts the site carried (empty: found by this release's own
 * review). Inputs are drawn from `alphabet`; `samples` are strings that
 * match, mutated before use; `long` adds [prefix, unit, suffix] runs to the
 * timing inputs.
 */
const SITES = [
  {
    id: 'script and style strip', alerts: [7, 13, 15, 21],
    old: (s) => s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, ''),
    neu: (s) => E.withoutScriptsAndStyles(s),
    samples: ['<script>x</script>', '<style>a{}</style>', '<SCRIPT src=x></Script>'],
    alphabet: ['<script', '<SCRIPT', '</script>', '</Script>', '<style', '</style>', '<STYLE', '</STYLE>', '<scrip', '</script', '<style>', 'x', ' ', '>', '<'],
  },
  {
    id: 'CSS comment strip', alerts: [6, 19, 20], replaces: true,
    old: (s) => [s.replace(/\/\*[\s\S]*?\*\//g, ''), s.replace(/\/\*[\s\S]*?\*\//g, ' ')],
    neu: (s) => [E.withoutCssComments(s, ''), E.withoutCssComments(s, ' ')],
    samples: ['/* a */', 'x/**/y', '/*/ */'],
    alphabet: ['/*', '*/', '/', '*', '/*/', 'a', ' ', '**', '//'],
  },
  {
    id: 'tag strip', alerts: [25, 29, 31, 33, 35, 37, 47], replaces: true,
    old: (s) => [s.replace(/<[^>]*>/g, ''), s.replace(/<[^>]*>/g, ' '), s.replace(/<[^>]+>/g, ' ')],
    neu: (s) => [E.withoutTags(s, '', false), E.withoutTags(s, ' ', false), E.withoutTags(s, ' ', true)],
    samples: ['<b>x</b>', '<>', '<a href="/">y</a>'],
    alphabet: ['<', '>', '<>', 'a', ' ', '<a', '/>', '<<', '>>'],
  },
  {
    id: 'button elements', alerts: [26, 28],
    old: (s) => execAll(/<button[^>]*>([\s\S]*?)<\/button>/gi, s),
    neu: (s) => E.buttonElements(s),
    samples: ['<button>Go</button>', '<button class="a">x<b>y</b></BUTTON>'],
    alphabet: ['<button', '<BUTTON', '</button>', '</Button>', '>', '<', 'x', ' ', 'class="a"', '</butto'],
  },
  {
    id: 'label elements', alerts: [30],
    old: (s) => execAll(/<label[^>]*>([\s\S]*?)<\/label>/gi, s),
    neu: (s) => E.labelElements(s),
    samples: ['<label for=x>Name</label>'],
    alphabet: ['<label', '</label>', '>', '<', 'x', ' ', '</LABEL>'],
  },
  {
    id: 'link elements', alerts: [34],
    old: (s) => execAll(/<a[^>]*>([\s\S]*?)<\/a>/gi, s),
    neu: (s) => E.anchorElements(s),
    samples: ['<a href="/">Read</a>', '<abbr>x</abbr></a>'],
    alphabet: ['<a', '<A', '</a>', '</A>', '>', '<', 'x', ' ', '<abbr', '</ab>'],
  },
  {
    id: 'role=button elements', alerts: [27],
    old: (s) => execAll(/<(?:a|div|span)[^>]*role=["']button["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/gi, s),
    neu: (s) => E.roleButtonElements(s),
    samples: ['<a role="button">Go</a>', "<div class=x role='button' >y</span>", '<span role="button"></div>'],
    alphabet: ['<a', '<div', '<span', '<DIV', ' role="button"', " role='button'", 'role="button"', '</a>', '</div>', '</span>', '>', '<', 'x', ' ', 'role="butto'],
  },
  {
    id: 'role=tab elements', alerts: [32],
    old: (s) => execAll(/<[a-z]+[^>]*role=["']tab["'][^>]*>([\s\S]*?)<\/[a-z]+>/gi, s),
    neu: (s) => E.roleTabElements(s),
    samples: ['<li role="tab">A</li>', "<a x role='tab'>B</b>", '<b role="tab" >c</xyz>'],
    alphabet: ['<a', '<li', '<B', 'role="tab"', " role='tab'", 'role="ta"', '</a>', '</li>', '</>', '</1>', '>', '<', 'x', 'a', ' ', '1'],
  },
  {
    id: 'ALL CAPS elements', alerts: [36],
    old: (s) => execAll(/<(button|a|label|td|th|p|li|h[1-6])\s([^>]*?)>([\s\S]*?)<\/\1>/gi, s),
    neu: (s) => E.capsElementMatches(s),
    samples: ['<p class="x">HELLO</p>', '<h2 id=a>TITLE</H2>', '<a href="/">GO</a>'],
    alphabet: ['<a ', '<A\t', '<p ', '<li ', '<h1 ', '<h2\n', '<td ', '<button ', '<label ', '</a>', '</A>', '</p>', '</li>', '</h1>', '</H2>', '</td>', '</button>', '</label>', '>', '<', 'x', ' ', 'HELLO', '<abbr '],
  },
  {
    id: 'eyebrow class', alerts: [38],
    old: (s) => /class=["'][^"']*(eyebrow|eyebro|meta-label)[^"']*["']/i.test(s),
    neu: (s) => E.hasEyebrowClass(s),
    samples: ['class="eyebrow"', "class='x meta-label y'"],
    long: [['class="eyebro', 'eyebro', '']],
    alphabet: ['class="', "class='", 'CLASS="', 'eyebrow', 'eyebro', 'EYEBRO', 'meta-label', 'meta-labe', '"', "'", 'x', ' ', 'class=', 'eye'],
  },
  {
    id: 'uppercase style', alerts: [39],
    old: (s) => /style=["'][^"']*text-transform:\s*uppercase[^"']*["']/i.test(s),
    neu: (s) => E.hasUppercaseStyle(s),
    samples: ['style="text-transform:uppercase"', "style='a:b; text-transform: UPPERCASE'"],
    long: [['style="', 'text-transform:uppercase', '']],
    alphabet: ['style="', "style='", 'text-transform:', 'text-transform: ', 'uppercase', 'UPPERCASE', '"', "'", 'x', ' ', '\t', 'upper'],
  },
  {
    id: 'heading line-height', alerts: [9],
    old: (s) => execAll(/(?:h1|h2|h3|h4|h5|h6|\.h\d|heading|title)[^{]*\{[^}]*line-height\s*:\s*([0-9.]+)/gi, s),
    neu: (s) => E.headingLineHeights(s),
    samples: ['h1{line-height:1.1}', '.title{color:red;line-height: 1.05;}'],
    alphabet: ['h1', 'H2', '.h3', 'heading', 'title', '{', '}', 'line-height', 'LINE-HEIGHT', ':', ' ', '1.2', '.', '0', ';', 'x', 'line-height:1.1;'],
  },
  {
    id: 'body line-height', alerts: [10],
    old: (s) => execAll(/(?:body|p|article|\.body|\.prose|\.copy)[^{]*\{[^}]*line-height\s*:\s*([0-9.]+)/gi, s),
    neu: (s) => E.bodyLineHeights(s),
    samples: ['p{line-height:1.5}', 'body{line-height :1.6}'],
    alphabet: ['body', 'p', 'P', 'article', '.prose', '.copy', '{', '}', 'line-height', ':', ' ', '1.5', ';', 'x', 'line-height: 1.6'],
  },
  {
    id: 'field font-size', alerts: [16],
    old: (s) => execAll(/(?:input|textarea|select|\.input|\.field)[^{]*\{[^}]*font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)/gi, s),
    neu: (s) => E.fieldFontSizes(s),
    samples: ['input{font-size:14px}', '.field{font-size:0.875rem}'],
    alphabet: ['input', 'textarea', '.field', 'select', '{', '}', 'font-size', ':', ' ', '14', '.5', 'px', 'rem', 'REM', ';', 'x', 'font-size:12px'],
  },
  {
    id: 'field font-size floor', alerts: [17],
    old: (s) => execAll(/input\s*(?:,[^{]*)?\{[^}]*font-size\s*:\s*(?:1rem|16px|1\.0(?:\d+)?rem|[2-9]\dpx)/gi, s),
    neu: (s) => E.fieldFontFloors(s),
    samples: ['input{font-size:1rem}', 'input, textarea{font-size:16px}', 'input ,select{color:red;font-size: 24px}', 'input\n{font-size:1.05rem}'],
    alphabet: ['input', 'INPUT', ',', ' ', '\n', '{', '}', 'font-size', ':', '1rem', '16px', '1.05rem', '24px', '9px', 'x', ';', 'textarea'],
  },
  {
    id: 'touch targets', alerts: [12],
    old: (s) => execAll(/(?:^|[,}\s])\s*(?:button|a\b|input|textarea|select|\[role\s*=\s*["']?button["']?\]|\.btn|\.button|\.chip|\.tab|\.nav-link)\s*[^{]*\{[^}]*(?:min-height|min-width)\s*:\s*(\d+(?:\.\d+)?)(px|rem)/gim, s),
    neu: (s) => E.touchTargetSizes(s),
    samples: ['button{min-height:44px}', 'a,.btn{min-width:2.75rem}', '}\n.tab {min-height: 48px}', ' [role="button"]{min-width:30px}', '.nav-link{x:y;min-height:40px}'],
    long: [['.btn', '\t', '']],
    alphabet: ['button', 'a', 'A', 'ab', '.btn', '.tab', '[role=button]', '[role = "button"]', ',', '}', '{', ' ', '\n', '\r', '\u2028', 'min-height', 'min-width', ':', '44', '2.75', 'px', 'rem', ';', 'x', '_'],
  },
  {
    id: ':focus strips outline', alerts: [40],
    old: (s) => /:focus[^{]*\{[^}]*outline\s*:\s*(none|0)\s*[;}]/i.test(s),
    neu: (s) => E.focusStripsOutline(s),
    samples: [':focus{outline:none}', ':focus-visible{outline: 0;}'],
    alphabet: [':focus', ':FOCUS', '{', '}', 'outline', ':', 'none', '0', ';', ' ', 'x', 'outline:none', 'outline:0}'],
  },
  {
    id: ':focus ring', alerts: [41],
    old: (s) => /:focus[^{]*\{[^}]*(box-shadow|outline\s*:\s*[^n0])/i.test(s),
    neu: (s) => E.focusHasRing(s),
    samples: [':focus{box-shadow:0 0 0 2px}', ':focus{outline:2px solid}'],
    alphabet: [':focus', '{', '}', 'outline', 'box-shadow', ':', 'none', '0', ';', ' ', 'x', 'n', '2px'],
  },
  {
    id: 'breath keyframes', alerts: [],
    old: (s) => /@keyframes\s+[^{]*breath[^{]*\{[^}]*opacity\s*:/i.test(s),
    neu: (s) => E.hasBreathKeyframes(s),
    samples: ['@keyframes breath{0%{opacity:0}}', '@keyframes  wordmark-breath {from{opacity: 1}}'],
    long: [['@keyframes\t', '\t', '']],
    alphabet: ['@keyframes', '@KEYFRAMES', ' ', '\t', 'breath', 'BREATH', 'x', '{', '}', 'opacity', ':', '0%', ';'],
  },
  {
    id: '@media prefers-reduced-motion', alerts: [50],
    old: (s) => /@media[^{]*prefers-reduced-motion/i.test(s),
    neu: (s) => E.mediaQueryHasReducedMotion(s),
    samples: ['@media (prefers-reduced-motion: reduce){'],
    alphabet: ['@media', '@MEDIA', 'prefers-reduced-motion', 'prefers-reduced', '{', '}', ' ', '(', ')', 'x'],
  },
  {
    id: '@media forced-colors', alerts: [22],
    old: (s) => /@media[^{]*forced-colors\s*:\s*active/i.test(s),
    neu: (s) => E.mediaQueryHasForcedColors(s),
    samples: ['@media (forced-colors: active)', '@media screen and (forced-colors:active){'],
    alphabet: ['@media', 'forced-colors', ':', ' ', 'active', '{', '}', 'x', '('],
  },
  {
    id: '@media -ms-high-contrast', alerts: [23],
    old: (s) => /@media[^{]*-ms-high-contrast/i.test(s),
    neu: (s) => E.mediaQueryHasHighContrast(s),
    samples: ['@media (-ms-high-contrast: active){'],
    alphabet: ['@media', '-ms-high-contrast', '-ms-high', '{', '}', ' ', 'x'],
  },
  {
    id: '@media hover guard', alerts: [],
    old: (s) => /@media[^{]*(?:hover\s*:\s*hover|pointer\s*:\s*fine)/i.test(s),
    neu: (s) => E.mediaQueryHasHoverGuard(s),
    samples: ['@media (hover: hover)', '@media(pointer:fine){'],
    alphabet: ['@media', 'hover', 'pointer', ':', ' ', 'fine', '{', '}', 'x'],
  },
  {
    id: 'reduced-motion queries', alerts: [],
    old: (s) => execAll(/@media[^{]*prefers-reduced-motion\s*:\s*(reduce|no-preference)\b[^{]*\{/gi, s),
    neu: (s) => E.reducedMotionQueries(s),
    samples: ['@media (prefers-reduced-motion: reduce){a{}}', '@media screen and (prefers-reduced-motion:no-preference) {', '@media(prefers-reduced-motion : reduce)and x{'],
    alphabet: ['@media', 'prefers-reduced-motion', ':', ' ', 'reduce', 'no-preference', 'REDUCE', 'x', 'reduced', '{', '}', '(', ')', 'and'],
  },
  {
    id: ':root @media strip', alerts: [5],
    old: (s) => s.replace(/@media[^{]*\{[^@]*?\}\s*\}/gi, ''),
    neu: (s) => E.withoutMediaBlocks(s),
    samples: ['@media x{a{b}}', '@media (y) { a { b } }', ':root{--a:1}@media z{:root{--a:2}  }'],
    alphabet: ['@media', '@', '{', '}', ' ', '\n', 'x', '}}', '} }', ':root'],
  },
  {
    id: ':root blocks', alerts: [],
    old: (s) => execAll(/:root(?:\s*,\s*:host)?\s*\{([^}]*)\}/g, s),
    neu: (s) => E.rootTokenBlocks(s),
    samples: [':root{--a:1}', ':root , :host {--b:2}', ':root,:host{}', ':root\t,\n:host\u00a0{--c:3}', ':root , :hos {x}'],
    alphabet: [':root', ':ROOT', ',', ' ', '\t', '\n', '\u00a0', ':host', ':hos', '{', '}', '--a:1;', 'x'],
  },
  {
    id: ':root custom properties', alerts: [],
    old: (s) => execAll(/--([\w-]+)\s*:\s*([^;]+?)(?:;|$)/g, s),
    neu: (s) => E.customPropertyValues(s),
    samples: ['--a:1;', '--x-y : red', '--b: ;', '--c:'],
    alphabet: ['--', '-', 'a', ' ', ':', ';', 'red', '\t', 'x'],
  },
  {
    id: '@keyframes strip', alerts: [8],
    old: (s) => s.replace(/@keyframes\s+[^{]+\{[^@]*?\}/gi, ''),
    neu: (s) => E.withoutKeyframesBlocks(s),
    samples: ['@keyframes a{0%{x}}', '@keyframes  spin {to{y}', '@keyframes\tx{}'],
    long: [['@keyframes\t', '\t', '']],
    alphabet: ['@keyframes', '@KEYFRAMES', ' ', '\t', 'x', '{', '}', '@', 'scale(0)'],
  },
  {
    id: '::selection rules', alerts: [11],
    old: (s) => s.match(/::selection\s*\{[^}]*\}/gi),
    neu: (s) => E.selectionRules(s),
    samples: ['::selection{color:red}', '::selection {}'],
    alphabet: ['::selection', '::SELECTION', ' ', '{', '}', 'x', 'color:red', ':'],
  },
  {
    id: 'font-size: var()', alerts: [14],
    old: (s) => callbackMatches(s, /(font-size\s*:\s*)(var\([^;{}]*\))/gi),
    neu: (s) => E.fontSizeVarMatches(s),
    samples: ['font-size:var(--a)', 'font-size : var(--x, 1rem);', 'FONT-SIZE:var(a(b))}'],
    alphabet: ['font-size', 'FONT-SIZE', ':', ' ', 'var(', 'VAR(', ')', '--x', ';', '{', '}', 'x', ','],
  },
  {
    id: 'rule blocks', alerts: [18],
    old: (s) => execAll(/([^{}]+)\{([^{}]*)\}/g, s),
    neu: (s) => E.cssRuleBlocks(s),
    samples: ['p{max-width:60ch}', 'a b{x}', '{x}y{z}'],
    alphabet: ['{', '}', 'a', ' ', 'p', 'max-width:60ch', ';'],
  },
  {
    id: 'url()', alerts: [24],
    old: (s) => execAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, s),
    neu: (s) => E.cssUrlMatches(s),
    samples: ['url(a.png)', 'url( "b.png" )', "url('c')", 'url( )', 'url("x" y)', 'url(ab url("x")'],
    long: [['url(', ' ', '"x;}']],
    alphabet: ['url(', 'URL(', ' ', '\t', '"', "'", ')', '(', 'a', 'x', ';', '}', 'url( '],
  },
  {
    id: 'background-clip: text rules', alerts: [43],
    old: (s) => s.match(/(?:^|\})[^{}]*\{[^}]*background-clip\s*:\s*text[^}]*\}/gi) || [],
    neu: (s) => E.gradientClipRules(s),
    samples: ['a{background-clip:text}', '}b{x:y;background-clip: text;}'],
    alphabet: ['{', '}', 'a', ' ', 'background-clip', ':', 'text', 'TEXT', ';', 'background-clip:text'],
  },
  {
    id: 'linear-gradient() arguments', alerts: [44],
    old: (s) => firstMatch(s.match(/linear-gradient\(([\s\S]+)\)\s*;?\s*background-size|linear-gradient\(([^;]+)\)/i)),
    neu: (s) => E.linearGradientArgs(s),
    samples: ['linear-gradient(red, blue)', 'linear-gradient(a);background-size:2px'],
    long: [['linear-gradient(a)', '\t', '']],
    alphabet: ['linear-gradient(', 'LINEAR-GRADIENT(', ')', '(', ';', ' ', '\t', 'background-size', 'red', ',', 'x'],
  },
  {
    id: 'grid repeat()', alerts: [45],
    old: (s) => s.match(/grid-template-columns[^}]*repeat\s*\(\s*(?:auto-fit|auto-fill|\d+)/gi) || [],
    neu: (s) => E.gridRepeatRules(s),
    samples: ['grid-template-columns:repeat(3,1fr)', 'grid-template-columns: repeat( auto-fit, x)}', 'grid-template-columns:x;repeat (auto-fill'],
    alphabet: ['grid-template-columns', 'repeat', '(', ' ', 'auto-fit', 'auto-fill', '3', '12', '}', '{', 'x', ':'],
  },
  {
    id: 'emoji in CTAs', alerts: [46],
    old: (s) => s.match(/(?:<button|<a[^>]*class[^>]*(?:btn|cta|primary|action))[^>]*>[\s\S]{0,200}(?:[\p{Emoji_Presentation}]|[\p{Emoji}]\uFE0F)/giu),
    neu: (s) => E.emojiCtaMatches(s),
    samples: ['<button>\u2b50 Star</button>', '<a class="btn">Go \ud83d\ude80</a>', '<a href=x class="cta primary">x\u2600\ufe0f'],
    alphabet: ['<button', '<a', '<A', ' class="', 'cla\u017f\u017f', 'btn', 'cta', 'primary', 'action', 'BTN', '>', '<', 'x', ' ', '\ud83d\ude00', '\u2600', '\u2600\ufe0f', '\u2b50', '\ud83d', '\ude00', '1\ufe0f', '#\ufe0f', 'x'.repeat(60)],
  },
  {
    id: 'cubic-bezier()', alerts: [48],
    old: (s) => execAll(/cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)/gi, s),
    neu: (s) => E.cubicBezierMatches(s),
    samples: ['cubic-bezier(0.4,0,0.2,1)', 'cubic-bezier( .5 , -0.25, 1.0, 1.5 )', 'cubic-bezier(1.,2,3,4)'],
    long: [['cubic-bezier(0,0,0,', '0', '']],
    alphabet: ['cubic-bezier(', 'CUBIC-BEZIER(', '0', '1', '.', '-', ',', ' ', ')', '12', '.5', 'x'],
  },
  {
    id: 'cubic-bezier() key zeros', alerts: [49],
    old: (s) => s.replace(/(\.\d*?)0+(?=\D|$)/g, '$1'),
    neu: (s) => E.withoutTrailingDecimalZeros(s),
    samples: ['0.500,0.10,1.0,0', '.000,-0.20,1,1.250'],
    long: [['.', '0', '1']],
    alphabet: ['.', '0', '00', '1', '5', ',', '-', ' ', 'x'],
  },
  {
    id: 'blanket reduced-motion kill', alerts: [51],
    old: (s) => /prefers-reduced-motion[\s\S]{0,200}\*\s*\{[^}]*animation\s*:\s*none/i.test(s),
    neu: (s) => E.hasBlanketMotionKill(s),
    samples: ['@media (prefers-reduced-motion: reduce){*{animation:none}}', 'prefers-reduced-motion) { * { animation : none !important }', 'prefers-reduced-motion xx *{color:red;animation:none}'],
    alphabet: ['prefers-reduced-motion', '*', ' ', '{', '}', 'animation', ':', 'none', 'x', 'x'.repeat(50), ';'],
  },
  {
    id: 'inline svg viewBox', alerts: [52],
    old: (s) => s.match(/<svg[^>]*viewBox=/gi) || [],
    neu: (s) => E.svgViewBoxTags(s),
    samples: ['<svg viewBox="0 0 1 1">'],
    alphabet: ['<svg', '<SVG', ' ', 'viewBox=', 'VIEWBOX=', '>', 'x', '"0 0 1 1"'],
  },
  {
    id: 'svg symbols', alerts: [53],
    old: (s) => s.match(/<symbol[^>]*>/gi) || [],
    neu: (s) => E.symbolTags(s),
    alphabet: ['<symbol', '<SYMBOL', ' ', '>', 'x', 'id="a"'],
  },
  {
    id: 'custom property declarations', alerts: [54],
    old: (s) => s.match(/--[\w-]+\s*:/g) || [],
    neu: (s) => E.customPropertyDecls(s),
    samples: ['--a:1', '--x-y :2', '---z:'],
    alphabet: ['--', '-', 'a', '_', '0', ' ', ':', ';', '\u00e9', '{'],
  },
  {
    id: 'token layering', alerts: [55],
    old: (s) => /--(?:color|surface|accent|action|feedback)[\w-]*\s*:\s*var\(--/i.test(s),
    neu: (s) => E.hasTokenLayering(s),
    samples: ['--color-x: var(--y)', '--surface:var(--a)', '--accent-2 : VAR(--b)'],
    alphabet: ['--color', '--SURFACE', '--accent', '-', 'x', ' ', ':', 'var(--', 'VAR(--', 'var(', ';'],
  },
  {
    id: 'theme attribute brackets', alerts: [],
    old: (s) => s.replace(/\[[^\]]*\]/g, (a) => `<${a}>`),
    neu: (s) => E.replaceBrackets(s, (a) => `<${a}>`),
    alphabet: ['[', ']', 'a', '=', '.'],
  },
  {
    id: 'theme attribute and class parts', alerts: [],
    old: (s) => s.match(/\[[^\]]*\]|\.[\w-]+/g),
    neu: (s) => E.attrAndClassParts(s),
    alphabet: ['[', ']', '.', 'a', '-', ' ', '='],
  },
  {
    id: 'motion toggle attribute', alerts: [],
    old: (s) => /^\[[\w-]*(?:motion|anim)[\w-]*(?:[~|^$*]?=[^\]]*)?\]$/i.test(s),
    neu: (s) => E.isMotionToggleAttr(s),
    samples: ['[data-motion]', '[data-anim="off"]', '[reduce-motion~=x]', '[ANIM|=a]', '[x-motion-y]', '[motion^="]', '[anim=]'],
    anchored: true,
    long: [['[', 'anim', '!']],
    alphabet: ['[', ']', 'motion', 'ANIM', 'data-', 'x', '~', '|', '^', '$', '*', '=', '"', ' ', '-'],
  },
  {
    id: '!important suffix', alerts: [],
    old: (s) => (/!\s*important\s*$/i.test(s) ? s.replace(/\s*!\s*important\s*$/i, '') : null),
    neu: (s) => { const k = E.importantSuffixStart(s); return k >= 0 ? s.slice(0, k) : null; },
    samples: ['red !important', 'x!IMPORTANT ', '1px ! important'],
    anchored: true,
    long: [['', ' ', 'x !important']],
    alphabet: ['!', 'important', 'IMPORTANT', ' ', '\t', 'red', 'x', '!important'],
  },
  {
    id: 'color-mix() percent after', alerts: [],
    old: (s) => asArray(/^([\s\S]*?)\s+(\d*\.?\d+)%$/.exec(s)),
    neu: (s) => E.percentAfter(s),
    samples: ['red 50%', 'var(--x)  12.5%', ' .5%'],
    anchored: true,
    long: [['', ' ', 'x']],
    alphabet: [' ', '\t', '0', '5', '.', '%', 'red', 'x'],
  },
  {
    id: 'color-mix() percent before', alerts: [],
    old: (s) => asArray(/^(\d*\.?\d+)%\s+([\s\S]*)$/.exec(s)),
    neu: (s) => asArray(E.percentBefore(s)),
    samples: ['50% red', '12.5%  var(--x)', '.5% x'],
    anchored: true,
    long: [['', '0', 'x']],
    alphabet: [' ', '\t', '0', '5', '.', '%', 'red', 'x'],
  },
  {
    id: 'relative colour', alerts: [],
    old: (s) => asArray(/^from\s+([\s\S]+?)\s+(r\s+g\s+b|h\s+s\s+l|l\s+c\s+h|l\s+a\s+b)\s*(?:\/\s*([\s\S]+))?$/.exec(s)),
    neu: (s) => E.relativeColorMatch(s),
    prefix: ['from', 'from ', 'from  ', 'from   ', 'from\t'],
    samples: ['from red r g b', 'from var(--x) l c h / 0.5', 'from  red  h s l /', 'from #fff l a b/ .2'],
    anchored: true,
    long: [['from ', ' ', 'x']],
    alphabet: [' ', '\t', 'r', 'g', 'b', 'h', 's', 'l', 'c', 'a', '/', 'x', 'red', 'r g b', 'l c h', 'l a b', 'h s l', '0.5'],
  },
  {
    id: '<input> tags', alerts: [],
    old: (s) => s.match(/<input\b[^>]*>/gi) || [],
    neu: (s) => E.inputTags(s),
    alphabet: ['<input', '<INPUT', '<inputs', ' ', '>', 'type="text"', 'x'],
  },
  {
    id: '<title> text', alerts: [],
    old: (s) => /<title\b[^>]*>[^<]+<\/title>/i.test(s),
    neu: (s) => E.hasTitleText(s),
    samples: ['<title>x</title>'],
    alphabet: ['<title', '<TITLE', '<titles', '>', '<', '</title>', '</TITLE>', 'x', ' '],
  },
  {
    id: 'AI widget script', alerts: [],
    old: (s) => /<script\b[^>]*src\s*=\s*["'][^"']*\b(?:chatbot|ai-widget|dialogflow)\b/i.test(s),
    neu: (s) => E.hasAiWidgetScript(s),
    samples: ['<script src="/chatbot.js">', "<script async src='x/ai-widget'>", '<script type=x src = "dialogflow">'],
    alphabet: ['<script', ' ', 'src', '=', '"', "'", 'chatbot', 'ai-widget', 'dialogflow', 'x', '>', '/', 'achatbot'],
  },
  {
    id: 'chat script', alerts: [],
    old: (s) => /<script\b[^>]*src\s*=\s*["'][^"']*\b(?:assistant|claude|gemini|rasa|intercom|drift|tawk|crisp|livechat|conversational)\b/i.test(s),
    neu: (s) => E.hasChatScript(s),
    samples: ['<script src="/intercom.js">', "<script src='x/drift'>"],
    alphabet: ['<script', ' ', 'src', '=', '"', "'", 'intercom', 'drift', 'x', '>', '/', 'adrift'],
  },
  {
    id: 'AI chat container', alerts: [],
    old: (s) => /<(?:iframe|div|section|aside)\b[^>]*(?:class|id)\s*=\s*["'][^"']*\b(?:chatbot|chat-bot|ai-assistant|ai_chat)\b/i.test(s),
    neu: (s) => E.hasAiChatContainer(s),
    samples: ['<div class="chatbot">', "<aside id='x ai-assistant'>", '<iframe data-id="ai_chat">'],
    alphabet: ['<div', '<section', '<iframe', '<divs', ' ', 'class', 'id', '=', '"', "'", 'chatbot', 'chat-bot', 'ai_chat', 'x', '>'],
  },
  {
    id: 'AI input', alerts: [],
    old: (s) => /<(?:input|textarea|form)\b[^>]*(?:placeholder|aria-label)\s*=\s*["'][^"']*\b(?:ask\s+ai|message\s+ai|chat\s+with\s+ai|ai\s+assistant)\b/i.test(s),
    neu: (s) => E.hasAiInput(s),
    samples: ['<input placeholder="Ask AI">', "<textarea aria-label='message  ai'>"],
    alphabet: ['<input', '<form', ' ', 'placeholder', 'aria-label', '=', '"', "'", 'ask', 'ai', 'chat with', 'x', '>'],
  },
  {
    id: 'chat widget container', alerts: [],
    old: (s) => /<(?:iframe|div|section|aside)\b[^>]*(?:class|id)\s*=\s*["'][^"']*\b(?:assistant-widget|intercom|drift|zendesk-chat|tawk(?:\.to)?|crisp\.chat|livechat|chat-widget|chat-container)\b/i.test(s),
    neu: (s) => E.hasChatWidgetContainer(s),
    samples: ['<div class="intercom">', "<section id='tawk.to'>"],
    alphabet: ['<div', '<section', ' ', 'class', 'id', '=', '"', "'", 'intercom', 'tawk', '.to', 'livechat', 'x', '>'],
  },
  {
    id: 'ambiguous widget', alerts: [],
    old: (s) => /<(?:iframe|div|section)\b[^>]*(?:class|id)\s*=\s*["'][^"']*\b(?:contact-widget|smart-search|virtual-agent|message-us|help-widget)\b/i.test(s),
    neu: (s) => E.hasAmbiguousWidget(s),
    samples: ['<div class="help-widget">'],
    alphabet: ['<div', '<iframe', ' ', 'class', 'id', '=', '"', "'", 'help-widget', 'message-us', 'x', '>'],
  },
  {
    id: 'AI generator meta', alerts: [],
    old: (s) => /<meta\s+name\s*=\s*["']generator["'][^>]*content\s*=\s*["'][^"']*\b(?:ai|gpt|claude|gemini|llm|generated|artificial\s+intelligence)\b/i.test(s),
    neu: (s) => E.hasAiGeneratorMeta(s),
    samples: ['<meta name="generator" content="AI tool">', "<meta  name='generator' x content='made by llm'>"],
    alphabet: ['<meta', ' name="generator"', ' ', 'content', '=', '"', "'", 'ai', 'gpt', 'x', '>'],
  },
  {
    id: 'AI JSON-LD', alerts: [],
    old: (s) => /<script\s+type\s*=\s*["']application\/ld\+json["'][\s\S]*?"@type"\s*:\s*"[^"]*\b(?:ai|softwareapplication)\b[^"]*"[\s\S]*?(?:"applicationCategory"\s*:\s*"[^"]*ai[^"]*"|"[^"]*ai[^"]*")/i.test(s),
    neu: (s) => E.hasAiJsonLd(s),
    samples: ['<script type="application/ld+json">{"@type":"SoftwareApplication","applicationCategory":"AI"}', '<script type=\'application/ld+json\' >{"@type": "ai thing", "x": "brain"}'],
    alphabet: ['<script type="application/ld+json">', '"@type"', ':', ' ', '"', 'ai', 'x', 'SoftwareApplication', '{', '}', ','],
  },
  {
    id: 'aria-hidden elements', alerts: [],
    old: (s) => s.replace(/<([a-z][a-z0-9-]*)\b[^>]*\baria-hidden\s*=\s*["']?true["']?[^>]*>[\s\S]*?<\/\1>/gi, ''),
    neu: (s) => E.withoutAriaHiddenElements(s),
    samples: ['<span aria-hidden="true">x</span>', '<a-b aria-hidden=true>y</a-b>'],
    alphabet: ['<span', '<a-b', '<a', '<A-', '<x1', ' aria-hidden="true"', ' aria-hidden=true', 'aria-hidden=true', '>', '</span>', '</a-b>', '</a>', '</A->', '</a->', '</x1>', 'x', ' ', '-', '_', '1', '<'],
  },
  {
    id: '<kbd> keycaps', alerts: [],
    old: (s) => s.replace(/<kbd\b[^>]*>(?:(?!<kbd\b)[\s\S])*?<\/kbd>/gi, ' '),
    neu: (s) => E.withoutKbdElements(s),
    samples: ['<kbd>K</kbd>', '<kbd><kbd>Ctrl</kbd>+<kbd>K</kbd></kbd>'],
    alphabet: ['<kbd', '<KBD', '<kbds', '>', '</kbd>', 'x', ' ', '+'],
  },
  {
    id: 'shortcut glyph', alerts: [],
    old: (s) => s.replace(/[\s]*[\u2303\u2318\u2325\u21E7\u21E7\u2387].*$/i, ''),
    neu: (s) => E.withoutGlyphShortcut(s),
    anchored: true,
    samples: ['Find \u2318K', 'Go\u21e7'],
    long: [['', ' ', 'x']],
    alphabet: [' ', '\n', '\u2028', '\u2318', '\u21e7', 'K', 'x', '\r'],
  },
  {
    id: 'shortcut text', alerts: [],
    old: (s) => s.replace(/[\s]*(?:Ctrl|Cmd|Shift|Alt|Option|Command)(?:\+[A-Za-z0-9+\-]*|[A-Z0-9]+)?$/, ''),
    neu: (s) => E.withoutTextShortcut(s),
    anchored: true,
    samples: ['Save Ctrl+S', 'FindCtrlK', 'Go Command'],
    long: [['', ' ', 'x']],
    alphabet: [' ', 'Ctrl', 'Cmd', 'Command', 'Shift', 'Alt', 'Option', '+', 'K', 'k', '1', '-', 'x', 'ctrl'],
  },
  {
    id: 'trailing plus signs', alerts: [],
    old: (s) => s.replace(/(?:\s*\+)+$/, ''),
    neu: (s) => E.withoutTrailingPluses(s),
    anchored: true,
    samples: ['a + +', 'x+'],
    long: [['', '+', '\u2600']],
    alphabet: [' ', '+', 'x', '\t'],
  },
  {
    id: 'grid: colour then 1px', alerts: [],
    old: (s) => /(?:transparent|rgba\([^)]+\)|color-mix\([^)]*\)|var\([^)]*\)|#[0-9a-fA-F]{3,8})\s+1px(?:\s*,)/.test(s),
    neu: (s) => E.hasColorThenHairline(s),
    samples: ['transparent 1px,', 'rgba(0,0,0,.1) 1px ,', 'var(--a) 1px,', '#fff 1px,', 'color-mix(in srgb, red, blue)  1px,'],
    alphabet: ['transparent', 'rgba(', 'color-mix(', 'var(', '#', 'fff', 'a', '0', ')', ' ', '1px', ',', 'x'],
  },
  {
    id: 'grid: 1px then colour', alerts: [],
    old: (s) => /\s+1px\s*,\s*(?:transparent|rgba\([^)]+\)|color-mix\([^)]*\)|var\([^)]*\))/.test(s),
    neu: (s) => E.hasHairlineThenColor(s),
    samples: [' 1px, transparent', ' 1px , rgba(0,0,0,.2)', '  1px,var(--x)', ' 1px,color-mix(a)'],
    alphabet: [' ', '1px', ',', 'transparent', 'rgba(', 'color-mix(', 'var(', ')', 'x'],
  },
  {
    id: 'hairline background size', alerts: [],
    old: (s) => /\/\s*[^,/]*(?:^|\s)1px(?:$|[\s,])/.test(s),
    neu: (s) => E.hasSlashThenHairline(s),
    samples: ['top / 100% 1px', 'x/ 1px,', 'a / b 1px'],
    long: [['/', ' ', '']],
    alphabet: ['/', ' ', '1px', ',', 'x', '100%', '1'],
  },
  {
    id: 'linear() easings', alerts: [],
    old: (s) => s.match(/linear\(\s*[^)]{20,}\)/gi) || [],
    neu: (s) => E.longLinearEasings(s),
    samples: ['linear(0, 0.5 20%, 1 100%, 0.25 50%)'],
    alphabet: ['linear(', 'LINEAR(', ' ', '0', ',', '0.5 50%', ')', 'x'.repeat(12)],
  },
  {
    id: 'inline <style> blocks', alerts: [],
    old: (s) => execAll(/<style[^>]*>([\s\S]*?)<\/style>/gi, s),
    neu: (s) => E.styleElements(s),
    samples: ['<style>a{}</style>', '<style media=x>b</style>'],
    alphabet: ['<style', '</style>', '>', '<', 'x', ' ', 'a{}'],
  },
  {
    // Engine 1.5.4: the reference is the combined pattern, with group 1 or
    // else group 2 (href before rel) as the one group the helper reports.
    id: 'stylesheet <link> hrefs', alerts: [],
    old: (s) => execAll(LINK_1_5_4, s).map((m) => ({ ...m, groups: [m.groups[0] ?? m.groups[1]] })),
    neu: (s) => E.stylesheetLinkMatches(s),
    samples: [
      '<link rel="stylesheet" href="a.css">', "<link href=\"x\" rel=stylesheet href='b.css'>",
      '<link href="a.css" rel="stylesheet">', "<LINK HREF='c.css' REL=stylesheet>", '<link href="x>y" rel=stylesheet>',
      '<link href="a" href="b" rel=stylesheet href="c">', "<link href=\"a.css\" media=\"print\" rel='stylesheet' >",
    ],
    long: [["<link href='a' ", "href='a' ", ''], ['', "<link href='a' ", ''], ['<link ', 'href="a.css" ', ' rel="stylesheet">']],
    alphabet: ['<link', '<LINK', ' ', 'rel=', 'rel="stylesheet"', "rel='stylesheet'", 'rel=stylesheet', 'stylesheet', 'href=', 'href="', "href='", 'a.css', '"', "'", '>', 'x', ' rel="stylesheet">', 'href="a.css" '],
  },
  {
    id: 'script, style, template and comment strip', alerts: [],
    old: (s) => s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ').replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ').replace(/<template\b[\s\S]*?<\/template\s*>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' '),
    neu: (s) => E.withoutNonVisibleMarkup(s),
    samples: ['<script>x</script >', '<!-- c -->', '<template>t</template>'],
    alphabet: ['<script', '<scripts', '</script', '</script >', '</script>', '<style', '</style  >', '<template', '</template>', '<!--', '-->', '<!-->', '>', ' ', 'x'],
  },
  {
    id: '@view-transition navigation', alerts: [],
    old: (s) => /@view-transition\s*\{[^}]*navigation\s*:\s*auto/i.test(s),
    neu: (s) => E.hasViewTransitionNavigation(s),
    samples: ['@view-transition { navigation: auto; }', '@view-transition{x:y;navigation:auto}'],
    alphabet: ['@view-transition', ' ', '{', '}', 'navigation', ':', 'auto', 'x', ';'],
  },
  {
    id: 'transition transform ease-out', alerts: [],
    old: (s) => /transition\s*:[^;]*transform[^;]*(ease-out|cubic-bezier\([^)]*0[, ])/i.test(s),
    neu: (s) => E.hasTransformEaseTransition(s),
    samples: ['transition: transform .2s ease-out', 'transition:transform 1s cubic-bezier(0, 0, .2, 1)', 'transition : opacity, transform 200ms cubic-bezier(.4,0 ,1,1)'],
    alphabet: ['transition', ':', ' ', 'transform', 'ease-out', 'cubic-bezier(', '0', ',', ')', ';', 'x', '.2'],
  },
  {
    id: 'purple gradient', alerts: [],
    old: (s) => s.match(/(?:background(?:-image)?\s*:[^;]*linear-gradient[^;]*(?:#?(?:615fff|8e51ff|4f39f6|7f22fe|a855f7|9333ea|7c3aed|6d28d9|5b21b6|4c1d95)))/gi),
    neu: (s) => E.purpleGradientDecls(s),
    samples: ['background:linear-gradient(#7c3aed,#fff)', 'background-image: linear-gradient(90deg, a855f7f22fe)'],
    alphabet: ['background', 'background-image', ':', ' ', 'linear-gradient', '(', '#', '7c3aed', 'a855f7', '7f22fe', 'f22fe', ';', 'x', ')'],
  },
  {
    id: 'rgb() stop', alerts: [],
    old: (s) => asArray(s.match(/rgba?\(([^)]+)\)/i)),
    neu: (s) => E.rgbArgs(s),
    samples: ['rgb(1,2,3)', 'RGBA(1, 2, 3, .5) 40%'],
    alphabet: ['rgb(', 'rgba(', 'RGB(', ')', '1', ',', ' ', 'x'],
  },
  {
    id: 'multi-stop gradient', alerts: [],
    old: (s) => O.multiStop(s),
    neu: (s) => E.hasMultiStopGradient(s),
    samples: ['linear-gradient(red, blue)', 'linear-gradient(to right, red)', 'LINEAR-GRADIENT(45deg, a, b)'],
    alphabet: ['linear-gradient(', 'LINEAR-GRADIENT(', '(', ')', ',', ' ', 'red', 'to ', '45deg', '\u0130'],
  },
  {
    id: 'v05 motion opt-in', alerts: [],
    old: (s) => O.optsIntoMotion(s),
    neu: (s) => E.optsIntoMotion(s),
    samples: ['a{transition:opacity .2s}', 'animation: none', 'scroll-behavior:smooth', '@view-transition{navigation:auto}', 'transition: all 5ms'],
    alphabet: ['animation', 'transition', 'scroll-behavior', ':', ' ', 'none', 'smooth', '0', '.2s', '200ms', '5ms', ';', '{', '}', '!important', 'x', '1', '.', ','],
  },
  {
    id: 'v05 reduced motion', alerts: [],
    old: (s) => O.checkReducedMotion(s),
    neu: (s) => E.checkReducedMotion(s),
    samples: ['@media (prefers-reduced-motion: reduce){a{animation:none}}', '@media (prefers-reduced-motion: no-preference){a{transition:opacity .3s}}', '@media (prefers-reduced-motion: no-preference){@media (prefers-reduced-motion: no-preference){a{x:y}}}'],
    alphabet: ['@media (prefers-reduced-motion: reduce)', '@media (prefers-reduced-motion: no-preference)', '{', '}', 'a', 'transition:opacity .2s;', 'animation:none;', '/*', '*/', ' '],
  },
  {
    id: 'cssTimeMs', alerts: [],
    old: (s) => O.cssTimeMs(s),
    neu: (s) => E.cssTimeMs(s),
    anchored: true,
    samples: ['200ms', '-.5s', '1.s', '3S'],
    long: [['', '0', 'x']],
    alphabet: ['0', '1', '.', '-', 'ms', 's', 'S', ' ', 'x'],
  },
  {
    id: 'cssNumber', alerts: [],
    old: (s) => [O.cssNumber(s, 1), O.cssNumber(s, 255)],
    neu: (s) => [E.cssNumber(s, 1), E.cssNumber(s, 255)],
    anchored: true,
    samples: ['50%', '-1.5e3', '.5turn', '1.deg', '+2rad', 'none'],
    long: [['', '1', 'x']],
    alphabet: ['0', '1', '.', '-', '+', 'e', 'E', '%', 'deg', 'turn', 'rad', 'grad', ' ', 'x'],
  },
  {
    id: 'v46 static px', alerts: [],
    old: (s) => O.v46StaticPx(s),
    neu: (s) => E.v46StaticPx(s),
    anchored: true,
    samples: ['16px', '1.25rem', '.5REM'],
    long: [['', '0', 'x']],
    alphabet: ['0', '1', '.', 'px', 'rem', ' ', 'x'],
  },
  {
    id: 'v45 zero opacity', alerts: [],
    old: (s) => /^(?:0*\.?0*|0*(?:\.0+)?%)$/.test(s),
    neu: (s) => E.isZeroOpacity(s),
    anchored: true,
    samples: ['0', '0.0', '.0%', '00%'],
    long: [['', '0', 'x']],
    alphabet: ['0', '.', '%', '1', 'x'],
  },
  {
    id: 'v27 rule selector', alerts: [],
    old: (s) => ruleOffsets(s).map((o) => [o, O.ruleSelectorAt(s, o)]).filter((x) => x[1] !== null),
    neu: (s) => {
      const at = E.ruleSelectorFinder(s);
      return ruleOffsets(s).map((o) => {
        const r = at(o);
        return [o, r === null ? null : s.slice(r[0], r[1])];
      }).filter((x) => x[1] !== null);
    },
    samples: ['input{font-size:12px}', 'a;b{c}d{e;f}', '{x}', '.field , select/* c */{font-size:1rem;color:red}', '}{'],
    alphabet: ['{', '}', ';', 'input', '.field', ' ', 'x', 'font-size:12px', '/*', '*/', ','],
  },
  {
    id: 'v27 font-size var() resolution', alerts: [],
    old: (s) => O.resolveFontSizeVars(s, V27_TOKENS),
    neu: (s) => E.resolveFontSizeVars(s, V27_TOKENS),
    samples: ['input{font-size:var(--a)}', '.field{font-size: var(--sm)}', 'p{font-size:var(--sm)}', 'select, .x{font-size:var(--missing, 1rem)}', 'input{color:red;font-size:var(--text-body)}'],
    alphabet: ['input', '.field', 'select', 'p', '{', '}', 'font-size', ':', 'var(--a)', 'var(--sm)', 'var(--text-body)', ';', ' ', ',', '/*', '*/'],
  },
  {
    id: 'v27 input font floor', alerts: [],
    old: (s) => floorVerdict(O.checkInputFontFloor(s, '<input>', V27_TOKENS)),
    neu: (s) => floorVerdict(E.checkInputFontFloor(s, '<input>', V27_TOKENS)),
    samples: ['input{font-size:12px}', '.field{font-size:var(--sm)}', 'input,textarea{font-size:1rem}', '.chip{user-select:none}.chip-label{font-size:12px}', 'select{font-size:var(--text-body)}', 'input{color:red;font-size:14px}'],
    alphabet: ['input', 'textarea', 'select', '.field', '.chip', 'user-select:none', '{', '}', ';', ':', ' ', ',', 'font-size', 'font-size:12px', 'font-size:1rem', 'var(--a)', 'var(--sm)', '14px', '16px', '/*', '*/'],
  },
  {
    id: 'error text', alerts: [42],
    old: (s) => O.sanitizeErrorText(s),
    neu: (s) => E.sanitizeErrorText(s),
    samples: ['imported from C:\\Users\\jane\\x.js.', 'at /home/runner/x/y.js)', 'file:///C:/x.js:1:2', 'stale cache at ..\\npm-cache\\_npx\\abc\\x.js!!'],
    long: [['file://', '!', 'x']],
    alphabet: ['C:\\', '/home/', '/Users/', 'file://', 'npm-cache', '/_npx/', '\\', '/', 'jane', ' ', '.', '!', ')', ',', '"', "'", 'x'],
  },
  {
    id: 'v46 size declarations (engine 1.5.2)', alerts: [],
    old: (s) => v46DeclsByPattern(s),
    neu: (s) => E.v46SizeDecls(s),
    samples: ['p{font-size:1rem}', '.a{font:500 0.66rem/1 var(--mono)}', 'font: 12px serif;', '@supports (font: -apple-system-body) and (x:y){.b{font:9px a}}', '.c{--chip-font-size:.7rem}', '.d{font:400 1rem/1.5 serif /* font: 10px */;}', '.e{font:1rem x /* font-size:2px; */}', 'font-size: ;', 'FONT : 1px}', 'x-font:1px;', 'font:  }'],
    long: [['a{', 'font:', ''], ['', 'font:', '{'], ['a{', 'font:(', ''], ['a{', 'font : ', ''], ['a{font-size:', ' ', ''], ['a{font:', 'font-size:', '']],
    alphabet: ['font', 'FONT', 'Font', 'font-size', 'FONT-SIZE', '-size', ':', ' ', ';', '}', '{', '/*', '*/', '12px', 'x', '-', '_', 'a', '--x-', 'font-family', 'font-sizes', '(', '\n'],
  },
  {
    id: 'v46 size token (engine 1.5.2)', alerts: [], anchored: true,
    old: (s) => V46_SIZE_TOKEN.test(s),
    neu: (s) => E.isV46SizeToken(s),
    samples: ['12px', '0.66rem', '.5em', '1.5%', 'x-small', 'XX-Large', 'xxx-small', 'medium', 'smaller', 'Larger', 'clamp(1rem, 2vw, 3rem)', 'MIN(1px)', 'calc()', 'max(a)b)'],
    long: [['', '1', 'x!'], ['', '1', ''], ['.', '1', '%%'], ['clamp(', 'x', '\n)'], ['min(', ')', '']],
    alphabet: ['1', '0', '9', '.', 'px', 'rem', 'PX', '%', 'e', 'x-', 'xx-', 'xxx-', 'small', 'large', 'medium', 'smaller', 'larger', 'clamp(', 'min(', 'max(', 'calc(', 'CLAMP(', '(', ')', '\n', '\u2028', 'a', 'Z', '-'],
  },
  {
    id: 'v46 rule selector (engine 1.5.2)', alerts: [],
    old: (s) => ruleOffsets(s).map((o) => [o, v46SelectorBefore(s, o)]).filter((x) => x[1] !== ''),
    neu: (s) => {
      const at = E.v46SelectorFinder(s);
      return ruleOffsets(s).map((o) => [o, at(o)]).filter((x) => x[1] !== '');
    },
    samples: ['a{font-size:12px}', '@media x{.b{font:9px y}}', 'p;q{r}', '/* c */.d , .e{f}', '{x}', '}{', 'a{b}c{'],
    alphabet: ['{', '}', ';', '.a', ' ', '\n', '/*', '*/', 'font-size:12px', '@media x', ','],
  },
];

// ── Inputs ───────────────────────────────────────────────────────────────────

/** A seeded generator (mulberry32), so a failure reproduces. */
function seeded(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generated inputs for one site: tokens, mutated samples, and repeated runs. */
function generator(site, rand) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const tokens = (n) => {
    const toks = rand() < 0.85 ? site.alphabet : [...site.alphabet, ...WS, ...ODD];
    let s = '';
    for (let k = 0; k < n; k++) s += rand() < 0.15 ? pick(WS) : pick(toks);
    return s;
  };
  const mutate = (s) => {
    const edits = Math.floor(rand() * 4);
    for (let e = 0; e < edits; e++) {
      const at = Math.floor(rand() * (s.length + 1));
      const r = rand();
      if (r < 0.4) s = s.slice(0, at) + tokens(1 + Math.floor(rand() * 2)) + s.slice(at);
      else if (r < 0.7) s = s.slice(0, at) + s.slice(at + 1 + Math.floor(rand() * 3));
      else if (r < 0.85) {
        const b = Math.floor(rand() * (s.length + 1));
        const [x, y] = at < b ? [at, b] : [b, at];
        s = s.slice(0, y) + s.slice(x, y) + s.slice(y);
      } else s = s.slice(0, at) + pick(WS) + s.slice(at);
    }
    return s;
  };
  return () => {
    const r = rand();
    let s = site.prefix ? pick(site.prefix) : '';
    if (site.samples && site.anchored && r < 0.3) return s + mutate(pick(site.samples));
    if (site.samples && r < 0.55) {
      const parts = 1 + Math.floor(rand() * 4);
      for (let k = 0; k < parts; k++) s += tokens(Math.floor(rand() * 4)) + mutate(pick(site.samples));
      return s + tokens(Math.floor(rand() * 4));
    }
    if (r < 0.62) {
      const unit = tokens(1 + Math.floor(rand() * 3));
      return s + tokens(Math.floor(rand() * 3)) + unit.repeat(2 + Math.floor(rand() * 12)) + tokens(Math.floor(rand() * 3));
    }
    return s + tokens(Math.floor(rand() * (r < 0.8 ? 12 : 40)));
  };
}

/** The repo's fixture pages, as [name, html, css]. */
function fixturePages() {
  const pages = [];
  for (const f of FIXTURES) if (typeof f.html === 'string') pages.push([`corpus/${f.name}`, f.html, f.css || '']);
  const parity = JSON.parse(readFileSync(join(HERE, 'fixtures', 'parity-page.json'), 'utf8'));
  pages.push(['parity-page', parity.html, parity.css]);
  // The offline-engine golden's edge cases, read from the script that writes it.
  const golden = readFileSync(join(HERE, '..', 'scripts', 'export-offline-golden.mjs'), 'utf8');
  const edge = new Function(`${golden.slice(golden.indexOf('const HTML_WITH_FIELD'), golden.indexOf('const AUTO_SUBJECTS'))}\nreturn EDGE;`)();
  for (const [name, html, css] of edge) pages.push([`golden/${name}`, html, css]);
  const sites = join(REPO, 'apps', 'site', 'scripts', 'fixtures', 'own-contract', 'sites');
  if (existsSync(sites)) {
    for (const f of readdirSync(sites).filter((x) => x.endsWith('.html'))) {
      const css = join(sites, f.replace(/\.html$/, '.css'));
      pages.push([`own-contract/${f}`, readFileSync(join(sites, f), 'utf8'), existsSync(css) ? readFileSync(css, 'utf8') : '']);
    }
  }
  const dir = process.env.LINEAR_SCAN_PAGES;
  if (dir) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const p = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      pages.push([`recorded/${f}`, p.html || '', p.css || '']);
    }
  }
  return pages;
}

/** Each page whole, and its fragments between braces, semicolons and angle brackets. */
function fixtureInputs(pages) {
  const out = new Set();
  for (const [, html, css] of pages) {
    out.add(html);
    out.add(css);
    for (const piece of css.split(/[{};]/)) if (piece.length < 2000) out.add(piece);
    for (const piece of html.split(/[<>]/)) if (piece.length < 2000) out.add(piece);
  }
  return [...out];
}

const same = (a, b) => isDeepStrictEqual(a, b);

/** Whether the old pattern found something in `s`: a replacement made, a match, a true. */
function produced(site, result, s) {
  if (typeof result === 'string') return result !== s;
  if (typeof result === 'boolean') return result;
  if (typeof result === 'number') return true;
  if (Array.isArray(result)) return site.replaces ? result.some((r) => r !== s) : result.length > 0;
  return result !== null && result !== undefined;
}
const run = (f, s) => {
  try {
    return f(s);
  } catch (e) {
    return `threw ${e && e.message}`;
  }
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('linear scanning: the character classes match the regex classes', () => {
  it('isJsSpace, isWordChar, isNameChar, isTagNameChar, isDigit and isLineTerminator agree on every code unit', () => {
    for (let c = 0; c < 0x10000; c++) {
      const ch = String.fromCharCode(c);
      assert.equal(E.isJsSpace(c), /\s/.test(ch), `\\s at ${c}`);
      assert.equal(E.isWordChar(c), /\w/.test(ch), `\\w at ${c}`);
      assert.equal(E.isNameChar(c), /[\w-]/.test(ch), `[\\w-] at ${c}`);
      assert.equal(E.isTagNameChar(c), /[a-z0-9-]/i.test(ch), `[a-z0-9-]/i at ${c}`);
      assert.equal(E.isDigit(c), /[0-9]/.test(ch), `[0-9] at ${c}`);
      assert.equal(E.isLineTerminator(c), /[\n\r\u2028\u2029]/.test(ch), `line terminator at ${c}`);
    }
  });

  it('engine 1.5.2: v46\'s case-insensitive words, its lookbehind and its size test agree with the patterns on every code unit', () => {
    for (let c = 0; c < 0x10000; c++) {
      const ch = String.fromCharCode(c);
      assert.equal(E.isNameChar(c), /[\w-]/i.test(ch), `[\\w-]/i at ${c}`);
      for (const s of [`1${ch}`, `1${ch}x`, `.5p${ch}`, `x-smal${ch}`, `${ch}edium`, `mi${ch}(1)`, `min(${ch})`, `calc(${ch}x)`]) {
        assert.equal(E.isV46SizeToken(s), V46_SIZE_TOKEN.test(s), `size token ${JSON.stringify(s)}`);
      }
      for (const s of [`${ch}font:1px;`, `fon${ch}:1px;`, `font-siz${ch}:1px;`, `font:${ch};`, `font${ch}:1px;`, `font-size:${ch}`]) {
        assert.deepEqual(E.v46SizeDecls(s), v46DeclsByPattern(s), `declarations ${JSON.stringify(s)}`);
      }
    }
  });
});

describe('linear scanning: every rewritten pattern returns what it returned', () => {
  const pages = fixturePages();
  const inputs = fixtureInputs(pages);
  const GENERATED = Number(process.env.LINEAR_SCAN_CASES || 10_000);

  it(`the sites cover every engine pattern the code scanning alerts named`, () => {
    const covered = new Set(SITES.flatMap((s) => s.alerts));
    const missing = [];
    for (let a = 5; a <= 55; a++) if (!covered.has(a)) missing.push(a);
    assert.deepEqual(missing, [], `alerts with no site: ${missing.join(', ')}`);
  });

  it('engine 1.5.4: on every fixture page the link helper returns what the 1.5.1 pattern returned', () => {
    let links = 0;
    for (const [name, html] of pages) {
      const before = execAll(LINK_1_5_1, html);
      assert.deepEqual(E.stylesheetLinkMatches(html), before, name);
      links += before.length;
    }
    assert.ok(links > 0, 'no fixture page links a stylesheet, so the comparison proves nothing');
  });

  for (const site of SITES) {
    it(`${site.id}: identical on ${pages.length} fixture pages and ${GENERATED} generated inputs`, () => {
      for (const s of inputs) {
        const a = run(site.old, s);
        const b = run(site.neu, s);
        assert.ok(same(a, b), `fixture input differs (${s.length} chars): ${JSON.stringify(s.slice(0, 200))}`);
      }
      const next = generator(site, seeded(0x5eed + site.id.length * 7919));
      let changed = 0;
      for (let k = 0; k < GENERATED; k++) {
        const s = next();
        const a = run(site.old, s);
        const b = run(site.neu, s);
        if (!same(a, b)) assert.fail(`generated input ${k} differs: ${JSON.stringify(s)}\nold ${JSON.stringify(a)}\nnew ${JSON.stringify(b)}`);
        if (produced(site, a, s)) changed++;
      }
      // The generated inputs must exercise the pattern, not only miss it.
      assert.ok(changed >= GENERATED / 100, `only ${changed} generated inputs produced a result other than the empty input's`);
    });
  }
});

describe('linear scanning: the CSS rule parser', () => {
  // Engine 1.5.1 bounds nesting at CSS_MAX_NESTING and the blocks closed at
  // the end of a sheet at CSS_MAX_OPEN_AT_END. Within those bounds the parse
  // is the old one exactly; the generated sheets below hold no quotes,
  // comments or url(), so every brace is one the parser counts.
  const O_PARSE = (css) => O.parseCssRulesUncached(css);
  const shape = (css) => {
    let depth = 0;
    let max = 0;
    for (const ch of css) {
      if (ch === '{') max = Math.max(max, ++depth);
      else if (ch === '}' && depth > 0) depth--;
    }
    return { max, open: depth };
  };

  it('is unchanged on every fixture page and on generated sheets within the bounds', () => {
    for (const [, , css] of fixturePages()) {
      assert.deepEqual(E.parseCssRulesUncached(css), O_PARSE(css));
    }
    const rand = seeded(0xc55);
    const alphabet = ['a', '.b', ' ', '{', '{', '}', 'color:red', ';', '@media x', '@keyframes k', 'from', '&', ',', '--t:1', 'to'];
    let checked = 0;
    for (let k = 0; k < 10_000; k++) {
      let css = '';
      const n = Math.floor(rand() * 60);
      for (let i = 0; i < n; i++) css += alphabet[Math.floor(rand() * alphabet.length)];
      const { max, open } = shape(css);
      if (max > E.CSS_MAX_NESTING || open > E.CSS_MAX_OPEN_AT_END) continue;
      checked++;
      assert.deepEqual(E.parseCssRulesUncached(css), O_PARSE(css), JSON.stringify(css));
    }
    assert.ok(checked > 5_000, `only ${checked} generated sheets were within the bounds`);
  });

  it('stays within the bounds the cohort leaves room for, and reads a deep sheet in linear time', () => {
    assert.ok(E.CSS_MAX_NESTING >= 16 && E.CSS_MAX_OPEN_AT_END >= 4);
    const deep = 'a{'.repeat(50_000);
    const t0 = performance.now();
    const { rules } = E.parseCssRulesUncached(deep);
    assert.ok(performance.now() - t0 < 500, 'a deep sheet took too long');
    assert.ok(rules.length <= E.CSS_MAX_OPEN_AT_END);
  });
});

describe('linear scanning: each helper reads 100 KB in under 50 ms', () => {
  const SIZE = 100_000;
  const build = ([pre, unit, suf]) => {
    let s = pre;
    while (s.length < SIZE) s += unit;
    return s.slice(0, SIZE) + suf;
  };
  for (const site of SITES) {
    it(site.id, () => {
      const units = [];
      const pre = site.prefix ? site.prefix[site.prefix.length - 1] : '';
      for (const a of site.alphabet) units.push([pre, a, ''], [pre, `${a} `, '']);
      for (const x of site.samples || []) units.push([pre, x, ''], [pre, x.slice(0, Math.ceil(x.length / 2)), '']);
      for (const l of site.long || []) units.push(l);
      let worst = 0;
      let worstUnit = null;
      for (const u of units) {
        const s = build(u);
        let best = Infinity;
        for (let k = 0; k < 2; k++) {
          const t0 = performance.now();
          site.neu(s);
          best = Math.min(best, performance.now() - t0);
        }
        if (best > worst) { worst = best; worstUnit = u; }
      }
      assert.ok(worst < 50, `${site.id} took ${worst.toFixed(1)} ms on 100 KB of ${JSON.stringify(worstUnit)}`);
    });
  }
});
