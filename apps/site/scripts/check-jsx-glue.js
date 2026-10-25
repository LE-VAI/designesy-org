#!/usr/bin/env node
/**
 * JSX glue gate: no JSX spacing may lose the space between two words, on the
 * page or in an accessible name.
 *
 * WHY THIS EXISTS
 * JSX removes whitespace that contains a line break when it sits between text
 * and an element or an {expression}. So a sentence that wraps right before
 * one renders with the space gone. On 2026-09-28 five of these were live:
 *
 *     "run live verification: the42-check score engine"   (/docs/mcp)
 *     "/score —42 automated checks"                         (/badge)
 *     "(warnings count as half).42 checks total"            (/badge)
 *     "...the lint that enforces it.Machine export."        (/contracts/guardrails)
 *     "...a watched series.Machine export."                 (/contracts/monitor)
 *
 * Every other check passed them. The build is valid JSX, the numbers are
 * right, prose-lint reads text with its whitespace already collapsed, and a
 * skim reads the sentence the author meant. It takes reading the rendered
 * characters one at a time, which is what this does, from the source.
 *
 * A space can also be on the page and missing from a name. React's server
 * render puts a <!-- --> marker between two adjacent text children, and
 * Chrome can leave a text node that holds only whitespace out of a name it
 * computes from content when the node sits next to such a marker. On
 * 2026-10-21 the /methodology summaries showed "13 checks · 13 scored" and
 * were named "13checks ·13 scored", and its rule tables' row headers showed
 * "S1 Overused fonts" and were named "S1Overused fonts" (Chrome 155,
 * react-dom 19.3).
 *
 * WHAT IT FLAGS
 * 1. wrap  A JSX text run and an inline neighbour (an {expression}, a Link, a
 *          span, strong, em, code, CountUp...) separated only by whitespace
 *          that contains a line break, where the characters on both sides are
 *          ones a space normally sits between: a word or closing punctuation
 *          before, a letter or digit after.
 * 2. name  A child that renders only whitespace ({' '}, a const that holds
 *          one, an array item ' ', or spaces between two children on one
 *          line) next to a child that renders text (JSX text, an
 *          {expression} that can be a string or a number, or a component
 *          whose definition returns one), anywhere inside an element whose
 *          name is computed from its content: a, Link, button, summary,
 *          h1-h6, th, td, dt, label, legend, caption, option, an element
 *          whose role takes its name from content (link, button, tab, cell,
 *          heading...), an element that a literal aria-labelledby points to,
 *          and a component prop that its component renders into one of those
 *          (DataTable puts each row's first cell in a <th scope="row">). A
 *          whitespace child at a fragment's edge is checked against the
 *          child outside the fragment, and when a .map() or .flatMap()
 *          callback returns the fragment, against the call's neighbours and
 *          the next item's other edge. In inline content Chrome 155 drops
 *          the space from the name; in an inline-flex or grid container it
 *          puts a space between the items, so the name reads right only
 *          because of the layout. The gate flags both.
 *
 * THE FIX
 * Keep the space inside a text run that also holds a word:
 *   - wrap the line one word earlier, so the word and its neighbour share a
 *     line and the space sits inside the text:
 *
 *         ...the same run                       ...scored once, by the
 *         your <Link>/score</Link> report       same {COUNT} checks the score page
 *
 *   - or write the space into the neighbouring text or string: Fixes <span>,
 *     {` ${value}`}, {`${n} ${noun}`}.
 * {' '} is safe between two host elements (span, b, code...): no text beside
 * it, so no marker. A component counts as text when its definition returns a
 * string, a number, a prop or a fragment with text at that edge, so {' '}
 * beside <Num n={3} /> is not safe when Num returns <>{n}</>.
 *
 * WHAT IT DOES NOT FLAG
 *   - wrap: {' '}, {' · Lab'} and any string that brings its own leading space;
 *   - wrap: an element whose content starts with a space or with punctuation
 *     (the wordmark's <span>.</span>, <span aria-hidden> →</span>);
 *   - wrap: block elements and empty self-closing tags, which carry no inline
 *     text;
 *   - wrap: text that starts with punctuation after an element
 *     ("</a>. Include");
 *   - wrap: the same boundary on ONE line: "v{version}" and "pt{plural}" are
 *     deliberate, and JSX keeps same-line spacing exactly as written;
 *   - name: an element named by a literal aria-label or aria-labelledby, and
 *     anything under aria-hidden="true";
 *   - name: an {expression} that clearly renders an element: JSX,
 *     cond && <El />, a .map() whose callback returns JSX. Any other value
 *     counts as text, except a component's own {children}, which counts as
 *     what its callers pass (CopyRow's one caller passes elements);
 *   - name: JSX that reaches a name in a way the gate does not follow. It
 *     follows JSX written inside such an element, and props a component
 *     renders into one, through .map() callbacks, property reads,
 *     destructuring and other components' props. It does not follow JSX kept
 *     in a variable, context, state or a helper function's return value;
 *   - name: a component with no definition under app/ (next/link, a
 *     package's icon), which counts as an element; a whitespace string
 *     imported from another module; an id that aria-labelledby or the
 *     element gets from an expression.
 *
 * Usage:  node scripts/check-jsx-glue.js [--json] [--self-test]
 * --self-test runs both clauses on sources built to break them and on safe
 * forms, and exits 1 if any is misjudged. Every scan runs it first, so a
 * clause that cannot fire never reads as a clean tree.
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const APP = path.join(__dirname, '..', 'app');

const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp',
  'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var',
  // Components that render inline text.
  'Link', 'CountUp',
]);

// A space normally sits after these and before letters or digits.
const WORD_END = /[\p{L}\p{N}.,;:!?)\]'"’”%]$/u;
const WORD_START = /^[\p{L}\p{N}]/u;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const tagName = (el) => (ts.isJsxElement(el) ? el.openingElement : el).tagName.getText();

const isStr = (e) => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e);

/**
 * The first or last character an expression can render, or null when it renders
 * nothing or starts (ends) with whitespace. An unknown value counts as a word.
 * `cond ? 's' : ''` is a deliberate plural suffix and is never flagged.
 */
