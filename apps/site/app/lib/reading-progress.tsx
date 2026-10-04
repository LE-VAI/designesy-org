/*
  ReadingProgress — retired 2026-10-03. Renders nothing.

  It drew a 2px progress bar across the top of the viewport on /contracts,
  /docs and /methodology. The header capsule already draws scroll progress
  along its lower edge on every route (.topbar .scroll-progress, lib/topbar),
  so on those three pages two meters reported the same value at once, one
  just above the other. The capsule's line is the one meter now.

  The component stays as a null render so the three page imports keep
  resolving without touching the pages. It no longer needs the client: no
  state, no listeners, no bundle. The .reading-progress-* rules are gone
  from globals.css.
*/

export function ReadingProgress() {
  return null;
}
