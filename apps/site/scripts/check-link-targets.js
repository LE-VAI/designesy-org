#!/usr/bin/env node
/**
 * Link targets gate: next/link never points at an endpoint or a file.
 *
 * WHY THIS EXISTS
 * next/link treats its href as a page. In a production build it prefetches
 * every link that scrolls into view (GET <href>?_rsc=...), and a click tries
 * a client-side navigation before it falls back to loading the URL. An API
 * route answers that GET with 405 when it only takes POST, and a file route
 * (open.json, llms-full.txt) sends its whole body to a prefetch nobody asked
 * for. On 2026-10-11 a live audit found a console error on 71 of the 74 HTML
 * routes: the footer's "MCP server" pill (/api/mcp) on every page, and the
 * "API endpoint" buttons and inline endpoint links on the contract, engine,
 * leaderboard and methodology pages. A page, a type check and the prerender
 * all pass with it; only a browser console shows it.
 *
 * WHAT IT FLAGS
 * A next/link element (the default import of 'next/link', under whatever
 * local name) whose href can be read from the source and names:
 *   - an API route or a well-known file: /api/..., /.well-known/...;
 *   - a file: the last path segment ends in an extension (/open.json,
 *     /llms.txt, /api/leaderboard.csv, /DESIGN.md, /badge.svg).
 * The site's own absolute origin (https://www.designesy.org/...) is read as
 * the same path: on the live site it is the same URL. Query strings and
 * fragments are ignored: /score?url=example.com is a page.
 *
 * Such a link is a plain <a href> (or a RouteLink from app/lib/route-link,
 * which picks the anchor for these targets at run time).
 *
 * HOW AN HREF IS READ
 * Most offenders were data, never a literal on the <Link> line: the footer
 * maps a MACHINE_LINKS array, the contract pages read machine_url from the
 * contract module. So the href expression is followed through:
 *   - string and template literals (a template is judged by its fixed head);
 *   - consts, in the same file or imported from another module of the app;
 *   - object and array literals, member access (c.machine_url, o.list[0]);
 *   - the item of ARRAY.map / filter / find / flatMap callbacks (destructured
 *     or not), spreads included;
 *   - [...].map((x) => ({ href })) and RECORD[key] (every value);
 *   - a component's prop, read at every place the component is rendered
 *     (EngineHead's contract.href, CheckGrid's item.href);
 *   - .replace(literal, literal) on any of the above;
 *   - ?:, || and ?? (every branch).
 * An href it cannot read (a computed value, spread props) is counted and
 * listed under --verbose, never failed: a gate that guesses fails on harmless
 * code and gets deleted. A next/link inside a function that tests the same
 * href with isNonPageHref() is reached only for pages (RouteLink), so it is
 * counted apart and not judged.
 *
 * PROVING IT CAN FAIL
 * On origin/main at 673ed301 (2026-10-11) it reports 85 targets in 28 files,
 * the footer's /api/mcp among them, and exits 1.
 *
 * Usage:  node scripts/check-link-targets.js [--json] [--verbose]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const APP_ROOT = path.join(__dirname, '..');
const APP = path.join(APP_ROOT, 'app');
const ORIGINS = [/^https?:\/\/(www\.)?designesy\.org(?=\/|$)/i];

const asJson = process.argv.includes('--json');
const verbose = process.argv.includes('--verbose');

/** The reason a path is not a page, or null when it is one. */
function nonPage(raw, { prefixOnly = false } = {}) {
  let href = raw;
  for (const o of ORIGINS) href = href.replace(o, '');
  if (!href.startsWith('/')) return null; // external, mailto:, #hash, relative
  const p = href.split(/[?#]/, 1)[0];
  if (p === '/api' || p.startsWith('/api/')) return 'an API route';
  if (p.startsWith('/.well-known/')) return 'a well-known file';
  // A template's fixed head may stop inside the last segment (`/x/${slug}`),
  // so only its complete segments can be judged for an extension.
  if (prefixOnly) return null;
  const last = p.slice(p.lastIndexOf('/') + 1);
  return /\.[a-z0-9]{1,8}$/i.test(last) ? 'a file' : null;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

// ── Module cache ─────────────────────────────────────────────────────────────

const sources = new Map();
function sourceOf(file) {
  if (!sources.has(file)) {
    let sf = null;
    try {
      const text = fs.readFileSync(file, 'utf8');
      sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    } catch {
      sf = null;
    }
    sources.set(file, sf);
  }
  return sources.get(file);
}

function resolveModule(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // packages are not the app's data
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

/** The initializer an exported name is declared with, in its module. */
function exportedInit(file, name, seen) {
  const sf = sourceOf(file);
  if (!sf) return null;
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) return { node: d.initializer, sf };
      }
    }
    // export { A as name } from './x'  /  export { A as name }
    if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        if (el.name.text !== name) continue;
        const local = (el.propertyName || el.name).text;
        if (st.moduleSpecifier) {
          const target = resolveModule(file, st.moduleSpecifier.text);
          return target && !seen.has(`${target}#${local}`) ? (seen.add(`${target}#${local}`), exportedInit(target, local, seen)) : null;
        }
        if (local !== name) return exportedInit(file, local, seen);
      }
    }
  }
  return null;
}

