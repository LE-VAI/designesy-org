import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';

/**
 * Whether an href names an endpoint or a file rather than a page: an API
 * route (/api/...), a well-known file, or a path whose last segment has an
 * extension (/open.json, /llms.txt, /api/leaderboard.csv). The site's own
 * absolute origin counts as the same path.
 *
 * next/link treats every href as a page: in production it prefetches the ones
 * that scroll into view (GET ?_rsc=...), and an API route that takes only POST
 * answers 405, which logged a console error on 71 of 74 routes (live audit
 * 2026-10-11, V07). scripts/check-link-targets.js holds the same rule for
 * every next/link whose href it can read from the source.
 */
export function isNonPageHref(href: string): boolean {
  const local = href.replace(/^https?:\/\/(www\.)?designesy\.org(?=\/|$)/i, '');
  if (!local.startsWith('/')) return false;
  const p = local.split(/[?#]/, 1)[0];
  if (p === '/api' || p.startsWith('/api/') || p.startsWith('/.well-known/')) return true;
  return /\.[a-z0-9]{1,8}$/i.test(p.slice(p.lastIndexOf('/') + 1));
}

type Props = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & { href: string };

/**
 * A link for lists that mix pages with endpoints and files (the footer's
 * machine rail, related rows): a plain anchor for an endpoint or a file, so
 * nothing prefetches it, and next/link for a page.
 */
export function RouteLink({ href, ...rest }: Props) {
  if (isNonPageHref(href)) return <a href={href} {...rest} />;
  return <Link href={href} {...rest} />;
}
