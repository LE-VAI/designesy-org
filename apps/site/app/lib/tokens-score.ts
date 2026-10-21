// designesy_tokens_score: the tokens contract's ten checks (t01-t10), run on one
// DTCG token file.
//
// WHY THIS MODULE EXISTS
// The checks lived inside the MCP route, so nothing outside a deploy could run
// them, and the PyPI server kept its own copy. Two defects followed:
//   - The score was PASS / all ten checks x 100, so a check that could not apply
//     counted as a zero: a clean file with no custom types (t07 SKIP) scored 90,
//     while designesy_motion_score states "SKIP is not scored" and the score
//     engine leaves MANUAL out. The score is now PASS / scored checks x 100;
//     WARN and FAIL earned nothing until 1.13.8 (see below).
//   - The two copies wrote different check names (the hosted one read the
//     contract by array position, the PyPI one hard-coded short names) and
//     different detail text. Names are now the contract's own, looked up by id.
//
// Since 1.13.8 (tokens contract 0.1.2), three more defects are fixed:
//   - A WARN counts half, as it does in designesy_motion_score, the score
//     engine and the npm @designesy/tokens validator. It counted zero
//     here alone, so the same file graded differently depending on which
//     Designesy tool read it.
//   - A DTCG alias such as {space.16} was read as a literal dimension with no
//     unit, so a file that aliased its dimensions WARNed twice (t08 and t10)
//     for doing what the format asks. An alias is now a reference: t08 checks
//     the value it resolves to, and one that resolves to nothing is reported
//     as unresolved rather than as a missing unit.
//   - A token named $root (the 2025.10 name for a group's own value) was
//     skipped with the other $-properties, so it was never checked. It is now
//     a token like any other, at the path group.$root, and an alias may name
//     it ({surface.$root}).
//   The 2025.10 dimension form, { value, unit }, was not read at all (only
//   strings and bare numbers were), so it is now checked in t08 too.
//
// Since tokens contract 0.1.3, the checks read a file the way the 2025.10
// Format Module does:
//   - A token's type is its own $type, else the type of the token its value
//     references, else the closest $type on the groups above it, a group's
//     $extends included (5.2.2, 6.7.3). Only a $type written on the token was
//     counted, so a conformant file that typed its groups FAILed t03 and t06,
//     and t05 and t08 never saw its colours and dimensions. With no tokens,
//     t03 SKIPs, as t06 does.
//   - A token written { $type, $ref } is a token: $ref is the JSON Pointer
//     reference tools MUST support (7.1.2), not a deprecated pattern. A $ref
//     that is not a JSON Pointer (#/...) is reported in t10.
//   - The whole file is walked. A top-level group named tokens (or $tokens)
//     was scored alone and every other group ignored.
//   - A missing $schema WARNs as Designesy policy: the Format Module does not
//     define $schema, and the detail said DTCG requires it.
//   - t08 expects a dimension's 2025.10 form, { value, unit } in px or rem
//     (8.2). A string such as "16px" is reported as the legacy form.
//   - Each chain of aliases, pointers or $extends is followed once per file
//     (TokenFile below). t08 walked each dimension alias's whole chain, so
//     5,000 chained aliases took seconds.
//
// The PyPI server (packages/designesy-mcp, _tokens_score) ports this module line
// for line. Both run on the token files in
// packages/designesy-mcp/test/fixtures/tokens/ and must produce expected.json
// there: the Python suite checks its output, scripts/check-mcp-tool-parity.js
// checks this module's.
//
// PURE AND IMPORT-FREE: the parity gate loads this file with Node's type
// stripping, so it takes the contract as an argument and imports nothing.

export type TokensStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

export type TokensCheck = { id: string; name: string; status: TokensStatus; detail: string };

type Json = unknown;
type Obj = Record<string, Json>;

/** The parts of the tokens contract (/contracts/tokens.json) this module reads. */
export type TokensContractLike = {
  id?: Json;
  version?: Json;
  status?: Json;
  verification?: { checks?: ReadonlyArray<Obj> | Json } | Json;
};

/**
 * The 13 types DTCG 2025.10 defines: seven in its Types section and six in its
 * Composite types section. Until 2026-10-08 (shipped with engine 1.1.0) this
 * list lacked cubicBezier and carried seven names the format does not define
 * (string, boolean, link, borderStyle, borderWeight, radius, spacing), so t06
 * WARNed on a conformant easing token and passed those names as standard.
 * packages/designesy-mcp carries the same list, and its test suite asserts the
 * two stay equal.
 */