// ── Values ───────────────────────────────────────────────────────────────────
// A value is { k: 'str', t } | { k: 'pre', t } | { k: 'obj', n, sf } |
// { k: 'arr', items } | { k: 'unk', why }.

const UNK = (why) => ({ k: 'unk', why });
const MAX_DEPTH = 14;

function unwrap(e) {
  while (
    e &&
    (ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isTypeAssertionExpression(e) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(e)))
  ) {
    e = e.expression;
  }
  return e;
}

/** Where an identifier is bound, searching outward from the use. */
function binding(id) {
  const name = id.text;
  for (let n = id.parent; n; n = n.parent) {
    // Parameters of an enclosing function.
    if (ts.isFunctionLike(n) && n.parameters) {
      for (const p of n.parameters) {
        const hit = bindsName(p.name, name);
        if (hit) return { kind: 'param', fn: n, param: p, path: hit.path };
      }
    }
    // Declarations in an enclosing block or the file.
    const stmts = ts.isSourceFile(n) || ts.isBlock(n) || ts.isModuleBlock(n) ? n.statements : null;
    if (stmts) {
      for (const st of stmts) {
        if (ts.isVariableStatement(st)) {
          for (const d of st.declarationList.declarations) {
            const hit = bindsName(d.name, name);
            if (hit) return { kind: 'var', decl: d, path: hit.path };
          }
        }
        if (ts.isImportDeclaration(st) && st.importClause) {
          const c = st.importClause;
          if (c.namedBindings && ts.isNamedImports(c.namedBindings)) {
            for (const el of c.namedBindings.elements) {
              if (el.name.text === name) return { kind: 'import', spec: st.moduleSpecifier.text, imported: (el.propertyName || el.name).text };
            }
          }
        }
      }
    }
  }
  return null;
}

/** Whether a binding name (identifier or destructuring) binds `name`; the
    property path to it from the bound value. */
function bindsName(b, name, at = []) {
  if (ts.isIdentifier(b)) return b.text === name ? { path: at } : null;
  if (ts.isObjectBindingPattern(b)) {
    for (const el of b.elements) {
      const key = el.propertyName ? el.propertyName.getText() : ts.isIdentifier(el.name) ? el.name.text : null;
      const hit = bindsName(el.name, name, key ? [...at, key] : at);
      if (hit) return hit;
    }
  }
  return null;
}

const PASS_THROUGH = new Set(['filter', 'slice', 'concat', 'reverse', 'sort', 'toSorted', 'toReversed']);
const ITEM_OF = new Set(['map', 'flatMap', 'forEach', 'filter', 'find', 'findLast', 'some', 'every']);

/** What an arrow or function callback returns: its expression body, or the
    expression of each return statement in its block. */
function returned(fn) {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out = [];
  const visit = (n) => {
    if (ts.isFunctionLike(n) && n !== fn) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
    ts.forEachChild(n, visit);
  };
  visit(fn.body);
  return out;
}

