/**
 * Server-side JSON-LD injector. No client JS.
 * Pass one object or an array of schema.org graphs.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const payload = Array.isArray(data) ? data : [data];
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(payload.length === 1 ? payload[0] : payload),
      }}
    />
  );
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Designesy',
    legalName: 'Designesy LLC',
    url: 'https://www.designesy.org',
    email: 'le@designesy.org',
    description:
      'Design intelligence infrastructure for a humane creative civilization.',
    logo: 'https://www.designesy.org/icon',
    sameAs: [] as string[],
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Designesy',
    url: 'https://www.designesy.org',
    description:
      'Design intelligence infrastructure — contracts, kits, labs, and field checks for people and agents.',
    publisher: {
      '@type': 'Organization',
      name: 'Designesy LLC',
      url: 'https://www.designesy.org',
    },
  };
}

export function creativeWorkJsonLd({
  name,
  description,
  url,
  version,
  related,
}: {
  name: string;
  description: string;
  url: string;
  version?: string;
  related?: string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name,
    description,
    url,
    ...(version ? { version } : {}),
    publisher: {
      '@type': 'Organization',
      name: 'Designesy LLC',
      url: 'https://www.designesy.org',
    },
    ...(related?.length
      ? {
          isPartOf: related.map((r) => ({
            '@type': 'CreativeWork',
            url: r,
          })),
        }
      : {}),
  };
}
