// /api/leaderboard/submit: score a site with the leaderboard's engine.
// Accepts a site URL, validates it, scores it on the fly via the internal
// /api/score engine, and returns the result.
//
// NOTHING IS STORED. The only state is an in-memory IP and timestamp list for
// rate limiting, and it is lost on a cold start, so there is no queue of
// submissions to curate from. The response says so, and points anyone who
// wants a site considered for the leaderboard to the site's contact address.
// (It used to promise that curated sites join the seed "on the next weekly
// batch"; nothing could have carried a submission there.)
//
// This route is dynamic (runtime = nodejs) because it performs a live fetch
// + score. It is rate-limited per IP (SUBMIT_RATE_LIMIT an hour).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { SITE_CONTACT_EMAIL } from '../../../lib/site-meta';
import { clientKey } from '../../../lib/rate-limit';

/** The truth about a submission, in one place for the reply and the docs. */
const NOT_STORED =
  `The submission is not stored, so the site does not join the leaderboard by being scored. To propose it for the leaderboard, email ${SITE_CONTACT_EMAIL}.`;

const SUBMIT_RATE_LIMIT = 20; // per hour per IP (Pro Plan)
const submitLog: { caller: string; ts: number }[] = [];

function isRateLimited(caller: string): boolean {
  const now = Date.now();
  const recent = submitLog.filter((e) => e.caller === caller && now - e.ts < 3600_000);
  submitLog.length = 0;
  submitLog.push(...recent);
  return recent.length >= SUBMIT_RATE_LIMIT;
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: { url?: string; name?: string; category?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const url = (body.url || '').trim();
  const name = (body.name || '').trim();
  const category = (body.category || '').trim();

  if (!url) {
    return Response.json({ ok: false, error: 'URL is required.' }, { status: 400 });
  }
  if (!isValidUrl(url)) {
    return Response.json({ ok: false, error: 'A valid http(s) URL is required.' }, { status: 400 });
  }

  // Rate limit
  const caller = clientKey(request.headers);
  if (isRateLimited(caller)) {
    return Response.json(
      { ok: false, error: `Rate limit exceeded. Maximum ${SUBMIT_RATE_LIMIT} submissions per hour.` },
      { status: 429 }
    );
  }

  // Check for duplicates against the seed list
  const { SEED } = await import('../../../leaderboard/seed');
  const exists = SEED.some((s) => {
    try {
      return new URL(s.url).hostname === new URL(url).hostname;
    } catch {
      return false;
    }
  });
  if (exists) {
    return Response.json(
      { ok: false, error: 'This site is already on the leaderboard.' },
      { status: 409 }
    );
  }

  // Score the submitted URL via the internal engine
  try {
    const scoreResponse = await fetch(new URL('/api/score', request.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!scoreResponse.ok) {
      const errText = await scoreResponse.text();
      return Response.json(
        { ok: false, error: `Scoring failed: ${errText}` },
        { status: 502 }
      );
    }

    const scoreData = await scoreResponse.json();
    const summary = scoreData.summary || scoreData;

    // Rate limiting only: the caller key (a keyed hash of the IP) and time,
    // in memory, lost on a cold start.
    submitLog.push({ caller, ts: Date.now() });

    return Response.json({
      ok: true,
      message: `Scored. ${NOT_STORED}`,
      stored: false,
      proposeTo: SITE_CONTACT_EMAIL,
      submitted: {
        url,
        name: name || new URL(url).hostname,
        category: category || 'Submitted',
      },
      score: {
        score: summary.score_percent ?? summary.score,
        grade: summary.grade,
        pass: summary.pass,
        fail: summary.fail,
        warn: summary.warn,
        skip: summary.skip,
        tokens: scoreData.tokens_extracted ?? 0,
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: `Scoring error: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 }
    );
  }
}

export function GET() {
  return Response.json({
    ok: true,
    endpoint: '/api/leaderboard/submit',
    method: 'POST',
    description: `Score a site with the leaderboard's engine. Returns the score immediately. ${NOT_STORED}`,
    stored: false,
    proposeTo: SITE_CONTACT_EMAIL,
    rateLimit: `${SUBMIT_RATE_LIMIT} submissions per hour per IP`,
    body: {
      url: 'string (required, valid http(s) URL)',
      name: 'string (optional, site name)',
      category: 'string (optional, e.g. SaaS, Design System, Editorial)',
    },
  });
}