/**
 * The engine's requests, read from its source: one request call, on the
 * engine's own agent, with the engine's own lookup.
 *
 * direct-connect.test.mjs runs the engine and watches what it sends. This
 * file reads src/engine.ts, and the dist/engine.js built from it, with the
 * TypeScript compiler (already a dev dependency, for the build) and holds the
 * shape that makes every request direct and every connection checked:
 *
 *   - Of the modules it imports, only node:https can open a connection, and
 *     from it the engine takes Agent and get, once each, and nothing else.
 *   - It names none of the other ways to send a request on a list here
 *     (fetch, a request function, https.globalAgent, a socket, the socket
 *     or connection of a request or a response, and a request's own
 *     writers), and none of the ways on a second list to reach another
 *     module, another program, the environment or code built at run time
 *     (process, globalThis, require, eval, a function's constructor and the
 *     like).
 *   - get is named once, where it is called. The call has three arguments.
 *     The first is the parameter url of the function it is in, which that
 *     function never writes to (by an assignment, ++ or --, a destructuring
 *     assignment, a rest included, or a for-in or for-of loop) or declares
 *     again. The second is an options object that holds agent:
 *     DIRECT_AGENT, lookup: safeLookup, headers and timeout, and nothing
 *     else. agent is named once, as that option.
 *   - DIRECT_AGENT is a top-level const that the module keeps to itself. It
 *     is made once, by new Agent with the options it states, and only that
 *     call uses it. safeLookup is a top-level function that only that call
 *     uses.
 *
 * The CLI (src/cli.ts and dist/cli.js) imports the engine and nothing that
 * can open a connection, and names nothing on the two lists but process,
 * which it uses for its arguments, output and exit code.
 *
 * A name is an identifier, or a string written as a property key: in
 * x['key'], as a computed key, or as the key of an object literal, a
 * destructuring pattern (in a declaration, a parameter, a catch clause, a
 * loop or an assignment), a class member, a method, an accessor or an enum
 * member. A name counts wherever it is written in code, a class's extends
 * clause and an instantiation expression (f<T>) included. Only names in
 * type positions, which never run, are left out: type annotations and
 * arguments, type aliases, interfaces and implements clauses. A string
 * used any other way, or a name built at run time, is not read as a name.
 *
 * It reads the source as written, so it cannot judge what code does when it
 * runs; the cases in direct-connect.test.mjs do that. It looks only for the
 * names on its lists, so a way to send a request that none of them reaches
 * is not seen. A change to the engine that needs another import, another
 * name from these lists or another request call changes this file too, with
 * the reason.
 *
 * The checks are tested first, in both directions: a small source of the
 * same shape passes them, and each of a set of small changes to it fails at
 * least one, so a check that read nothing could not pass.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Modules the engine and the CLI may import, with the bindings each may
// take (null: any). None of them opens a connection except node:https.
// node:dns/promises answers safeLookup.
const ENGINE_MODULES = {
  'node:https': ['Agent', 'get'],
  'node:dns/promises': ['lookup'],
  'node:zlib': null,
  'node:string_decoder': null,
  '@google/design.md/linter': null,
};
const CLI_MODULES = { './engine.js': null };

// Names the engine may not use: other ways to send a request (the shared
// agents, sockets, a request's or a response's socket or connection, and
// the request's own writers, which can put more on its connection), and
// ways to reach another module, another program, the environment or code
// built at run time.
const REQUEST_NAMES = ['fetch', 'request', 'globalAgent', 'createConnection', 'connect', 'Socket', 'socket', 'connection', 'client', '_send', '_writeRaw', 'outputData', 'XMLHttpRequest', 'WebSocket', 'EventSource'];
const REACH_NAMES = ['process', 'globalThis', 'global', 'require', 'createRequire', 'getBuiltinModule', 'binding', 'execve', 'eval', 'Function', 'Reflect', 'constructor'];
// The CLI uses process for its arguments, output and exit code.
const CLI_NAMES = [...REQUEST_NAMES, ...REACH_NAMES.filter((n) => n !== 'process')];

const parse = (name, text) => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, name.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
const read = (rel) => parse(rel, readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** An expression without parentheses, type assertions or `!`. */
function bare(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(node)))) node = node.expression;
  return node;
}

/** The text of a property name, or null when it is computed at run time. */
function propertyName(name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const e = bare(name.expression);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  }
  return null;
}

