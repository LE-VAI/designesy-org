/**
 * Response headers for every generated image: the icons and the Open Graph and
 * Twitter cards.
 *
 * Next 15.5's ImageResponse set this Cache-Control itself in production, and the
 * live site serves it today. Next 16 changed the ImageResponse default to
 * `public, max-age=0, must-revalidate` (next/dist/server/og/image-response.js),
 * which would make every browser and crawler revalidate each image. The routes
 * pass it explicitly so the header does not depend on the framework default.
 */
export const IMAGE_CACHE_HEADERS = {
  'cache-control': 'public, immutable, no-transform, max-age=31536000',
};