function resolve(expr, depth = 0) {
  if (depth > MAX_DEPTH) return [UNK('too deep')];
  const e = unwrap(expr);
  if (!e) return [UNK('empty')];
  if (e.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(e) && e.text === 'undefined')) return [];
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [{ k: 'str', t: e.text }];
  if (ts.isTemplateExpression(e)) {
    // `${route}?url=...`: the head says nothing, so the first value does.
    if (e.head.text === '' && e.templateSpans.length) {
      const span = e.templateSpans[0];
      return resolve(span.expression, depth + 1).map((v) =>
        v.k === 'str' ? { k: 'pre', t: v.t + span.literal.text } : v.k === 'pre' ? v : UNK('template'),
      );
    }
    return [{ k: 'pre', t: e.head.text }];
  }
  if (ts.isObjectLiteralExpression(e)) return [{ k: 'obj', n: e }];
  if (ts.isArrayLiteralExpression(e)) {
    const items = [];
    for (const el of e.elements) {
      if (ts.isSpreadElement(el)) {
        for (const v of resolve(el.expression, depth + 1)) items.push(...(v.k === 'arr' ? v.items : [v]));
      } else items.push(...resolve(el, depth + 1));
    }
    return [{ k: 'arr', items }];
  }
  if (ts.isConditionalExpression(e)) return [...resolve(e.whenTrue, depth + 1), ...resolve(e.whenFalse, depth + 1)];
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return [...resolve(e.left, depth + 1), ...resolve(e.right, depth + 1)];
    }
    if (op === ts.SyntaxKind.PlusToken) {
      return resolve(e.left, depth + 1).map((v) => (v.k === 'str' || v.k === 'pre' ? { k: 'pre', t: v.t } : UNK('concatenation')));
    }
    return [UNK('expression')];
  }
  if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
    const method = e.expression.name.text;
    const recv = e.expression.expression;
    if (method === 'replace' && e.arguments.length === 2) {
      const [a, b] = e.arguments.map(unwrap);
      if ((ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && (ts.isStringLiteral(b) || ts.isNoSubstitutionTemplateLiteral(b))) {
        return resolve(recv, depth + 1).map((v) => (v.k === 'str' ? { k: 'str', t: v.t.replace(a.text, b.text) } : v));
      }
      return [UNK('replace')];
    }
    if (PASS_THROUGH.has(method)) return resolve(recv, depth + 1);
    if (method === 'find' || method === 'findLast' || method === 'at') {
      return resolve(recv, depth + 1).flatMap((v) => (v.k === 'arr' ? v.items : [UNK('find on a non-array')]));
    }
    // [...].map((x) => ({ href: ... })): the items are what the callback returns.
    const cb = e.arguments[0] && unwrap(e.arguments[0]);
    if ((method === 'map' || method === 'flatMap') && cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
      let items = returned(cb).flatMap((r) => resolve(r, depth + 1));
      if (method === 'flatMap') items = items.flatMap((v) => (v.k === 'arr' ? v.items : [v]));
      return [{ k: 'arr', items }];
    }
    return [UNK(`.${method}()`)];
  }
  if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) {
    const key = ts.isPropertyAccessExpression(e)
      ? e.name.text
      : ts.isStringLiteral(unwrap(e.argumentExpression)) || ts.isNumericLiteral(unwrap(e.argumentExpression))
        ? unwrap(e.argumentExpression).text
        : null;
    // RECORD[key] with a key known only at run time: any of its values.
    if (key === null) return resolve(e.expression, depth + 1).flatMap((v) => everyValue(v, depth));
    return resolve(e.expression, depth + 1).flatMap((v) => member(v, key, depth));
  }
  if (ts.isIdentifier(e)) return resolveIdentifier(e, depth);
  return [UNK(ts.SyntaxKind[e.kind])];
}

/** A property of a value: an object's property, every item's for an array. */
function member(v, key, depth) {
  if (v.k === 'obj') {
    for (const p of v.n.properties) {
      if (ts.isPropertyAssignment(p) && propName(p) === key) return resolve(p.initializer, depth + 1);
      if (ts.isShorthandPropertyAssignment(p) && p.name.text === key) return resolveIdentifier(p.name, depth + 1);
    }
    // Spreads may carry it.
    const spread = v.n.properties.filter(ts.isSpreadAssignment);
    if (spread.length) return spread.flatMap((s) => resolve(s.expression, depth + 1).flatMap((x) => member(x, key, depth + 1)));
    return [UNK(`no ${key}`)];
  }
  if (v.k === 'arr') {
    if (/^\d+$/.test(key)) return v.items[Number(key)] ? [v.items[Number(key)]] : [UNK('index')];
    if (key === 'length') return [UNK('length')];
    return v.items.flatMap((it) => member(it, key, depth + 1));
  }
  if (v.k === 'jsx') {
    // A component's props, read at each place it is rendered.
    for (const a of v.n.attributes.properties) {
      if (ts.isJsxSpreadAttribute(a)) return [UNK('spread props')];
      if (!ts.isJsxAttribute(a) || a.name.getText() !== key) continue;
      if (!a.initializer) return [UNK('boolean prop')];
      if (ts.isStringLiteral(a.initializer)) return [{ k: 'str', t: a.initializer.text }];
      if (ts.isJsxExpression(a.initializer) && a.initializer.expression) return resolve(a.initializer.expression, depth + 1);
      return [UNK('prop')];
    }
    return [];
  }
  if (v.k === 'unk') return [v];
  return [UNK(`member of a ${v.k}`)];
}