function exprEdge(e, which) {
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (isStr(e)) return e.text.length ? (which === 'first' ? e.text[0] : e.text[e.text.length - 1]) : null;
  if (ts.isTemplateExpression(e)) {
    if (which === 'first') return e.head.text.length ? e.head.text[0] : 'x';
    const tail = e.templateSpans[e.templateSpans.length - 1].literal.text;
    return tail.length ? tail[tail.length - 1] : 'x';
  }
  if (ts.isConditionalExpression(e)) {
    const [a, b] = [e.whenTrue, e.whenFalse].map((x) => { while (ts.isParenthesizedExpression(x)) x = x.expression; return x; });
    if (isStr(a) && isStr(b) && [a.text, b.text].includes('') && [a.text, b.text].some((t) => /^[a-z]{1,3}$/.test(t))) return null;
    return [exprEdge(a, which), exprEdge(b, which)].find((c) => c && /[\p{L}\p{N}]/u.test(c)) || null;
  }
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return exprEdge(e.right, which);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return [exprEdge(e.left, which), exprEdge(e.right, which)].find((c) => c && /[\p{L}\p{N}]/u.test(c)) || null;
    }
  }
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return edgeChar(e, which);
  return 'x';
}

/** The first or last visible character an inline child renders, or null when unknown or none. */
function edgeChar(node, which) {
  if (ts.isJsxExpression(node)) {
    if (!node.expression) return null; // {/* comment */}
    return exprEdge(node.expression, which);
  }
  if (ts.isJsxFragment(node)) {
    const kids = node.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()));
    if (!kids.length) return null;
    const k = which === 'first' ? kids[0] : kids[kids.length - 1];
    if (ts.isJsxText(k)) { const raw = k.text; return which === 'first' ? raw[0] : raw[raw.length - 1]; }
    return edgeChar(k, which);
  }
  if (ts.isJsxSelfClosingElement(node)) {
    const name = tagName(node);
    return /^[A-Z]/.test(name) && INLINE.has(name) ? 'x' : null; // <CountUp /> renders a number
  }
  if (ts.isJsxElement(node)) {
    if (!INLINE.has(tagName(node))) return null;
    const kids = node.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()));
    if (!kids.length) return null;
    const k = which === 'first' ? kids[0] : kids[kids.length - 1];
    if (ts.isJsxText(k)) {
      // .text keeps the leading and trailing whitespace; getText() drops it.
      const raw = k.text;
      return which === 'first' ? raw[0] : raw[raw.length - 1];
    }
    return edgeChar(k, which);
  }
  return null;
}

// ---- clause 2: names -------------------------------------------------------

// Elements whose accessible name is computed from their content.
const NAME_FROM_CONTENT = new Set([
  'a', 'Link', 'button', 'summary', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'th', 'td', 'dt', 'label', 'legend', 'caption',
  'option',
]);
const NAME_FROM_CONTENT_ROLES = new Set([
  'link', 'button', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem', 'cell',
  'gridcell', 'columnheader', 'rowheader', 'heading', 'switch', 'checkbox', 'radio', 'tooltip', 'term',
]);

// Ids that a literal aria-labelledby points to: that element's content names another one.
let LABELLED_IDS = new Set();

function labelledIds(sources) {
  const ids = new Set();
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const v = literalAttr(attrOf(node, 'aria-labelledby'));
      if (typeof v === 'string') v.split(/\s+/).filter(Boolean).forEach((id) => ids.add(id));
    }
    ts.forEachChild(node, visit);
  };
  sources.forEach(visit);
  return ids;
}

const attrsOf = (el) => (ts.isJsxElement(el) ? el.openingElement : el).attributes.properties;
const attrOf = (el, name) => attrsOf(el).find((p) => ts.isJsxAttribute(p) && p.name.getText() === name);

/** An attribute's literal value: a string, true, null for an expression, undefined when absent. */
function literalAttr(a) {
  if (!a) return undefined;
  if (!a.initializer) return true; // <span aria-hidden>
  if (ts.isStringLiteral(a.initializer)) return a.initializer.text;
  const e = a.initializer.expression;
  if (e && isStr(e)) return e.text;
  if (e && e.kind === ts.SyntaxKind.TrueKeyword) return true;
  return null;
}

/** Whether this host element's name is computed from its content. */
function namedByContent(el) {
  const role = literalAttr(attrOf(el, 'role'));
  if (!(typeof role === 'string' ? NAME_FROM_CONTENT_ROLES.has(role) : NAME_FROM_CONTENT.has(tagName(el)))) return false;
  // A literal aria-label or aria-labelledby names it instead of its content.
  return !['aria-label', 'aria-labelledby'].some((n) => typeof literalAttr(attrOf(el, n)) === 'string');
}

const hiddenFromNames = (el) => [true, 'true'].includes(literalAttr(attrOf(el, 'aria-hidden')));

function unwrap(e) {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) {
    e = e.expression;
  }
  return e;
}

// JSX drops whitespace-only text that holds a line break, and {/* comments */}.
const dropped = (k) => (ts.isJsxText(k) && !k.text.trim() && /\n/.test(k.text)) || (ts.isJsxExpression(k) && !k.expression);

const WHITESPACE = /^[ \t\n\r\f]+$/;

/** An expression that renders only whitespace: ' ', " ", or a const in this file that holds one. */
function blankExpr(e) {
  e = unwrap(e);
  if (isStr(e)) return WHITESPACE.test(e.text);
  if (!ts.isIdentifier(e)) return false;
  const d = declOf(e);
  const init = d && d.kind === 'var' && !d.path.length ? unwrap(d.node.initializer) : null;
  return !!init && isStr(init) && WHITESPACE.test(init.text);
}

