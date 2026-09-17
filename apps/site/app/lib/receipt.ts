/**
 * Conformance receipt — a re-checkable record of one measurement.
 *
 * Why this exists: a score without version or provenance is an opinion. Two
 * runs that disagree look like a broken site when they may just be two builds
 * of the instrument, and there is no way for a third party to tell the
 * difference. This binds a result to (a) what was measured, (b) when, (c)
 * which build measured it, and (d) a digest anyone can recompute.
 *
 * What the digest covers — and deliberately does not:
 *   It hashes the per-check VERDICTS ONLY (id + status), not timings, not
 *   scores, not detail strings. So the same page measured twice produces the
 *   same digest, and a different digest means the page actually changed. If
 *   the digest covered a timestamp it would be useless for comparison — every
 *   run would differ and the field would be decoration.
 *
 * What this is NOT:
 *   Not a signature. A signature proves WHO issued a receipt; this proves only
 *   that a given result is internally consistent and re-derivable. Signing
 *   needs key infrastructure and a published key, and a fake or self-asserted
 *   signature would be worse than an honest digest. Ship the digest now; add
 *   signing when there is a key to publish.
 *
 * Reproducibility caveat, stated plainly because it limits the guarantee:
 *   The digest is only stable while the measured page and the engine are both
 *   stable. A site that serves different markup per request, or that changes
 *   between runs, will legitimately produce a different digest. A mismatch
 *   therefore means "something changed", not "the previous result was wrong".
 */

import { createHash } from 'node:crypto';
import { ENGINE_VERSION } from './check-definitions';

export interface ReceiptInput {
  /** The URL as requested by the caller (before any www/http fallback). */
  requestedUrl: string;
  /** Contract version applied — which rules ran. */
  contractVersion: string;
  /** Scope of the run, e.g. 'universal' | 'contract'. */
  scope: string;
  /** The per-check verdicts the run produced. */
  checks: ReadonlyArray<{ id: string; status: string }>;
}

export interface Receipt {
  /** What was measured. */
  subject: string;
  /** When the measurement completed, ISO-8601 UTC. */
  retrieved_at: string;
  /** Which rules were applied. */
  contract_version: string;
  /** Which build applied them — moves independently of contract_version. */
  engine_version: string;
  /** Run scope. */
  scope: string;
  /**
   * sha256 over the ordered `id:status` verdict set. Recompute it by running
   * the same URL at the same engine version and diffing:
   *   sha256(checks.map(c => `${c.id}:${c.status}`).join('\n'))
   */
  digest: string;
  /** How to re-check this receipt. */
  verify: {
    method: 're-run' | 'diff';
    endpoint: string;
    instructions: string;
  };
}

/**
 * Compute the digest over an ordered verdict set.
 *
 * Order matters: checks are emitted in registry order by the engine, so the
 * join is stable across runs. Sorting is NOT applied — if the engine ever
 * reorders its registry that is a change worth surfacing, and silently
 * sorting would hide it.
 */
export function verdictDigest(checks: ReadonlyArray<{ id: string; status: string }>): string {
  const canonical = checks.map((c) => `${c.id}:${c.status}`).join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Build the receipt for one completed run.
 *
 * `retrievedAt` is injected rather than read from the clock here so the caller
 * controls it — a re-scoring batch can stamp all of its rows with one instant
 * instead of drifting across the run.
 */
export function buildReceipt(input: ReceiptInput, retrievedAt: Date = new Date()): Receipt {
  return {
    subject: input.requestedUrl,
    retrieved_at: retrievedAt.toISOString(),
    contract_version: input.contractVersion,
    engine_version: ENGINE_VERSION,
    scope: input.scope,
    digest: verdictDigest(input.checks),
    verify: {
      method: 're-run',
      endpoint: '/api/score',
      instructions:
        'POST the same subject to /api/score and compare `receipt.digest`. ' +
        'An equal digest means the same verdict set was reproduced. ' +
        'A different digest means the page, the contract, or the engine build changed — ' +
        'check `engine_version` and `contract_version` first: if those match, the page changed.',
    },
  };
}
