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
    sameAs: [
      'https://x.com/designesy',
      'https://github.com/designesy',
    ],
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

/**
 * Dataset JSON-LD for the open catalog — signals machine-ingestible
 * primary reference for design intelligence infrastructure.
 */
export function datasetJsonLd({
  name,
  description,
  url,
  machineUrl,
  version,
  keywords,
  dateModified,
}: {
  name: string;
  description: string;
  url: string;
  machineUrl: string;
  version?: string;
  keywords?: string[];
  dateModified?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name,
    description,
    url,
    identifier: machineUrl,
    ...(version ? { version } : {}),
    ...(dateModified ? { dateModified } : {}),
    ...(keywords?.length ? { keywords } : {}),
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    creator: {
      '@type': 'Organization',
      name: 'Designesy LLC',
      url: 'https://www.designesy.org',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Designesy LLC',
      url: 'https://www.designesy.org',
    },
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: machineUrl,
        name: 'open.json catalog',
      },
      {
        '@type': 'DataDownload',
        encodingFormat: 'text/plain',
        contentUrl: 'https://www.designesy.org/llms.txt',
        name: 'llms.txt agent brief',
      },
      {
        '@type': 'DataDownload',
        encodingFormat: 'text/plain',
        contentUrl: 'https://www.designesy.org/llms-full.txt',
        name: 'llms-full.txt full agent brief',
      },
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: 'https://www.designesy.org/.well-known/agent.json',
        name: 'agent discovery document',
      },
    ],
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