/**
 * The names the source writes in the forms the header lists, with their
 * nodes: identifiers (variables, properties, labels), and strings written
 * as a property key: in `x['key']`, as a computed key (`{ ['key']: v }`),
 * and as the key of an object literal, a destructuring pattern, a class
 * member, a method, an accessor or an enum member (`{ 'key': v }`,
 * `const { 'key': v } = x`). A key in `x[...]` or a computed key may be in
 * parentheses, with a type assertion or with `!`. Names in type positions
 * are left out.
 */
function namesOf(sf) {
  const out = [];
  walk(sf, (node) => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) out.push([node.text, node]);
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.parent) {
      let key = node;
      while (key.parent && bare(key.parent) === node) key = key.parent;
      const p = key.parent;
      if ((ts.isElementAccessExpression(p) && p.argumentExpression === key) || ts.isComputedPropertyName(p) || keyOf(p) === key) out.push([node.text, node]);
    }
  });
  return out.filter(([, node]) => !inType(node));
}

/**
 * The node written as the property key of `p`, when `p` has one: an object
 * literal's property, a destructuring element (in a declaration, a
 * parameter, a catch clause or a loop), a class member, a method, an
 * accessor or an enum member. A destructuring assignment is an object
 * literal, so its keys are property keys too.
 */
function keyOf(p) {
  if (ts.isBindingElement(p)) return p.propertyName;
  if (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isEnumMember(p)) return p.name;
  return undefined;
}

/**
 * True when `node` is in a type position, which never runs: a type
 * annotation or argument, a type alias, an interface or an implements
 * clause. The compiler counts the expression of a class's extends clause,
 * and of an instantiation expression (f<T>), as part of a type node, but
 * that expression runs, so it is read as code.
 */
function inType(node) {
  for (let child = node, n = node.parent; n; child = n, n = n.parent) {
    if (ts.isExpressionWithTypeArguments(n)) {
      if (n.expression === child && runs(n)) continue;
      return true;
    }
    if (ts.isTypeNode(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) return true;
  }
  return false;
}

/**
 * True for an expression with type arguments whose expression runs: one in
 * a class's extends clause, or one written as an expression. One in an
 * implements clause or in an interface's extends clause names a type.
 */
function runs(n) {
  const clause = n.parent;
  if (!ts.isHeritageClause(clause)) return true;
  return clause.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(clause.parent);
}

/** True when the identifier `id` declares a name. */
function declares(id) {
  const p = id.parent;
  return (ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p) || ts.isEnumDeclaration(p)) && p.name === id;
}

/**
 * True when the identifier `id` is written to: the target of an
 * assignment, a compound assignment, ++ or --, a destructuring assignment
 * (an element, a property or a rest of one) or a for-in or for-of loop.
 */
function written(id) {
  let n = id;
  for (;;) {
    const p = n.parent;
    if (ts.isParenthesizedExpression(p) || ts.isNonNullExpression(p) || ts.isAsExpression(p) || ts.isTypeAssertionExpression(p) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(p)) || ts.isArrayLiteralExpression(p) || ts.isSpreadElement(p)) n = p;
    else if ((ts.isShorthandPropertyAssignment(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.initializer === n) || ts.isSpreadAssignment(p)) n = p.parent;
    else break;
  }
  const p = n.parent;
  if (ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return true;
  if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) return true;
  return (ts.isForInStatement(p) || ts.isForOfStatement(p)) && p.initializer === n;
}

/** Each module the source imports or exports from, with the bindings it takes. */
function importsOf(sf) {
  const out = [];
  const problems = [];
  walk(sf, (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) return;
      const spec = node.moduleSpecifier.text;
      const names = [];
      if (clause?.name) names.push('default');
      const nb = clause?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) names.push('*');
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (!el.isTypeOnly) names.push((el.propertyName || el.name).text);
      if (!clause) names.push('(for its effects)');
      out.push({ spec, names, local: nb && ts.isNamedImports(nb) ? Object.fromEntries(nb.elements.map((el) => [(el.propertyName || el.name).text, el.name])) : {} });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {
      out.push({ spec: node.moduleSpecifier.text, names: ['(re-exported)'], local: {} });
    } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
      const ref = node.moduleReference;
      if (ts.isExternalModuleReference(ref)) out.push({ spec: ref.expression.text, names: ['*'], local: {} });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = bare(node.arguments[0]);
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) out.push({ spec: arg.text, names: ['*'], local: {} });
      else problems.push('a dynamic import whose module is not written out');
    }
  });
  return { imports: out, problems };
}