/** Every value an object or array holds, for an index known only at run time. */
function everyValue(v, depth) {
  if (v.k === 'arr') return v.items;
  if (v.k === 'obj') {
    return v.n.properties.flatMap((p) =>
      ts.isPropertyAssignment(p) ? resolve(p.initializer, depth + 1) : ts.isSpreadAssignment(p) ? resolve(p.expression, depth + 1).flatMap((x) => everyValue(x, depth + 1)) : [UNK('member')],
    );
  }
  return v.k === 'unk' ? [v] : [UNK('computed member')];
}

// Every JSX element in the app, by tag name: where a component is rendered,
// so a prop that becomes an href can be read at each call site.
let tagIndex = null;
function rendered(name) {
  if (!tagIndex) {
    tagIndex = new Map();
    for (const file of walk(APP)) {
      const sf = sourceOf(file);
      if (!sf || !/\.tsx$/.test(file)) continue;
      const visit = (n) => {
        if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
          const t = n.tagName.getText();
          if (!tagIndex.has(t)) tagIndex.set(t, []);
          tagIndex.get(t).push(n);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  }
  return tagIndex.get(name) || [];
}

/** The component name of a function, if it is one (Capitalized). */
function componentName(fn) {
  if (ts.isFunctionDeclaration(fn) && fn.name) return /^[A-Z]/.test(fn.name.text) ? fn.name.text : null;
  const d = fn.parent;
  if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name)) {
    return /^[A-Z]/.test(d.name.text) ? d.name.text : null;
  }
  return null;
}

function propName(p) {
  const n = p.name;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  return null;
}

function resolveIdentifier(id, depth) {
  const b = binding(id);
  if (!b) return [UNK(`unbound ${id.text}`)];
  if (b.kind === 'var') {
    if (!b.decl.initializer) return [UNK('no initializer')];
    let vals = resolve(b.decl.initializer, depth + 1);
    for (const key of b.path) vals = vals.flatMap((v) => member(v, key, depth));
    return vals;
  }
  if (b.kind === 'import') {
    const file = resolveModule(id.getSourceFile().fileName, b.spec);
    if (!file) return [UNK(`import from ${b.spec}`)];
    const init = exportedInit(file, b.imported, new Set());
    return init ? resolve(init.node, depth + 1) : [UNK(`export ${b.imported}`)];
  }
  if (b.kind === 'param') {
    // The item of ARRAY.map((item) => ...) and its siblings.
    const fn = b.fn;
    const call = fn.parent;
    if (
      (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
      call &&
      ts.isCallExpression(call) &&
      call.arguments[0] === fn &&
      fn.parameters[0] === b.param &&
      ts.isPropertyAccessExpression(call.expression) &&
      ITEM_OF.has(call.expression.name.text)
    ) {
      let vals = resolve(call.expression.expression, depth + 1).flatMap((v) => (v.k === 'arr' ? v.items : [UNK('map over a non-array')]));
      for (const key of b.path) vals = vals.flatMap((v) => member(v, key, depth));
      return vals;
    }
    // A component's props: what each place that renders it passes.
    const comp = fn.parameters[0] === b.param ? componentName(fn) : null;
    if (comp) {
      const sites = rendered(comp);
      if (!sites.length) return [UNK(`${comp} is never rendered`)];
      let vals = sites.map((n) => ({ k: 'jsx', n }));
      for (const key of b.path) vals = vals.flatMap((v) => member(v, key, depth + 1));
      return vals;
    }
    return [UNK(`parameter ${id.text}`)];
  }
  return [UNK('binding')];
}

// ── Scan ────────────────────────────────────────────────────────────────────

function linkName(sf) {
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.moduleSpecifier.text === 'next/link' && st.importClause?.name) {
      return st.importClause.name.text;
    }
  }
  return null;
}