/** A child that renders only whitespace: {' '}, {" "}, {sp}, or spaces between two children on one line. */
function blank(k) {
  if (ts.isJsxText(k)) return /^[ \t]+$/.test(k.text);
  return ts.isJsxExpression(k) && !!k.expression && blankExpr(k.expression);
}

/** The array literals an expression renders as a list of siblings: [' ', <b />], cond && [...]. */
function arraysIn(e) {
  e = unwrap(e);
  if (ts.isArrayLiteralExpression(e)) return [e];
  if (ts.isConditionalExpression(e)) return [...arraysIn(e.whenTrue), ...arraysIn(e.whenFalse)];
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return arraysIn(e.right);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return [...arraysIn(e.left), ...arraysIn(e.right)];
    }
  }
  return [];
}

/**
 * Whether an expression can render a text node at its own level, where React
 * would put a marker beside a neighbouring text child. Unknown values count as
 * text; host elements, `cond && <El />` and a .map() whose callback returns
 * them do not. A component counts as what its definition returns.
 */
function exprRendersText(e, side) {
  e = unwrap(e);
  if (isStr(e)) return e.text.length > 0;
  if (ts.isTemplateExpression(e) || ts.isNumericLiteral(e) || ts.isBigIntLiteral(e)) return true;
  if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(e.kind)) return false;
  if (ts.isIdentifier(e) && e.text === 'undefined') return false;
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e)) return elementRendersText(e, side);
  if (ts.isJsxFragment(e)) return childrenRenderText(e.children, side);
  if (ts.isConditionalExpression(e)) return exprRendersText(e.whenTrue, side) || exprRendersText(e.whenFalse, side);
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return exprRendersText(e.right, side);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return exprRendersText(e.left, side) || exprRendersText(e.right, side);
    }
  }
  if (ts.isArrayLiteralExpression(e)) {
    const els = e.elements;
    return els.length > 0 && exprRendersText(side === 'first' ? els[0] : els[els.length - 1], side);
  }
  if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && ['map', 'flatMap'].includes(e.expression.name.text)) {
    const cb = e.arguments[0] && unwrap(e.arguments[0]);
    if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
      return returnsOf(cb).some((r) => exprRendersText(r, side));
    }
  }
  // A component's own {children}: what its callers pass.
  const comp = childrenPropOf(e);
  if (comp && CHILD_TEXT.has(comp)) return CHILD_TEXT.get(comp)[side];
  return true;
}

// For each component, whether any caller's children render text at the first
// or last edge. A component with no caller in the tree counts as text.
let CHILD_TEXT = new Map();

// Component name -> the expressions its definitions in the tree return.
let RETURNS = new Map();
const VISITING = new Set();

/** The expressions a function returns: a concise arrow's body, or each return statement's value. */
function returnsOf(fn) {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out = [];
  const find = (n) => {
    if (ts.isReturnStatement(n)) {
      if (n.expression) out.push(n.expression);
    } else if (!ts.isFunctionLike(n)) ts.forEachChild(n, find);
  };
  ts.forEachChild(fn.body, find);
  return out;
}

function componentReturns(sources) {
  const map = new Map();
  const visit = (node) => {
    if (ts.isFunctionLike(node)) {
      const name = componentNameOf(node);
      if (name) map.set(name, [...(map.get(name) || []), ...returnsOf(node)]);
    }
    ts.forEachChild(node, visit);
  };
  sources.forEach(visit);
  return map;
}

/**
 * Whether an element renders a text node at its own level. A host element
 * never does: its text sits inside its own node. A component does when a
 * definition of it in the tree returns text at that edge: a string, a number,
 * a prop, or a fragment that starts (ends) with one. <Num n={3} /> with
 * Num returning <>{n}</> renders "3" beside its neighbours. A component with
 * no definition in the tree (next/link) counts as an element.
 */
function elementRendersText(el, side) {
  const name = tagName(el);
  if (!isComponentName(name) || !RETURNS.has(name) || VISITING.has(name)) return false;
  VISITING.add(name);
  try {
    return RETURNS.get(name).some((r) => exprRendersText(r, side));
  } finally {
    VISITING.delete(name);
  }
}

/** The component whose own children an expression reads (`children`, `props.children`), or null. */
function childrenPropOf(e) {
  const viaProps = ts.isPropertyAccessExpression(e) && e.name.text === 'children';
  const id = viaProps ? e.expression : e;
  if (!ts.isIdentifier(id)) return null;
  const d = declOf(id);
  if (!d || d.kind !== 'param' || d.fn.parameters[0] !== d.node) return null;
  const own = viaProps ? d.path.length === 0 : d.path.length === 1 && d.path[0] === 'children';
  return own ? componentNameOf(d.fn) : null;
}

function childText(sources) {
  const map = new Map();
  const add = (name, first, last) => {
    const t = map.get(name) || { first: false, last: false };
    map.set(name, { first: t.first || first, last: t.last || last });
  };
  const visit = (node) => {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && isComponentName(tagName(node))) {
      const viaProp = !!attrOf(node, 'children');
      const kids = ts.isJsxElement(node) ? node.children : [];
      add(tagName(node), viaProp || childrenRenderText(kids, 'first'), viaProp || childrenRenderText(kids, 'last'));
    }
    ts.forEachChild(node, visit);
  };
  sources.forEach(visit);
  return map;
}

/** The .map() or .flatMap() call whose callback `p` returns `n` from, or null. */
function mapCallReturning(p, n) {
  let fn = null;
  if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && p.body === n) fn = p;
  else if (ts.isReturnStatement(p)) for (fn = p.parent; fn && !ts.isFunctionLike(fn); fn = fn.parent);
  const call = fn && fn.parent;
  if (!call || !ts.isCallExpression(call) || call.arguments[0] !== fn) return null;
  return ts.isPropertyAccessExpression(call.expression) && ['map', 'flatMap'].includes(call.expression.name.text)
    ? call
    : null;
}

