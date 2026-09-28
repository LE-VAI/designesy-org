// /specs/review-findings.json — Designesy Design Review Findings Schema v1.0
//
// The canonical format for design verification findings. One JSON envelope
// that any design verification tool can populate. Agents consuming findings
// from multiple verifiers (designesy, Google design.md, Lighthouse, axe,
// jakubkrehel/skills) need a common schema to aggregate, compare, and act.
//
// This schema is a superset: each tool populates the subset of fields it has.
// Fields that a tool does not produce are omitted (not set to null). The
// `tool` field identifies the producer so consumers can route by source.
//
// designesy_score emits this schema natively via POST /api/score?format=designesy
// (default). The `review` and `google` emission formats are lossy projections
// of this canonical shape — the canonical JSON is the source of truth.
//
// Provenance: synthesized from Google @google/design.md lint() output
// ({findings, summary, designSystem}), Lighthouse LHR top-level structure,
// and jakubkrehel/skills better-interface markdown report format (Scope,
// Findings, Considered-but-Rejected, Verification, Verdict).

import { REVIEW_FINDINGS_SCHEMA as SCHEMA } from '../../lib/review-findings-schema';

export const dynamic = 'force-static';


export function GET() {
  return new Response(JSON.stringify(SCHEMA, null, 2), {
    headers: {
      'Content-Type': 'application/schema+json',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}