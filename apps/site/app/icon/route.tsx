import { ImageResponse } from 'next/og';

// A plain route, not the app/icon.tsx metadata convention. As a
// metadata icon it put <link rel="icon" href="/icon" sizes="32x32"> in every
// page head, and Chrome then showed this PNG in the tab at every scale, 100%
// included, so the hand-hinted 16px frame in app/favicon.ico never appeared
// (tested with Chrome 154 at device scale 1, 1.25 and 1.5). Without the link,
// the tab uses favicon.ico: its 16 frame at 100%, its 32 frame above that.
// The URL stays for anything outside the site that still links to /icon.
export const dynamic = 'force-static';

const size = { width: 32, height: 32 };

/**
 * The 32px mark: the Designesy mark, favicon variant (identity v1).
 * Four body shapes in white and the Azure dot, on --paper #010102. The favicon
 * variant widens the gutters to m/3 and enlarges the body so the figure holds
 * at 16 to 48px; its corners are rounded at r 7.5. The dot is flat Azure at
 * this size (the teal hint starts at 96px).
 * Paths are the master designesy-mark.v1.favicon.on-dark.svg, unchanged; its
 * 512 box already contains the dot (x 276 to 396), so nothing is cropped.
 */
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#010102',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 512 512">
          <path fill="#FFFFFF" d="M116.27 308.00A120.00 120.00 0 0 1 228.00 196.27A7.50 7.50 0 0 1 236.00 203.75L236.00 308.50A7.50 7.50 0 0 1 228.50 316.00L123.75 316.00A7.50 7.50 0 0 1 116.27 308.00Z" />
          <path fill="#FFFFFF" d="M283.50 196.00L388.50 196.00A7.50 7.50 0 0 1 396.00 203.50L396.00 308.50A7.50 7.50 0 0 1 388.50 316.00L283.50 316.00A7.50 7.50 0 0 1 276.00 308.50L276.00 203.50A7.50 7.50 0 0 1 283.50 196.00Z" />
          <path fill="#FFFFFF" d="M128.80 463.20L223.20 368.80A7.50 7.50 0 0 1 236.00 374.11L236.00 468.50A7.50 7.50 0 0 1 228.50 476.00L134.11 476.00A7.50 7.50 0 0 1 128.80 463.20Z" />
          <path fill="#FFFFFF" d="M283.50 356.00L388.25 356.00A7.50 7.50 0 0 1 395.73 364.00A120.00 120.00 0 0 1 284.00 475.73A7.50 7.50 0 0 1 276.00 468.25L276.00 363.50A7.50 7.50 0 0 1 283.50 356.00Z" />
          <circle fill="#0A94FF" cx="336" cy="96" r="60" />
        </svg>
      </div>
    ),
    size
  );
}