/**
 * The children just outside a fragment, before or after it. A fragment's children
 * render in the list around it, so a space at its edge meets that neighbour:
 * Fixes{n > 0 && <>{' '}<b>{n}</b></>} puts the space beside "Fixes". A
 * fragment that a .map() or .flatMap() callback returns renders once per item,
 * so its edge also meets the next (previous) item's other edge, and the items
 * together meet the call's neighbours: Fixes{xs.map((x) => <>{' '}<b>{x}</b></>)}.
 */
function outside(list, dir) {
  if (!ts.isJsxFragment(list)) return [];
  const step = dir === 'prev' ? -1 : 1;
  const found = [];
  let frag = list;
  let n = list;
  for (let p = n.parent; p; n = p, p = p.parent) {
    if (ts.isParenthesizedExpression(p) || ts.isBinaryExpression(p) || ts.isJsxExpression(p)
      || (ts.isConditionalExpression(p) && p.condition !== n)) continue;
    const call = mapCallReturning(p, n);
    if (call) {
      const live = frag.children.filter((k) => !dropped(k));
      const other = dir === 'next' ? live[0] : live[live.length - 1];
      if (other && !blank(other)) found.push(other);
      p = call;
      continue;
    }
    if (!ts.isJsxElement(p) && !ts.isJsxFragment(p)) return found;
    const kids = p.children;
    let i = kids.indexOf(n) + step;
    while (i >= 0 && i < kids.length && dropped(kids[i])) i += step;
    if (i >= 0 && i < kids.length) return [...found, kids[i]];
    if (!ts.isJsxFragment(p)) return found;
    frag = p;
  }
  return found;
}

/** Whether the first (or last) rendered child of a list is a text node at that level. */
function childrenRenderText(kids, side) {
  const live = kids.filter((k) => !dropped(k));
  return live.length > 0 && rendersText(side === 'first' ? live[0] : live[live.length - 1], side);
}

/** Whether a JSX child (or an array item) renders a text node at that edge of its level. */
function rendersText(k, side) {
  if (ts.isJsxText(k)) return true;
  if (ts.isJsxExpression(k)) return !!k.expression && exprRendersText(k.expression, side);
  return exprRendersText(k, side); // an element, a component, a fragment or an array item
}

// ---- which component props end up in a name -------------------------------

const isComponentName = (s) => /^[A-Z]/.test(s);

/**
 * The component a function node defines, if any: `function Name(...)`,
 * `const Name = (...) =>`, or either wrapped in forwardRef() or memo().
 */
function componentNameOf(fn) {
  if (ts.isFunctionDeclaration(fn) && fn.name && isComponentName(fn.name.text)) return fn.name.text;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return null;
  let at = fn;
  const callee = (c) => (ts.isPropertyAccessExpression(c) ? c.name.text : ts.isIdentifier(c) ? c.text : '');
  if (ts.isCallExpression(at.parent) && at.parent.arguments[0] === at && ['forwardRef', 'memo'].includes(callee(at.parent.expression))) {
    at = at.parent;
  }
  if (ts.isVariableDeclaration(at.parent)) {
    const n = at.parent.name;
    if (ts.isIdentifier(n) && isComponentName(n.text)) return n.text;
  }
  return null;
}

/** The property path from a binding pattern's root to `name`, or null when the pattern does not bind it. */
function bindingPath(pattern, name) {
  if (ts.isIdentifier(pattern)) return pattern.text === name ? [] : null;
  for (const el of pattern.elements) {
    if (ts.isOmittedExpression(el)) continue;
    const key = ts.isObjectBindingPattern(pattern)
      ? el.dotDotDotToken ? '...' : (el.propertyName || el.name).getText()
      : '[]';
    const sub = bindingPath(el.name, name);
    if (sub) return [key, ...sub];
  }
  return null;
}

/** Where an identifier is declared: { kind: 'param' | 'var', node, path }. */
function declOf(id) {
  for (let n = id.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) {
      for (const p of n.parameters) {
        const pathTo = bindingPath(p.name, id.text);
        if (pathTo) return { kind: 'param', node: p, fn: n, path: pathTo };
      }
    }
    const stmts = ts.isBlock(n) || ts.isSourceFile(n) ? n.statements : [];
    for (const st of stmts) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        const pathTo = bindingPath(d.name, id.text);
        if (pathTo && d.initializer) return { kind: 'var', node: d, path: pathTo };
      }
    }
    if ((ts.isForOfStatement(n) || ts.isForInStatement(n)) && ts.isVariableDeclarationList(n.initializer)) {
      for (const d of n.initializer.declarations) {
        const pathTo = bindingPath(d.name, id.text);
        if (pathTo) return { kind: 'loop', node: n, path: pathTo };
      }
    }
  }
  return null;
}

/**
 * The props of `fn` (a component) that an expression's value comes from:
 * 'rows' for `rows`, `props.rows`, `rows.map((r) => r)[0]`... and '*' for the
 * props object or a ...rest of it, which carries children.
 */
