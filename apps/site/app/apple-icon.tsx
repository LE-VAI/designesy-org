import { ImageResponse } from 'next/og';
import { IMAGE_CACHE_HEADERS } from './lib/image-cache';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * Home-screen mark: the Designesy mark, display variant (identity v1), on
 * --paper #010102. White body, Azure dot with the teal hint
 * in its lower edge (display sizes only, 96px and up). Corners r 7 (m/16),
 * gutters 28, outer arcs r 112.
 * Paths are the master designesy-mark.v1.display.on-dark.svg, unchanged: the
 * art box is translated (18, 18) inside its 512 box, so the dot (it reaches
 * x 366, past the body's 364) sits well inside the frame.
 */
export default function AppleIcon() {
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
        <svg width="180" height="180" viewBox="0 0 512 512">
          <defs>
            <linearGradient id="dot-hint" x1="0.3" y1="0.15" x2="0.7" y2="1">
              <stop offset="0" stopColor="#0A94FF" />
              <stop offset="0.62" stopColor="#0A94FF" />
              <stop offset="1" stopColor="#19BBE7" />
            </linearGradient>
          </defs>
          <g transform="translate(18 18)">
            <path fill="#FFFFFF" d="M112.25 288.53A112.00 112.00 0 0 1 216.53 184.25A7.00 7.00 0 0 1 224.00 191.23L224.00 289.00A7.00 7.00 0 0 1 217.00 296.00L119.23 296.00A7.00 7.00 0 0 1 112.25 288.53Z" />
            <path fill="#FFFFFF" d="M259.00 184.00L357.00 184.00A7.00 7.00 0 0 1 364.00 191.00L364.00 289.00A7.00 7.00 0 0 1 357.00 296.00L259.00 296.00A7.00 7.00 0 0 1 252.00 289.00L252.00 191.00A7.00 7.00 0 0 1 259.00 184.00Z" />
            <path fill="#FFFFFF" d="M123.95 424.05L212.05 335.95A7.00 7.00 0 0 1 224.00 340.90L224.00 429.00A7.00 7.00 0 0 1 217.00 436.00L128.90 436.00A7.00 7.00 0 0 1 123.95 424.05Z" />
            <path fill="#FFFFFF" d="M259.00 324.00L356.77 324.00A7.00 7.00 0 0 1 363.75 331.47A112.00 112.00 0 0 1 259.47 435.75A7.00 7.00 0 0 1 252.00 428.77L252.00 331.00A7.00 7.00 0 0 1 259.00 324.00Z" />
            <circle fill="url(#dot-hint)" cx="308" cy="98" r="58" />
          </g>
        </svg>
      </div>
    ),
    { ...size, headers: IMAGE_CACHE_HEADERS }
  );
}
