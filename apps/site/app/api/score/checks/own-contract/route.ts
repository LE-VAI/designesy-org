import { NextResponse } from 'next/server';
import { CONTRACT_VERSION } from '../../../../lib/design-system-contract';
import { ownContractFormula } from '../../../../lib/own-contract/formula';

// The published own-contract formula: the fourteen fidelity checks, their
// thresholds and evidence minimums, the weights and ceilings, the baseline
// groups and the null rules, versioned and dated. Static, like
// /api/score/checks; a query parameter there could not serve it, because that
// route is force-static too.
export const runtime = 'nodejs';
export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({ contractVersion: CONTRACT_VERSION, ...ownContractFormula() });
}
