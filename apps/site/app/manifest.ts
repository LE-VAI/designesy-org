import type { MetadataRoute } from 'next';

import { SITE_DEFAULT_DESCRIPTION, SITE_NAME } from './lib/site-meta';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} · Design intelligence infrastructure`,
    short_name: SITE_NAME,
    description: SITE_DEFAULT_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#010102',
    theme_color: '#010102',
    // The brand avatar mark, not /icon: that is a 32px PNG, which this
    // listed as sizes 'any'. Chromium installs need a 192 and a 512 icon.
    icons: [
      {
        src: '/brand/designesy-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/brand/designesy-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/brand/designesy-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}