function propsBehind(e, fn, seen = new Set()) {
  e = unwrap(e);
  if (seen.has(e)) return [];
  seen.add(e);
  const out = [];
  if (ts.isIdentifier(e)) {
    const d = declOf(e);
    if (!d) return out;
    if (d.kind === 'param' && d.fn === fn && fn.parameters[0] === d.node) {
      if (!d.path.length || d.path[0] === '...') out.push('*');
      else out.push(d.path[0]);
    } else if (d.kind === 'param') {
      // An element of an array that is mapped: xs.map((x) => ...), xs.map(({ a }) => ...).
      const call = d.fn.parent;
      if (call && ts.isCallExpression(call) && call.arguments[0] === d.fn && d.fn.parameters[0] === d.node
        && ts.isPropertyAccessExpression(call.expression)) {
        out.push(...propsBehind(call.expression.expression, fn, seen));
      }
    } else if (d.kind === 'var') {
      const from = propsBehind(d.node.initializer, fn, seen);
      // const { rows } = props: a key read from the props object is that prop.
      for (const p of from) out.push(p === '*' && d.path.length && d.path[0] !== '...' && d.path[0] !== '[]' ? d.path[0] : p);
    } else if (d.kind === 'loop') {
      out.push(...propsBehind(d.node.expression, fn, seen));
    }
    return out;
  }
  if (ts.isPropertyAccessExpression(e)) {
    for (const p of propsBehind(e.expression, fn, seen)) out.push(p === '*' ? e.name.text : p);
    return out;
  }
  if (ts.isElementAccessExpression(e)) return propsBehind(e.expression, fn, seen);
  if (ts.isConditionalExpression(e)) return [...propsBehind(e.whenTrue, fn, seen), ...propsBehind(e.whenFalse, fn, seen)];
  if (ts.isBinaryExpression(e)) return [...propsBehind(e.left, fn, seen), ...propsBehind(e.right, fn, seen)];
  if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)
    && ['slice', 'filter', 'concat', 'flat', 'reverse', 'toReversed', 'toSorted', 'at'].includes(e.expression.name.text)) {
    return propsBehind(e.expression.expression, fn, seen);
  }
  return out;
}

/**
 * Walk the JSX in one source with the name context each child list sits in:
 * false, or the label of the element or prop whose name it feeds. `naming`
 * maps a component to the props it renders into a name ('children' for its
 * content). `onList(node, label)` sees every element's and fragment's
 * children; `onValue(expr, label)` sees every JSX {expression} child and
 * every prop value placed in a name.
 */
function walkJsx(sf, naming, onList, onValue) {
  const visitAttrs = (el, label) => {
    const name = tagName(el);
    const props = isComponentName(name) ? naming.get(name) : null;
    for (const a of attrsOf(el)) {
      if (ts.isJsxSpreadAttribute(a)) {
        if (label) onValue(a.expression, label);
        visit(a.expression, false);
        continue;
      }
      const into = props && props.has(a.name.getText()) ? `${name} ${a.name.getText()}` : false;
      if (into && a.initializer) {
        const v = ts.isJsxExpression(a.initializer) ? a.initializer.expression : a.initializer;
        if (v) onValue(v, into);
      }
      if (a.initializer) visit(a.initializer, into);
    }
  };
  const visit = (node, label) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = tagName(node);
      let inner = label;
      if (hiddenFromNames(node)) inner = false;
      else if (!label && !isComponentName(name) && namedByContent(node)) inner = `<${name}>`;
      else if (!label && name === 'Link' && namedByContent(node)) inner = '<Link>';
      else if (!label && isComponentName(name) && naming.get(name)?.has('children')) inner = `${name} children`;
      else if (!label && !isComponentName(name) && LABELLED_IDS.has(literalAttr(attrOf(node, 'id')))) {
        inner = `<${name} id="${literalAttr(attrOf(node, 'id'))}">`;
      }
      // A spread on an element in a name passes the props object, children included.
      visitAttrs(node, inner && (!isComponentName(name) || name === 'Link') ? inner : false);
      if (ts.isJsxSelfClosingElement(node)) return;
      onList(node, inner);
      for (const c of node.children) {
        if (ts.isJsxExpression(c) && c.expression && inner) onValue(c.expression, inner);
        visit(c, inner);
      }
      return;
    }
    if (ts.isJsxFragment(node)) {
      onList(node, label);
      for (const c of node.children) {
        if (ts.isJsxExpression(c) && c.expression && label) onValue(c.expression, label);
        visit(c, label);
      }
      return;
    }
    ts.forEachChild(node, (c) => visit(c, label));
  };
  visit(sf, false);
}

/** Component name -> the props it renders inside a name. Found to a fixed point across all sources. */
function namingProps(sources) {
  const naming = new Map();
  for (let changed = true, round = 0; changed && round < 10; round++) {
    changed = false;
    for (const sf of sources) {
      walkJsx(sf, naming, () => {}, (expr, label) => {
        for (let fn = expr.parent; fn; fn = fn.parent) {
          if (!ts.isFunctionLike(fn)) continue;
          const comp = componentNameOf(fn);
          if (!comp) continue;
          for (const p of propsBehind(expr, fn)) {
            const prop = p === '*' ? 'children' : p;
            if (!naming.has(comp)) naming.set(comp, new Set());
            if (!naming.get(comp).has(prop)) { naming.get(comp).add(prop); changed = true; }
          }
          break;
        }
      });
    }
  }
  return naming;
}

// ---- scan -----------------------------------------------------------------

