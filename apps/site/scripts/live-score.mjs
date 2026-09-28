/**
 * One live score for the methodology report scripts (sensitivity, rank bounds,
 * score diff), with the two kinds of failure kept apart.
 *
 * A target the engine could not read (403, redirect loop, timeout) comes back
 * with no score. The reports used to take its placeholder result as a site
 * scoring 0 and fold it into the cohort statistics; now it is excluded and
 * named in the report, as the weekly re-score keeps such a row stale instead
 * of republishing it.
 *
 * A failure on our side (the API's rate limit, the network) says nothing about
 * the target, and a report missing those sites would read as a smaller cohort.
 * It throws, and the script writes nothing: the committed report stays whole.
 *
 * Returns { data } for a scored page, or { excluded: reason }.
 */
export async function liveScore(base, url) {
  let res;
  let d;
  try {
    res = await fetch(`${base}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    d = await res.json();
  } catch (e) {
    throw new Error(`network failure scoring ${url}: ${e.message}. Nothing written.`);
  }
  if (res.status === 429 || /rate limit/i.test(String(d && d.error))) {
    throw new Error(`the score API's rate limit stopped the run at ${url}. Nothing written; run it again in an hour.`);
  }
  if (!d || !Array.isArray(d.checks) || d.score === null || d.score === undefined) {
    return { excluded: (d && d.error) || 'the engine could not read the page' };
  }
  return { data: d };
}
