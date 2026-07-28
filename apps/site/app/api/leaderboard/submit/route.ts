// /api/leaderboard/submit — open submission endpoint for the leaderboard.
// Accepts a site URL, validates it, scores it on-the-fly via the internal
// /api/score engine, and returns the result. Submissions are NOT auto-added
// to the seed list — they are reviewed and curated into the next seed batch.
//
// This route is dynamic (runtime = nodejs) because it performs a live fetch
// + score. It is rate-limited to 5 submissions per hour per IP.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUBMIT_RATE_LIMIT = 5; // per hour per IP
const submitLog: { ip: string; ts: number }[] = [];

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = submitLog.filter((e) => e.ip === ip && now - e.ts < 3600_000);
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
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return Response.json(
      { ok: false, error: `Rate limit exceeded. Maximum ${SUBMIT_RATE_LIMIT} submissions per hour.` },
      { status: 429 }
    );
  }

  // Check for duplicates against the seed list
  const { SEED } = await import('../../leaderboard/seed');
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

    // Log the submission (in-memory, lost on cold start — fine for preview)
    submitLog.push({ ip, ts: Date.now() });

    return Response.json({
      ok: true,
      message: 'Submission scored successfully. Curated sites are added to the seed list on the next weekly batch.',
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
    description: 'Submit a site for leaderboard scoring. Returns the score immediately. Curated into the seed list on the next weekly batch.',
    rateLimit: `${SUBMIT_RATE_LIMIT} submissions per hour per IP`,
    body: {
      url: 'string (required, valid http(s) URL)',
      name: 'string (optional, site name)',
      category: 'string (optional, e.g. SaaS, Design System, Editorial)',
    },
  });
}