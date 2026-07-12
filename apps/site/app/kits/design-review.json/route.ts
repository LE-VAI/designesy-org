import { designReviewKit } from '../../lib/kits/design-review';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(designReviewKit, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition':
        'inline; filename="designesy-kit-design-review-v0.1.json"',
    },
  });
}