function checkImports(sf, allowed) {
  const { imports, problems } = importsOf(sf);
  for (const { spec, names } of imports) {
    if (!(spec in allowed)) { problems.push(`imports ${spec}`); continue; }
    const only = allowed[spec];
    if (only) for (const n of names) if (!only.includes(n)) problems.push(`takes ${n} from ${spec}`);
  }
  return problems;
}

function checkNames(sf, forbidden) {
  const problems = [];
  for (const [text] of namesOf(sf)) if (forbidden.includes(text)) problems.push(`names ${text}`);
  return [...new Set(problems)];
}

/** The local name a module's export is imported under, or null. */
function localName(sf, spec, exported) {
  for (const { spec: s, local } of importsOf(sf).imports) if (s === spec && local[exported]) return local[exported].text;
  return null;
}

/** Uses of `name`, leaving out the declarations given. */
function uses(sf, name, except) {
  return namesOf(sf).filter(([text, node]) => text === name && !except.includes(node)).map(([, node]) => node);
}

function topLevelConst(sf, name) {
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return { st, d };
  }
  return null;
}

function checkCall(sf) {
  const problems = [];
  const get = localName(sf, 'node:https', 'get');
  const Agent = localName(sf, 'node:https', 'Agent');
  if (!get || !Agent) return ['does not import Agent and get from node:https by name'];
  const importNode = (n) => importsOf(sf).imports.find((i) => i.spec === 'node:https').local[n];
  // Agent and get: each taken from node:https once, in all its imports, so
  // no second name for either goes unread.
  const taken = importsOf(sf).imports.filter((i) => i.spec === 'node:https').flatMap((i) => i.names);
  for (const n of ['Agent', 'get']) {
    const count = taken.filter((x) => x === n).length;
    if (count !== 1) problems.push(`takes ${n} from node:https ${count} times`);
  }

  // get: named once, as the callee of the one call.
  const getUses = uses(sf, get, [importNode('get')]);
  if (getUses.length !== 1) problems.push(`names get ${getUses.length} times; it is named once, where it is called`);
  const call = getUses[0]?.parent;
  if (!call || !ts.isCallExpression(call) || call.expression !== getUses[0]) return [...problems, 'does not call get by its name'];

  // The URL: the call's first argument is the parameter url of the
  // outermost function the call is in, which never writes to url or
  // declares it again (in a function inside it either), so nothing else can
  // ride on it. Then the options, then one more argument, which is not
  // checked here; its names are read with the rest of the file.
  let owner = null;
  for (let p = call.parent; p; p = p.parent) if (ts.isFunctionLike(p)) owner = p;
  const param = owner?.parameters.find((q) => ts.isIdentifier(q.name) && q.name.text === 'url')?.name;
  const first = bare(call.arguments[0]);
  if (call.arguments.length !== 3 || !param || !first || !ts.isIdentifier(first) || first.text !== 'url') problems.push('calls get with arguments other than the parameter url, the options and one more');
  else {
    walk(owner, (n) => {
      if (n === param || !ts.isIdentifier(n) || n.text !== 'url') return;
      if (declares(n)) problems.push('declares url again');
      else if (written(n)) problems.push('writes to url');
    });
  }

  const opts = bare(call.arguments[1]);
  if (!opts || !ts.isObjectLiteralExpression(opts)) return [...problems, 'calls get with options that are not written out'];
  const props = {};
  for (const p of opts.properties) {
    const key = ts.isSpreadAssignment(p) ? '...' : propertyName(p.name);
    if (key === null) { problems.push('names an option it computes'); continue; }
    if (key in props) problems.push(`sets ${key} twice`);
    props[key] = p;
  }
  const want = ['agent', 'headers', 'timeout', 'lookup'];
  for (const k of Object.keys(props)) if (!want.includes(k)) problems.push(`calls get with ${k === '...' ? 'a spread' : k}`);
  for (const k of want) if (!(k in props)) problems.push(`calls get with no ${k}`);
  const value = (k) => (props[k] && ts.isPropertyAssignment(props[k]) ? bare(props[k].initializer) : props[k] && ts.isShorthandPropertyAssignment(props[k]) ? props[k].name : null);
  const agent = value('agent');
  if (!agent || !ts.isIdentifier(agent) || agent.text !== 'DIRECT_AGENT') problems.push('calls get with an agent other than DIRECT_AGENT');
  // agent: named once, as that option, so no code reaches the agent through
  // a request or a response.
  const agentNames = namesOf(sf).filter(([text]) => text === 'agent');
  if (agentNames.length !== 1 || !props.agent || agentNames[0][1] !== props.agent.name) problems.push(`names agent ${agentNames.length} times; it is named once, as the option of the call`);
  const lookup = value('lookup');
  if (!lookup || !ts.isIdentifier(lookup) || lookup.text !== 'safeLookup') problems.push('calls get with a lookup other than safeLookup');

  // DIRECT_AGENT: a top-level const that is not exported, made by new Agent
  // with the options it states, and used only in that call.
  const decl = topLevelConst(sf, 'DIRECT_AGENT');
  if (!decl) return [...problems, 'has no top-level DIRECT_AGENT'];
  if (!(decl.st.declarationList.flags & ts.NodeFlags.Const)) problems.push('declares DIRECT_AGENT with let or var');
  if ((ts.getModifiers(decl.st) || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) problems.push('exports DIRECT_AGENT');
  const made = bare(decl.d.initializer);
  if (!made || !ts.isNewExpression(made) || !ts.isIdentifier(made.expression) || made.expression.text !== Agent) problems.push('does not make DIRECT_AGENT with new Agent');
  else {
    const arg = made.arguments?.length === 1 ? bare(made.arguments[0]) : null;
    const stated = arg && ts.isObjectLiteralExpression(arg)
      ? arg.properties.map((p) => (ts.isPropertyAssignment(p) ? `${propertyName(p.name)}: ${bare(p.initializer).getText(sf)}` : '?')).sort().join(', ')
      : '?';
    if (stated !== "keepAlive: true, scheduling: 'lifo', timeout: 5000") problems.push(`makes DIRECT_AGENT with ${stated}`);
  }
  const agentUses = uses(sf, 'DIRECT_AGENT', [decl.d.name]);
  if (agentUses.some((n) => n !== agent)) problems.push('uses DIRECT_AGENT outside the agent option of the call');
  const AgentUses = uses(sf, Agent, [importNode('Agent')]);
  if (AgentUses.some((n) => !made || n !== made.expression)) problems.push('uses Agent other than to make DIRECT_AGENT');

  // safeLookup: a top-level function, used only in that call.
  const fn = sf.statements.find((st) => ts.isFunctionDeclaration(st) && st.name?.text === 'safeLookup');
  if (!fn) problems.push('has no top-level function safeLookup');
  const lookupUses = uses(sf, 'safeLookup', fn ? [fn.name] : []);
  if (lookupUses.some((n) => n !== lookup)) problems.push('uses safeLookup outside the lookup option of the call');
  return problems;
}

const engineProblems = (sf) => [...checkImports(sf, ENGINE_MODULES), ...checkNames(sf, [...REQUEST_NAMES, ...REACH_NAMES]), ...checkCall(sf)];
const cliProblems = (sf) => [...checkImports(sf, CLI_MODULES), ...checkNames(sf, CLI_NAMES)];

// A small source of the engine's shape, and small changes to it that the
// checks must each catch.
const SHAPE = [
  "import { Agent as A, get as g } from 'node:https';",
  "import { lookup as dl } from 'node:dns/promises';",
  "const DIRECT_AGENT = new A({ keepAlive: true, scheduling: 'lifo', timeout: 5000 });",
  'function safeLookup(h: string, o: object, cb: Function) { dl(h).then(cb); }',
  'export function f(url: string, h: object, t: number) {',
  '  const req = g(url, { agent: DIRECT_AGENT, headers: h, timeout: t, lookup: safeLookup as any }, () => {});',
  "  req.on('timeout', () => req.destroy());",
  '}',
].join('\n');
const CHANGES = [
  ['a second call', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); g(url, { headers: h }); });"],
  ['get kept under another name', "  req.on('timeout', () => req.destroy());", "  const again = g; req.on('timeout', () => req.destroy());"],
  ['the agent chosen by a condition', 'agent: DIRECT_AGENT,', 'agent: t ? DIRECT_AGENT : undefined,'],
  ['no agent', 'agent: DIRECT_AGENT, ', ''],
  ['a spread after the agent', 'lookup: safeLookup as any }', 'lookup: safeLookup as any, ...h }'],
  ['another option', 'timeout: t,', 'timeout: t, rejectUnauthorized: false,'],
  ['the agent set twice', 'timeout: t,', "timeout: t, 'agent': undefined,"],
  ['another lookup', 'lookup: safeLookup as any', 'lookup: (t ? safeLookup : undefined) as any'],
  ['the agent made with other options', 'timeout: 5000 })', 'timeout: 5000, ca: [] })'],
  ['the agent made later', "const DIRECT_AGENT = new A({ keepAlive: true, scheduling: 'lifo', timeout: 5000 });", "const DIRECT_AGENT = (() => new A({ keepAlive: true, scheduling: 'lifo', timeout: 5000 }))();"],
  ['the agent kept in a let', 'const DIRECT_AGENT', 'let DIRECT_AGENT'],
  ['the agent exported', 'const DIRECT_AGENT', 'export const DIRECT_AGENT'],
  ['the agent used again', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); DIRECT_AGENT.destroy(); });"],
  ['a second agent', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); new A(); });"],
  ['safeLookup used again', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); safeLookup(url, {}, () => {}); });"],
  ['node:http imported', "import { lookup as dl } from 'node:dns/promises';", "import { lookup as dl } from 'node:dns/promises';\nimport http from 'node:http';"],
  ['node:net imported', "import { lookup as dl } from 'node:dns/promises';", "import { lookup as dl } from 'node:dns/promises';\nimport { connect as c } from 'node:net';"],
  ['node:tls imported', "import { lookup as dl } from 'node:dns/promises';", "import { lookup as dl } from 'node:dns/promises';\nimport 'node:tls';"],
  ['node:http2 imported later', "  req.on('timeout', () => req.destroy());", "  import('node:http2'); req.on('timeout', () => req.destroy());"],
  ['undici re-exported', "import { lookup as dl } from 'node:dns/promises';", "import { lookup as dl } from 'node:dns/promises';\nexport { request as r } from 'undici';"],
  ['a module chosen at run time', "  req.on('timeout', () => req.destroy());", "  import(url); req.on('timeout', () => req.destroy());"],
  ['more taken from node:https', "import { Agent as A, get as g } from 'node:https';", "import { Agent as A, get as g, request as r } from 'node:https';"],
  ['all of node:https', "import { Agent as A, get as g } from 'node:https';", "import { Agent as A, get as g } from 'node:https';\nimport * as h2 from 'node:https';"],
  ['fetch', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => fetch(url));"],
  ['the global agent', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => (A as any)['globalAgent']);"],
  ['process', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => process.exit());"],
  ['globalThis', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => globalThis);"],
  ["a function's constructor", "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => (() => {}).constructor('return this')());"],
  ['a second call in a class extends clause', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); void class extends ((g(url, { headers: h }), Object) as any) {}; });"],
  ['fetch in a class extends clause', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); void class extends ((fetch(url), Object) as any) {}; });"],
  ['the agent changed in a class extends clause', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); void class extends ((Object.assign(DIRECT_AGENT.options, { rejectUnauthorized: false }), Object) as any) {}; });"],
  ['a second agent in a class extends clause', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); void class extends ((new A({ keepAlive: true }), Object) as any) {}; });"],
  ['get kept under another name by an instantiation expression', "  req.on('timeout', () => req.destroy());", "  const again = (g as unknown as <T>() => any)<never>; req.on('timeout', () => req.destroy());"],
  ['the agent reached through the request', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); (req as any).agent.destroy(); });"],
  ['a URL object with an option of its own', 'g(url, {', 'g(Object.assign(new URL(url), { rejectUnauthorized: false }), {'],
  ['the URL written to before the call', '  const req = g(url,', "  url = url + '#'; const req = g(url,"],
  ['the URL handed to a function of its own', '  const req = g(url, { agent: DIRECT_AGENT, headers: h, timeout: t, lookup: safeLookup as any }, () => {});', '  const req = ((url: any) => g(url, { agent: DIRECT_AGENT, headers: h, timeout: t, lookup: safeLookup as any }, () => {}))(new URL(url));'],
  ['the URL written to by an object rest', '  const req = g(url,', '  ({ ...(url as any) } = {}); const req = g(url,'],
  ['get imported a second time', "import { lookup as dl } from 'node:dns/promises';", "import { lookup as dl } from 'node:dns/promises';\nimport { get as g2 } from 'node:https';"],
  ['get named twice in one import', "import { Agent as A, get as g } from 'node:https';", "import { Agent as A, get as g2, get as g } from 'node:https';"],
  ['Agent imported a second time', "import { lookup as dl } from 'node:dns/promises';", "import { lookup as dl } from 'node:dns/promises';\nimport { Agent as A2 } from 'node:https';"],
  ['the agent reached through the request by a key in parentheses', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); (req as any)[('agent')].destroy(); });"],
  ['the agent reached through the request by a string key in a declaration', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); const { 'agent': a } = req as any; a.destroy(); });"],
  ['the agent reached through the request by a string key in a parameter', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); (({ 'agent': a }: any) => a.destroy())(req); });"],
  ['the agent reached through the request by a string key in a catch clause', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { try { throw req; } catch ({ 'agent': a }: any) { a.destroy(); } });"],
  ['the agent reached through the request by a string key in a for-of loop', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { for (const { 'agent': a } of [req as any]) a.destroy(); });"],
  ['the agent reached through the request by a string key in a nested pattern', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { const { 'res': { 'agent': a } } = { res: req } as any; a.destroy(); });"],
  ['the agent reached through the request by a computed key in a declaration', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { const { ['agent']: a } = req as any; a.destroy(); });"],
  ['the agent reached through the request by a string key in an assignment', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { let a: any; ({ 'agent': a } = req as any); a.destroy(); });"],
  ["a function's constructor by a string key in a declaration", "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { const { 'constructor': F } = (() => {}) as any; F('return this')(); });"],
  ['fetch by a string key in a declaration', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { const { 'fetch': send } = req as any; send(url); });"],
  ['the agent named as the key of an accessor', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => void { get 'agent'() { return req; } });"],
  ['fetch named as the key of a class member', "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => void class { 'fetch' = url; });"],
  ["the request's socket", "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => req.socket?.destroy());"],
  ["the request's connection", "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => (req as any).connection?.destroy());"],
  ["the response's socket by its other name", '}, () => {});', '}, (res: any) => res.client?.destroy());'],
  ["the request's own writer", "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); (req as any)._send(''); });"],
  ["the request's raw writer", "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); (req as any)._writeRaw(''); });"],
  ["the request's queued output", "  req.on('timeout', () => req.destroy());", "  req.on('timeout', () => { req.destroy(); void (req as any).outputData; });"],
];
// The shape with names written only in type positions, which never run: it
// passes the checks.
const TYPES = `${SHAPE}\ntype R = typeof fetch;\ninterface P extends Pick<typeof globalThis, 'fetch'> { agent: typeof process; }\nexport class K implements Partial<ReturnType<typeof g>> { x: typeof DIRECT_AGENT | null = null; }`;

