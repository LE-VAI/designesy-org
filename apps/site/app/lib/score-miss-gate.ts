// The score cache's miss gate: a way for a caller to be asked before a fresh
// score starts, without limiting reads the cache answers.
//
// unstable_cache calls scoreUrl's function (app/api/score/route.ts) only when
// it has no entry for the key, or refreshes a stale one, so the start of that
// function is the one place that knows a fresh score is about to run. It
// awaits currentScoreMissGate() there. A caller that must limit fresh scores
// runs scoreUrl inside withScoreMissGate(gate, ...): the gate runs on a miss
// only, and a gate that throws stops the score before any fetch
// (unstable_cache does not cache a throw). Every other caller passes no gate
// and is unchanged.
//
// The gate travels in an AsyncLocalStorage, so it reaches the cached function
// through unstable_cache without becoming a cache-key argument.
//
// It lives here, outside route.ts, so the score route's top-level units stay
// the ones packages/score's source-drift check compares against engine.ts: the
// gate is transport (the npm engine has no cache), not scoring logic.
//
// The live badge uses it (lib/badge/live-badge-route.ts, limit in
// lib/badge/miss-limit.ts); scripts/check-badge-miss-limit.js holds the wiring.

import { AsyncLocalStorage } from 'node:async_hooks';

const missGate = new AsyncLocalStorage<() => Promise<void>>();

/** Run `run` (a scoreUrl call) with `gate` awaited before any fresh score it starts. */
export function withScoreMissGate<T>(gate: () => Promise<void>, run: () => Promise<T>): Promise<T> {
  return missGate.run(gate, run);
}

/** The gate of the scoreUrl call in progress, if its caller set one. */
export function currentScoreMissGate(): (() => Promise<void>) | undefined {
  return missGate.getStore();
}
