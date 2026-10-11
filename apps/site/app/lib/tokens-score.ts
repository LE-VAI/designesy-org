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
//     WARN and FAIL still earn nothing, as the tokens contract has always said.
//   - The two copies wrote different check names (the hosted one read the
//     contract by array position, the PyPI one hard-coded short names) and
//     different detail text. Names are now the contract's own, looked up by id.
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
  'PASS=1, WARN=0, FAIL=0; SKIP is not scored. Score = points / scored checks x 100. A>=90, B>=80, C>=70, D>=60, F<60.';

const VALID_DIMENSION_UNITS = [
  'px', 'rem', 'em', '%', 'vw', 'vh', 'vmin', 'vmax',
  'ch', 'ex', 'svh', 'lvh', 'dvh', 'svw', 'lvw', 'dvw',
  'cm', 'mm', 'in', 'pt', 'pc', 'fr',
].sort((a, b) => b.length - a.length); // longest first for suffix matching

function isObj(x: Json): x is Obj {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function extractUnit(v: string): string {
  for (const unit of VALID_DIMENSION_UNITS) {
    if (v.endsWith(unit)) return unit;
  }
  return '';
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
  const picked = tokens.$tokens || tokens.tokens || tokens;
  const tokenGroups: Obj = isObj(picked) ? picked : {};

  // t01: $schema present and points to designtokens.org
  const hasSchema = typeof tokens.$schema === 'string' && tokens.$schema !== '';
  const schemaValid = hasSchema && (tokens.$schema as string).includes('designtokens.org');
  add('t01', schemaValid ? 'PASS' : hasSchema ? 'WARN' : 'FAIL',
    hasSchema ? `Schema: ${tokens.$schema as string}` : 'No $schema found. DTCG 2025.10 requires $schema pointing to designtokens.org/schemas/2025.10/format.json');

  // t02: token groups exist
  const groupKeys = Object.keys(tokenGroups).filter((k) => !k.startsWith('$'));
  add('t02', groupKeys.length > 0 ? 'PASS' : 'FAIL',
    `${groupKeys.length} token groups found: ${groupKeys.slice(0, 5).join(', ')}${groupKeys.length > 5 ? '...' : ''}`);

  // t03-t10: one walk over the tokens
  let typePassCount = 0;
  let valuePassCount = 0;
  let colorStructureCount = 0;
  let colorBareHexCount = 0;
  let totalTokens = 0;
  const allTypes = new Set<string>();
  const dimensionValues: Array<{ path: string; value: string }> = [];
  const deprecatedPatterns: string[] = [];

  const walk = (obj: Obj, path: string): void => {
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('$')) continue;
      const currentPath = path ? `${path}.${key}` : key;
      if (!isObj(val)) continue;
      if (val.$value === undefined) {
        walk(val, currentPath);
        continue;
      }
      totalTokens++;
      if (val.$type) {
        typePassCount++;
        if (typeof val.$type === 'string') allTypes.add(val.$type);
      }
      valuePassCount++;
      if (val.$type === 'color') {
        if (isObj(val.$value) && 'colorSpace' in val.$value) {
          colorStructureCount++;
        } else if (typeof val.$value === 'string' && val.$value.startsWith('#')) {
          colorBareHexCount++;
          deprecatedPatterns.push(`Color token '${currentPath}' uses bare hex (pre-2025.10 pattern)`);
        }
      }
      if (val.$type === 'dimension') {
        if (typeof val.$value === 'string') {
          dimensionValues.push({ path: currentPath, value: val.$value });
          if (!extractUnit(val.$value)) {
            deprecatedPatterns.push(`Dimension token '${currentPath}' has unrecognized or missing unit: '${val.$value}'`);
          }
        } else if (typeof val.$value === 'number') {
          dimensionValues.push({ path: currentPath, value: String(val.$value) });
          deprecatedPatterns.push(`Dimension token '${currentPath}' uses bare number (should include unit string)`);
        }
      }
      if ('$ref' in val) {
        deprecatedPatterns.push(`Token '${currentPath}' uses deprecated $ref syntax (use {path} in $value)`);
      }
    }
  };
  walk(tokenGroups, '');

  // t03: $type on all tokens
  add('t03', totalTokens > 0 && typePassCount === totalTokens ? 'PASS' : typePassCount > 0 ? 'WARN' : 'FAIL',
    `${typePassCount}/${totalTokens} tokens have $type`);

  // t04: $value on all tokens
  add('t04', totalTokens > 0 && valuePassCount === totalTokens ? 'PASS' : 'FAIL',
    `${valuePassCount}/${totalTokens} tokens have $value`);

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

  // t08: dimension tokens have valid CSS length units
  if (dimensionValues.length === 0) {
    add('t08', 'SKIP', 'No dimension tokens found');
  } else {
    const badUnits = dimensionValues.filter((d) => !extractUnit(d.value)).map((d) => `${d.path}='${d.value}'`);
    if (badUnits.length === 0) {
      add('t08', 'PASS', `All ${dimensionValues.length} dimension token(s) use valid units (px, rem, em, %, etc.)`);
    } else {
      add('t08', badUnits.length < dimensionValues.length ? 'WARN' : 'FAIL',
        `${badUnits.length}/${dimensionValues.length} dimension token(s) have missing/unrecognized units: ${badUnits.slice(0, 5).join(', ')}`);
    }
  }

  // t09: tokens are organised into groups (nesting is the dot hierarchy)
  if (totalTokens === 0) add('t09', 'FAIL', 'No tokens found: cannot assess naming hierarchy');
  else if (groupKeys.length > 0) add('t09', 'PASS', `${groupKeys.length} token group(s) with nested hierarchy: ${groupKeys.slice(0, 5).join(', ')}${groupKeys.length > 5 ? '...' : ''}`);
  else add('t09', 'WARN', 'No token groups found: tokens should be organized into groups (e.g., color, spacing, typography)');

  // t10: no pre-2025.10 patterns
  if (deprecatedPatterns.length === 0) {
    add('t10', 'PASS', 'No deprecated DTCG patterns detected (no bare hex colors, no bare number dimensions, no $ref syntax)');
  } else {
    add('t10', 'WARN', `${deprecatedPatterns.length} deprecated pattern(s) found: ${deprecatedPatterns.slice(0, 3).join('; ')}${deprecatedPatterns.length > 3 ? '...' : ''}`);
  }

  const count = (s: TokensStatus) => results.filter((r) => r.status === s).length;
  const pass = count('PASS'), warn = count('WARN'), fail = count('FAIL'), skip = count('SKIP');
  const scored = pass + warn + fail;
  const score = scored > 0 ? Math.round((pass / scored) * 100) : 0;
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
