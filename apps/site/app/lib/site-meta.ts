import type { Metadata } from 'next';

/** Canonical public host — apex 308s to www. */
export const SITE_BASE = 'https://www.designesy.org';

export const SITE_NAME = 'Designesy';

export const SITE_DEFAULT_DESCRIPTION =
  'Design intelligence infrastructure for a humane creative civilization. Canonical public source for portable design judgment — contracts, kits, labs, and field checks people and agents can fetch, run, and cite.';

/**
 * Build consistent page metadata: title, description, canonical, OG, Twitter.
 * Use on every human page so crawlers get one www canonical and matching social tags.
 */
/**
 * Routes that have a build-generated markdown variant.
 *
 * Mirrors MARKDOWN_ROUTES in next.config.ts. The two lists must agree: a route
 * advertised here but missing there would 404 the alternate link, and one
 * served there but unadvertised here would be undiscoverable via the tag.
 *
 * Entries are PUBLIC paths with the leading slash stripped. The homepage is ''
 * (the result of stripping '/' from '/'), which is why the lookup below handles
 * an empty string rather than treating it as "no path".
 */
const MARKDOWN_ROUTES = new Set([
  '',  // the homepage: public path '/', markdown twin at /index.md
  'docs', 'methodology', 'kits', 'open', 'benchmarks', 'leaderboard',
  'contracts',
  'contracts/design-system', 'contracts/a11y', 'contracts/motion',
  'contracts/drift', 'contracts/readiness', 'contracts/guardrails',
  'contracts/monitor', 'contracts/report', 'contracts/compare',
  'contracts/tokens', 'labs/poise', 'labs/takt', 'labs/cadence',
  'labs/acoustics',
  'docs/mcp',
  'state-of-compliance',
  'changelog',
  'work/compile',
  'work/continuity',
  'specs',
  'learn/what-is-design-verification',
  'learn/why-we-built-a-public-design-score',
  'learn/design-verification-vs-linting-vs-visual-regression',
  'review',
  'pricing',
  'graph',
  'labs',
  'maturity',
  'continuity',
  'frameworks',
  'work',
  'learn',
  'acoustic-tokens',
  'badge',
  'kits/design-review',
  'm3-bridge',
  'open/handoff',
  'privacy',
  'review/acoustics',
  'review/cadence',
  'review/designesy-org',
  'review/keyboard',
  'review/poise',
  'review/poise/keyboard',
  'review/takt',
  'score/bolt',
  'score/lovable',
  'score/v0',
  'spring-validator',
  'work/designesy-org',
  'work/lovable-dev',
  'work/tile',
]);

export function pageMeta({
  title,
  description,
  path,
  ogTitle,
  ogDescription,
  twitterTitle,
  twitterDescription,
  image,
  type,
  machineSibling,
}: {
  title: string;
  description: string;
  /** Path starting with /, e.g. `/open` or `/` */
  path: string;
  ogTitle?: string;
  ogDescription?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  /** Absolute or root-relative OG/Twitter image URL */
  image?: string;
  /** OG type — defaults to website, use article for content pages */
  type?: 'website' | 'article';
  /**
   * Machine-readable sibling path, e.g. `/contracts/compare.json`.
   *
   * WHY THIS EXISTS
   * Six routes (/compare, /drift, /readiness, /guardrails, /monitor, /report)
   * are force-dynamic because they read searchParams, so the build-time markdown
   * generator cannot reach them — it converts prerendered HTML, and they have
   * none. They are not uncovered, though: each already serves a markdown
   * projection at its `.json` sibling, with `x-markdown-fidelity: projection`.
   *
   * What was missing is DISCOVERY. An agent landing on /compare found no
   * alternate link and, in four of the six cases, no mention of the sibling
   * anywhere in the HTML. The document existed and was unreachable.
   *
   * The sibling is a DIFFERENT document from the page, not a rendering of it:
   * the page explains what the tool does, the sibling specifies the contract it
   * emits. Both are useful to different agents, so this advertises the one
   * rather than replacing the other.
   */
  machineSibling?: string;
}): Metadata {
  const normalized = path === '/' ? '' : path.replace(/\/$/, '');
  const url = `${SITE_BASE}${normalized || ''}`;
  const socialTitle = ogTitle ?? `${title} · ${SITE_NAME}`;
  const socialDesc = ogDescription ?? description;
  const twTitle = twitterTitle ?? socialTitle;
  const twDesc = twitterDescription ?? socialDesc;

  return {
    title,
    description,
    alternates: {
      canonical: url || SITE_BASE,
      // Advertise the markdown twin so an agent that follows
      // <link rel="alternate"> can find it without guessing the URL shape.
      // Cheap and harmless: llms.txt v2 formalised this pattern (2026-08-10)
      // and Codex CLI is one documented follower. Treat it as a convenience,
      // NOT as load-bearing -- most agents neither negotiate nor follow it,
      // which is why the .md suffix exists independently.
      // `path !== undefined`, NOT a truthy check. The homepage passes '/',
      // which strips to '' — falsy, so a truthy test silently skipped the
      // homepage and it alone would have had no alternate link.
      //
      // The twin is ALWAYS rooted at /index.md, and for the homepage that is not
      // a stylistic choice. Appending '.md' to '/' yields
      // "https://www.designesy.org.md", which parses as a bare host with a
      // ".md" TLD -- a link to a domain that does not exist, not a 404 on ours.
      // Verified live before this fix: the homepage shipped exactly that href.
      // Rooting it means the homepage's twin is /index.md, which is the file the
      // build actually writes and the URL the rewrite serves.
      ...(path !== undefined && MARKDOWN_ROUTES.has(path.replace(/^\//, ''))
        ? {
            types: {
              'text/markdown': `${SITE_BASE}/${path.replace(/^\/|\/$/g, '') || 'index'}.md`,
            },
          }
        : {}),
      // A different document, not a second rendering of the page: the contract
      // this tool implements. Typed as application/json because that is what a
      // client without the Accept header receives from that URL.
      ...(machineSibling ? { types: { 'application/json': `${SITE_BASE}${machineSibling}` } } : {}),
    },
    openGraph: {
      title: socialTitle,
      description: socialDesc,
      url: url || SITE_BASE,
      siteName: SITE_NAME,
      type: type ?? 'website',
      locale: 'en_US',
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: twTitle,
      description: twDesc,
      ...(image ? { images: [image] } : {}),
    },
  };
}
