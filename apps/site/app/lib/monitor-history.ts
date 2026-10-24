// The request body /api/monitor accepts, checked for shape and bounds before any
// monitor check reads it.
//
// Bounds only: types, a score from 0 to 100, a grade from A to F, drift check
// ids d01 to d12, PASS, FAIL, WARN or SKIP, and string lengths. A run's score is
// not recomputed from its checks: runs stored by an earlier engine scored
// differently and stay valid history. Without this, history [{}] threw at
// previous.checks, and a score that was not a number broke the m03 and m07
// deltas.
//
// `email` is accepted with any value and ignored: email delivery was retired in
// monitor contract 0.1.5 (CHANGELOG), and designesy-mcp 1.13.10 and earlier send
// it when given.
import { z } from 'zod';

export const MONITOR_HISTORY_MAX_RUNS = 1000;
export const MONITOR_BODY_MAX_BYTES = 512 * 1024;
/** m10's detail on every run since monitor contract 0.1.5. */
export const M10_RETIRED_DETAIL = 'Alerts are returned in the response; email delivery was retired';

const driftCheck = z.object({
  id: z.string().regex(/^d(0[1-9]|1[0-2])$/),
  item: z.string().max(200),
  category: z.string().max(64),
  status: z.enum(['PASS', 'FAIL', 'WARN', 'SKIP']),
  detail: z.string().max(4096),
});

export const monitorSnapshotSchema = z.object({
  // An unparseable timestamp is allowed: m02 SKIPs it.
  timestamp: z.string().max(64),
  score: z.number().min(0).max(100),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  tokensExtracted: z.number().int().min(0).max(1_000_000),
  checks: z.array(driftCheck).max(12),
});

export const monitorHistorySchema = z.array(monitorSnapshotSchema).max(MONITOR_HISTORY_MAX_RUNS);

export const monitorRequestSchema = z.object({
  url: z.string().max(2048).nullish(),
  history: monitorHistorySchema.nullish(),
  cadence: z.unknown().optional(),
  email: z.unknown().optional(),
});

export type MonitorRequest = z.infer<typeof monitorRequestSchema>;

/** The first problem, as { path: 'history[0].score', error: 'history[0].score: <zod message>' }. */
export function requestProblem(error: z.ZodError): { path: string; error: string } {
  const issue = error.issues[0];
  const path = (issue?.path ?? []).reduce<string>(
    (at, key) => (typeof key === 'number' ? `${at}[${key}]` : at ? `${at}.${String(key)}` : String(key)),
    '',
  ) || 'body';
  return { path, error: `${path}: ${issue?.message ?? 'invalid request body'}` };
}
