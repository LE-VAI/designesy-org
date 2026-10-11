// /score/badge?url=<site>: the first embeddable score badge. Embeds of it
// keep working and now draw the live badge, the same SVG as /api/badge?url=
// ("Scored by Designesy", the site, the grade, the score and the date of the
// run, from the score cache). One renderer, so the two cannot drift.
//
//   <img src="https://www.designesy.org/api/badge?url=designesy.org" alt="Designesy score for designesy.org" />
//
// Behaviour, caching and the SSRF guard: app/lib/badge/live-badge-route.ts.
import { liveBadgeResponse } from '../../lib/badge/live-badge-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return liveBadgeResponse(request);
}
