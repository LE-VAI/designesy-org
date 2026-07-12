import type { Metadata } from 'next';

/** Canonical public host — apex 308s to www. */
export const SITE_BASE = 'https://www.designesy.org';

export const SITE_NAME = 'Designesy';

export const SITE_DEFAULT_DESCRIPTION =
  'Design intelligence infrastructure for a humane creative civilization. Sources into principles, principles into contracts, contracts into tools, tools into better designed work.';

/**
 * Build consistent page metadata: title, description, canonical, OG, Twitter.
 * Use on every human page so crawlers get one www canonical and matching social tags.
 */
export function pageMeta({
  title,
  description,
  path,
  ogTitle,
  ogDescription,
  twitterTitle,
  twitterDescription,
}: {
  title: string;
  description: string;
  /** Path starting with /, e.g. `/open` or `/` */
  path: string;
  ogTitle?: string;
  ogDescription?: string;
  twitterTitle?: string;
  twitterDescription?: string;
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
    },
    openGraph: {
      title: socialTitle,
      description: socialDesc,
      url: url || SITE_BASE,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: twTitle,
      description: twDesc,
    },
  };
}
