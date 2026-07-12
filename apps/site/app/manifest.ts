import type { MetadataRoute } from 'next';

import { SITE_DEFAULT_DESCRIPTION, SITE_NAME } from './lib/site-meta';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Design intelligence infrastructure`,
    short_name: SITE_NAME,
    description: SITE_DEFAULT_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        url: '/icon',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}