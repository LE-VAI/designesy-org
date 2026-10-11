import { NextResponse } from 'next/server';
import { scoreUrl, scoreArithmetic, computeGrade, autoDetectScope, normalizeInputUrl, isValidUrl, type ScoreScope } from '../route';
import { auditVerdicts, mergeVerdicts, tally } from './merge';

// POST /api/score/rescore: a run scored again with the browser audit's
// verdicts. The score form used to do this in the browser with its own copy of
// the arithmetic, which left out the anti-slop deduction and the originality
// lift and weighted three categories wrong: an audit that changed nothing moved
// stripe.com from D 67.9 to C 70 and pentagram.com from F 56.6 to C 72.1. Here
// the run is the engine's own (the cached /api/score result for the same URL
// and scope), only the audit's three checks can change, and the score comes
// from scoreArithmetic, the function both engine copies share.
//
// Rate limited with /api/score by the edge middleware (the /api/score prefix).
// scripts/check-audit-rescore.mjs holds the line.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { url?: unknown; scope?: unknown; checks?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = normalizeInputUrl(typeof body.url === 'string' ? body.url : '');
  if (!url || !isValidUrl(url)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid URL. Enter a valid domain like designesy.org or nike.com.' },
      { status: 400 },
    );
  }
  const scopeRaw = typeof body.scope === 'string' ? body.scope.toLowerCase() : '';
  const scope: ScoreScope = scopeRaw === 'contract' || scopeRaw === 'universal' ? scopeRaw : autoDetectScope(url);

  const verdicts = auditVerdicts(body.checks);
  if (verdicts.length === 0) {
    return NextResponse.json({ ok: false, error: 'The request carried no browser-audit results to score.' }, { status: 400 });
  }

  try {
    const run = await scoreUrl(url, scope);
    if (run.score === null || run.total === 0) {
      return NextResponse.json(
        { ok: false, error: 'This site could not be read, so there is no score to update.' },
        { status: 409 },
      );
    }

    const merged = mergeVerdicts(run.checks, verdicts);
    const { score, categoryWeights, categoryCounts, categoryScores, a11yFloorApplied, hardFailCeilingApplied, hardFailCeilingReason } =
      scoreArithmetic(merged, run.slop.total, run.originality.points);
    // Per-check weight as the engine attaches it: the category's weight split
    // across its scored checks, 0 for a check that is not scored.
    const checks = merged.map((c) => {
      const scored = c.status !== 'SKIP' && c.status !== 'MANUAL';
      const weight = scored ? (categoryWeights[c.category] || 5) / (categoryCounts[c.category] || 1) : 0;
      return { ...c, weight: Math.round(weight * 1000) / 1000 };
    });

    return NextResponse.json(
      {
        ok: true,
        url,
        scope: run.scope,
        score,
        grade: computeGrade(score),
        ...tally(checks),
        a11yFloorApplied,
        hardFailCeilingApplied,
        hardFailCeilingReason,
        categoryScores,
        checks,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: `The score for ${url} could not be updated with the browser audit. Try again.` },
      { status: 502 },
    );
  }
}