/** Every finding in a set of .tsx sources ({ rel, src }): `wrap` (clause 1) and `name` (clause 2). */
function scanSources(files) {
  const sources = files.map(({ rel, src }) => ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  LABELLED_IDS = labelledIds(sources);
  RETURNS = componentReturns(sources);
  const naming = namingProps(sources);
  // Callers' children are read with every component's own {children} counted as text.
  CHILD_TEXT = new Map();
  CHILD_TEXT = childText(sources);
  const out = [];
  for (const sf of sources) {
    const report = (kind, node, before, after, extra = {}) => {
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      out.push({ kind, file: sf.fileName, line, before: before.slice(-40), after: after.slice(0, 40), ...extra });
    };
    walkJsx(sf, naming, (node, label) => {
      const kids = node.children;
      // The rendered neighbours of child i: JSX drops whitespace with a line break, and comments.
      const around = (i) => {
        let p = i - 1;
        while (p >= 0 && dropped(kids[p])) p--;
        let n = i + 1;
        while (n < kids.length && dropped(kids[n])) n++;
        return { prevs: p >= 0 ? [kids[p]] : outside(node, 'prev'), nexts: n < kids.length ? [kids[n]] : outside(node, 'next') };
      };
      const check = (k, space, prevs, nexts) => {
        if (prevs.some((x) => rendersText(x, 'last')) || nexts.some((x) => rendersText(x, 'first'))) {
          report('name', k, prevs[0] ? prevs[0].getText() : '', nexts[0] ? nexts[0].getText() : '', { space, in: label });
        }
      };
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        if (label && blank(k)) {
          const { prevs, nexts } = around(i);
          check(k, ts.isJsxText(k) ? JSON.stringify(k.text) : k.getText(), prevs, nexts);
        }
        // An array's items render as siblings in this list: Fixes{[' ', <b key="b">12</b>]}.
        if (label && ts.isJsxExpression(k) && k.expression) {
          for (const arr of arraysIn(k.expression)) {
            const els = arr.elements;
            els.forEach((el, j) => {
              if (!blankExpr(el)) return;
              const out = around(i);
              check(el, el.getText(), j > 0 ? [els[j - 1]] : out.prevs, j < els.length - 1 ? [els[j + 1]] : out.nexts);
            });
          }
        }
        if (!ts.isJsxText(k)) continue;
        const raw = k.text;
        if (!raw.trim()) continue;
        // Text, then a line break, then an inline neighbour.
        const next = kids[i + 1];
        if (next && /\S[ \t]*\r?\n\s*$/.test(raw)) {
          const end = raw.trimEnd();
          const c = edgeChar(next, 'first');
          if (c && WORD_END.test(end) && WORD_START.test(c)) report('wrap', k, end, next.getText());
        }
        // An inline neighbour, then a line break, then text.
        const prev = kids[i - 1];
        if (prev && /^\s*\n\s*\S/.test(raw)) {
          const start = raw.trimStart();
          const c = edgeChar(prev, 'last');
          if (c && WORD_START.test(start) && WORD_END.test(c)) report('wrap', k, prev.getText(), start);
        }
      }
    }, () => {});
  }
  return out;
}

// ---- self-test --------------------------------------------------------------