const FILES = [
  ['src/engine.ts', engineProblems],
  ['dist/engine.js', engineProblems],
  ['src/cli.ts', cliProblems],
  ['dist/cli.js', cliProblems],
];

describe('direct connection, in the source: one request call, on the engine\'s own agent', () => {
  it('the checks pass a source of the engine\'s shape, and fail each change to it', () => {
    assert.deepEqual(engineProblems(parse('shape.ts', SHAPE)), [], 'the shape itself fails the checks');
    assert.deepEqual(engineProblems(parse('types.ts', TYPES)), [], 'a name in a type position was read as code');
    for (const [name, from, to] of CHANGES) {
      assert.equal(SHAPE.split(from).length, 2, `${name}: the text to change does not occur once`);
      const problems = engineProblems(parse('shape.ts', SHAPE.replace(from, to)));
      assert.ok(problems.length > 0, `${name}: the checks did not catch it`);
    }
    assert.deepEqual(cliProblems(parse('cli.ts', "import { scoreUrl } from './engine.js';\nprocess.exit(0);")), []);
    assert.ok(cliProblems(parse('cli.ts', "import { scoreUrl } from './engine.js';\nawait fetch('https://example.test/');")).length > 0);
    assert.ok(cliProblems(parse('cli.ts', "import { scoreUrl } from './engine.js';\nimport https from 'node:https';")).length > 0);
    assert.ok(cliProblems(parse('cli.ts', "import { scoreUrl } from './engine.js';\nvoid class extends ((fetch('https://example.test/'), Object) as any) {};")).length > 0);
    assert.ok(cliProblems(parse('cli.ts', "import { scoreUrl } from './engine.js';\nconst { 'getBuiltinModule': load } = process as any;")).length > 0);
    assert.ok(cliProblems(parse('cli.ts', "import { scoreUrl } from './engine.js';\nvoid (process as any).execve;")).length > 0);
  });

  for (const [file, problemsOf] of FILES) {
    it(`${file}: ${problemsOf === engineProblems ? 'one request call, with agent DIRECT_AGENT and lookup safeLookup, and no other way out' : 'imports the engine and sends no request of its own'}`, () => {
      assert.deepEqual(problemsOf(read(file)), [], `${file} breaks the shape that keeps every request on the engine's agent`);
    });
  }
});
