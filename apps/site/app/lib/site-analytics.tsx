'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { redactAnalyticsEvent } from './analytics-url';

/**
 * Vercel Web Analytics and Speed Insights, mounted once for every page, with
 * the query string and fragment removed from every address they report
 * (lib/analytics-url.ts says why).
 *
 * A client component because `beforeSend` is a function, and a function cannot
 * be passed from the server layout to a client component. The hook is a
 * module-level reference, so both components register it once instead of on
 * every render.
 */
export function SiteAnalytics() {
  return (
    <>
      <Analytics beforeSend={redactAnalyticsEvent} />
      <SpeedInsights beforeSend={redactAnalyticsEvent} />
    </>
  );
}
