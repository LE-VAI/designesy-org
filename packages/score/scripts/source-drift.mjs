#!/usr/bin/env node
/**
 * Source drift between the two 44-check engines.
 *
 * WHY THIS EXISTS
 * The scoring engine lives in two hand-maintained copies:
 *
 *   apps/site/app/api/score/route.ts   — what designesy.org and the MCP endpoint run
 *   packages/score/src/engine.ts       — what `npx designesy-score` runs
 *
 * Nothing kept them in sync. test/parity.test.mjs sounds like it does, but it
 * scores a fixture with the PACKAGE engine only and compares against pinned
 * verdicts; route.ts never executes in it. check-cross-engine-agreement.js in
 * apps/site guards drift vs monitor (d01-d12), a different pair.
 *
 * Measured 2026-09-30 with the comparison below: 85 units exist in both files,
 * 15 differ, and 9 of those are scoring logic — fixes that landed in route.ts
 * and were never ported (the slop-rules-page suppression on S8/S9/S11/S12, the
 * S2 grid-pattern widening, aria-hidden stripping in v38, the v26 resolver). So
 * the CLI and the website score the same page differently, and nothing said so.
 *
 * WHAT IT COMPARES
 * Top-level functions and consts by name, plus each slop block (the statement
 * after a `// S<n>.` comment inside the orchestrator), plus each orchestrator
 * statement that calls a shared step (SHARED_CALLS), in a canonical form built
 * from the TypeScript AST. Canonical means formatting cannot register as drift:
 * whitespace, comments, quote style, trailing commas, optional braces around a
 * single statement, redundant parentheses, `x => e` vs `x => { return e; }`, and
 * type annotations all vanish. Anything that changes what runs does not.
 *
 * WHY A BASELINE (A RATCHET) RATHER THAN "MUST BE IDENTICAL"
 * Fifteen divergences exist today. Some are correct (the copies fetch and emit
 * differently), the rest are debt. A gate demanding identity would fail on day
 * one and be deleted. The baseline pins each known divergence to the exact hash
 * of BOTH sides, so the gate fails when:
 *
 *   * a unit that matched starts to differ      — a fix landed in one copy only
 *   * one side of a baselined unit changes      — same, on known-divergent code
 *   * a baselined unit converges                — remove the entry; ratchet tightens
 *   * a unit appears in one file only           — a check added to one engine
 *
 * Usage:
 *   node scripts/source-drift.mjs             # report, exit 1 on any finding
 *   node scripts/source-drift.mjs --update    # rewrite baseline hashes; NEW
 *                                             # entries get an empty `why`, which
 *                                             # the test rejects until a human
 *                                             # says why the divergence is OK
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');

export const ROUTE = join(REPO, 'apps', 'site', 'app', 'api', 'score', 'route.ts');
export const ENGINE = join(REPO, 'packages', 'score', 'src', 'engine.ts');
export const BASELINE = join(HERE, '..', 'test', 'fixtures', 'source-drift-baseline.json');

/** The orchestrator in each file — where the slop blocks live. */
const ORCHESTRATORS = new Set(['scoreUrlUncached', 'scoreFromParts']);

/**
 * Shared steps each orchestrator must call, compared at the call site too.
 *
 * scoreArithmetic holds everything between the verdicts and the grade. It sat
 * inline in both orchestrators until engine 1.2.0, where nothing compared it,
 * and the copies disagreed on the accessibility floor (the site capped at 70
 * when the accessibility category was under 60%, the npm engine on any
 * accessibility FAIL). The function is compared as `fn:scoreArithmetic`; the
 * statement that calls it is compared as `call:scoreArithmetic`, so an engine
 * that stops calling it, or calls it with other inputs, is a finding too.
 *
 * sanitizeCheckDetails scrubs local paths from every check detail before the
 * score is computed (published @designesy/score 0.7.0 echoed the CLI user's
 * npm cache path in v37). An engine that stops calling it would publish them.
 */
export const SHARED_CALLS = new Set(['scoreArithmetic', 'sanitizeCheckDetails']);