// Each case: sources, and the findings the gate must report ([kind, line] pairs).
const SELF_TEST = [
  ['wrap: text, line break, expression', ['<a href="#a">\n  Label:\n  {value}\n</a>'], [['wrap', 2]]],
  ['wrap: text, line break, Link', ['<p>\n  the same run your\n  <Link href="/score">score</Link> report shows.\n</p>'], [['wrap', 2]]],
  ['wrap: Link, line break, text', ['<p>\n  <Link href="/score">score</Link>\n  report shows.\n</p>'], [['wrap', 3]]],
  ["name: text {' '} element", [`<a href="#">Fixes{' '}<span>12</span></a>`], [['name', 1]]],
  ["name: element {' '} text", [`<button><span>12</span>{' '}checks</button>`], [['name', 1]]],
  ['name: {n} {w} on one line', ['<summary>{n} {w}</summary>'], [['name', 1]]],
  ['name: <code>{id}</code> {name} on one line', ['<th scope="row"><code>{id}</code> {name}</th>'], [['name', 1]]],
  ["name: {' '} at a line end before an expression", [`<summary>\n  {n} checks ·{' '}\n  {m} scored\n</summary>`], [['name', 2]]],
  ["name: {\" \"} in a role=tab", ['<div role="tab">{a}{" "}{b}</div>'], [['name', 1]]],
  ['name: deep inside a heading', ['<h2>\n  <span>\n    Poise{\' \'}<em>adopted</em>\n  </span>\n</h2>'], [['name', 3]]],
  ['name: a prop a component renders into <th>', [
    'export function Table({ rows }) {\n  return <table><tbody>{rows.map((r) => <tr>{r.map((c, j) => (j === 0 ? <th scope="row">{c}</th> : <td>{c}</td>))}</tr>)}</tbody></table>;\n}',
    'const t = <Table rows={ITEMS.map((x) => [<span key="a"><code>{x.id}</code> {x.name}</span>])} />;',
  ], [['name', 1]]],
  ['name: children a component renders into <button>', [
    'export const Row = ({ children, ...rest }) => <button {...rest}>{children}</button>;',
    'const r = <Row>{count}{\' \'}<span>rows</span></Row>;',
  ], [['name', 1]]],
  ["name: {' '} at a fragment's edge, beside text outside it", [`<a href="#">Fixes{n > 0 && <>{' '}<b>{n}</b></>}</a>`], [['name', 1]]],
  ['name: {children} that a caller passes as text', [
    "export const Row = ({ index, children }) => <button>{index && <i>{index}</i>}{' '}{children}</button>;",
    'const r = <Row index="01">Root</Row>;',
  ], [['name', 1]]],
  ['name: a component passing its prop to one that names it', [
    'export function Table({ rows }) {\n  return <th>{rows[0]}</th>;\n}',
    'export function Wrap({ items }) {\n  return <Table rows={items} />;\n}',
    'const w = <Wrap items={[<>{a} {b}</>]} />;',
  ], [['name', 1]]],
  // Each element and role that takes its name from content.
  ...['label', 'legend', 'caption', 'td', 'dt'].map((tag) => [
    `name: inside a <${tag}>`, [`<${tag}>Fixes{' '}<span>12</span></${tag}>`], [['name', 1]],
  ]),
  ['name: inside an <option>', [`<option>{n}{' '}items</option>`], [['name', 1]]],
  ['name: inside a role=term', [`<div role="term">Fixes{' '}<span>12</span></div>`], [['name', 1]]],
  ['name: inside a Link', [`<Link href="/score">Fixes{' '}<span>12</span></Link>`], [['name', 1]]],
  ['name: inside an element an aria-labelledby points to', [
    `<section aria-labelledby="p"><p id="p">Fixes{' '}<span>12</span></p></section>`,
  ], [['name', 1]]],
  // Each kind of neighbour that renders text.
  ['name: beside a template literal', ['<a href="#">{`${n} runs`}{\' \'}<span>more</span></a>'], [['name', 1]]],
  ['name: beside a number', [`<button>{3}{' '}<span>runs</span></button>`], [['name', 1]]],
  ["name: beside cond && 'text'", [`<button>{open && 'Close'}{' '}<span>menu</span></button>`], [['name', 1]]],
  ["name: beside the right side of ??", [`<button>{undefined ?? 'Close'}{' '}<span>menu</span></button>`], [['name', 1]]],
  ["name: beside the else branch of a ternary", [`<button>{open ? <Icon /> : 'Menu'}{' '}<span>x</span></button>`], [['name', 1]]],
  ['name: beside an array that ends with text', [`<a href="#">{[a, b]}{' '}<span>12</span></a>`], [['name', 1]]],
  ['name: beside a fragment that holds text', [`<a href="#"><>Fixes</>{' '}<span>12</span></a>`], [['name', 1]]],
  ['name: beside a component that returns a fragment of text', [
    'export function Num({ n }) {\n  return <>{n}</>;\n}',
    `const a = <a href="#"><Num n={3} />{' '}<span>runs</span></a>;`,
  ], [['name', 1]]],
  ['name: beside a component that returns a prop', [
    'export const Txt = ({ v }) => v;',
    `const a = <a href="#"><Txt v="Fixes" />{' '}<b>1</b></a>;`,
  ], [['name', 1]]],
  ['name: beside a forwardRef component that returns text', [
    'export const Txt = forwardRef(function Txt({ v }, ref) {\n  return v;\n});',
    `const a = <a href="#"><Txt v="Fixes" />{' '}<b>1</b></a>;`,
  ], [['name', 1]]],
  // Each shape of whitespace child.
  ["name: {' '} at a fragment's end, beside text after it", [`<a href="#">{n > 0 && <><b>{n}</b>{' '}</>}Fixes</a>`], [['name', 1]]],
  ["name: {' '} at the edge of a fragment a .map() returns", [`<a href="#">Fixes{xs.map((x) => <>{' '}<b>{x}</b></>)}</a>`], [['name', 1]]],
  ["name: {' '} at the edge of a fragment a block .map() callback returns", [
    `<a href="#">Fixes{xs.map((x) => {\n  return <>{' '}<b>{x}</b></>;\n})}</a>`,
  ], [['name', 2]]],
  ["name: {' '} at a mapped fragment's end, beside the next item's text", [`<a href="#">{xs.map((x) => <>{x}<b>!</b>{' '}</>)}</a>`], [['name', 1]]],
  ["name: {' '} at a nested mapped fragment's end, beside the next item's text", [
    `<a href="#">{xs.map((x) => <>{x}<><b>!</b>{' '}</></>)}</a>`,
  ], [['name', 1]]],
  ["name: ' ' as an array item", [`<a href="#">Fixes{[' ', <b key="b">12</b>]}</a>`], [['name', 1]]],
  ["name: ' ' after a text item in an array", [`<a href="#"><i>Go</i>{[a, ' ', <b key="b">12</b>]}</a>`], [['name', 1]]],
  ["name: ' ' before a text item in an array", [`<a href="#"><i>Go</i>{[' ', a]}</a>`], [['name', 1]]],
  ["name: ' ' in an array behind cond &&", [`<a href="#">Fixes{open && [' ', <b key="b">12</b>]}</a>`], [['name', 1]]],
  ["name: ' ' in an array behind a ternary", [`<a href="#">Fixes{open ? [' ', <b key="b">12</b>] : null}</a>`], [['name', 1]]],
  ["name: ' ' in an array behind ??", [`<a href="#">Fixes{list ?? [' ', <b key="b">12</b>]}</a>`], [['name', 1]]],
  ["name: {' '} after a {/* comment */} that follows text", [`<a href="#">Fixes{/* note */}{' '}<span>12</span></a>`], [['name', 1]]],
  ['name: inside the second element an aria-labelledby lists', [
    `<section aria-labelledby="a b"><h3 id="a">Title</h3><p id="b">Fixes{' '}<span>12</span></p></section>`,
  ], [['name', 1]]],
  ['name: a const that holds a space', [`const sp = ' ';\nconst a = <a href="#">Fixes{sp}<span>12</span></a>;`], [['name', 2]]],
  // Each way a prop reaches a name.
  ['name: a prop read by destructuring the props object', [
    'export function Table(props) {\n  const { rows } = props;\n  return <th>{rows[0]}</th>;\n}',
    'const t = <Table rows={[<>{a} {b}</>]} />;',
  ], [['name', 1]]],
  ['name: a prop read in a for-of loop', [
    'export function List({ items }) {\n  const out = [];\n  for (const it of items) out.push(<th>{it}</th>);\n  return out;\n}',
    'const l = <List items={[<>{a} {b}</>]} />;',
  ], [['name', 1]]],
  ['name: children passed on by a spread', [
    'export function Btn(props) {\n  return <button {...props} />;\n}',
    `const b = <Btn>Fixes{' '}<span>12</span></Btn>;`,
  ], [['name', 1]]],
  ['name: children that a caller passes as a prop', [
    "export const Row = ({ index, children }) => <button>{index && <i>{index}</i>}{' '}{children}</button>;",
    'const r = <Row index="01" children="Root" />;',
  ], [['name', 1]]],
  ['name: a two-hop prop chain, read before its components', [
    'const w = <Wrap items={[<>{a} {b}</>]} />;',
    'export function Wrap({ items }) {\n  return <Table rows={items} />;\n}',
    'export function Table({ rows }) {\n  return <th>{rows[0]}</th>;\n}',
  ], [['name', 1]]],
  // Safe forms: none of these may be flagged.
  ['safe: wrap after text that ends in a slash', ['<p>\n  open /\n  {path}\n</p>'], []],
  ['safe: the space inside the text run', ['<a href="#">Fixes <span>12</span></a>'], []],
  ['safe: a template carries the spaces', ['<summary>{`${n} ${w}`}</summary>'], []],
  ['safe: the neighbouring string carries the space', ['<th scope="row"><code>{id}</code>{` ${name}`}</th>'], []],
  ['safe: a string with its own leading space', ["<summary>{n}{' checks'}</summary>"], []],
  ['safe: text after an expression on one line', ['<summary>{n} checks</summary>'], []],
  ["safe: {' '} between two elements", [`<a href="#"><span>Alpha</span>{' '}<span>Beta</span></a>`], []],
  ["safe: {' '} beside text outside a name", [`<p>Fixes{' '}<span>12</span></p>`], []],
  ["safe: a literal aria-label names it", [`<a href="#" aria-label="Fixes 12">Fixes{' '}<span>12</span></a>`], []],
  ["safe: a literal aria-labelledby names it", [`<a href="#" aria-labelledby="x">Fixes{' '}<span>12</span></a>`], []],
  ["safe: inside aria-hidden", [`<a href="#">Go<span aria-hidden="true">{n}{' '}→</span></a>`], []],
  ["safe: inside aria-hidden={true}", [`<a href="#">Go<span aria-hidden={true}>{n}{' '}→</span></a>`], []],
  ["safe: {' '} beside a component that returns an element", [
    'export const Tag = ({ v }) => <span>{v}</span>;',
    `const a = <a href="#"><Tag v="Fixes" />{' '}<b>1</b></a>;`,
  ], []],
  ["safe: {' '} beside a component with no definition in the tree", [`<a href="#"><Icon />{' '}<span>Menu</span></a>`], []],
  ["safe: {' '} beside a component that renders itself", [
    'export function Tree({ items }) {\n  return <>{items.map((i) => <Tree key={i} items={[]} />)}</>;\n}',
    `const a = <a href="#"><Tree items={xs} />{' '}<span>x</span></a>;`,
  ], []],
  ["safe: {' '} at a mapped fragment's edge between elements", [`<a href="#"><i>Go</i>{xs.map((x) => <>{' '}<b>{x}</b></>)}</a>`], []],
  ["safe: ' ' as an array item between elements", [`<a href="#">{[<i key="i">Go</i>, ' ', <b key="b">12</b>]}</a>`], []],
  ["safe: beside a .map() that returns JSX", [`<a href="#">{xs.map((x) => <i key={x}>{x}</i>)}{' '}<b>more</b></a>`], []],
  ["safe: beside cond && <El />", [`<button>{open && <Icon />}{' '}<span>Menu</span></button>`], []],
  ['safe: {children} that every caller passes as elements', [
    "export const Row = ({ index, children }) => <button>{index && <i>{index}</i>}{' '}{children}</button>;",
    'const r = <Row index="01"><span>Root</span></Row>;',
  ], []],
  ['safe: a component prop that is not rendered into a name', [
    'export function Fig({ note }) {\n  return <p>{note}</p>;\n}',
    'const f = <Fig note={<>{a} {b}</>} />;',
  ], []],
];

