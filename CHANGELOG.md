# Changelog

All notable changes to `designesy-score` are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.13.3] — 2026-10-09

Released together: **engine 1.2.0** (designesy.org, `/api/score`, the MCP
endpoint), **@designesy/score 0.7.0** (npm), and **designesy-mcp 1.13.3** (PyPI,
MCP registry). Headlines: two checks found on this site, v44 and v45, join every score; the S2 and S8 anti-slop rules stop
firing on components and prose; the npm engine's accessibility floor matches
the site's. Contract mode moves to engine 1.3.0.

### Added

- **Engine 1.2.0: v44 and v45, two defects this site shipped and fixed.**
  `ENGINE_VERSION` is now `1.2.0`. Both engine copies carry the identical change
  and the source-drift gate reports them in agreement.

  - **v44 (accessibility): status colors used as text meet contrast in every
    declared theme.** A color picked to mark a state (a dot or a bar, where 3:1
    is enough) gets reused to write the word for that state, which needs 4.5:1.
    On designesy.org the light `--warn` #b07d04 painted status words at 3.51:1
    on #fbfbfc; mixed toward the ink, `color-mix(in oklab, var(--warn) 70%,
    var(--ink))`, it paints #7f5e21 at 5.76:1. The check measures every
    `color` that reads a status color (directly, through one alias, or at
    reduced alpha) in every theme the stylesheet declares (`:root`,
    `[data-theme]` and `.dark`/`.light` blocks, including attribute
    combinations, and `prefers-color-scheme` blocks). A theme named by part of
    a compound theme selector also reads that compound's tokens before the
    root's: primer.style declares its dark `--fgColor-danger` only under
    `[data-color-mode=dark][data-dark-theme=dark]`. It resolves `var()`
    chains, `color-mix()` in srgb, oklab and oklch (rounded to the 8-bit color
    a browser paints), `light-dark()` and relative color syntax.
    It measures on a surface the stylesheet attests: the rule's own background,
    another rule's for the same element, or the nearest ancestor compound's in
    the same selector (a `:hover` ancestor's own fill, else its fill without the
    state), with translucent fills composited over the next surface out, else
    the theme's page background. When an ancestor in an interactive state
    (hover, active, focus, checked, expanded, selected, open) paints no fill
    the stylesheet declares, the surface is unresolved and the finding WARNs at
    most: v44 never FAILs a pairing it cannot attest. Text needs 4.5:1, large
    text (24px, or 18.66px bold) 3:1. A non-text use is a graphic under WCAG
    1.4.11 and needs 3:1: an svg subject, a class whose role word is icon,
    octicon, glyph, spinner or indicator (or an `icon-`/`octicon-` prefix), a
    progress or meter bar, a color named for an icon (`--button-danger-iconColor`),
    or an element that paints its own background with `currentColor`. Only a
    color named as a status (ok, success, warn, warning, error, danger, fail,
    destructive, info, grade-a to grade-f) can FAIL, and only where it
    resolves to a hue (Oklch chroma 0.06 or more). White, grey or near-grey
    text under a status name (a counter or a keyboard hint on a danger button)
    WARNs at most, with its ratio kept: it is a general text-contrast miss, not
    a status color. A hue that counts only
    because the stylesheet also paints it as a fill or border WARNs at most,
    because its real surface is often a fill on an ancestor that a static
    reading cannot see. Disabled states are exempt, as WCAG 1.4.3 exempts
    inactive controls. SKIP when no status color is used as text. Results carry
    `evidence`: up to 20 measured uses (selector, token, theme, color,
    background, ratio, threshold) and a count of the rest. A ratio that misses
    its threshold by less than a rounding step is shown rounded down (4.49, not
    4.50, against 4.5).
  - **v45 (motion): pausing motion keeps content visible.** A site-level pause
    (`animation-play-state: paused` on every element, under an attribute or
    class on the document or inside `prefers-reduced-motion: reduce`) holds
    each animation on its current frame. An entrance whose first keyframe is
    opacity 0 is then held invisible; on designesy.org a paused visitor got
    empty pages. Each one-shot entrance that the pause holds must end or be
    removed under it: `animation: none`, `animation-play-state: running`, or a
    negative `animation-delay` at least as long as the animation (the site uses
    -3600s). FAIL without one, WARN when the override's selector or scope does
    not clearly match, SKIP when no rule pauses every element.

  **Owner decision D10: legacy scores gain both checks.** A request without a
  contract returns what engine 1.1.0 returned except for v44 and v45. The
  registry grows from 42 to 44 checks, and 39 to 41 of them are scored.
  Category weights are unchanged (accessibility 15, motion 10, of 117), so each
  accessibility check now carries 15/7 = 2.14 points where it carried 2.5, and
  each motion check 2.0 where it carried 2.5. A SKIP leaves a score where it
  was.

### Fixed

- **S2 and S8 stopped deducting for components and prose.** designesy.org lost
  10 points to them, every one a false positive.
  - **S2, "Full-page gradient background"**, counted `inset: 0` as full-bleed,
    but `inset: 0` fills the nearest positioned ancestor. All three hits on
    designesy.org were components: a 1px window sheen, a cell fill and a heatmap
    bar. A gradient now needs viewport evidence: it is painted on `html`, `body`
    or `:root`, or the rule is `position: fixed` and pinned to all four edges,
    or it is sized in viewport units. `border-radius: inherit` marks a
    component, and a gradient sized to 1px by `background-size` is a hairline.
  - **S8, "AI-pill badge text"**, matched the whole HTML with no word boundary,
    so "Generate" matched "generates" and "AI-generated", and it read the
    framework's `<script>` payload, counting each sentence twice. It now strips
    `<script>`, `<style>`, `<template>` and comments, matches whole words, and
    counts only the text of a pill: an element whose class or role names a
    badge, pill, chip, tag or CTA, a button, or a link, holding 40 characters
    or fewer. A real "AI-powered" badge still counts.
- **The npm engine's accessibility floor matches the site's.** The site caps a
  score at 70 when the accessibility category is under 60% (WARN counts half),
  as /methodology documents. `@designesy/score` capped at 70 on any
  accessibility FAIL, so the CLI scored some pages lower than the site (with
  v44, primer.style 70 in the CLI against 89.8 on the site). The score
  arithmetic is now one function, `scoreArithmetic`, in both copies, and the
  source-drift gate compares it and each orchestrator's call to it; a test
  re-introduces the old floor in one copy and requires a finding.
- **Scores carry one decimal, without float noise.** The shared score
  arithmetic subtracted a fractional slop total and added the originality lift
  without rounding, so a page weighted 72.6 with 20 points of slop and a +4
  lift scored 56.599999999999994 in both engines. It now rounds to one
  decimal, the precision scores are shown at, after both steps. No cohort
  score moves by more than that noise.
- **`@designesy/score` reports the current contract.** `CONTRACT_VERSION` read
  `v0.4.1` in 0.6.0 while the site served v0.4.3. It reads `v0.4.3`, and a
  test now compares it with the site's contract source.

### Changed

- **`@designesy/score` 0.7.0 (npm)** ships engine 1.2.0. The package exports
  one new type, `CheckEvidence`, and `CheckResult` gains an optional `evidence`
  field (additive). The v24 hard-fail ceiling
  reason now matches the site's wording.
- **`designesy-score` (npm) stays retired.** It is not republished; its
  deprecation notice now points to `@designesy/score` with 44 checks and
  contract v0.4.3.
- **designesy-mcp 1.13.3 (PyPI).** The offline fallback mirrors engine 1.2.0
  and contract v0.4.3. v44 and v45 are listed in `engine.not_run` with a reason,
  so 27 of the 44 checks run offline. The tool descriptions state 44 checks,
  and the remote-score note reads the check count from the engine's reply. The
  offline engine's golden covers 118 cases and 229 runs.
- **The four engines' check grid on /score follows the check count.** Its
  lattice was written into the stylesheet for 42 cells (3 x 14 wide, 7 x 6
  narrow) and left a last row of two at 44. It is derived from the contract
  score's count: 4 x 11 wide and 11 x 4 narrow at 44.
- **Calibration corpus 1.3.0**: seven fixtures for v44 and v45 (32 in all).
  `test/engine-1-2-0.test.mjs` pins each rule's edges and both slop fixes.

**Leaderboard impact, measured.** The HTML and CSS of the 30 seed sites were
fetched once on 2026-10-09 with GET requests, one site at a time, and scored
by engine 1.1.0 and engine 1.2.0 on the same bytes. The scores below use the
site's arithmetic. The DESIGN.md probe (v37) was off in both runs, so a site
that serves a DESIGN.md can differ from its live score by that check. 26 of 30
sites were reachable; nytimes.com and cssdesignawards.com returned 403,
getdesy.com refused the connection and awwwards.com timed out. v44: 1 FAIL,
9 WARN, 4 PASS, 12 SKIP. v45: 1 PASS (designesy.org), 25 SKIP. The new checks
alone move 8 sites by -1.8 to +1.2 (mean -0.02); the slop fixes alone move 11
by 0 to +13 (mean +2.49); together 14 sites move, by 0 to +12.3 (mean +2.2),
and six change grade. The live leaderboard keeps its current scores until the
re-score that runs on release.

  | Site | v44 | v45 | S2, S8 findings | Score: 1.1.0 → 1.2.0 | v44/v45 | S2/S8 | Delta | Grade |
  |---|---|---|---|---|---|---|---|---|
  | linear.app | WARN | SKIP | S2 21 → 0; S8 9 → 0 | 70.0 → 70.0 | 0 | 0 | 0 | C |
  | vercel.com | SKIP | SKIP | S2 1 → 0 | 81.0 → 86.0 | 0 | +5 | +5 | B |
  | stripe.com | WARN | SKIP | S2 1 → 0; S8 12 → 0 | 66.9 → 67.9 | 0 | +1 | +1 | D |
  | apple.com | SKIP | SKIP | no change | 83.1 → 83.1 | 0 | 0 | 0 | B |
  | nytimes.com | not reached | | | | | | | |
  | mozaika.design | SKIP | SKIP | no change | 65.1 → 65.1 | 0 | 0 | 0 | D |
  | www.designesy.org | PASS | PASS | S2 3 → 0; S8 6 → 0 | 98.0 → 100.0 | 0 | +2 | +2 | A |
  | designesy.ai.studio | PASS | SKIP | no change | 77.7 → 78.5 | +0.8 | 0 | +0.8 | C |
  | getdesy.com | not reached | | | | | | | |
  | stitch.withgoogle.com | SKIP | SKIP | S8 4 → 0 | 64.4 → 69.4 | 0 | +5 | +5 | D |
  | zeroheight.com | WARN | SKIP | S8 3 → 0 | 70.0 → 70.0 | 0 | 0 | 0 | C |
  | roastbyai.com | SKIP | SKIP | S8 4 → 0 | 74.7 → 82.7 | 0 | +8 | +8 | C → B |
  | atlassian.design | PASS | SKIP | no change | 91.9 → 93.1 | +1.2 | 0 | +1.2 | A |
  | primer.style | WARN | SKIP | S2 2 → 0; S8 1 → 0 | 85.4 → 91.6 | -1.8 | +8 | +6.2 | B → A |
  | carbondesignsystem.com | WARN | SKIP | S2 3 → 0; S8 2 → 0 | 69.3 → 81.6 | -0.7 | +13 | +12.3 | D → B |
  | spectrum.adobe.com | SKIP | SKIP | no change | 69.1 → 69.1 | 0 | 0 | 0 | D |
  | m3.material.io | WARN | SKIP | no change | 66.4 → 66.4 | 0 | 0 | 0 | D |
  | radix-ui.com | WARN | SKIP | S2 2 → 0 | 65.2 → 70.0 | +0.4 | +4.8 | +4.8 | D → C |
  | geist.dev | SKIP | SKIP | no change | 64.4 → 64.4 | 0 | 0 | 0 | D |
  | plex.ibm.com | SKIP | SKIP | no change | 57.1 → 57.1 | 0 | 0 | 0 | F |
  | awwwards.com | not reached | | | | | | | |
  | fwa.org | WARN | SKIP | S8 1 → 0 | 47.9 → 51.5 | +0.6 | +3 | +3.6 | F |
  | cssdesignawards.com | not reached | | | | | | | |
  | pentagram.com | SKIP | SKIP | S8 4 → 0 | 56.6 → 56.6 | 0 | 0 | 0 | F |
  | vam.ac.uk | SKIP | SKIP | S2 7 → 0 | 70.0 → 70.0 | 0 | 0 | 0 | C |
  | github.com | FAIL | SKIP | S2 5 → 0; S8 6 → 0 | 68.5 → 70.0 | -1.8 | +10 | +1.5 | D → C |
  | notion.so | WARN | SKIP | S2 2 → 1 | 65.5 → 65.5 | 0 | 0 | 0 | D |
  | figma.com | SKIP | SKIP | S8 250 → 0 | 79.4 → 84.4 | 0 | +5 | +5 | C → B |
  | x.com | SKIP | SKIP | no change | 90.2 → 90.2 | 0 | 0 | 0 | A |
  | wikipedia.org | PASS | SKIP | no change | 83.0 → 83.8 | +0.8 | 0 | +0.8 | B |

  A WARN carries half credit, so whether it raises or lowers a score depends on
  where the accessibility category already stands; on this cohort the v44 WARNs
  move scores by -1.8 to +0.6. A score that holds at 70 (linear.app,
  zeroheight.com, vam.ac.uk) is held by the accessibility floor. pentagram.com
  stays at 56.6 because its slop deduction is still at the 20-point cap without
  S8.

  **The one v44 FAIL, read by hand**, each finding against the stylesheet it
  came from. carbondesignsystem.com WARNs: its progress bar and status icon
  (`--cds-support-success`, 3.05:1) are graphics and clear 3:1, and a
  ghost-button color it also paints as a mark stays a WARN. primer.style WARNs:
  its two misses are neutral text under a danger name, the danger button's
  counter on hover (white on 20% white over #cf222e, #d94e58, 4.05:1) and its
  keyboard hint in the dark theme (#9198a1 on #2a313c, 4.497:1). github.com
  FAILs on 83 hues, in five groups. 43 are in the Dark Dimmed theme, with both
  values from its `dark_dimmed` theme file: `--fgColor-danger` #e5534b on
  #212830 (4.02:1) 33 times, and 10 danger labels and buttons on that theme's
  surfaces (3.30 to 4.36:1). 4 are Primer Brand's dark red #fa383d on the Dark
  Dimmed canvas (4.04:1). 27 are Primer Brand colors when the appearance
  follows the system and a dark theme fills the day slot
  (`[data-color-mode=auto][data-light-theme=dark]` and its dimmed and
  high-contrast variants): the brand declares only `[data-color-mode=light]`
  and `[data-color-mode=dark]`, so it keeps its light palette on the dark
  canvas (2.78 to 4.41:1). The cascade produces that as written; only a
  signed-in visitor with those settings reaches it. 8 are
  `--brand-color-success-emphasis` as text, 2.46:1 on white and 2.13 to
  2.94:1 in the dark themes, under 3:1 even as a graphic. 1 is an alert
  counter in the light colorblind theme, #bc4c00 on #f0f1f2 (4.45:1). Its 12
  neutral counters and keyboard hints WARN.

## [1.13.2] — 2026-10-09

**designesy-mcp 1.13.2** (PyPI, MCP registry): every tool declares a title and the four MCP annotation hints.

### Added

- **MCP tool titles and annotations.** Each of the 17 tools on the hosted
  endpoint (`/api/mcp`) and in the PyPI stdio server now declares a `title`
  (as `Tool.title` and `annotations.title`) and all four MCP 2025-06-18 hints:
  `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`.
  Every value was read from the handler and the API route it calls. Sixteen
  tools are read-only. `designesy_monitor_score` is marked `readOnlyHint:
  false`, `destructiveHint: false` and `idempotentHint: false`, because
  `/api/monitor` sends a drift-alert email through Resend when the caller
  passes `email`, an alert fires and the server has a Resend key.
  `designesy_a11y_score` and the seven document tools are closed world; the
  tools that fetch a caller's URL are open world.
- **The annotations are gated.** `check-mcp-tool-parity.js` fails when a tool
  lacks a title or one of the four hints, when the route does not apply a
  tool's own entry, or when the PyPI server's titles and hints differ from the
  hosted endpoint's. The Python suite (`test_tool_annotations.py`) asserts the
  same from the package side, against the served `tools/list`.

### Fixed

- **The PyPI summary and README no longer call the server read-only.** Both
  said it never writes anywhere, while `designesy_monitor_score` can send
  email. The summary now reads "Read-only except monitor alerts, which can send
  email when configured", and the README's Safety section states when the email
  goes out.

## [1.13.1] — 2026-10-08

**designesy-mcp 1.13.1** (PyPI, MCP registry): the offline fallback mirrors engine 1.1.0 under a drift gate.

### Changed

- **PyPI MCP server: the offline fallback mirrors engine 1.1.0, under a drift
  gate.** When the live engine is unreachable, `designesy_score` (format
  `designesy`) falls back to a Python engine in `packages/designesy-mcp`.
  Nothing compared it with the live engine. Measured against the new golden, it
  disagreed with the live engine's status on at least one run for 23 of its 26
  checks (only v03, v07 and v09 agreed everywhere), and it raised `ValueError`
  on `scale(0.9.5)`.

  - Its 26 checks are now ports of the TypeScript checks, with the same item,
    category, status and detail, the same token inference, and the same scope
    filter. v05, v14 and v18 carry their 1.1.0 behaviour, and v27 is added with
    its 1.1.0 behaviour, so 27 of the 42 checks run offline.
  - `scope` now applies offline, requested or auto-detected from the URL as the
    live engine does. It used to be dropped with a `scope_note`.
  - v02, v04 and v21 read MANUAL without a browser, as in the live engine
    (all three read SKIP before).
  - The result names itself: `engine.kind` is `offline`,
    `engine.mirrors_engine_version` is `1.1.0`, `engine.not_run` lists the 15
    checks it does not run (each with a reason in the source), and `scope` is
    reported. Its score stays an unweighted pass rate over the checks it runs,
    and its note says that this is not the live engine's score.
  - It collects CSS the way the live route does (inline first, then each
    distinct stylesheet linked with `rel` before `href`, at most 60), and no
    longer fetches the contract from designesy.org, which only the old v01 used.

  **Drift gate.** `packages/score/scripts/export-offline-golden.mjs` scores the
  25 offline corpus fixtures, the recorded parity page, 77 edge inputs and 8
  scope auto-detection cases with the built TypeScript engine, under both scopes
  (215 runs), and writes `packages/designesy-mcp/test/fixtures/offline-engine-golden.json`.
  `test_offline_engine_parity.py` requires the Python engine to match every run,
  check by check, and requires its ported and listed checks to be exactly the
  live engine's 42. CI runs the exporter with `--check`. No version is bumped.


## [1.13.0] — 2026-10-08

Released together: **designesy-mcp 1.13.0** (PyPI, MCP registry) and
**@designesy/score 0.6.0** (npm). The entries below were merged since 1.12.2.
Headlines: engine 1.1.0 (v05, v27, v14/v18 tiering, the 13-type DTCG list) now
ships in the npm CLI's bundled engine; the PyPI `designesy_score` tool passes
`format` and `scope` through to the engine and identifies itself as
`designesy-mcp/1.13.0`.

### Changed

- **`@designesy/score` 0.5.0 — the standalone engine is converged with the site
  engine; no known debt remains.** The two hand-maintained copies of the 42-check
  engine had 13 unported fixes, so the CLI and the site could score the same page
  differently. All 13 are ported (#169) and the drift baseline is down from 15
  divergences to 4 — all genuine transport splits (`route.ts` attaches a receipt
  and takes a `Date`; the package fetches via an SSRF-guarded `httpsFetch`).
  Behaviour that changes for CLI users:

  - **v38** — `aria-hidden` subtrees are stripped before text extraction (tag
    removal used to FUSE neighbouring text into strings nobody wrote), a 1–2
    character label falls back to its `aria-label`, and selection controls
    (`aria-pressed`, `role="radio"`, `<button name= value=>`) are no longer read
    as non-verb commands. Icon-only buttons and radio groups stop failing.
  - **v37** — returning `PASS` when the `@google/design.md` linter was not
    installed **asserted validation that never ran**. It now returns `WARN`, and
    distinguishes "linter missing" from "linter threw", which need different fixes.
  - **v26, S2, S8, S9, S11, S12** — font-family and slop checks now match the
    site: the grid-pattern exemption accepts `color-mix()`/`var()`/hex stops in
    either order (a hairline-grid background was flagged at severity 5), and the
    slop checks are suppressed on a page that *documents* the rules, which
    previously cost points for publishing one's own rule registry.
  - **Alias resolution** — an alias resolving to an empty string no longer stops
    the search, so a later alias with a real value is still used.
  - **`emitReview`** — an all-`SKIP` result printed **"Approve"** for a page
    nothing had evaluated. It now reads "Not scored".

  **Public API (additive):** `deriveVerdict` and `statusToSeverity` are exported.
  The verdict rule is now shared by every emission format so they cannot disagree
  about the same result. Nothing was removed.

  **Guard added:** the source-drift gate also pins the package's exported
  surface. Its body comparison drops the `export` keyword by design (a route and
  a package legitimately differ on it), which made an accidental API change
  invisible — verified directly, then covered by a test with its own control.

### Fixed

- **Engine 1.1.0 (2026-10-08): four baseline defects fixed; 21 of the 30
  leaderboard sites change at least one verdict.** `ENGINE_VERSION` is now
  `1.1.0`, so every result and receipt scored from here on names the build that
  produced it. Both engine copies (`apps/site/app/api/score/route.ts` and
  `packages/score/src/engine.ts`) carry the identical change; the source-drift
  gate reports them in agreement.

  - **v05: motion gated behind `prefers-reduced-motion: no-preference` passes.**
    Declaring motion only inside a `no-preference` block is a recommended way to
    honour reduced motion, because a user who asked for less never receives it.
    Engine 1.0.0 accepted only a `reduce` block and WARNed this pattern. The block
    has to opt into motion: an animation, a transition, smooth scrolling or a view
    transition. An empty block still WARNs, and so does a block that only switches
    motion off (the `reduce` kill switch filed under the wrong query, which stills
    motion for users with no preference and leaves it running for users who asked
    for less). The existing regression fixture `broken-reduced-motion-inverted`
    pins that last case and still reads WARN.
  - **v27: a page with no field to zoom into reads SKIP.** When the CSS shows
    neither a sub-16px input rule nor a 16px floor, a page whose HTML carries no
    text input, textarea or select now reads SKIP, as v38 already does for a page
    with no buttons. It used to read WARN. Inputs that take no typed text (hidden,
    checkbox, radio, submit, button, reset, image, file, range, color) do not
    count as fields. A sub-16px input rule still FAILs and a declared floor still
    PASSes, on any page.
  - **v14 and v18 move to Tier 2.** Both encode Designesy Cadence taste (the
    Cadence umbrella rule set, and `text-wrap: balance` plus `pretty`) yet sat in
    Tier 1, so `scope=universal` WARNed external sites for not adopting them.
    Their absence now reads SKIP under `scope=universal`, the treatment v15, v19,
    v20 and x01 to x03 already receive. `scope=contract`, which designesy.org is
    scored under, is unchanged.
  - **MCP DTCG validator (t06, t07): the type list is the 13 types DTCG 2025.10
    defines.** `cubicBezier` was missing, so a conformant easing token WARNed on
    t06 and t07. Seven names the format does not define (`string`, `boolean`,
    `link`, `borderStyle`, `borderWeight`, `radius`, `spacing`) were accepted as
    standard. Fixed in the hosted endpoint (`apps/site/app/api/mcp/route.ts`) and
    in the Python package, whose tests now assert that the two lists are equal.
    This tool is separate from the site score, so no leaderboard verdict moves
    with it. `packages/tokens` keeps its own 15-type list (it also accepts
    `string` and `boolean`) and is untouched by this release.

  **Leaderboard impact, measured.** The HTML and CSS of every seed site in
  `apps/site/app/leaderboard/seed.ts` were fetched once on 2026-10-08 through the
  package engine's fetch path, then scored by engine 1.0.0 and engine 1.1.0 on
  the same bytes, with the live DESIGN.md probe (v37) enabled. 27 of 30 sites
  were reachable; nytimes.com, getdesy.com and cssdesignawards.com were not,
  which matches their held-over flags in `seed.ts`. 21 sites change at least one
  verdict: v14 on 19 sites, v18 on 17, v27 on 10 and v05 on 1. No other check
  moves. Six sites move nothing: linear.app, vercel.com (a), stripe.com,
  www.designesy.org, github.com and x.com (a). The live leaderboard keeps its
  1.0.0 scores until its next weekly re-score.

  | Site | Check: 1.0.0 → 1.1.0 | Score: 1.0.0 → 1.1.0 | Delta | Grade |
  |---|---|---|---|---|
  | apple.com | v14 WARN → SKIP; v18 WARN → SKIP | 82.1 → 83.1 | +1.0 | B |
  | mozaika.design | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 62.8 → 64.3 | +1.5 | D |
  | designesy.ai.studio | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 74.8 → 76.8 | +2.0 | C |
  | stitch.withgoogle.com | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 61.2 → 63.5 | +2.3 | D |
  | zeroheight.com | v18 WARN → SKIP | 70 → 70 | 0 | C |
  | roastbyai.com (a) | v14 WARN → SKIP; v18 WARN → SKIP | 72.2 → 74.7 | +2.5 | C |
  | atlassian.design (a) | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 89.1 → 91.9 | +2.8 | B → A (b) |
  | primer.style | v27 WARN → SKIP | 82.4 → 84.1 | +1.7 | B |
  | carbondesignsystem.com | v14 WARN → SKIP; v18 WARN → SKIP | 67.8 → 69.3 | +1.5 | D |
  | spectrum.adobe.com | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 63.5 → 65.1 | +1.6 | D |
  | m3.material.io | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 67.6 → 66.4 | -1.2 | D |
  | radix-ui.com | v05 WARN → PASS; v14 WARN → SKIP | 63.2 → 65.2 | +2.0 | D |
  | geist.dev | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 62.0 → 64.4 | +2.4 | D |
  | plex.ibm.com | v14 WARN → SKIP; v18 WARN → SKIP | 58.3 → 56.8 | -1.5 | F |
  | awwwards.com (a) | v14 WARN → SKIP; v18 WARN → SKIP | 70 → 70 | 0 | C |
  | fwa.org | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 48.0 → 47.9 | -0.1 | F |
  | pentagram.com | v14 WARN → SKIP | 56.3 → 56.6 | +0.3 | F |
  | vam.ac.uk | v14 WARN → SKIP; v18 WARN → SKIP | 70 → 70 | 0 | C |
  | notion.so | v14 WARN → SKIP | 65.0 → 65.5 | +0.5 | D |
  | figma.com | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 76.6 → 79.4 | +2.8 | C |
  | wikipedia.org | v14 WARN → SKIP; v18 WARN → SKIP | 80.7 → 83.0 | +2.3 | B |

  (a) On the captured bytes, engine 1.0.0 does not reproduce this site's live
  2026-10-08 score (live: vercel.com 79.6, roastbyai.com 71.2, atlassian.design
  86.1, awwwards.com 70.3, x.com 87.8), so the page or the fetch differed from the
  weekly run. The verdict moves and deltas in these rows hold for the captured
  bytes; the live values are not measured. The other 22 reachable sites reproduce
  their live 1.0.0 score exactly. www.designesy.org shows one PASS fewer than
  live at the same score, because the package engine reports v37 as MANUAL where
  the hosted engine runs the DESIGN.md linter.
  (b) The grade change rests on a 1.0.0 score of 89.1 that the live run did not
  reproduce: live, atlassian.design scored 86.1 with one more FAIL. Whether its
  live grade moves is not measured.

  Scores can fall. Removing a WARN (half credit) from a category that averages
  below half credit lowers that category, which is why m3.material.io,
  plex.ibm.com and fwa.org drop. A score that holds at 70 (zeroheight.com,
  awwwards.com, vam.ac.uk) is held by the accessibility floor, which caps any
  site whose accessibility category is below 60% at 70.

  The calibration corpus grows from 18 fixtures to 25 (corpus 1.2.0): fixtures
  that held each old wrong verdict, plus controls that keep the verdicts the
  fixes must not move. Fourteen existing fixtures change their counts: thirteen
  universal-scope fixtures because v14 and v18 now SKIP on them, and
  `edge-empty-page` because it has no field and v27 now SKIPs. Every pinned
  verdict still holds. `packages/score/test/engine-1-1-0.test.mjs` pins the edges
  of each rule.

- **`designesy-score` 1.0.5 (npm CLI): the v07 label no longer names an internal
  project.** 1.0.4 was built from a branch that never merged and printed a
  control-plane name in the v07 `item` on every run. 1.0.5 is built from `main`,
  where v07 reads `Semantic HTML foundation: single h1, title, meta description,
  landmark`, and the check function is renamed to `checkSemanticHtmlFoundation`
  in both engine copies so the shipped `engine.js` carries no trace of it. The
  CLI banner now reads its version from `package.json` (it said v1.0.0 through
  1.0.4) and counts 42 checks, not 40. The package stays deprecated in favour of
  `@designesy/score`.

- **Standalone `@designesy/score` engine re-synced to the site engine** (v0.3.0).
  37 of 40 check functions had drifted from the canonical `apps/site` engine —
  5 wrong category assignments (v03 accessibility→interaction, v05
  accessibility→motion, v20/v26 identity→cadence, v27 responsive→
  accessibility) and 32 stale check implementations (v10 takt, v34 AI
  disclosure, v38 button-verb, v39 trailing-period, v11/v19 semantics, and
  more). Before: the CLI scored designesy.org 88.5 B while the site engine
  scored it 93 A. After: identical scores and per-check statuses verified on
  three URLs (designesy.org 93 A, linear.app 67.7 D, example.com 63.3 D
  universal) — 0 diffs across all 42 checks on each. The v37 DESIGN.md check
  keeps its deliberate npm-runtime adaptations (SSRF-safe httpsFetch,
  optional-linter fallback).

## [1.12.2] — 2026-09-28

### Fixed

- **The published package now names the org, not a person.** `pyproject.toml`
  declared a personal name in `authors`, and PyPI renders that as
  `author_email` on the project page. The npm packages moved to
  `Designesy <hello@designesy.org>` in the same change, so the artifacts now
  agree. Registry metadata is immutable per published version, which is why this
  needs a release rather than an edit: 1.12.1 still carries the old field.
- **The sdist LICENSE now reads `Copyright (c) 2026 LE-VAI`**, matching the
  licence holder used across the other packages. The bundled copy had drifted.

## [1.12.0] — 2026-08-30

### Added

- **Semantic category wired: v42 + v43.** The `semantic` category carried a
  reserved weight (12) since v0.3.0 with zero checks returning it — dead
  weight in the engine's category table. Two deterministic checks now score
  it:
  - **v42 — Semantic color vocabulary:** classifies every color-valued token
    in :root as role-named (ink, paper, surface, danger, success, accent…)
    vs hue-named (blue, slate, amber, -500 scales…). PASS at ≥60% role share
    with ≥3 distinct roles. Grounded in the contract's own role-named
    palette (--ink, --paper, --surface, --signal, --ok/--warn/--error) and
    role-based naming best practice (zeroheight naming guide, Material 3).
  - **v43 — Semantic status colors:** checks status-state coverage
    (ok/success, warn/warning, error/danger, info/notice) among color token
    names. PASS at ≥3 of 4 families.
  Both checks are WARN-only (style craft, not user harm) per the engine's
  calibration precedent, self-SKIP when a site has no color tokens, and are
  site-agnostic (no scope-tier registration needed). Wired identically in
  the standalone `@designesy/score` engine to keep CLI/site parity.
- **Engine grows 40 → 42 checks.** The semantic category's weight 12 now
  enters the weighted denominator (6 per check). The methodology page's
  reserved-weight note is replaced with the live category description, and
  all engine-count copy is true-upped to 42 (READMEs, MCP tool descriptions,
  leaderboard, pricing, badge, CLI packages); historical surfaces (blog
  studies, dated compliance reports, changelog entries for past releases)
  intentionally keep their original counts.

### Fixed

- **The weekly-leaderboard write path was rotted three ways** (all fixed
  2026-08-30): rescore workflow died on a missing `leaderboard` label before
  opening its PR (labels now created idempotently in-workflow); the seed
  writer regenerated seed.ts from a stale template, stripping
  `liveScoreUrl`/`coiDisclosure` fields added after the last successful run
  (rewritten as a surgical field-preserving editor); and branch protection
  required status contexts in `CI / <job>` form that never matched the bare
  check-run names GitHub Actions reports (corrected to bare names). First
  fully-working weekly cycle lands with this release.

## [1.11.1] — 2026-08-30

### Added

- **/DESIGN.md served at site root** (Google DESIGN.md convention). The score
  engine's v37 spec-layer check now validates the live file with Google's
  @google/design.md linter (0 errors, 0 warnings) instead of SKIPping.
- **/DESIGN.md added to sitemap** and the post-deploy smoke assertions.

### Fixed

- **v37 serverless regression: @google/design.md linter ENOENT at Lambda
  runtime.** Next's bundler inlined build-machine absolute paths into the
  server bundle, so the dynamic import failed in production. The package is
  now externalized (serverExternalPackages) and traced into the /api/score
  Lambda zip (outputFileTracingIncludes).
- **Vercel alias flip missed on the 3845983 build** (integration glitch) —
  production briefly kept serving the prior build until a manual promote.

### Changed

- **Accuracy true-up, AnySearch-verified:** v24 target-size citation
  corrected to WCAG 2.5.5 Target Size (Enhanced) with the 2.5.8 24px AA
  minimum stated alongside; APCA Lc role mapping corrected (Lc 75 body
  minimum, Lc 90 body preferred, Lc 60 non-body); 84% token-adoption stat
  attributed to zeroheight Design Systems Report 2025; axe-core pinned
  4.12.1 → 4.13.0 across 17 pins; Belitsoft citation named exactly
  (State of React Development 2026).
- **Count true-up:** 23 packages, 17 MCP tools, 10 machine exports, 40
  checks across READMEs, open.json.cache, and the single-source check
  registry (lib/check-definitions.ts).
- **Live self-score: 93 A** (37 pass / 0 fail / 0 warn / 0 skip / 3 manual).

## [1.0.4] — 2026-08-15

### Fixed

- **v13 check: false FAILs from decorative animations.** The press-scale check
  extracted ALL `scale()` values from the entire CSS and used `:active` only as a
  boolean gate. Decorative `@keyframes` animations (`scale(0.3)` for checkmark
  pop-in, `scale(0.001)` for ripple start, `scale(0.85)` for spinner pulse) were
  incorrectly flagged as press-feedback failures. The check now extracts `scale()`
  values only from inside `:active` rule bodies, eliminating 9 false positives.
- **v27 check: false FAILs from unit blindness and substring matching.** The
  input font-size check dropped the CSS unit (`1rem` became `1`, compared against
  `16` as px) and matched "input" as a substring inside class names (`.cmdk-input`,
  `.score-url-input-inner`). The check now captures and converts units (rem/em × 16
  = px) and requires element selectors at selector boundaries. Eliminates 6 false
  positives.

### Changed

- **Real CSS fix: `.score-search-input` font-size raised from 0.8rem to 1rem.**
  The score page check search input was at 12.8px, which triggers iOS Safari
  auto-zoom on focus. Now at 16px (1rem), the WCAG 2.5.8 floor.
- **Dependabot ignore blocks added** for `next`, `eslint`, `eslint-config-next`,
  and `typescript` major version bumps. These require migration work (Next 16
  removes `next lint`, TS 6 requires CSS module declarations) and will be handled
  in a dedicated session. Minor/patch updates still flow.

## [1.0.3] — 2026-08-15

### Fixed

- **Critical: safeLookup did not honor `options.all` (Node v24 regression).**
  Node v24's `net` layer passes `{ all: true }` to the custom `lookup` function,
  expecting the callback to receive an array of `{ address, family }` objects.
  The previous `safeLookup` always returned a single `(address, family)` tuple,
  causing `ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined` on every fetch.
  This made every `httpsFetch` fail silently, returning empty HTML/CSS, which
  caused all CSS-text and token-based checks to report false FAILs/WARNs against
  empty input (0 tokens extracted, no `<h1>` found, no `:focus-visible` found,
  no `prefers-reduced-motion` found, no duration tokens found).
  The fix: `safeLookup` now checks `options.all` and returns an array when true.
  Impact: designesy.org contract score went from 59.4 F (0 tokens) to 78.1 C
  (146 tokens extracted) with the same source CSS — the engine was blind, not
  the site.

## [1.0.2] — 2026-08-14

### Security

- **DNS rebinding SSRF mitigation (TOCTOU-safe).** The SSRF guard now validates
  resolved IP addresses *inside the connection path* via a custom `lookup`
  function (`safeLookup`). This eliminates the time-of-check/time-of-use race
  (CWE-367) that made the previous resolve-then-fetch approach vulnerable to
  DNS rebinding attacks. A hostname like `localtest.me` (which resolves to
  `127.0.0.1`) is now blocked before the socket connects. References: OWASP
  SSRF Prevention Cheat Sheet (DNS pinning), CVE-2026-27826.

### Added

- **`node:test` automated test suite (36 tests, zero dependencies).** Three
  test files covering SSRF guard unit tests (12), scoring engine contract
  tests (8), CLI integration tests (8), and engine parity tests (4). Uses
  `node --test` discovery with `node:assert/strict`. Run via `npm test` in
  `packages/score`.
- **Engine parity test.** Compares the npm engine output against the live
  `designesy.org/api/score` endpoint — catches structural drift (check IDs,
  check count, grade) and score drift (> 5 points triggers a sync warning).

### Changed

- **`@designesy/cli` path resolution refactored.** Replaced the 6-candidate
  filesystem path heuristic with `createRequire(import.meta.url).resolve()`,
  which uses Node's built-in module resolution. Handles npm flat-hoisting,
  pnpm virtual stores, and yarn PnP correctly. Bumped to 0.2.0.
- **`@designesy/score` bumped to 0.2.0.** Includes the safeLookup fix and
  test suite.

## [1.0.1] — 2026-08-14

### Fixed

- **SSRF redirect bypass (critical).** The SSRF guard now re-validates every HTTP
  redirect target with `isValidUrl()` before following it. Previously, only the
  initial URL was validated — an attacker could redirect from a safe URL to
  `http://169.254.169.254/` (AWS IMDS) and the engine would follow it. The
  CHANGELOG previously claimed "SSRF guard runs on every fetch, including
  redirect hops" — this is now actually true.