/** The shared step a statement calls, if any. */
function sharedCallIn(node) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && SHARED_CALLS.has(n.expression.text)) {
      found = n.expression.text;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

const K = ts.SyntaxKind;

/** Nodes with no runtime meaning of their own: compare what they wrap. */
const TRANSPARENT = new Set([
  K.ParenthesizedExpression,
  K.AsExpression,
  K.TypeAssertionExpression,
  K.NonNullExpression,
  K.SatisfiesExpression,
]);

/** Nodes that do not change what runs. `export` differs by design between a route and a package. */
const DROP = new Set([K.ExportKeyword, K.DefaultKeyword, K.TypeParameter]);

/**
 * Canonical form of a node: kinds, identifiers and literal VALUES, with
 * formatting-only differences normalised away. Exported so the test can prove
 * the normalisation neither over- nor under-matches.
 */
export function canonical(node) {
  if (!node) return '';
  if (TRANSPARENT.has(node.kind)) return canonical(node.expression);
  if (DROP.has(node.kind) || ts.isTypeNode(node)) return '';
  const body = (s) => (s ? (ts.isBlock(s) ? canonical(s) : `{${canonical(s)}}`) : '');

  switch (node.kind) {
    case K.StringLiteral:
    case K.NoSubstitutionTemplateLiteral:
      return `S${JSON.stringify(node.text)}`;
    case K.NumericLiteral:
      return `N${Number(node.text)}`;
    case K.Identifier:
    case K.PrivateIdentifier:
      return `I${node.text}`;
    case K.RegularExpressionLiteral:
    case K.TemplateHead:
    case K.TemplateMiddle:
    case K.TemplateTail:
      return `${K[node.kind]}${JSON.stringify(node.text)}`;
    case K.Block:
      return `{${node.statements.map(canonical).join(';')}}`;
    case K.IfStatement:
      return `if(${canonical(node.expression)})${body(node.thenStatement)}${
        node.elseStatement ? `else${body(node.elseStatement)}` : ''
      }`;
    case K.ForStatement:
    case K.ForInStatement:
    case K.ForOfStatement:
    case K.WhileStatement:
    case K.DoStatement: {
      const parts = [];
      ts.forEachChild(node, (c) => {
        if (c !== node.statement) parts.push(canonical(c));
      });
      return `${K[node.kind]}(${parts.join(',')})${body(node.statement)}`;
    }
    case K.ArrowFunction: {
      const mods = (node.modifiers || []).map(canonical).join('');
      const params = node.parameters.map(canonical).join(',');
      const b = ts.isBlock(node.body) ? canonical(node.body) : `{I_return(${canonical(node.body)})}`;
      return `${mods}=>(${params})${b}`;
    }
    case K.ReturnStatement:
      return node.expression ? `I_return(${canonical(node.expression)})` : 'I_return()';
    case K.PrefixUnaryExpression:
    case K.PostfixUnaryExpression:
      // The operator is a plain number on the node, not a child — include it
      // explicitly or `!x` and `x` would canonicalise identically.
      return `${K[node.kind]}${node.operator}(${canonical(node.operand)})`;
    case K.VariableDeclarationList:
      return `vars${node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)}(${node.declarations
        .map(canonical)
        .join(',')})`;
  }

  const kids = [];
  ts.forEachChild(
    node,
    (c) => {
      kids.push(canonical(c));
    },
    (arr) => {
      for (const c of arr) kids.push(canonical(c));
    },
  );
  return `${K[node.kind]}(${kids.filter(Boolean).join(',')})`;
}

export function parse(text, name = 'input.ts') {
  // CRLF is normalised before parsing so a Windows checkout and CI hash alike.
  return ts.createSourceFile(name, text.replace(/\r\n/g, '\n'), ts.ScriptTarget.Latest, true);
}

/** Map of unit key -> canonical form, for one source file. */
export function unitsOf(text, name) {
  const src = parse(text, name);
  const full = src.getFullText();
  const out = new Map();
  for (const st of src.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) {
      out.set(`fn:${st.name.text}`, canonical(st));
      if (ORCHESTRATORS.has(st.name.text) && st.body) {
        for (const inner of st.body.statements) {
          for (const r of ts.getLeadingCommentRanges(full, inner.getFullStart()) || []) {
            const m = full.slice(r.pos, r.end).match(/^\/\/\s*(S\d+)\./);
            if (m) out.set(`slop:${m[1]}`, canonical(inner));
          }
          const call = sharedCallIn(inner);
          if (call) out.set(`call:${call}`, canonical(inner));
        }
      }
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) out.set(`const:${d.name.text}`, canonical(d));
      }
    }
  }
  return out;
}

/**
 * The PUBLIC API surface of the package engine, as a sorted export list.
 *
 * WHY THIS EXISTS SEPARATELY FROM unitsOf()
 *   `canonical()` drops the `export` keyword by design (see DROP): a route and a
 *   package legitimately differ on it, so counting it would report false drift
 *   on every shared helper. The consequence is that an accidental export change
 *   is INVISIBLE to the body comparison -- verified directly: a function and the
 *   same function prefixed with `export` canonicalise to the same string. So the
 *   engine bodies cannot drift, but the package's public surface quietly can.
 *
 *   That matters more for a published package than for the site: `packages/score`
 *   ships an engine.d.ts that consumers compile against, while route.ts is not a
 *   library at all. This is a read-only report of what the package actually
 *   promises, so a release can state its API delta instead of assuming one.
 *
 * Returns { fn: [...], const: [...], type: [...] } of exported names.
 */