export const DTCG_STANDARD_TYPES: ReadonlySet<string> = new Set([
  'color', 'dimension', 'fontFamily', 'fontWeight', 'duration',
  'cubicBezier', 'number',
  'strokeStyle', 'border', 'transition', 'shadow', 'gradient', 'typography',
]);

/** Names used only when a contract lacks a check id. */
export const TOKENS_CHECK_NAMES: Readonly<Record<string, string>> = {
  t01: '$schema declaration',
  t02: 'Token groups present',
  t03: '$type on all tokens',
  t04: '$value on all tokens',
  t05: 'Structured color format',
  t06: 'Standard type names',
  t07: 'Custom type extension',
  t08: 'Dimension units',
  t09: 'Token naming hierarchy',
  t10: 'No deprecated patterns',
};

/** The scoring rule, stated in every result. */
export const TOKENS_SCORING =
  'PASS=1, WARN=0.5, FAIL=0; SKIP is not scored. Score = points / scored checks x 100. A>=90, B>=80, C>=70, D>=60, F<60.';

// CSS length units, which a legacy string dimension ("16px") may end in.
const VALID_DIMENSION_UNITS = [
  'px', 'rem', 'em', '%', 'vw', 'vh', 'vmin', 'vmax',
  'ch', 'ex', 'svh', 'lvh', 'dvh', 'svw', 'lvw', 'dvw',
  'cm', 'mm', 'in', 'pt', 'pc', 'fr',
].sort((a, b) => b.length - a.length); // longest first for suffix matching

// The units the 2025.10 dimension form allows (8.2.1).
const DTCG_DIMENSION_UNITS = ['px', 'rem'];