function selfTest() {
  const bad = [];
  for (const [name, srcs, want] of SELF_TEST) {
    const got = scanSources(srcs.map((src, i) => ({ rel: `case-${i}.tsx`, src })));
    const key = (f) => `${f[0] ?? f.kind}:${f[1] ?? f.line}`;
    const gotKeys = got.map(key).sort().join(' ');
    const wantKeys = want.map(key).sort().join(' ');
    if (gotKeys !== wantKeys) bad.push(`${name}: expected [${wantKeys}], got [${gotKeys}]`);
  }
  return bad;
}

// ---- main -------------------------------------------------------------------

const broken = selfTest();
if (process.argv.includes('--self-test')) {
  for (const b of broken) console.error(`  [self-test] FAIL ${b}`);
  console.log(`[jsx-glue] self-test: ${SELF_TEST.length - broken.length}/${SELF_TEST.length} cases judged right`);
  process.exit(broken.length ? 1 : 0);
}
if (broken.length) {
  console.error('[jsx-glue] the self-test failed, so a clean scan would prove nothing:');
  for (const b of broken) console.error(`  ${b}`);
  process.exit(1);
}

const findings = scanSources(
  walk(APP).map((file) => ({ rel: path.relative(APP, file).split(path.sep).join('/'), src: fs.readFileSync(file, 'utf8') })),
);
const wrap = findings.filter((f) => f.kind === 'wrap');
const name = findings.filter((f) => f.kind === 'name');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ findings }, null, 2));
} else if (!findings.length) {
  console.log('[jsx-glue] OK - no line break glues two words together, and no name can lose a space');
} else {
  for (const f of wrap) {
    console.log(`  FAIL ${f.file}:${f.line}  ${JSON.stringify(f.before)} + ${JSON.stringify(f.after)}`);
  }
  if (wrap.length) {
    console.log(
      `[jsx-glue] ${wrap.length} boundary(ies) where a line break removes the space: wrap one word earlier so the ` +
        "space stays inside the text, or write it into the neighbouring string ({` ${value}`}).",
    );
  }
  for (const f of name) {
    console.log(`  FAIL ${f.file}:${f.line}  ${JSON.stringify(f.before)} ${f.space} ${JSON.stringify(f.after)}  (in ${f.in})`);
  }
  if (name.length) {
    console.log(
      `[jsx-glue] ${name.length} space(s) that can drop out of an accessible name: a child that is only whitespace, ` +
        'beside text, inside content that names a link, button, summary, heading, table header or cell, or a ' +
        "label's control. In inline content Chrome drops it from the name; in a flex or grid container it keeps " +
        'it, and the gate flags it there too. Write the space into the neighbouring text or string (Fixes <span>, ' +
        "{` ${value}`}, {`${n} ${noun}`}); {' '} is safe only between two host elements, and a component that " +
        'returns text counts as text.',
    );
  }
}
process.exit(findings.length ? 1 : 0);
