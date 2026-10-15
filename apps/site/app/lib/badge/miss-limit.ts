// The live badge's miss limit: whether a badge request may start a fresh
// score.
//
// A badge view that the score cache answers costs nothing and is never
// limited: embeds in READMEs arrive through GitHub's image proxy from a shared
// pool of IPs, and the CDN's max-age already absorbs repeats, so a per-request
// limit would turn legitimate cached views into broken images. A cache MISS is
// different: it fetches someone's site and runs the whole engine, and before
// this limit anyone could loop /api/badge?url=<random-domain>.com and make the
// site fetch and score without end.
//
// So this runs only on a miss (live-badge-route.ts hands it to scoreUrl's miss
// gate, which calls it inside the cached function, where only a miss or a
// stale entry's refresh arrives):
//   1. per IP:  20 fresh scores an hour      (prefix 'badge-miss')
//   2. global: 300 fresh scores an hour in all (prefix 'badge-miss-global')
// The per-IP check runs first, so one IP can spend at most 20 of the global
// 300. Fixed windows, analytics off, built by the same helpers as the Edge
// middleware's limiters (app/lib/rate-limit.ts). Two Upstash commands per
// allowed miss and none per cached view.
//
// FAILS CLOSED. The middleware fails open for the scoring API, because a dead
// Redis must not take every API route down with it, and its callers are
// people waiting on a result. Here the cost of failing open is the very thing
// the limit exists to stop: unlimited fresh scores, triggered by anyone,
// for as long as the backend is out. The cost of failing closed is small and
// visible: an uncached site shows "Not scored" for a minute (the response is
// cached 60 s) while cached badges keep working. So:
//   - Upstash errors, or answers after Ratelimit's own timeout (it then
//     resolves success: true with reason "timeout"): refused ("degraded").
//   - No limiter on Vercel (env vars missing or construction threw): refused
//     ("inactive"). Production without Upstash must not score without limit.
//   - No limiter off Vercel (a local `next start`, CI's served build): allowed
//     ("inactive"). There is no shared store to count against, and a single
//     local process is not the open internet.

import { clientKey, fixedWindow, getLimiter, type LimiterOutcome } from '../rate-limit';

export const BADGE_MISS_LIMITS = {
  perIp: { prefix: 'badge-miss', tokens: 20, window: '1 h' },
  global: { prefix: 'badge-miss-global', tokens: 300, window: '1 h' },
} as const;

const PER_IP_WINDOW = fixedWindow(BADGE_MISS_LIMITS.perIp.tokens, BADGE_MISS_LIMITS.perIp.window);
const GLOBAL_WINDOW = fixedWindow(BADGE_MISS_LIMITS.global.tokens, BADGE_MISS_LIMITS.global.window);

export type MissDecision =
  | { allowed: true; outcome: Extract<LimiterOutcome, 'active' | 'inactive'> }
  | { allowed: false; outcome: LimiterOutcome; why: 'per-ip' | 'global' | 'degraded' | 'no-limiter' };

/** Whether this request may start a fresh score. Spends a token only when it is allowed to try. */
export async function decideBadgeMiss(headers: Headers): Promise<MissDecision> {
  const perIp = getLimiter(BADGE_MISS_LIMITS.perIp.prefix, PER_IP_WINDOW);
  const global = getLimiter(BADGE_MISS_LIMITS.global.prefix, GLOBAL_WINDOW);
  if (!perIp || !global) {
    return process.env.VERCEL
      ? { allowed: false, outcome: 'inactive', why: 'no-limiter' }
      : { allowed: true, outcome: 'inactive' };
  }
  try {
    const mine = await perIp.limit(`${BADGE_MISS_LIMITS.perIp.prefix}:${await clientKey(headers)}`);
    if (mine.reason === 'timeout') return { allowed: false, outcome: 'degraded', why: 'degraded' };
    if (!mine.success) return { allowed: false, outcome: 'active', why: 'per-ip' };
    const all = await global.limit(`${BADGE_MISS_LIMITS.perIp.prefix}:all`);
    if (all.reason === 'timeout') return { allowed: false, outcome: 'degraded', why: 'degraded' };
    if (!all.success) return { allowed: false, outcome: 'active', why: 'global' };
    return { allowed: true, outcome: 'active' };
  } catch (err) {
    console.error(
      '[badge] miss limiter unavailable, failing closed:',
      err instanceof Error ? err.message : String(err),
    );
    return { allowed: false, outcome: 'degraded', why: 'degraded' };
  }
}