function isObj(x: Json): x is Obj {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function extractUnit(v: string): string {
  for (const unit of VALID_DIMENSION_UNITS) {
    if (v.endsWith(unit)) return unit;
  }
  return '';
}

/** A DTCG alias: the whole value is one {path.to.token} reference. */
const ALIAS = /^\{[^{}]+\}$/;

function isAlias(v: Json): v is string {
  return typeof v === 'string' && ALIAS.test(v);
}

/**
 * t01: a $schema points at designtokens.org when its URL's host is that name or
 * a subdomain of it (www.designtokens.org). A substring test passed any URL
 * that only contained the name, such as https://designtokens.org.example.com/
 * or https://example.com/designtokens.org. One anchored pattern rather than a
 * URL parser, because the WHATWG parser here and urllib in the PyPI port read
 * a host differently in edge cases (a backslash, a userinfo part); the pattern
 * reads the same in both ports and admits neither.
 */
const DTCG_SCHEMA_HOST = /^https?:\/\/(?:[a-z0-9-]+\.)*designtokens\.org(?::[0-9]+)?(?:[/?#]|$)/i;

/** A JSON Pointer reference (RFC 6901), the form a $ref takes: #/path/to/target. */
function isPointer(v: Json): v is string {
  return typeof v === 'string' && v.startsWith('#/');
}

/** The path segments a {group.token} alias or a #/ JSON Pointer names. */
function refPath(ref: Json): string[] | undefined {
  if (isAlias(ref)) return ref.slice(1, -1).split('.');
  if (isPointer(ref)) return ref.slice(2).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  return undefined;
}

/** A token holds a $value or a $ref; any other object is a group. */
function isToken(node: Obj): boolean {
  return node.$value !== undefined || '$ref' in node;
}

/** The node at a path from the root, or undefined when a segment is missing. */
function nodeAt(root: Obj, path: string[]): Json {
  let node: Json = root;
  for (const part of path) {
    node = isObj(node) && Object.prototype.hasOwnProperty.call(node, part) ? node[part] : undefined;
  }
  return node;
}

/** The literal value an alias resolves to, with the type of the token that holds it. */
type Resolved = { value: Json; type: string | null };

/**
 * The file being scored, and what is worked out once for it: the type each
 * group takes through its $extends, the type of each token, and what each
 * alias resolves to. Every chain of aliases, pointers or $extends is followed
 * in a loop and each answer kept, so a chain of n references costs n steps in
 * all. Following it again from every token on it cost n * n, and the recursion
 * ran out of stack on a chain of 5,000 untyped aliases (the PyPI port's, on
 * one of 1,200).
 */
type TokenFile = {
  root: Obj;
  groupTypes: Map<Obj, string | null>;
  tokenTypes: Map<Obj, Json>;
  aliases: Map<string, Resolved | undefined>;
};

/**
 * A group's own $type, else the one the group its $extends names gives,
 * through any chain of $extends (6.7.3); null when none has one or the chain
 * loops.
 */
function extendedType(group: Obj, file: TokenFile): string | null {
  const chain: Obj[] = [];
  const onChain = new Set<Obj>();
  let node: Json = group;
  let type: string | null = null;
  while (isObj(node) && !isToken(node) && !onChain.has(node)) {
    const known = file.groupTypes.get(node);
    if (known !== undefined) {
      type = known;
      break;
    }
    chain.push(node);
    onChain.add(node);
    if (typeof node.$type === 'string' && node.$type) {
      type = node.$type;
      break;
    }
    const path = refPath(node.$extends);
    node = path ? nodeAt(file.root, path) : undefined;
  }
  for (const g of chain) file.groupTypes.set(g, type);
  return type;
}

/**
 * The $type a group gives the tokens in it: its own, else the one the group
 * its $extends names gives (the group's type after extension, 6.7.3), else
 * the type it inherits from the groups above it.
 */
function groupType(group: Obj, inherited: string | null, file: TokenFile): string | null {
  return extendedType(group, file) ?? inherited;
}

/** The node at a path, with the type the groups above it give it. */
function locate(file: TokenFile, path: string[]): { node: Json; inherited: string | null } {
  let node: Json = file.root;
  let inherited: string | null = null;
  for (const part of path) {
    if (!isObj(node) || !Object.prototype.hasOwnProperty.call(node, part)) return { node: undefined, inherited };
    inherited = groupType(node, inherited, file);
    node = node[part];
  }
  return { node, inherited };
}

/**
 * The token a token's {alias} value or #/path/$value pointer names, with the
 * type its groups give it; undefined when it names none. A pointer into part
 * of a value names no token.
 */
function referencedToken(token: Obj, file: TokenFile): { node: Obj; inherited: string | null } | undefined {
  let path: string[] | undefined;
  if (isAlias(token.$value)) {
    path = refPath(token.$value);
  } else if (token.$value === undefined && isPointer(token.$ref)) {
    path = refPath(token.$ref);
    if (path && path[path.length - 1] === '$value') path = path.slice(0, -1);
  }
  if (!path) return undefined;
  const target = locate(file, path);
  return isObj(target.node) && isToken(target.node) ? { node: target.node, inherited: target.inherited } : undefined;
}

/**
 * A token's type (5.2.2): its own $type, else the type of the token its
 * {alias} value or #/path/$value pointer references, else the type the groups
 * above it give it (null when none does). A pointer into part of a value
 * names no token, so its token takes the groups' type. The tokens on a loop
 * of references take their groups' type: the value of every token on a loop
 * is unknown (7.2.3).
 */
function tokenType(token: Obj, inherited: string | null, file: TokenFile): Json {
  const chain: Array<{ token: Obj; inherited: string | null }> = [];
  const onChain = new Map<Obj, number>();
  let node = token;
  let nodeInherited = inherited;
  let type: Json = null;
  for (;;) {
    if (file.tokenTypes.has(node)) {
      type = file.tokenTypes.get(node);
      break;
    }
    if (node.$type) {
      type = node.$type;
      break;
    }
    const at = onChain.get(node);
    if (at !== undefined) {
      for (const c of chain.splice(at)) file.tokenTypes.set(c.token, c.inherited);
      type = nodeInherited;
      break;
    }
    onChain.set(node, chain.length);
    chain.push({ token: node, inherited: nodeInherited });
    const target = referencedToken(node, file);
    if (!target) break;
    node = target.node;
    nodeInherited = target.inherited;
  }
  // Each token before the end takes the type found past it, else its groups'.
  for (let i = chain.length - 1; i >= 0; i--) {
    type = type || chain[i].inherited;
    file.tokenTypes.set(chain[i].token, type);
  }
  return type;
}

/**
 * Follow an alias to the literal value it names, through any chain of aliases,
 * with the type of the token that holds it (null when it has none).
 * Path segments are group and token names, $root included. Returns undefined
 * when a segment is missing, the target is not a token, or the chain loops.
 */
function resolveAlias(alias: string, file: TokenFile): Resolved | undefined {
  const chain: string[] = [];
  const onChain = new Set<string>();
  let ref = alias;
  let resolved: Resolved | undefined;
  while (isAlias(ref) && !onChain.has(ref)) {
    if (file.aliases.has(ref)) {
      resolved = file.aliases.get(ref);
      break;
    }
    chain.push(ref);
    onChain.add(ref);
    const { node, inherited } = locate(file, ref.slice(1, -1).split('.'));
    if (!isObj(node) || node.$value === undefined) break;
    if (!isAlias(node.$value)) {
      const type = tokenType(node, inherited, file);
      resolved = { value: node.$value, type: typeof type === 'string' ? type : null };
      break;
    }
    ref = node.$value;
  }
  for (const r of chain) file.aliases.set(r, resolved);
  return resolved;
}

/**
 * How t08 reads a dimension value: 'ok' for the 2025.10 form { value: number,
 * unit } in px or rem, 'legacy' for a string ending in a CSS length unit
 * ("16px"), 'bad' for anything else.
 */
function dimensionForm(v: Json): 'ok' | 'legacy' | 'bad' {
  if (typeof v === 'string') return extractUnit(v) ? 'legacy' : 'bad';
  if (isObj(v) && typeof v.value === 'number' && typeof v.unit === 'string' && DTCG_DIMENSION_UNITS.includes(v.unit)) return 'ok';
  return 'bad';
}

/** How a dimension value prints in a detail line. */
function dimensionText(v: Json): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (isObj(v)) {
    const value = typeof v.value === 'number' ? String(v.value) : typeOf(v.value);
    const unit = typeof v.unit === 'string' ? v.unit : typeOf(v.unit);
    return `{value: ${value}, unit: ${unit}}`;
  }
  return typeOf(v);
}

/** JavaScript's typeof for a JSON value (null and arrays are 'object'). */
function typeOf(v: Json): string {
  return v === undefined ? 'undefined' : v === null || typeof v === 'object' ? 'object' : typeof v;
}

function checkNames(contract: TokensContractLike): Record<string, string> {
  const names: Record<string, string> = { ...TOKENS_CHECK_NAMES };
  const verification = isObj(contract.verification) ? contract.verification : {};
  const rows = Array.isArray(verification.checks) ? verification.checks : [];
  for (const row of rows) {
    if (isObj(row) && typeof row.id === 'string' && typeof row.item === 'string' && row.id in names) names[row.id] = row.item;
  }
  return names;
}

/** Run t01-t10 on one parsed token file (a JSON object). */
export function scoreTokens(tokens: Obj, contract: TokensContractLike, url: string) {
  const names = checkNames(contract);
  const results: TokensCheck[] = [];
  const add = (id: string, status: TokensStatus, detail: string) => results.push({ id, name: names[id], status, detail });

  // t01: $schema present and points to designtokens.org. Designesy policy: the
  // Format Module does not define $schema, so a file without one WARNs.
  const hasSchema = typeof tokens.$schema === 'string' && tokens.$schema !== '';
  const schemaValid = hasSchema && DTCG_SCHEMA_HOST.test(tokens.$schema as string);
  add('t01', schemaValid ? 'PASS' : 'WARN',
    hasSchema ? `Schema: ${tokens.$schema as string}` : 'No $schema found. Designesy policy, not a DTCG requirement: point $schema at https://www.designtokens.org/schemas/2025.10/format.json so editors can validate the file.');

  // t02: token groups exist
  const groupKeys = Object.keys(tokens).filter((k) => !k.startsWith('$'));
  add('t02', groupKeys.length > 0 ? 'PASS' : 'FAIL',
    `${groupKeys.length} token groups found: ${groupKeys.slice(0, 5).join(', ')}${groupKeys.length > 5 ? '...' : ''}`);

  // t03-t10: one walk over the tokens
  let typePassCount = 0;
  let valuePassCount = 0;
  let colorStructureCount = 0;
  let colorBareHexCount = 0;
  let totalTokens = 0;
  const allTypes = new Set<string>();
  const dimensionValues: Array<{ path: string; value: string; form: 'ok' | 'legacy' | 'bad' }> = [];
  const deprecatedPatterns: string[] = [];
  const file: TokenFile = { root: tokens, groupTypes: new Map(), tokenTypes: new Map(), aliases: new Map() };

  const walk = (obj: Obj, path: string, inherited: string | null): void => {
    for (const [key, val] of Object.entries(obj)) {
      // $root is a token (a group's own value), not a property of the group.
      if (key.startsWith('$') && key !== '$root') continue;
      const currentPath = path ? `${path}.${key}` : key;
      if (!isObj(val)) continue;
      if (!isToken(val)) {
        walk(val, currentPath, groupType(val, inherited, file));
        continue;
      }
      totalTokens++;
      const type = tokenType(val, inherited, file);
      if (type) {
        typePassCount++;
        if (typeof type === 'string') allTypes.add(type);
      }
      valuePassCount++;
      if (type === 'color') {
        if (isObj(val.$value) && 'colorSpace' in val.$value) {
          colorStructureCount++;
        } else if (typeof val.$value === 'string' && val.$value.startsWith('#')) {
          colorBareHexCount++;
          deprecatedPatterns.push(`Color token '${currentPath}' uses bare hex (pre-2025.10 pattern)`);
        }
      }
      if (type === 'dimension') {
        if (isAlias(val.$value)) {
          // A reference: its form is the form of the value it resolves to, and
          // the target, if it is a dimension token, answers t10 for itself. A
          // target of another type is named as such.
          const target = resolveAlias(val.$value, file);
          const otherType = target && target.type !== null && target.type !== 'dimension';
          dimensionValues.push(!target
            ? { path: currentPath, value: `${val.$value} (unresolved alias)`, form: 'bad' }
            : otherType
              ? { path: currentPath, value: `${val.$value} -> a ${target.type} token`, form: 'bad' }
              : { path: currentPath, value: `${val.$value} -> ${dimensionText(target.value)}`, form: dimensionForm(target.value) });
        } else if (typeof val.$value === 'string') {
          dimensionValues.push({ path: currentPath, value: val.$value, form: dimensionForm(val.$value) });
          deprecatedPatterns.push(extractUnit(val.$value)
            ? `Dimension token '${currentPath}' uses the pre-2025.10 string form: '${val.$value}' (write { value, unit })`
            : `Dimension token '${currentPath}' has unrecognized or missing unit: '${val.$value}'`);
        } else if (typeof val.$value === 'number') {
          dimensionValues.push({ path: currentPath, value: String(val.$value), form: 'bad' });
          deprecatedPatterns.push(`Dimension token '${currentPath}' uses bare number (should include unit string)`);
        } else if (isObj(val.$value)) {
          dimensionValues.push({ path: currentPath, value: dimensionText(val.$value), form: dimensionForm(val.$value) });
        }
      }
      // A $ref is a JSON Pointer (#/path/to/target); a dot path is not one.
      if ('$ref' in val && !isPointer(val.$ref)) {
        const ref = typeof val.$ref === 'string' ? `'${val.$ref}'` : `a value of type ${typeOf(val.$ref)}`;
        deprecatedPatterns.push(`Token '${currentPath}' has a $ref that is not a JSON Pointer: ${ref} (write #/path/to/token/$value)`);
      }
    }
  };
  walk(tokens, '', groupType(tokens, null, file));

  // t03: $type on all tokens, their own or inherited
  if (totalTokens === 0) add('t03', 'SKIP', 'No tokens found');
  else add('t03', typePassCount === totalTokens ? 'PASS' : typePassCount > 0 ? 'WARN' : 'FAIL',
    `${typePassCount}/${totalTokens} tokens have $type (direct or inherited)`);

  // t04: $value (or a $ref) on all tokens
  add('t04', totalTokens > 0 && valuePassCount === totalTokens ? 'PASS' : 'FAIL',
    `${valuePassCount}/${totalTokens} tokens have $value or $ref`);

  // t05: structured color format (colorSpace + components)
  if (colorStructureCount + colorBareHexCount > 0) {
    add('t05', colorBareHexCount === 0 ? 'PASS' : colorStructureCount > 0 ? 'WARN' : 'FAIL',
      `${colorStructureCount} structured, ${colorBareHexCount} bare hex. DTCG 2025.10 prefers {colorSpace, components} over bare hex strings.`);
  } else {
    add('t05', 'SKIP', 'No color tokens found');
  }

  // t06: standard type names
  const nonStandardTypes = [...allTypes].filter((t) => !DTCG_STANDARD_TYPES.has(t)).sort();
  if (totalTokens === 0) add('t06', 'SKIP', 'No tokens found');
  else if (typePassCount === 0) add('t06', 'FAIL', 'No tokens have $type: cannot verify standard type names');
  else if (nonStandardTypes.length === 0) add('t06', 'PASS', `All ${allTypes.size} unique type(s) are DTCG 2025.10 standard: ${[...allTypes].sort().join(', ')}`);
  else add('t06', 'WARN', `Non-standard type(s) found: ${nonStandardTypes.join(', ')}. These may be valid custom types (see t07).`);

  // t07: custom types follow the dot-namespacing convention
  const customTypes = [...allTypes].filter((t) => !DTCG_STANDARD_TYPES.has(t)).sort();
  if (customTypes.length === 0) {
    add('t07', 'SKIP', 'No custom types found');
  } else {
    const bareCustoms = customTypes.filter((t) => !t.includes('.'));
    if (bareCustoms.length === 0) add('t07', 'PASS', `All ${customTypes.length} custom type(s) use dot-namespacing: ${customTypes.join(', ')}`);
    else add('t07', 'WARN', `Custom type(s) without namespacing (recommend dot-prefix like 'com.example.glow'): ${bareCustoms.join(', ')}`);
  }

  // t08: dimension tokens use the 2025.10 form, { value, unit } in px or rem.
  // A legacy string ("16px") WARNs; t08 FAILs only when no value is usable.
  if (dimensionValues.length === 0) {
    add('t08', 'SKIP', 'No dimension tokens found');
  } else {
    const others = dimensionValues.filter((d) => d.form !== 'ok')
      .map((d) => `${d.path}='${d.value}'${d.form === 'legacy' ? ' (legacy string)' : ''}`);
    const bad = dimensionValues.filter((d) => d.form === 'bad').length;
    if (others.length === 0) {
      add('t08', 'PASS', `All ${dimensionValues.length} dimension token(s) use the 2025.10 form { value, unit } in px or rem`);
    } else {
      add('t08', bad < dimensionValues.length ? 'WARN' : 'FAIL',
        `${others.length}/${dimensionValues.length} dimension token(s) are not { value, unit } in px or rem: ${others.slice(0, 5).join(', ')}`);
    }
  }

  // t09: tokens are organised into groups (nesting is the dot hierarchy)
  if (totalTokens === 0) add('t09', 'FAIL', 'No tokens found: cannot assess naming hierarchy');
  else if (groupKeys.length > 0) add('t09', 'PASS', `${groupKeys.length} token group(s) with nested hierarchy: ${groupKeys.slice(0, 5).join(', ')}${groupKeys.length > 5 ? '...' : ''}`);
  else add('t09', 'WARN', 'No token groups found: tokens should be organized into groups (e.g., color, spacing, typography)');

  // t10: no pre-2025.10 patterns
  if (deprecatedPatterns.length === 0) {
    add('t10', 'PASS', 'No deprecated DTCG patterns detected (no bare hex colors, no string or bare number dimensions, no $ref that is not a JSON Pointer)');
  } else {
    add('t10', 'WARN', `${deprecatedPatterns.length} deprecated pattern(s) found: ${deprecatedPatterns.slice(0, 3).join('; ')}${deprecatedPatterns.length > 3 ? '...' : ''}`);
  }

  const count = (s: TokensStatus) => results.filter((r) => r.status === s).length;
  const pass = count('PASS'), warn = count('WARN'), fail = count('FAIL'), skip = count('SKIP');
  const scored = pass + warn + fail;
  const score = scored > 0 ? Math.round(((pass + warn * 0.5) / scored) * 100) : 0;
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  return {
    contract_id: contract.id ?? null,
    contract_version: contract.version ?? null,
    contract_status: contract.status ?? null,
    url,
    total_tokens: totalTokens,
    score,
    grade,
    pass_count: pass,
    fail_count: fail,
    warn_count: warn,
    skip_count: skip,
    scoring: TOKENS_SCORING,
    checks: results,
    provenance: 'W3C DTCG 2025.10 CG-FINAL + designesy-core.v0.4.0 §8',
    validator_note: 'Canonical validator: @terrazzo/parser 2.4.0 (npm i -D @terrazzo/parser, run: tz check tokens.json)',
  };
}
