/**
 * What the site's analytics may see of a page address: the path, never the
 * query string or the fragment.
 *
 * WHY. /score?url=… carries the address a visitor scores, and the same is true
 * of /drift, /readiness, /compare, /guardrails, /monitor, /report and
 * /score/report. Measured on production on 2026-10-11, before this module: the
 * Web Analytics page view sent it as `o` and Speed Insights sent it as `href`
 * on every vital, so a private or staging address typed into the score box
 * left the browser for the analytics store. Both scripts hand every event to a
 * `beforeSend` hook first (@vercel/analytics 2.0.1 and @vercel/speed-insights
 * 2.0.0, the versions in package-lock.json), and returning the event with a
 * shortened `url` is what they send.
 *
 * WHY EVERYWHERE, NOT ONLY ON /score. Eight routes carry a visitor-entered
 * address in the query today and the next tool page will too; a per-route list
 * is a list someone forgets to extend. No route needs its query in analytics:
 * the codebase sets no utm_ or campaign parameters, and both products already
 * group views by route.
 *
 * Paths are kept. The site has no dynamic route segment, so a path never
 * carries a visitor's input.
 *
 * Import-free on purpose: scripts/check-analytics-redaction.js loads this file
 * with Node's type stripping and runs it, so the gate tests the code that
 * ships rather than a copy of it.
 */

/** The address with everything from the first `?` or `#` removed. Never throws. */
export function analyticsSafeUrl(url: string): string {
  if (typeof url !== 'string') return '';
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * The `beforeSend` hook for both <Analytics> and <SpeedInsights>: the same
 * event, with its `url` reduced to the path.
 */
export function redactAnalyticsEvent<T extends { url: string }>(event: T): T {
  return { ...event, url: analyticsSafeUrl(event.url) };
}
