// Privacy-preserving usage counters (sprint item F7, approved 2026-10-08).
//
// Why: Phase A's day-90 gate asks whether anyone uses the engine, and through
// which surface. Nothing counted calls before this, so every adoption claim was
// a guess.
//
// What is stored, per UTC day and per key (an MCP tool, or a /api/score client):
//   - calls:   a counter (INCR).
//   - callers: a HyperLogLog sketch (PFADD) of a salted hash of the caller's IP.
//     A sketch answers "about how many distinct callers" and cannot list them,
//     and the salt changes daily, so one caller cannot be linked across days.
// Never stored: the URL scored, any contract, the IP, or the user-agent string.
// Keys come from closed lists (MCP_TOOL_NAMES, SCORE_CLIENTS), so a caller
// cannot mint new keys, and every key expires after USAGE_TTL_DAYS.
//
// Recording never blocks or fails a request: callers schedule it with
// next/server `after`, and it swallows its own errors. Without the Upstash env
// (local, CI, previews without secrets) it does nothing.

import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { MCP_TOOL_NAMES } from './mcp-tool-registry';

export const USAGE_TTL_DAYS = 400;
const PREFIX = 'designesy:usage';

export const SCORE_CLIENTS = ['browser', 'mcp', 'action', 'cli', 'script'] as const;
export type ScoreClient = (typeof SCORE_CLIENTS)[number];

// The minimal Redis surface used here, so tests can pass a fake.
export interface UsageStore {
  pipeline(): {
    incr(key: string): unknown;
    pfadd(key: string, ...elements: string[]): unknown;
    sadd(key: string, ...members: string[]): unknown;
    expire(key: string, seconds: number): unknown;
    exec(): Promise<unknown>;
  };
}

let cached: Redis | null | undefined;
function defaultStore(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? new Redis({ url, token }) : null;
  return cached;
}

/** Which surface called /api/score, from its user agent. */
export function scoreClientOf(userAgent: string | null): ScoreClient {
  const ua = (userAgent || '').toLowerCase();
  if (ua.startsWith('designesy-mcp/')) return 'mcp';
  if (ua.startsWith('designesy-contract-check/')) return 'action';
  if (ua.startsWith('designesy-score-cli/')) return 'cli';
  if (ua.startsWith('mozilla/')) return 'browser';
  return 'script';
}

/** Tool names in a JSON-RPC body (single or batch) that are registered MCP tools. */
export function toolCallNames(bodyText: string): string[] {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return [];
  }
  const known = new Set<string>(MCP_TOOL_NAMES);
  const messages = Array.isArray(body) ? body : [body];
  const names: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const msg = m as { method?: unknown; params?: { name?: unknown } };
    if (msg.method !== 'tools/call') continue;
    const name = msg.params?.name;
    if (typeof name === 'string' && known.has(name)) names.push(name);
  }
  return names;
}

function callerHash(request: Request, day: string): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown';
  // An optional dedicated salt; CRON_SECRET is already a server-only secret.
  const salt = process.env.USAGE_SALT || process.env.CRON_SECRET || '';
  return createHash('sha256').update(`${salt}:${day}:${ip}`).digest('hex').slice(0, 32);
}

/**
 * Count one call under `key` ("mcp:<tool>" or "score:<client>") for today.
 * Callers pass only keys built from the closed lists above.
 */
export async function recordUsage(
  key: string,
  request: Request,
  store: UsageStore | null = defaultStore(),
  now: Date = new Date(),
): Promise<void> {
  if (!store) return;
  const day = now.toISOString().slice(0, 10);
  const base = `${PREFIX}:${day}`;
  const ttl = USAGE_TTL_DAYS * 86400;
  try {
    const p = store.pipeline();
    p.incr(`${base}:${key}:calls`);
    p.pfadd(`${base}:${key}:callers`, callerHash(request, day));
    p.sadd(`${base}:keys`, key);
    p.expire(`${base}:${key}:calls`, ttl);
    p.expire(`${base}:${key}:callers`, ttl);
    p.expire(`${base}:keys`, ttl);
    await p.exec();
  } catch {
    // Counting must never affect the request it counts.
  }
}

export interface DayUsage {
  day: string;
  keys: Record<string, { calls: number; callers: number }>;
}

/** Read the last `days` UTC days of counters (newest first). */
export async function readUsage(days: number, now: Date = new Date()): Promise<DayUsage[] | null> {
  const store = defaultStore();
  if (!store) return null;
  const out: DayUsage[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    const base = `${PREFIX}:${day}`;
    const keys = ((await store.smembers(`${base}:keys`)) as string[]).sort();
    const entry: DayUsage = { day, keys: {} };
    for (const key of keys) {
      const [calls, callers] = await Promise.all([
        store.get<number>(`${base}:${key}:calls`),
        store.pfcount(`${base}:${key}:callers`),
      ]);
      entry.keys[key] = { calls: Number(calls) || 0, callers: Number(callers) || 0 };
    }
    out.push(entry);
  }
  return out;
}