export function exportedSurface(text, name = 'engine.ts') {
  const src = parse(text, name);
  const out = { fn: [], const: [], type: [] };
  for (const st of src.statements) {
    const hasExport = (node) =>
      (ts.getModifiers(node) || []).some((m) => m.kind === K.ExportKeyword);
    if (ts.isFunctionDeclaration(st) && st.name && hasExport(st)) {
      out.fn.push(st.name.text);
    } else if (ts.isVariableStatement(st) && hasExport(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) out.const.push(d.name.text);
      }
    } else if (
      (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) &&
      st.name && hasExport(st)
    ) {
      out.type.push(st.name.text);
    }
  }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

export function hash(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

export function loadUnits() {
  return {
    route: unitsOf(readFileSync(ROUTE, 'utf8'), 'route.ts'),
    engine: unitsOf(readFileSync(ENGINE, 'utf8'), 'engine.ts'),
  };
}

export function loadBaseline() {
  return JSON.parse(readFileSync(BASELINE, 'utf8'));
}

/**
 * Every way the two sources disagree with the baseline. Empty = clean.
 * Each finding says what happened AND what to do, because the person reading
 * it is usually mid-fix in one file and has not heard of this gate.
 */
export function findings(units = loadUnits(), baseline = loadBaseline()) {
  const { route, engine } = units;
  const out = [];
  const known = baseline.divergent || {};

  const routeOnly = [...route.keys()].filter((k) => !engine.has(k)).sort();
  const engineOnly = [...engine.keys()].filter((k) => !route.has(k)).sort();
  const shared = [...route.keys()].filter((k) => engine.has(k)).sort();

  for (const [side, actual, pinned] of [
    ['route.ts', routeOnly, baseline.routeOnly || []],
    ['engine.ts', engineOnly, baseline.engineOnly || []],
  ]) {
    for (const k of actual.filter((k) => !pinned.includes(k))) {
      out.push(`${k} exists only in ${side}. If it is a new check or helper the other engine needs, add it there too; if it is transport-only, add it to the baseline's ${side === 'route.ts' ? 'routeOnly' : 'engineOnly'} list.`);
    }
    for (const k of pinned.filter((k) => !actual.includes(k))) {
      out.push(`${k} is listed as ${side}-only in the baseline but is not ${side}-only any more. Remove it from the list.`);
    }
  }

  for (const k of shared) {
    const r = hash(route.get(k));
    const e = hash(engine.get(k));
    const entry = known[k];
    if (!entry) {
      if (r !== e) {
        out.push(`${k} differs between route.ts and engine.ts. A change landed in one copy only. Port it to the other copy; if the divergence is intentional, run \`node scripts/source-drift.mjs --update\` and write the why.`);
      }
      continue;
    }
    if (r === e) {
      out.push(`${k} is baselined as divergent but the two copies now match. Remove it from the baseline so the ratchet tightens.`);
    } else if (r !== entry.route && e === entry.engine) {
      out.push(`${k} changed in route.ts only (a known divergence edited on one side). Port the change to engine.ts, or re-baseline with --update if it deliberately stays route-only.`);
    } else if (e !== entry.engine && r === entry.route) {
      out.push(`${k} changed in engine.ts only (a known divergence edited on one side). Port the change to route.ts, or re-baseline with --update if it deliberately stays engine-only.`);
    } else if (r !== entry.route && e !== entry.engine) {
      out.push(`${k} changed in both copies and they still differ. Re-baseline with --update and confirm the why still holds.`);
    }
  }

  for (const k of Object.keys(known)) {
    if (!shared.includes(k)) out.push(`${k} is baselined but no longer exists in both files. Remove it from the baseline.`);
  }

  return out;
}

function update() {
  const { route, engine } = loadUnits();
  const prev = existsSync(BASELINE) ? loadBaseline() : {};
  const divergent = {};
  for (const k of [...route.keys()].filter((k) => engine.has(k)).sort()) {
    const r = hash(route.get(k));
    const e = hash(engine.get(k));
    if (r === e) continue;
    const old = prev.divergent?.[k];
    divergent[k] = { route: r, engine: e, kind: old?.kind || '', why: old?.why || '' };
  }
  const next = {
    $comment: prev.$comment || 'Known divergences between route.ts and engine.ts. See scripts/source-drift.mjs.',
    divergent,
    routeOnly: [...route.keys()].filter((k) => !engine.has(k)).sort(),
    engineOnly: [...engine.keys()].filter((k) => !route.has(k)).sort(),
  };
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
  const blank = Object.entries(divergent).filter(([, v]) => !v.why || !v.kind).map(([k]) => k);
  console.log(`source-drift: baseline written (${Object.keys(divergent).length} divergent units).`);
  if (blank.length) console.log(`  needs a kind + why before the test passes: ${blank.join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--update')) {
    update();
  } else {
    const f = findings();
    if (f.length === 0) {
      const n = Object.keys(loadBaseline().divergent || {}).length;
      console.log(`source-drift: OK. The engines agree everywhere except ${n} baselined units.`);
    } else {
      console.error(`source-drift: ${f.length} finding(s)\n`);
      for (const line of f) console.error(`  - ${line}\n`);
    }
    process.exit(f.length === 0 ? 0 : 1);
  }
}
