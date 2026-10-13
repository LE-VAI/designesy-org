// The Designesy mark for the badges: the favicon variant, the master for any
// mark drawn at 48px or smaller (brand ledger D37; masters/designesy-mark.v1.
// favicon*.svg). The body takes one colour, ink on light and white on dark;
// the dot is the only colour carrier and is Azure (03-SYSTEM-SPEC, "The mark").
//
// Kept apart from the badge renderer on purpose: the renderer draws grades,
// and a grade never takes a brand colour (D5), which
// scripts/check-results-language.mjs asserts by finding no brand blue in it.
// The Azure here is the mark's dot, which is artwork, not a grade.

/** The four body shapes in the master's 512 box (favicon variant, r 7.5). */
const BODY = [
  'M116.27 308.00A120.00 120.00 0 0 1 228.00 196.27A7.50 7.50 0 0 1 236.00 203.75L236.00 308.50A7.50 7.50 0 0 1 228.50 316.00L123.75 316.00A7.50 7.50 0 0 1 116.27 308.00Z',
  'M283.50 196.00L388.50 196.00A7.50 7.50 0 0 1 396.00 203.50L396.00 308.50A7.50 7.50 0 0 1 388.50 316.00L283.50 316.00A7.50 7.50 0 0 1 276.00 308.50L276.00 203.50A7.50 7.50 0 0 1 283.50 196.00Z',
  'M128.80 463.20L223.20 368.80A7.50 7.50 0 0 1 236.00 374.11L236.00 468.50A7.50 7.50 0 0 1 228.50 476.00L134.11 476.00A7.50 7.50 0 0 1 128.80 463.20Z',
  'M283.50 356.00L388.25 356.00A7.50 7.50 0 0 1 395.73 364.00A120.00 120.00 0 0 1 284.00 475.73A7.50 7.50 0 0 1 276.00 468.25L276.00 363.50A7.50 7.50 0 0 1 283.50 356.00Z',
];

/** Azure, the mark's dot (D2). */
const DOT = '#0A94FF';

/**
 * The art box inside the 512 master: the body spans x 116 to 396 and the dot
 * reaches y 36 (its centre 96, radius 60); the body ends at y 476.
 */
export const MARK_ART = { left: 116, right: 396, top: 36, bottom: 476, box: 512 } as const;

/**
 * The mark as an SVG fragment, `size` px square at (x, y), with the body in
 * `body` (#FFFFFF on a dark ground, #010102 on a light one).
 */
export function markSvg(x: number, y: number, size: number, body: '#FFFFFF' | '#010102'): string {
  const paths = BODY.map((d) => `<path d="${d}"/>`).join('');
  return (
    `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 512 512" aria-hidden="true">` +
    `<g fill="${body}">${paths}</g><circle cx="336" cy="96" r="60" fill="${DOT}"/></svg>`
  );
}
