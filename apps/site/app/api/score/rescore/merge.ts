// The browser audit's verdicts, folded into a static run. Pure functions with
// no imports, so scripts/check-audit-rescore.mjs runs them under Node as they
// ship. The scoring itself is the engine's scoreArithmetic (../route.ts); this
// module only decides which verdicts may replace which.

/** The three checks the static run leaves to a browser, and the audit settles. */
export const AUDIT_CHECK_IDS: readonly string[] = ['v02', 'v04', 'v21'];

const STATUSES = new Set(['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL']);

export type Verdict = {
  id: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'MANUAL';
  detail: string;
};

/**
 * The verdicts a rescore request may carry: an audit check id, a known
 * status and a text detail. Anything else is dropped, so a request can never
 * rewrite a check the static run measured.
 */
export function auditVerdicts(raw: unknown): Verdict[] {
  if (!Array.isArray(raw)) return [];
  const out: Verdict[] = [];
  for (const v of raw.slice(0, 16)) {
    if (!v || typeof v !== 'object') continue;
    const { id, status, detail } = v as Record<string, unknown>;
    if (typeof id !== 'string' || !AUDIT_CHECK_IDS.includes(id)) continue;
    if (typeof status !== 'string' || !STATUSES.has(status)) continue;
    if (out.some((o) => o.id === id)) continue;
    out.push({ id, status: status as Verdict['status'], detail: typeof detail === 'string' ? detail.slice(0, 2000) : '' });
  }
  return out;
}

/** The run's checks, each audit verdict in place of the run's own for its id. */
export function mergeVerdicts<C extends { id: string; status: string; detail: string }>(checks: C[], verdicts: Verdict[]): C[] {
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  return checks.map((c) => {
    const v = byId.get(c.id);
    return v ? ({ ...c, status: v.status, detail: v.detail } as C) : c;
  });
}

/** Status counts, as /api/score reports them. */
export function tally(checks: { status: string }[]): {
  pass: number; fail: number; warn: number; skip: number; manual: number; total: number; scored: number;
} {
  const n = (s: string) => checks.filter((c) => c.status === s).length;
  const skip = n('SKIP');
  const manual = n('MANUAL');
  return { pass: n('PASS'), fail: n('FAIL'), warn: n('WARN'), skip, manual, total: checks.length, scored: checks.length - skip - manual };
}