- **CHANGELOG links fixed.** Version comparison links now point to the correct
  monorepo tag names (`designesy-score@1.0.0` instead of `v1.0.0`).

### Added

- **Runtime deprecation warning.** Using `--api` or `$SCORE_API` now emits a
  `DeprecationWarning` to stderr, directing users to the local engine.
- **MIGRATION.md shipped in tarball.** The migration guide is now included in the
  npm package so users who install via npm can read it without visiting GitHub.

## [1.0.0] — 2026-08-14

### ⚠️ BREAKING CHANGES

- **Local engine by default.** The CLI now runs the full 40-check scoring engine
  locally — no server required. In 0.x, the CLI POSTed to `https://www.designesy.org/api/score`.
  In 1.0.0, it fetches the target URL, extracts CSS + `:root` tokens, and runs
  all 40 checks in-process. Zero dependencies (Node built-ins only).

- **`--api` is now a remote fallback.** The `--api <url>` flag and `$SCORE_API` env var
  still work, but they now opt INTO the old remote API client mode instead of being
  the default. If you relied on the remote server, add `--api https://www.designesy.org`
  or set `SCORE_API=https://www.designesy.org` to restore the pre-1.0.0 behavior.

- **New `--scope` flag.** `--scope contract` (strict — all checks penalize absence,
  default for designesy.org) or `--scope universal` (fair to external sites — optional
  features SKIP on absence). Default is `auto` (detects whether the site declares
  Designesy tokens). [NEW in 1.0.0]

