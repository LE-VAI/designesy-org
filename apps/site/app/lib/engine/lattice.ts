// The register lattice for the four engines' cells on /score, derived from the
// check counts.
//
// Every register draws its cells on one lattice: a fixed number of tracks, the
// same cell width for all four engines, so each cell stands under a column of
// the contract score. The track count is chosen so the contract score closes
// as whole rows: a divisor of the contract's check count, nearest the old
// fourteen across a wide face and the old six across a narrow one. A register
// with more cells than the lattice has tracks takes the largest column count
// that divides it, so its rows are whole too; a shorter one sits on one row.
//
// Until engine 1.2.0 this was written into engine.css for a 42-cell register
// (3 x 14 wide, 7 x 6 narrow). At 44 the same CSS left a last row of two cells;
// derived here, 44 lays out as 4 x 11 wide and 11 x 4 narrow, and the next
// count picks its own.

export type LatticeRange = { lo: number; hi: number; target: number };

/** Tracks across a face at least 34rem wide: cells about 3rem at 1440. */
export const WIDE: LatticeRange = { lo: 8, hi: 16, target: 14 };
/** Tracks across a narrow face: each cell stays wider than the 24px target floor at 390. */
export const NARROW: LatticeRange = { lo: 4, hi: 8, target: 6 };

/**
 * Tracks for a register of `count` cells: the divisor of `count` in the range
 * nearest its target (the smaller on a tie). A count with no divisor in range
 * (a prime, say) takes the track count whose last row is fullest.
 */
export function latticeTracks(count: number, range: LatticeRange): number {
  let best: number | null = null;
  for (let t = range.lo; t <= range.hi; t++) {
    if (count % t !== 0) continue;
    if (best === null || Math.abs(t - range.target) < Math.abs(best - range.target)) best = t;
  }
  if (best !== null) return best;
  let fullest = range.target;
  let fill = -1;
  for (let t = range.lo; t <= range.hi; t++) {
    const lastRow = count % t === 0 ? t : count % t;
    const f = lastRow / t;
    if (f > fill || (f === fill && Math.abs(t - range.target) < Math.abs(fullest - range.target))) {
      fill = f;
      fullest = t;
    }
  }
  return fullest;
}

/**
 * Columns a register of `count` cells uses on a lattice of `tracks`: all of
 * them on one row when they fit; else the largest column count that divides
 * the register, so every row is whole, as long as it fills at least half the
 * lattice; else every track, leaving one short last row (a count with no such
 * divisor, such as 43 or 46, cannot close).
 */
export function registerColumns(count: number, tracks: number): number {
  if (count <= tracks) return Math.max(1, count);
  for (let c = tracks; c * 2 >= tracks && c >= 2; c--) if (count % c === 0) return c;
  return tracks;
}

/** The inline custom properties one register's cell list carries. */
export function registerStyle(count: number, contractCount: number): Record<string, number> {
  const wide = latticeTracks(contractCount, WIDE);
  const narrow = latticeTracks(contractCount, NARROW);
  return {
    '--mc-tracks-wide': wide,
    '--mc-cols-wide': registerColumns(count, wide),
    '--mc-tracks-narrow': narrow,
    '--mc-cols-narrow': registerColumns(count, narrow),
  };
}