/** Whether the function around a link tests the same href with
    isNonPageHref() (app/lib/route-link.tsx): RouteLink's own next/link is only
    reached for a page, so its href's possible values are not its targets. */
function guarded(node, hrefText) {
  for (let n = node.parent; n; n = n.parent) {
    if (!ts.isFunctionLike(n) || !n.body) continue;
    let hit = false;
    const visit = (c) => {
      if (hit) return;
      if (
        ts.isCallExpression(c) &&
        ts.isIdentifier(c.expression) &&
        c.expression.text === 'isNonPageHref' &&
        c.arguments[0] &&
        c.arguments[0].getText() === hrefText
      ) {
        hit = true;
        return;
      }
      ts.forEachChild(c, visit);
    };
    visit(n.body);
    if (hit) return true;
  }
  return false;
}

const findings = [];
const unread = [];
let links = 0;
let guardedLinks = 0;

for (const file of walk(APP)) {
  const sf = sourceOf(file);
  if (!sf) continue;
  const Link = linkName(sf);
  if (!Link) continue;
  const rel = path.relative(APP_ROOT, file).replace(/\\/g, '/');
  const visit = (node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText() === Link) {
      links++;
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const attr = node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === 'href');
      const expr = attr && attr.initializer && ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : null;
      if (expr && guarded(node, expr.getText())) {
        guardedLinks++;
        ts.forEachChild(node, visit);
        return;
      }
      let vals;
      if (!attr || !attr.initializer) vals = [UNK('no href')];
      else if (ts.isStringLiteral(attr.initializer)) vals = [{ k: 'str', t: attr.initializer.text }];
      else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        vals = resolve(attr.initializer.expression).flatMap((v) => (v.k === 'obj' ? member(v, 'pathname', 0) : [v]));
      } else vals = [UNK('href')];
      const hrefText = attr && attr.initializer ? attr.initializer.getText().replace(/\s+/g, ' ').slice(0, 70) : '(none)';
      const seen = new Set();
      let resolved = false;
      for (const v of vals) {
        if (v.k === 'str' || v.k === 'pre') {
          resolved = true;
          const why = nonPage(v.t, { prefixOnly: v.k === 'pre' });
          const key = `${v.t}|${why}`;
          if (why && !seen.has(key)) {
            seen.add(key);
            findings.push({ file: rel, line, href: hrefText, target: v.k === 'pre' ? `${v.t}…` : v.t, why });
          }
        }
      }
      if (!resolved || vals.some((v) => v.k === 'unk')) {
        unread.push({ file: rel, line, href: hrefText, why: [...new Set(vals.filter((v) => v.k === 'unk').map((v) => v.why))].join(', ') || 'no string' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Guard the guard: a scan that found no links read nothing, and would pass.
if (links < 20) {
  findings.push({ file: '(scan)', line: 0, href: '', target: '', why: `only ${links} next/link elements found under app/; the scan cannot be reading the app` });
}

if (asJson) {
  console.log(JSON.stringify({ ok: findings.length === 0, links, unread: unread.length, findings, ...(verbose ? { unreadList: unread } : {}) }, null, 2));
} else if (!findings.length) {
  console.log(`[link-targets] OK - ${links} next/link elements, none points at an endpoint or a file (${guardedLinks} behind isNonPageHref, ${unread.length} with an href read only at run time)`);
  if (verbose) for (const u of unread) console.log(`  unread ${u.file}:${u.line}  ${u.href}  (${u.why})`);
} else {
  for (const f of findings) console.log(`  FAIL ${f.file}:${f.line}  href=${f.href}  -> ${f.target} is ${f.why}`);
  console.log(`[link-targets] ${findings.length} next/link target(s) are not pages.`);
  console.log('  next/link prefetches its href as a page (GET ?_rsc=), so an endpoint answers 405 and a file');
  console.log('  sends its body to a prefetch. Use a plain <a href> (keep its classes and attributes), or');
  console.log('  RouteLink from app/lib/route-link.tsx where one list mixes pages and files.');
  if (verbose) for (const u of unread) console.log(`  unread ${u.file}:${u.line}  ${u.href}  (${u.why})`);
}
process.exit(findings.length ? 1 : 0);
