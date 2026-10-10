// Narrower results for the two largest MCP tool outputs.
//
// WHY THIS MODULE EXISTS
// Anthropic's Software Directory Policy 5B asks a server to be frugal with
// tokens and to give users a way to trim what a tool returns. On
// www.designesy.org, designesy_report returned about 100,000 characters and
// designesy_guardrails about 90,000, and a client that caps tool output cut
// both off. The report repeats each engine's whole result (every check with its
// remediation, category scores, receipts) beside one merged check list, and
// the guardrails bundle carries six generated files.
//
// Two optional, backward-compatible parameters trim them:
//   designesy_report     detail: "summary" | "full" (default "full")
//   designesy_guardrails parts: [...] (default: the whole bundle)
// Omitting them returns exactly what the tools returned before.
//
// The PyPI server ports these functions (_report_summary, _guardrails_parts).
// Both run on packages/designesy-mcp/test/fixtures/trim/ and must produce
// expected.json there: the Python suite checks its output, and
// scripts/check-mcp-tool-parity.js checks this module's.
//
// PURE AND IMPORT-FREE: the parity gate loads this file with Node's type
// stripping.

type Obj = Record<string, unknown>;

/** The values designesy_report's `detail` accepts. */
export const REPORT_DETAILS = ['summary', 'full'] as const;

/** The engine results a report carries, in the order it lists them. */
export const REPORT_ENGINES = ['score', 'drift', 'readiness'] as const;

/** The six files of a guardrails bundle, by the key /api/guardrails gives each. */
export const GUARDRAILS_PARTS = ['tokens', 'lintConfig', 'agentRules', 'componentContract', 'antiPatterns', 'designMd'] as const;

function isObj(x: unknown): x is Obj {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function isScalar(x: unknown): boolean {
  return x === null || typeof x !== 'object';
}

function notPass(list: unknown): unknown[] {
  return Array.isArray(list) ? list.filter((c) => !(isObj(c) && c.status === 'PASS')) : [];
}

/**
 * designesy_report with detail "summary": the same keys as the full report,
 * fewer rows. The composite and the totals stay; each engine (score, drift,
 * readiness) keeps only its own score, grade, counts and other single values,
 * without its check list, category scores or receipt; checks and synthesis keep
 * only the entries that did not PASS. A result without a check list (an error)
 * is returned unchanged.
 */
export function reportSummary(report: unknown): unknown {
  if (!isObj(report) || !Array.isArray(report.checks)) return report;
  const engines: readonly string[] = REPORT_ENGINES;
  const out: Obj = { detail: 'summary' };
  for (const k of Object.keys(report)) {
    const v = report[k];
    if (isScalar(v)) {
      out[k] = v;
    } else if (engines.includes(k) && isObj(v)) {
      const s: Obj = {};
      for (const ek of Object.keys(v)) {
        if (isScalar(v[ek])) s[ek] = v[ek];
      }
      out[k] = s;
    } else if (k === 'checks' || k === 'synthesis') {
      out[k] = notPass(v);
    }
  }
  const kept = (k: string) => (Array.isArray(out[k]) ? (out[k] as unknown[]).length : 0);
  const given = (k: string) => (Array.isArray(report[k]) ? (report[k] as unknown[]).length : 0);
  out.omitted = {
    pass_checks: given('checks') - kept('checks'),
    pass_synthesis: given('synthesis') - kept('synthesis'),
    note: 'Left out: the checks that PASS, and from each engine its check list, category scores and receipt. Call again with detail "full" for everything.',
  };
  return out;
}

/** The names asked for, duplicates dropped, or why they cannot be used. */
export function guardrailsPartNames(parts: readonly string[]): { names: string[] } | { error: string; unknown: string[] } {
  const names = [...new Set(parts)];
  if (names.length === 0) return { error: 'parts is empty; name at least one part, or omit it for the whole bundle.', unknown: [] };
  const valid: readonly string[] = GUARDRAILS_PARTS;
  const unknown = names.filter((n) => !valid.includes(n));
  if (unknown.length > 0) return { error: `Unknown guardrails part(s): ${unknown.join(', ')}.`, unknown };
  return { names };
}

/**
 * designesy_guardrails with parts: the same result with only the named bundle
 * files, in the order asked, and a `parts` list naming them. Everything outside
 * the bundle (score, grade, counts, checks) is kept. A result without a bundle
 * (an error) is returned unchanged.
 */
export function guardrailsParts(result: unknown, names: readonly string[]): unknown {
  if (!isObj(result) || !isObj(result.bundle)) return result;
  const bundle = result.bundle;
  const out: Obj = {};
  for (const k of Object.keys(result)) {
    if (k !== 'bundle') {
      out[k] = result[k];
      continue;
    }
    out.parts = [...names];
    const picked: Obj = {};
    for (const n of names) picked[n] = Object.prototype.hasOwnProperty.call(bundle, n) ? bundle[n] : null;
    out.bundle = picked;
  }
  return out;
}
