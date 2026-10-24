// The request body /api/monitor accepts, checked for shape and bounds before any
// monitor check reads it. The route and the hosted designesy_monitor_score tool
// (app/api/mcp/route.ts) share it, so both accept the same history.
//
// Bounds only: types, a score from 0 to 100, a grade from A to F, drift check
// ids d01 to d12, PASS, FAIL, WARN or SKIP, and string lengths. A run's score is
// not recomputed from its checks: runs stored by an earlier engine scored
// differently and stay valid history. Without this, history [{}] threw at
// previous.checks, and a score such as "x" made the m03, m04 and m07 deltas NaN.
//
// Only what a monitor check reads is required: a run's score (m03, m04, m07),
// its tokensExtracted (m08) and its checks with their id and status (m05, m06).
// The timestamp (m02 SKIPs a run without one), the grade and each check's item,
// category and detail are bounded when present, so a caller that trims its
// earlier runs to what the checks read is still answered.
//
// Each array's length is checked before its elements are parsed, and parsing
// stops at the first element that fails (boundedArray, below).
//
// `email` is accepted with any value and ignored: email delivery was retired in
// monitor contract 0.1.5 (CHANGELOG), and designesy-mcp 1.13.10 and earlier send
// it when given.
import { z } from 'zod';

export const MONITOR_HISTORY_MAX_RUNS = 1000;
export const MONITOR_CHECKS_MAX = 12;
export const MONITOR_BODY_MAX_BYTES = 512 * 1024;
/** m10's detail on every run since monitor contract 0.1.5. */
export const M10_RETIRED_DETAIL = 'Alerts are returned in the response; email delivery was retired';

// z.array(item).max(n) parses every element before .max() runs, and keeps every
// element's issues. Measured on zod 4.6.5 through the route: one run holding
// 30,000 empty checks (a 90 KB body) threw a RangeError while zod merged the
// issues, so the route answered 500, and a 512 KB history of empty runs built
// about 870,000 issues before its 400. Here the length is checked first, and
// the elements are parsed one at a time until one fails, so a refused array
// carries the issues of one element at most. As a preprocess, the JSON Schema
// the hosted tool publishes is the plain array's (zod uses the pipe's output
// schema for a transform's input).
function boundedArray<T extends z.ZodType>(item: T, max: number) {
  return z.preprocess((value, ctx) => {
    // Not an array: the array schema below reports the type.
    if (!Array.isArray(value)) return value;
    if (value.length > max) {
      ctx.addIssue({ code: 'too_big', origin: 'array', maximum: max, inclusive: true, input: value });
      return value;
    }
    for (let i = 0; i < value.length; i++) {
      const parsed = item.safeParse(value[i]);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: [i, ...issue.path], input: value[i] });
        return value;
      }
    }
    return value;
  }, z.array(item).max(max));
}

const driftCheck = z.object({
  id: z.string().regex(/^d(0[1-9]|1[0-2])$/),
  item: z.string().max(200).optional(),
  category: z.string().max(64).optional(),
  status: z.enum(['PASS', 'FAIL', 'WARN', 'SKIP']),
  detail: z.string().max(4096).optional(),
});

export const monitorSnapshotSchema = z.object({
  // A missing or unparseable timestamp is allowed: m02 SKIPs it.
  timestamp: z.string().max(64).optional(),
  score: z.number().min(0).max(100),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']).optional(),
  tokensExtracted: z.number().int().min(0).max(1_000_000),
  checks: boundedArray(driftCheck, MONITOR_CHECKS_MAX),
});

export const monitorHistorySchema = boundedArray(monitorSnapshotSchema, MONITOR_HISTORY_MAX_RUNS);

export const monitorRequestSchema = z.object({
  url: z.string().max(2048).nullish(),
  // null means no history, as it did before the schema.
  history: monitorHistorySchema.nullish(),
  cadence: z.unknown().optional(),
  email: z.unknown().optional(),
});

export type MonitorRequest = z.infer<typeof monitorRequestSchema>;
/** One earlier run as the request carries it. */
export type PriorRun = z.infer<typeof monitorSnapshotSchema>;

/** The first problem, as { path: 'history[0].score', error: 'history[0].score: <zod message>' }. */
export function requestProblem(error: z.ZodError): { path: string; error: string } {
  const issue = error.issues[0];
  const path = (issue?.path ?? []).reduce<string>(
    (at, key) => (typeof key === 'number' ? `${at}[${key}]` : at ? `${at}.${String(key)}` : String(key)),
    '',
  ) || 'body';
  return { path, error: `${path}: ${issue?.message ?? 'invalid request body'}` };
}
