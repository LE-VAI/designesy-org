#!/usr/bin/env node
/**
 * JSX glue gate: no sentence may wrap so that JSX glues two words together.
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
 * WHAT IT FLAGS
 * A JSX text run and an inline neighbour (an {expression}, a Link, a span,
 * strong, em, code, CountUp...) separated only by whitespace that contains a
 * line break, where the characters on both sides are ones a space normally
 * sits between: a word or closing punctuation before, a letter or digit after.
 * The fix is an explicit {' '} at the boundary.
 *
 * WHAT IT DOES NOT FLAG
 *   - {' '}, {' · Lab'} and any string that brings its own leading space;
 *   - an element whose content starts with a space or with punctuation
 *     (the wordmark's <span>.</span>, <span aria-hidden> →</span>);
 *   - block elements and empty self-closing tags, which carry no inline text;
 *   - text that starts with punctuation after an element ("</a>. Include");
 *   - the same boundary on ONE line: "v{version}" and "pt{plural}" are
 *     deliberate, and JSX keeps same-line spacing exactly as written.
 *
 * Usage:  node scripts/check-jsx-glue.js [--json]
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

const findings = [];
for (const file of walk(APP)) {
  const rel = path.relative(APP, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const report = (node, before, after) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    findings.push({ file: rel, line, before: before.slice(-40), after: after.slice(0, 40) });
  };
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const kids = node.children;
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        if (!ts.isJsxText(k)) continue;
        const raw = k.text;
        if (!raw.trim()) continue;
        // Text, then a line break, then an inline neighbour.
        const next = kids[i + 1];
        if (next && /\S[ \t]*\r?\n\s*$/.test(raw)) {
          const end = raw.trimEnd();
          const c = edgeChar(next, 'first');
          if (c && WORD_END.test(end) && WORD_START.test(c)) report(k, end, next.getText());
        }
        // An inline neighbour, then a line break, then text.
        const prev = kids[i - 1];
        if (prev && /^\s*\n\s*\S/.test(raw)) {
          const start = raw.trimStart();
          const c = edgeChar(prev, 'last');
          if (c && WORD_START.test(start) && WORD_END.test(c)) report(k, prev.getText(), start);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ findings }, null, 2));
} else if (!findings.length) {
  console.log('[jsx-glue] OK - no line break glues two words together');
} else {
  for (const f of findings) {
    console.log(`  FAIL ${f.file}:${f.line}  ${JSON.stringify(f.before)} + ${JSON.stringify(f.after)}`);
  }
  console.log(`[jsx-glue] ${findings.length} boundary(ies) where a line break removes the space: add {' '}`);
}
process.exit(findings.length ? 1 : 0);