- **Report includes anti-slop + originality.** The formatted report now shows
  anti-slop deductions (12 patterns) and originality lifts (7 craft signals) that
  affect the final score. These were always part of the engine but not displayed
  in the 0.x CLI report.

- **`verify` subcommand runs locally.** The `verify <url>` subcommand (DESIGN.md
  spec-layer check) now runs the v37 check from the local engine instead of
  POSTing to the server. Use `--api` to fall back to remote mode.

### Added

- Local 40-check scoring engine (zero dependencies, `node:https` + pure-JS SSRF guard)
- `--scope` flag for contract vs universal scoring
- Anti-slop deductions (S1-S12) and originality lifts (O1-O7) in the formatted report
- `--scope`, `--format`, `--min-score`, `--min-grade`, `--json`, `--quiet` all work
  in both local and remote mode
- `MANUAL` check status icon (for checks that need a live browser to verify)

### Changed

- Default mode: local engine (was: remote API call to designesy.org)
- `--api` and `$SCORE_API`: now opt-in remote fallback (was: default behavior)
- Engine fetch: `node:https` with zero-dep SSRF guard (was: `fetch()` + `ipaddr.js`)
- Report: shows anti-slop + originality lines (was: score + categories + findings only)

### Deprecated

- `--api <url>` remote fallback mode — will be removed in 2.0.0. The local engine
  is strictly better (works offline, no rate limits, no server dependency).
- `$SCORE_API` env var — same as `--api`, deprecated in favor of local mode.

### Fixed

- Windows libuv crash: replaced `fetch()`/undici with `node:https` to avoid the
  `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` crash on process exit
- SSRF guard: replaced `ipaddr.js` dependency with pure-JS private-range checks
  (10.x, 127.x, 169.254.x, 172.16-31.x, 192.168.x, 100.64+, all IPv6, encoded IPs)

### Security

- Zero runtime dependencies (was: ipaddr.js)
- SSRF guard runs on every fetch, including redirect hops

---

## [0.4.2] — 2026-08-11

- API client CLI: POSTs to designesy.org/api/score, formats the response
- Flags: `--format`, `--api`, `--min-score`, `--min-grade`, `--json`, `--quiet`
- Subcommand: `verify <url>` (DESIGN.md spec-layer check via remote API)
- Zero dependencies

## [0.3.0] — 2026-07-30

- Initial API client release
- 40-check engine running server-side at designesy.org

[1.0.4]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.4
[1.0.3]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.3
[1.0.2]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.2
[1.0.1]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.1
[1.0.0]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.0
[0.4.2]: https://github.com/LE-VAI/designesy-org/compare/v0.4.0...designesy-score%401.0.0